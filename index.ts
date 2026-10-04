/**
 * squint — compact transcript rendering for pi, in five interchangeable directions.
 *
 * Every tool call becomes one row: a header plus a short preview, with the full output on
 * click or the expand shortcut (Cmd+E by default). The direction decides how that row is
 * drawn — see directions.ts for the layouts, and /squint to switch between them.
 *
 *   rail    a trace spine; nested work hangs off its parent   (default)
 *   ledger  one aligned line per call, output only on open
 *   badge   the filled chip, as shipped before
 *   gutter  a typographic column of labels instead of a chip
 *   deck    each call boxed; nesting visible inside
 *
 * Nested calls (a codemode script or subagent running other tools) never get their own
 * transcript row from pi, but they do emit tool_execution_* events with parentToolCallId,
 * so they are collected here and drawn inside the row that made them.
 *
 * Colors use the pi logo palette. Tones by category: READ/SEARCH blue, EDIT/WRITE coral,
 * SHELL gold (pi logo); AGENT/ASK violet, WEB teal, TODO/CODE green, everything else gray.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, Key, MouseRegion, parseColor } from "@earendil-works/pi-tui";
import {
	buildRow,
	DEFAULT_DIRECTION,
	DIRECTIONS,
	isDirection,
	layout,
	type Direction,
	type Fill,
	type Ink,
	type Row,
	type Seg,
} from "./directions.ts";
import { classify, textOf, TONE_HEX, type Classification, type Tone } from "./logic.ts";

const BADGE_FG = "#181a20";
/** Owned by this extension; the built-in app.tools.expand binding is disabled in keybindings.json. */
const EXPAND_KEY = Key.super("e");
/** Hint label; pi formats super as "super", so show the mac glyph instead of the binding text. */
const EXPAND_LABEL = "⌘E";

/* ------------------------------------------------------------------ *
 * settings — ~/.pi/agent/squint.json
 * ------------------------------------------------------------------ */
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const SETTINGS_FILE = join(AGENT_DIR, "squint.json");

function loadDirection(): Direction {
	try {
		const saved = JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as { direction?: unknown };
		if (isDirection(saved.direction)) return saved.direction;
	} catch {
		// No settings yet, or unreadable: the default is rail.
	}
	return DEFAULT_DIRECTION;
}

function saveDirection(direction: Direction): void {
	try {
		mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
		writeFileSync(SETTINGS_FILE, `${JSON.stringify({ direction }, null, 2)}\n`);
	} catch {
		// A read-only home must not break the transcript; the session keeps the picked direction.
	}
}

/* ------------------------------------------------------------------ *
 * state shapes
 * ------------------------------------------------------------------ */
interface Live {
	/** The argument and result objects as last seen; compared by identity to skip repeat passes. */
	args: unknown;
	result?: unknown;
	text: string;
	diff?: string;
	isError: boolean;
	pending: boolean;
}

/** A tool call made by another tool. pi never gives it a transcript row of its own. */
interface Child {
	id: string;
	toolName: string;
	args: unknown;
	text: string;
	isError: boolean;
	startedAt: number;
	ms?: number;
}

/* ------------------------------------------------------------------ *
 * segments → terminal text
 * ------------------------------------------------------------------ */
function inkColor(theme: Theme, ink?: Ink) {
	if (!ink) return undefined;
	if (ink in TONE_HEX) return parseColor(TONE_HEX[ink as Tone]);
	switch (ink) {
		case "text":
			return theme.colors.text;
		case "muted":
			return theme.colors.toolOutput;
		case "dim":
			return theme.colors.dim;
		case "add":
			return theme.colors.toolDiffAdded;
		case "del":
			return theme.colors.toolDiffRemoved;
		case "error":
			return theme.colors.error;
		default:
			return parseColor(BADGE_FG);
	}
}

function fillColor(theme: Theme, fill?: Fill) {
	if (!fill) return undefined;
	switch (fill) {
		case "add":
			return theme.colors.toolSuccessBg;
		case "del":
		case "error":
			return theme.colors.toolErrorBg;
		case "pending":
			return theme.colors.toolPendingBg;
		default:
			return parseColor(TONE_HEX[fill as Tone]);
	}
}

/** Styling one row's segments into terminal strings. Split out so a row is styled once, not per frame. */
function styleSegs(theme: Theme, line: Seg[]): string {
	let out = "";
	for (const s of line) {
		const fg = inkColor(theme, s.ink);
		const bg = fillColor(theme, s.fill);
		out += !fg && !bg && !s.bold ? s.t : theme.style(s.t, { ...(fg ? { fg } : {}), ...(bg ? { bg } : {}), ...(s.bold ? { bold: true } : {}) });
	}
	return out;
}

/** The head (line 0) or the body (everything after it) of a row, already styled. */
interface Rendered {
	/** Everything the output depends on: a hit means no rebuild is needed. */
	key: string;
	/** The theme stamp these strings were styled with. */
	stamp: unknown;
	head: string[];
	body: string[];
}

