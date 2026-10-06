/**
 * squint — compact transcript rendering for pi, in five interchangeable directions.
 *
 * Every tool call becomes one row: a header plus a short preview, with the full output on click or
 * the configured expand shortcut (⌘E by default). The direction decides how that row is drawn —
 * see directions.ts for the layouts, and /squint to switch between them, hand tool calls back to
 * pi ("off"), or describe a new direction to build ("custom").
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
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, Theme, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { type Component, type KeyId, MouseRegion, parseColor } from "@earendil-works/pi-tui";
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
import { classify, keyLabel, normalizeKeyId, textOf, TONE_HEX, type Classification, type Tone } from "./logic.ts";
import { ensureShim } from "./shim.ts";
import {
	CODE_STYLES,
	DEFAULT_CODE_STYLE,
	isCodeStyle,
	liveTheme,
	renderCodeBlock,
	type CodeArea,
	type CodeBlockHook,
	type CodeStyle,
} from "./codeblocks.ts";

const BADGE_FG = "#181a20";

/** Every render mode: a real direction, or "off" for pi's own tool rendering. */
type Mode = Direction | "off";
const OFF = "off" as const;

/* ------------------------------------------------------------------ *
 * settings — ~/.pi/agent/squint.json
 * ------------------------------------------------------------------ */
const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
const SETTINGS_FILE = join(AGENT_DIR, "squint.json");
/** Where this extension lives; quoted back to pi when it builds a custom direction. */
const HERE = (() => {
	try {
		return dirname(fileURLToPath(import.meta.url));
	} catch {
		return join(AGENT_DIR, "extensions", "squint");
	}
})();

const DEFAULT_KEY = "super+e";

interface Settings {
	direction: Mode;
	/** The expand/collapse shortcut, as a canonical pi key id. */
	key: string;
	/** How fenced code blocks render: a style, or "off" for pi's own fences (see codeblocks.ts). */
	codeBlock: CodeStyle;
	/** The instructions last handed to /squint custom, kept as the editor's prefill. */
	custom?: { instructions: string };
}

const isMode = (value: unknown): value is Mode => value === OFF || isDirection(value);

function loadSettings(): Settings {
	try {
		const saved = JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) as Partial<Settings>;
		return {
			direction: isMode(saved.direction) ? saved.direction : DEFAULT_DIRECTION,
			key: normalizeKeyId(saved.key) ?? DEFAULT_KEY,
			codeBlock: isCodeStyle(saved.codeBlock) ? saved.codeBlock : DEFAULT_CODE_STYLE,
			custom: typeof saved.custom?.instructions === "string" ? { instructions: saved.custom.instructions } : undefined,
		};
	} catch {
		// No settings yet, or unreadable: rail, Cmd+E, spine.
	}
	return { direction: DEFAULT_DIRECTION, key: DEFAULT_KEY, codeBlock: DEFAULT_CODE_STYLE };
}

function saveSettings(settings: Settings): void {
	try {
		mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
		writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
	} catch {
		// A read-only home must not break the transcript; the session keeps the picked mode.
	}
}

/**
 * The prompt pi follows to build a user's own direction. One string, so the whole workflow —
 * preview, confirmation, implementation, cleanup — is readable in one place.
 */