/** Renders a cached slice. The row is turned into strings once per change, not once per frame. */
class SquintRow implements Component {
	private readonly get: (cols: number) => string[];

	constructor(get: (cols: number) => string[]) {
		this.get = get;
	}

	invalidate(): void {}

	render(cols: number): string[] {
		return this.get(cols);
	}
}

/* ------------------------------------------------------------------ *
 * the extension
 * ------------------------------------------------------------------ */
export default function squint(pi: ExtensionAPI) {
	let direction: Direction = loadDirection();
	let latestId: string | null = null;

	const expanded = new Set<string>();
	const invalidators = new Map<string, () => void>();
	const live = new Map<string, Live>();
	const startedAt = new Map<string, number>();
	const duration = new Map<string, number>();
	/** Set when a nested call arrives, so its parent's renderer runs again. */
	const children = new Map<string, Child[]>();
	const childById = new Map<string, Child>();

	const isOpen = (id: string) => expanded.has(id);

	/**
	 * The expansion hint's verb. Only the newest row owns the keyboard binding; older rows expand by
	 * click. Plain text, styled by the row itself, so this stays off the package's theme singleton.
	 */
	const keyHint = (id: string) => (action: string) => (id === latestId ? `${EXPAND_LABEL} ${action}` : `click ${action}`);

	const toggle = (id: string | null) => {
		if (!id) return;
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
		invalidators.get(id)?.();
	};

	/** Switch direction and redraw every row already on screen. */
	const apply = (next: Direction) => {
		direction = next;
		saveDirection(next);
		for (const invalidate of invalidators.values()) invalidate();
	};

	const state = (id: string): Live => {
		let current = live.get(id);
		if (!current) {
			current = { args: undefined, text: "", isError: false, pending: true };
			live.set(id, current);
		}
		return current;
	};

	function nestedRows(parentId: string, depth: number): Row[] {
		if (depth >= 2) return [];
		return (children.get(parentId) ?? []).map((child) => childRow(child, depth));
	}

	function childRow(child: Child, depth: number): Row {
		// A child row is always drawn open: it only exists once its parent is being shown expanded.
		return buildRow(direction, classify(child.toolName), {
			args: child.args,
			text: child.text,
			isError: child.isError,
			pending: child.ms === undefined,
			ms: child.ms ?? Date.now() - child.startedAt,
			open: true,
			nested: nestedRows(child.id, depth + 1),
		});
	}

	function rowFor(info: Classification, id: string): Row {
		const current = live.get(id);
		const start = startedAt.get(id);
		const finished = duration.get(id);
		return buildRow(direction, info, {
			args: current?.args,
			text: current?.text ?? "",
			diff: current?.diff,
			isError: current?.isError ?? false,
			pending: current?.pending ?? true,
			// A pending row shows no time, so the clock is only read for a row that has already
			// finished — which keeps Date.now() out of the render path entirely.
			ms: current?.pending ? undefined : (finished ?? (start === undefined ? undefined : Date.now() - start)),
			open: isOpen(id),
			nested: nestedRows(id, 0),
		});
	}

	/**
	 * Rows turn into strings once per change, not once per frame. Everything a redraw depends on goes
	 * in the key — width, direction, open state, whether this is the row the expand key targets, and
	 * the theme — so typing and scrolling, which change none of those, reuse the previous strings
	 * untouched. `invalidateRow` drops the entry whenever the tool's own output changes.
	 */
	const rendered = new Map<string, Rendered>();

	/**
	 * Cached rows have the theme's colours baked into their strings, so a `/theme` switch has to
	 * invalidate them. pi's theme is a Proxy over a swappable instance, so the colour object's
	 * identity changes on a switch while the Proxy itself does not — one property read detects it.
	 */
	const themeStamp = (theme: Theme): unknown => theme.colors.text;

	const invalidateRow = (id: string) => {
		rendered.delete(id);
	};

	function renderRow(info: Classification, id: string, cols: number, theme: Theme): Rendered {
		const key = `${cols}|${direction}|${isOpen(id) ? "open" : "shut"}|${id === latestId ? "key" : ""}`;
		const stamp = themeStamp(theme);
		const hit = rendered.get(id);
		if (hit && hit.key === key && hit.stamp === stamp) return hit;
		const lines = layout(direction, rowFor(info, id), cols, isOpen(id), { keyHint: keyHint(id) }).map((line) => styleSegs(theme, line));
		const fresh: Rendered = { key, stamp, head: lines.slice(0, 1), body: lines.slice(1) };
		// A long session touches thousands of rows; the cap keeps the cache from outgrowing the transcript.
		if (rendered.size > 2000) rendered.clear();
		else rendered.set(id, fresh);
		return fresh;
	}


	/** Own the click so expansion has a single source of truth (key and mouse both toggle here). */
	const clickable = (component: Component, id: string, invalidate: () => void): Component => {
		// Registered on every render, not on click: switching direction has to redraw rows nobody touched.
		invalidators.set(id, invalidate);
		return new MouseRegion(component, (event) => {
			if (event.type !== "click" || event.button !== "left") return undefined;
			toggle(id);
			return { handled: true };
		});
	};

	// Thinking blocks are core-rendered, so this extension only relabels the collapsed line;
	// settings.json sets hideThinkingBlock so they start minimized like a tool row.
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setHiddenThinkingLabel("THINK · click to expand");
	});

	pi.on("tool_execution_start", (event) => {
		if (!event.parentToolCallId) {
			latestId = event.toolCallId;
			startedAt.set(event.toolCallId, Date.now());
			return;
		}
		const child: Child = {
			id: event.toolCallId,
			toolName: event.toolName,
			args: event.args,
			text: "",
			isError: false,
			startedAt: Date.now(),
		};
		const list = children.get(event.parentToolCallId) ?? [];
		list.push(child);
		children.set(event.parentToolCallId, list);
		childById.set(child.id, child);
		invalidateRow(event.parentToolCallId);
		invalidators.get(event.parentToolCallId)?.();
	});

	pi.on("tool_execution_update", (event) => {
		if (!event.parentToolCallId) return;
		const child = childById.get(event.toolCallId);
		if (child) child.text = textOf(event.partialResult?.content as Array<{ type: string; text?: string }>) || child.text;
		invalidateRow(event.parentToolCallId);
		invalidators.get(event.parentToolCallId)?.();
	});

	pi.on("tool_execution_end", (event) => {
		if (!event.parentToolCallId) {
			const start = startedAt.get(event.toolCallId);
			if (start !== undefined) {
				duration.set(event.toolCallId, Date.now() - start);
				startedAt.delete(event.toolCallId);
			}
			invalidateRow(event.toolCallId);
			return;
		}
		const child = childById.get(event.toolCallId);
		if (child) {
			child.text = textOf(event.result?.content as Array<{ type: string; text?: string }>) || child.text;
			child.isError = event.isError;
			child.ms = Date.now() - child.startedAt;
		}
		const parent = event.parentToolCallId;
		if (parent) {
			invalidateRow(parent);
			invalidators.get(parent)?.();
		}
	});

	// Own this key so core's global toggle (which expands every tool row and section) never fires.
	pi.registerShortcut(EXPAND_KEY, {
		description: "Expand the latest tool output",
		handler: () => toggle(latestId),
	});

	pi.registerCommand("squint", {
		description: `How tool calls render — ${DIRECTIONS.map((d) => d.id).join(", ")} (default ${DEFAULT_DIRECTION})`,
		getArgumentCompletions: (prefix: string) => {
			const typed = prefix.trim().toLowerCase();
			const matches = DIRECTIONS.filter((d) => d.id.startsWith(typed)).map((d) => ({ value: d.id, label: `${d.id} — ${d.blurb}` }));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args: string, ctx) => {
			const wanted = args.trim().toLowerCase();
			if (wanted) {
				const hit = DIRECTIONS.find((d) => d.id === wanted);
				if (!hit) {
					ctx.ui.notify(`squint: unknown direction "${wanted}". Options: ${DIRECTIONS.map((d) => d.id).join(", ")}`, "warning");
					return;
				}
				apply(hit.id);
				ctx.ui.notify(`squint: ${hit.label} — ${hit.blurb}`, "info");
				return;
			}
			if (!ctx.hasUI) {
				ctx.ui.notify(`squint: ${direction}`, "info");
				return;
			}
			// One pick then close, so the transcript is visible immediately behind the picker.
			const choices = DIRECTIONS.map((d) => `${d.id === direction ? "●" : "○"} ${d.label} — ${d.blurb}`);
			const picked = await ctx.ui.select(`squint — how tool calls render (now: ${direction})`, choices);
			if (!picked) return;
			const hit = DIRECTIONS[choices.indexOf(picked)];
			if (hit) {
				apply(hit.id);
				ctx.ui.notify(`squint: ${hit.label}`, "info");
			}
		},
	});

	pi.registerToolRenderer((toolName): ToolRenderers => {
		const info = classify(toolName);


		return {
			renderShell: "self",

			renderCall(args, theme, context) {
				const id = context.toolCallId;
				// Core re-runs this on every redraw with the same object; only a real change invalidates.
				const current = state(id);
				if (current.args !== args) {
					current.args = args;
					invalidateRow(id);
				}
				return clickable(new SquintRow((cols) => renderRow(info, id, cols, theme).head), id, context.invalidate);
			},

			renderResult(result, options, theme, context) {
				const id = context.toolCallId;
				const current = state(id);
				const changed = current.result !== result || current.isError !== context.isError || current.pending !== options.isPartial;
				if (changed) {
					current.result = result;
					current.text = textOf(result.content as Array<{ type: string; text?: string }>);
					current.diff = (result.details as { diff?: string } | undefined)?.diff;
					current.isError = context.isError;
					current.pending = options.isPartial;
					// New output, so the cached strings for this row are stale.
					invalidateRow(id);
				}
				return clickable(new SquintRow((cols) => renderRow(info, id, cols, theme).body), id, context.invalidate);
			},
		};
	});
}