function customPrompt(instructions: string): string {
	return [
		"Build a new squint render direction from these instructions:",
		"",
		instructions,
		"",
		`squint is the extension in ${HERE} (directions.ts, logic.ts, index.ts, README.md). Read the`,
		`"Adding a direction" section and the existing renderers first. The direction must fit the same`,
		"contract: a pure layout returning styled segments, the first line is the head, one segment is",
		"one physical line, and every line fits the terminal width.",
		"",
		"Do this in order, and do not skip the preview:",
		"",
		"1. Design the layout against the cases every direction already covers: read, grep, an edit",
		"   diff, a shell tail, an error, a pending call, and nested calls.",
		"2. Build a browser simulation of the candidate: one self-contained HTML page (inline CSS and",
		"   JS) modeled on the squint-tui preview page (`index.html`) — pi's dark theme tokens, the real",
		"   transcript vocabulary, and the same cases. Put it in a fresh dir created with",
		"   `mktemp -d \"${TMPDIR:-/tmp}/squint-preview.XXXXXX\"`, serve that dir locally",
		"   (`python3 -m http.server 0 --directory <dir>`), and print the exact dir path and the URL.",
		"3. Ask me to confirm the preview and stop there. If I ask for changes, revise the preview and",
		"   ask again; do not touch the extension until I confirm.",
		`4. On confirmation, implement the direction in ${join(HERE, "directions.ts")}: add the id to`,
		"   `Direction` and `DIRECTIONS`, write the renderer, add the `layout()` case and a",
		"   `collapsedLimit()` case, then run `node directions.test.ts` and `node logic.test.ts` and fix",
		"   until both are green.",
		"5. Delete the preview: stop the local server, `rm -rf` the exact `squint-preview.*` dir from",
		"   step 2, then run `test ! -e <dir>` to confirm every file is gone. If that check fails, say so",
		"   instead of claiming success. Only then report done.",
		"6. Optimise: re-read the renderer for needless work on the render path and remove it; report",
		"   what changed in a few lines.",
		"",
		"Touch only the squint files above and the `squint-preview.*` dir.",
	].join("\n");
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
	const settings = loadSettings();
	let direction: Mode = settings.direction;
	let codeBlock: CodeStyle = settings.codeBlock;

	/**
	 * How pi's renderer asks squint to draw a fenced code block. The shim (shim.ts) calls this
	 * global; the style is read per block, so switching it needs no reload, and a style that
	 * throws falls back to pi's own fences instead of breaking the transcript.
	 */
	const codeHook: CodeBlockHook = (code, lang, width, area) => {
		try {
			if (codeBlock === "off") return undefined;
			const theme = liveTheme();
			if (!theme) return undefined;
			return renderCodeBlock({ style: codeBlock, theme, area, ink: parseColor(BADGE_FG) }, code, lang, width);
		} catch {
			return undefined;
		}
	};
	(globalThis as Record<string, unknown>)["__squintCodeBlock"] = codeHook;
	let latestId: string | null = null;
	/** Read once per load; a new binding only takes effect after /reload (or ctx.reload()). */
	const key = settings.key;
	const expandLabel = keyLabel(key);

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
	const keyHint = (id: string) => (action: string) => (id === latestId ? `${expandLabel} ${action}` : `click ${action}`);

	const toggle = (id: string | null) => {
		if (!id) return;
		if (expanded.has(id)) expanded.delete(id);
		else expanded.add(id);
		invalidators.get(id)?.();
	};

	/**
	 * Switch mode and redraw every row already on screen. Returns true when the runtime has to
	 * reload: "off" changes which renderers win, and those are fixed when a row is built.
	 */
	const apply = (next: Mode): boolean => {
		const reload = next === OFF || direction === OFF;
		direction = next;
		settings.direction = next;
		saveSettings(settings);
		if (!reload) for (const invalidate of invalidators.values()) invalidate();
		return reload;
	};

	/** Install or repair the renderer shim; true when anything had to be written just now. */
	const patchedNow = (): boolean => {
		try {
			return ensureShim().some((result) => result.action === "installed");
		} catch {
			// An unwritable install (a read-only home, a sandbox) must not break the session.
			return false;
		}
	};

	/** Store a binding; the shortcut is only re-read when the extension reloads. */
	const setKey = (raw: string | undefined): boolean => {
		const id = normalizeKeyId(raw);
		if (!id) return false;
		settings.key = id;
		saveSettings(settings);
		return true;
	};

	/**
	 * Switch the code block style. The shim is what makes a style visible at all, so it is
	 * confirmed here: when it had to be installed, this session cannot draw the new style yet
	 * and the user is told to restart instead of being left with a silent no-op.
	 */
	const setCodeBlock = async (next: CodeStyle, ctx: ExtensionCommandContext): Promise<void> => {
		codeBlock = next;
		settings.codeBlock = next;
		saveSettings(settings);
		if (patchedNow()) {
			ctx.ui.notify(`squint: code blocks are set to "${next}", but the renderer shim was just installed — restart pi to see it`, "warning");
			return;
		}
		// Same reload the tool directions use: it re-renders the transcript, which is
		// already holding code blocks drawn by the previous style.
		await ctx.reload();
	};

	const state = (id: string): Live => {
		let current = live.get(id);
		if (!current) {
			current = { args: undefined, text: "", isError: false, pending: true };
			live.set(id, current);
		}
		return current;
	};

	/** The direction to lay out with; "off" never reaches a squint component, but be safe. */
	const activeDirection = (): Direction => (direction === OFF ? DEFAULT_DIRECTION : direction);

	function nestedRows(parentId: string, depth: number): Row[] {
		if (depth >= 2) return [];
		return (children.get(parentId) ?? []).map((child) => childRow(child, depth));
	}

	function childRow(child: Child, depth: number): Row {
		// A child row is always drawn open: it only exists once its parent is being shown expanded.
		return buildRow(activeDirection(), classify(child.toolName), {
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
		return buildRow(activeDirection(), info, {
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
		const lines = layout(activeDirection(), rowFor(info, id), cols, isOpen(id), { keyHint: keyHint(id) }).map((line) => styleSegs(theme, line));
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
		if (direction !== OFF) ctx.ui.setHiddenThinkingLabel("THINK · click to expand");
		// A pi update ships the stock renderer again, so the shim is put back on every start.
		if (patchedNow() && codeBlock !== "off") {
			ctx.ui.notify("squint: re-applied the code block shim after the pi update — restart pi to see code blocks", "info");
		}
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

	// Own the configured key so core's global toggle (which expands every tool row and section)
	// never fires. The built-in app.tools.expand binding is released in keybindings.json.
	if (direction !== OFF) {
		pi.registerShortcut(key as KeyId, {
			description: "Expand the latest tool output",
			handler: () => toggle(latestId),
		});
	}

	/** Everything the picker and completion offer: the five directions, plus off and custom. */
	type Choice = { id: Mode; label: string; blurb: string } | { id: "custom"; label: string; blurb: string };
	const CHOICES: ReadonlyArray<Choice> = [
		{ id: OFF, label: "Default pi TUI", blurb: "squint off; pi draws tool calls itself" },
		...DIRECTIONS,
		{ id: "custom", label: "Custom…", blurb: "describe a layout; pi builds it with a local preview" },
	];

	/** Save the instructions and set pi to work on the direction they describe. */
	const startCustom = (instructions: string, ctx: ExtensionCommandContext): void => {
		settings.custom = { instructions };
		saveSettings(settings);
		const message = customPrompt(instructions);
		if (ctx.isIdle()) pi.sendUserMessage(message);
		else pi.sendUserMessage(message, { deliverAs: "followUp" });
		ctx.ui.notify("squint: instructions saved — building a preview…", "info");
	};

	/** Open the instructions editor (prefilled with the last ones) and start the build. */
	const promptCustom = async (ctx: ExtensionCommandContext): Promise<void> => {
		const typed = await ctx.ui.editor("Describe how tool calls should render", settings.custom?.instructions ?? "");
		if (!typed?.trim()) return;
		startCustom(typed.trim(), ctx);
	};

	pi.registerCommand("squint", {
		description: `How tool calls render — ${CHOICES.map((c) => c.id).join(", ")}; "code <style>" for code blocks; or "key <binding>"`,
		getArgumentCompletions: (prefix: string) => {
			const typed = prefix.trim().toLowerCase();
			const matches = CHOICES.filter((c) => c.id.startsWith(typed)).map((c) => ({ value: c.id, label: `${c.id} — ${c.blurb}` }));
			if (matches.length === 0 && "key".startsWith(typed)) matches.push({ value: "key", label: "key <binding> — set the expand/collapse shortcut" });
			if (matches.length === 0 && "code".startsWith(typed)) matches.push({ value: "code", label: `code <style> — how code blocks render (${CODE_STYLES.map((s) => s.id).join(", ")})` });
			return matches.length > 0 ? matches : null;
		},
		handler: async (args: string, ctx) => {
			const raw = args.trim();
			const space = raw.indexOf(" ");
			const head = (space === -1 ? raw : raw.slice(0, space)).toLowerCase();
			const tail = space === -1 ? "" : raw.slice(space + 1).trim();

			if (head === "key") {
				if (!ctx.hasUI) {
					ctx.ui.notify(`squint: collapse key ${key}`, "info");
					return;
				}
				const typed = tail || (await ctx.ui.input(`squint collapse key (now ${expandLabel})`, key));
				if (!typed) return;
				if (!setKey(typed)) {
					ctx.ui.notify(`squint: "${typed}" is not a key (try super+e, ctrl+o, ctrl+shift+x)`, "warning");
					return;
				}
				// The shortcut is fixed when the extension loads, so a new binding needs a reload.
				await ctx.reload();
				return;
			}

			if (head === "code") {
				const named = tail ? CODE_STYLES.find((style) => style.id === tail) : undefined;
				if (tail && !named) {
					ctx.ui.notify(`squint: unknown code style "${tail}". Options: ${CODE_STYLES.map((s) => s.id).join(", ")}`, "warning");
					return;
				}
				if (named) {
					await setCodeBlock(named.id, ctx);
					return;
				}
				if (!ctx.hasUI) {
					ctx.ui.notify(`squint: code blocks ${codeBlock}`, "info");
					return;
				}
				// One pick then close, like the directions picker.
				const options = CODE_STYLES.map((style) => `${style.id === codeBlock ? "●" : "○"} ${style.label} — ${style.blurb}`);
				const selection = await ctx.ui.select(`squint — how code blocks render (now: ${codeBlock})`, options);
				if (!selection) return;
				const picked = CODE_STYLES[options.indexOf(selection)];
				if (!picked) return;
				await setCodeBlock(picked.id, ctx);
				return;
			}

			if (head === "custom") {
				if (!ctx.hasUI) {
					ctx.ui.notify("squint: custom needs an interactive session", "warning");
					return;
				}
				if (tail) startCustom(tail, ctx);
				else await promptCustom(ctx);
				return;
			}

			if (head) {
				const hit = CHOICES.find((choice) => choice.id === head);
				if (!hit) {
					ctx.ui.notify(`squint: unknown mode "${head}". Options: ${CHOICES.map((c) => c.id).join(", ")}, key`, "warning");
					return;
				}
				if (hit.id === "custom") return;
				if (apply(hit.id)) {
					await ctx.reload();
					return;
				}
				ctx.ui.notify(`squint: ${hit.label} — ${hit.blurb}`, "info");
				return;
			}

			if (!ctx.hasUI) {
				ctx.ui.notify(`squint: ${direction}`, "info");
				return;
			}
			// One pick then close, so the transcript is visible immediately behind the picker.
			const choices = CHOICES.map((c) => `${c.id === direction ? "●" : "○"} ${c.label} — ${c.blurb}`);
			const picked = await ctx.ui.select(`squint — how tool calls render (now: ${direction} · ${expandLabel})`, choices);
			if (!picked) return;
			const hit = CHOICES[choices.indexOf(picked)];
			if (!hit) return;
			if (hit.id === "custom") {
				await promptCustom(ctx);
				return;
			}
			if (apply(hit.id)) {
				await ctx.reload();
				return;
			}
			ctx.ui.notify(`squint: ${hit.label}`, "info");
		},
	});

	pi.registerToolRenderer((toolName, next): ToolRenderers | undefined => {
		// "off" hands the call back to whatever renderer would have won without squint.
		if (direction === OFF) return next();
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
