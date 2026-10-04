/**
 * squint — the six render directions.
 *
 * Pure layout. Every function takes plain data and returns styled segments, so the
 * column maths is testable with plain node (see directions.test.ts) and the renderer
 * in index.ts stays a dispatcher. No imports beyond ./logic.ts, no terminal rendering.
 *
 * Cells, not pixels: everything here is monospace-terminal arithmetic, because the
 * thing being drawn is a terminal transcript. Wide glyphs count as two columns.
 */
import { diffLineKind, diffStats, previewLines, summarizeArgs, tailLines, toLines, type Classification, type Kind, type Tone } from "./logic.ts";

export type Direction = "badge" | "ledger" | "gutter" | "deck" | "rail" | "timeline";

/** Order is the picker order; the first entry is the default. */
export const DIRECTIONS: ReadonlyArray<{ id: Direction; label: string; blurb: string }> = [
	{ id: "rail", label: "Rail", blurb: "a trace spine; nesting is the point" },
	{ id: "ledger", label: "Ledger", blurb: "one aligned line per call; output on open" },
	{ id: "badge", label: "Badge", blurb: "the filled chip, as shipped before" },
	{ id: "gutter", label: "Gutter", blurb: "a typographic column instead of a chip" },
	{ id: "deck", label: "Deck", blurb: "each call boxed; nesting visible inside" },
	{ id: "timeline", label: "Timeline", blurb: "a duration bar per call, git-log flavored; output on open" },
];

export const DEFAULT_DIRECTION: Direction = "rail";

export function isDirection(value: unknown): value is Direction {
	return DIRECTIONS.some((d) => d.id === value);
}

/** Collapsed preview lines per direction. Ledger and timeline show none: that absence is their design. */
const BADGE_LIMIT: Partial<Record<Kind, number>> = { read: 6, grep: 8, find: 8, ls: 8, edit: 10, write: 4, shell: 8, agent: 4, web: 4, todo: 6, ask: 6, code: 6, other: 6 };

export function collapsedLimit(direction: Direction, kind: Kind): number {
	const badgeLimit = BADGE_LIMIT[kind] ?? 6;
	switch (direction) {
		case "ledger":
		case "timeline":
			return 0;
		case "badge":
			return badgeLimit;
		case "deck":
			return badgeLimit;
		case "gutter":
			return Math.max(3, badgeLimit - 2);
		default:
			return Math.max(3, badgeLimit - 2);
	}
}

export type Ink = Tone | "text" | "muted" | "dim" | "add" | "del" | "error" | "chip";
export type Fill = Tone | "add" | "del" | "pending" | "error";

export interface Seg {
	t: string;
	ink?: Ink;
	fill?: Fill;
	bold?: boolean;
}

export interface DiffRow {
	t: "add" | "del" | "ctx";
	s: string;
}

export interface Row {
	label: string;
	tone: Tone;
	summary: string;
	/** Right-hand metadata for ledger/gutter/deck/rail. Empty hides its column. */
	count: string;
	time: string;
	/** The raw duration the time column and the timeline bar are both derived from. */
	ms?: number;
	state: "ok" | "pending" | "error";
	/** Lines visible while collapsed. */
	preview: string[];
	/** Remainder revealed on open. */
	hidden: string[];
	/** Hidden total; for a shell tail row this exceeds hidden.length. */
	hiddenCount: number;
	/** "more", "earlier lines", "context lines". */
	hiddenLabel: string;
	/** A tail row's hidden lines are its earlier lines: the marker states the count, so the hint must not. */
	tail?: boolean;
	diff?: { rows: DiffRow[]; added: number; removed: number };
	nested?: Row[];
}

export interface LayoutOptions {
	/** Renders the expansion hint's key. Injected so this module stays terminal-free. */
	keyHint?: (action: string) => string;
	/** Per-line clip, before the width clip. Mirrors the extension's own limit. */
	maxLine?: number;
}

/* ------------------------------------------------------------------ *
 * cell width
 * ------------------------------------------------------------------ */
const WIDE: Array<[number, number]> = [
	[0x1100, 0x115f],
	[0x2e80, 0xa4cf],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe30, 0xfe6f],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x1f300, 0x1f64f],
	[0x1f900, 0x1f9ff],
	[0x20000, 0x3fffd],
];

function charWidth(cp: number): number {
	if (cp === 0x200d || (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
	for (const [lo, hi] of WIDE) if (cp >= lo && cp <= hi) return 2;
	return 1;
}

/**
 * The code point at `index`, without String.codePointAt: this is the hottest call in the module,
 * and a surrogate-aware charCodeAt pair is several times cheaper than the iterator protocol.
 */
function cpAt(text: string, index: number): number {
	const high = text.charCodeAt(index);
	if (high >= 0xd800 && high <= 0xdbff && index + 1 < text.length) {
		const low = text.charCodeAt(index + 1);
		if (low >= 0xdc00 && low <= 0xdfff) return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
	}
	return high;
}

/** True for the overwhelmingly common case: one cell, one UTF-16 unit. */
const isNarrow = (code: number): boolean => code < 0x0300;

/**
 * Cells this text occupies in a terminal. Single pass, index-based, no allocation: every line of
 * every visible row goes through here on a redraw, so it has to stay O(n) and cheap.
 */
export function cellWidth(text: string): number {
	let w = 0;
	for (let i = 0; i < text.length; ) {
		const code = text.charCodeAt(i);
		if (isNarrow(code)) {
			w += 1;
			i += 1;
			continue;
		}
		const cp = cpAt(text, i);
		w += charWidth(cp);
		i += cp > 0xffff ? 2 : 1;
	}
	return w;
}

/** The longest prefix of `text` that fits in `room` cells, cut only at a code point boundary. */
function cutTo(text: string, room: number): string {
	if (room <= 0) return "";
	let w = 0;
	for (let i = 0; i < text.length; ) {
		const code = text.charCodeAt(i);
		const cp = isNarrow(code) ? code : cpAt(text, i);
		const cw = isNarrow(code) ? 1 : charWidth(cp);
		if (w + cw > room) return text.slice(0, i);
		w += cw;
		i += cp > 0xffff ? 2 : 1;
	}
	return text;
}

export function clipW(text: string, max: number): string {
	if (max <= 0) return "";
	// Measure once. The walk stops as soon as the budget is spent, so a long line costs O(max), not
	// O(length); the old version re-measured the growing prefix on every character.
	let w = 0;
	for (let i = 0; i < text.length; ) {
		const code = text.charCodeAt(i);
		const cp = isNarrow(code) ? code : cpAt(text, i);
		const cw = isNarrow(code) ? 1 : charWidth(cp);
		if (w + cw > max) return cutTo(text, max - 1) + "…";
		w += cw;
		i += cp > 0xffff ? 2 : 1;
	}
	return text;
}

export function padEnd(text: string, cols: number): string {
	const gap = cols - cellWidth(text);
	return gap > 0 ? text + " ".repeat(gap) : text;
}

export function padStart(text: string, cols: number): string {
	const gap = cols - cellWidth(text);
	return gap > 0 ? " ".repeat(gap) + text : text;
}

const seg = (t: string, ink?: Ink, fill?: Fill, bold?: boolean): Seg => ({ t, ink, fill, bold });
const spaces = (n: number): string => " ".repeat(Math.max(0, n));

export function segsWidth(segs: Seg[]): number {
	let w = 0;
	for (const s of segs) w += cellWidth(s.t);
	return w;
}

/** Trim segments from the end until they fit `max` columns, marking the cut with an ellipsis. */
function clipSegs(segs: Seg[], max: number): Seg[] {
	const out: Seg[] = [];
	let room = max;
	if (room <= 0) return out;
	for (const s of segs) {
		const w = cellWidth(s.t);
		if (w <= room) {
			out.push(s);
			room -= w;
			continue;
		}
		out.push({ ...s, t: clipW(s.t, Math.max(1, room)) });
		return out;
	}
	return out;
}

/** Left block, right block, exactly one gap between them — the whole line fills `cols`. */
function fit(left: Seg[], right: Seg[], cols: number, fill = " "): Seg[] {
	const r = clipSegs(right, Math.max(0, cols - 1));
	const rw = segsWidth(r);
	const l = clipSegs(left, Math.max(0, cols - rw - 1));
	const gap = Math.max(0, cols - segsWidth(l) - rw);
	return [...l, seg(fill.repeat(gap), fill === " " ? undefined : "dim"), ...r];
}

/* ------------------------------------------------------------------ *
 * shared row pieces
 * ------------------------------------------------------------------ */
const MAX_LINE = 200;
const EXPANDED_LIMIT = 400;

function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "";
	// A sub-millisecond call is not worth "0ms"; say what it is rather than printing a zero.
	if (ms < 1) return "<1ms";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);
	return `${minutes}m${String(seconds).padStart(2, "0")}s`;
}

function diffModel(diff: string): NonNullable<Row["diff"]> {
	const rows = diff
		.split("\n")
		.filter((line) => line !== "")
		.map((line) => ({ t: diffLineKind(line), s: line }));
	const { added, removed } = diffStats(diff);
	return { rows, added, removed };
}

/** Everything a tool call contributes to its row, before any of it becomes cells. */
export interface RowInput {
	/** Raw tool arguments, straight from the model. Untrusted: a command can be a heredoc. */
	args: unknown;
	/** Raw result text, straight from the tool. */
	text: string;
	/** A unified diff, when the tool reports one. */
	diff?: string;
	isError: boolean;
	pending: boolean;
	ms?: number;
	/** Whether the row is expanded. Decides the slice, so the hint can stay honest in both states. */
	open: boolean;
	nested?: Row[];
}

/**
 * The one place a tool call becomes drawable data, shared by transcript rows and nested children.
 * It lives here, beside the layouts, because it is pure: it decides what a collapsed row shows and
 * what its count means, and directions.test.ts can drive it with the raw text a session hands over.
 */
export function buildRow(direction: Direction, info: Classification, input: RowInput): Row {
	const list = toLines(input.text);
	const limit = input.open ? EXPANDED_LIMIT : collapsedLimit(direction, info.kind);
	const model = input.diff ? diffModel(input.diff) : undefined;

	let preview: string[] = [];
	let hidden: string[] = [];
	let hiddenCount = 0;
	let tail = false;
	let hiddenLabel = "more";

	if (model) {
		// Collapsed shows the changed lines; the context lines are what the open reveals.
		hiddenCount = input.open ? 0 : model.rows.filter((r) => r.t === "ctx").length;
		hiddenLabel = "context lines";
	} else if (limit === 0) {
		// Ledger: nothing until the row is opened.
		hidden = list.slice(0, EXPANDED_LIMIT);
	} else if (info.kind === "shell" && !input.open) {
		// A shell's interesting lines are its last ones, so the collapsed preview is the tail and the
		// withheld count names the earlier lines that opening brings back, in order, from the top.
		const sliced = tailLines(list, limit);
		preview = sliced.shown;
		hiddenCount = sliced.hidden;
		hiddenLabel = "earlier lines";
		tail = sliced.hidden > 0;
	} else {
		const sliced = previewLines(list, limit);
		preview = sliced.shown;
		hidden = input.open ? [] : list.slice(limit, EXPANDED_LIMIT);
		// Past the cap there are lines even an open row cannot show, and only the count says so.
		hiddenCount = input.open ? Math.max(0, list.length - EXPANDED_LIMIT) : sliced.hidden;
	}

	const unit = info.kind === "grep" ? "matches" : info.kind === "find" ? "files" : info.kind === "ls" ? "entries" : "lines";
	return {
		label: info.label,
		tone: info.tone,
		summary: summarizeArgs(info.kind, input.args),
		count: input.isError ? "error" : model ? `+${model.added} −${model.removed}` : input.pending ? "streaming" : `${list.length} ${unit}`,

		// A running row has no duration worth printing yet; the count column already says it is live.
		time: input.pending || input.ms === undefined ? "" : formatDuration(input.ms),
		ms: input.pending ? undefined : input.ms,
		state: input.isError ? "error" : input.pending ? "pending" : "ok",
		preview,
		hidden,
		hiddenCount,
		hiddenLabel,
		tail,
		diff: model,
		nested: input.nested,
	};
}

function clipped(lines: string[], maxLine: number): string[] {
	return lines.map((l) => clipW(l, Math.min(MAX_LINE, maxLine)));
}

/**
 * Something withheld that opening would reveal. A row that is already fully open withholds nothing,
 * so its hint goes away — otherwise it keeps offering to reveal lines that are already on screen.
 */
function revealable(row: Row): boolean {
	return row.hidden.length > 0 || row.hiddenCount > 0;
}

/** Ledger shows no preview while collapsed, so any content at all earns a chevron. */
function toggleable(row: Row): boolean {
	return row.preview.length > 0 || revealable(row);
}

/** Mirrors the extension: a shell tail row carries no count, and a row with nothing behind it has no affordance. */
function hintSegs(row: Row, open: boolean, keyHint: (action: string) => string): Seg[] | undefined {
	if (!revealable(row)) return undefined;
	const more = !row.tail && row.hiddenCount > 0 ? `+${row.hiddenCount} ${row.hiddenLabel} · ` : "";
	return [seg(more + keyHint(open ? "to collapse" : "to expand"), "dim")];
}

/** Collapsed shows changed lines only; context arrives with the open. Mirrors diffPreview(). */
function diffRows(row: Row, open: boolean): DiffRow[] {
	const rows = row.diff?.rows ?? [];
	// Collapsed shows changed lines only, capped like the extension's own collapsed edit limit;
	// context arrives with the open. Mirrors diffPreview().
	return open ? rows.slice(0, 400) : rows.filter((r) => r.t !== "ctx").slice(0, 10);
}

const DIFF_INK: Record<DiffRow["t"], Ink> = { add: "add", del: "del", ctx: "muted" };
const DIFF_FILL: Record<DiffRow["t"], Fill> = { add: "add", del: "del", ctx: "pending" };

/* ------------------------------------------------------------------ *
 * 01 badge — the incumbent: filled chip, per-kind slice, full-bleed bands
 * ------------------------------------------------------------------ */
function badge(row: Row, cols: number, open: boolean, opts: Required<LayoutOptions>): Seg[][] {
	const ind = row.label.length + 3;
	const out: Seg[][] = [];
	const head: Seg[] = [seg(` ${row.label} `, "chip", row.tone, true)];
	if (row.summary) head.push(seg(` ${row.summary}`, "text"));
	out.push(clipSegs(head, cols));

	if (row.state === "pending" && row.preview.length === 0 && row.hidden.length === 0) {
		out.push([seg(`${spaces(ind)}…`, "dim")]);
	} else if (row.state === "error") {
		for (const line of clipped(open ? [...row.preview, ...row.hidden] : row.preview, cols - ind - 2)) {
			out.push([seg(spaces(ind)), seg(` ${line}`, "error", "error")]);
		}
	} else if (row.diff) {
		const stats: Seg[] = [seg(`+${row.diff.added}`, "add"), seg(" / ", "dim"), seg(`−${row.diff.removed}`, "del")];
		for (const line of diffRows(row, open)) {
			out.push([seg(spaces(ind)), seg(` ${clipW(line.s, cols - ind - 2)}`, DIFF_INK[line.t], DIFF_FILL[line.t])]);
		}
		const hint = hintSegs(row, open, opts.keyHint);
		out.push(clipSegs(hint ? [seg(spaces(ind)), ...stats, seg("  ", "dim"), ...hint] : [seg(spaces(ind)), ...stats], cols));
	} else {
		if (row.tail) out.push([seg(spaces(ind) + clipW(`… ${row.hiddenCount} ${row.hiddenLabel}`, cols - ind), "dim")]);
		for (const line of clipped(row.preview, cols - ind - 1)) out.push([seg(spaces(ind) + line, "muted")]);
		if (open) for (const line of clipped(row.hidden, cols - ind - 1)) out.push([seg(spaces(ind) + line, "muted")]);
	}

	out.push(...nestedBlock(row, cols, opts, 2));
	const hint = hintSegs(row, open, opts.keyHint);
	if (hint && !row.diff) out.push([seg(spaces(ind)), ...clipSegs(hint, cols - ind)]);
	return out;
}

/* ------------------------------------------------------------------ *
 * 02 ledger — one aligned line per call
 * ------------------------------------------------------------------ */
const LEDGER_LABEL = 8;
const LEDGER_COUNT = 10;
const LEDGER_TIME = 6;

function ledger(row: Row, cols: number, open: boolean, opts: Required<LayoutOptions>): Seg[][] {
	const count = row.state === "error" ? row.count || "error" : row.count;
	const head: Seg[] = [
		seg(row.state === "pending" ? "▫" : "▪", row.state === "error" ? "error" : row.tone),
		seg(" "),
		seg(padEnd(clipW(row.label, LEDGER_LABEL), LEDGER_LABEL), row.tone, undefined, true),
		seg(" "),
		seg(row.summary || "—", "text"),
	];
	const right: Seg[] = [
		seg(padStart(clipW(count, LEDGER_COUNT), LEDGER_COUNT), row.state === "error" ? "error" : "dim"),
		seg(" "),
		seg(padStart(clipW(row.time, LEDGER_TIME), LEDGER_TIME), "dim"),
		seg(" "),
		seg(toggleable(row) ? (open ? "▾" : "▸") : " ", "dim"),
	];
	const out: Seg[][] = [fit(head, right, cols)];
	if (open) for (const line of bodyLines(row, open, opts, cols - 4)) out.push([seg("  │ ", "dim"), ...line]);
	return out;
}

/* ------------------------------------------------------------------ *
 * 03 gutter — a typographic column; output hangs off a 1px rule
 * ------------------------------------------------------------------ */
const GUTTER_LABEL = 7;
/** The rule sits under the summary column it serves: label cell + its two-space gap. */
const GUTTER_RULE = GUTTER_LABEL + 2;

function gutter(row: Row, cols: number, open: boolean, opts: Required<LayoutOptions>): Seg[][] {
	const meta = row.state === "error" ? row.count || "error" : row.count;
	const metaRoom = Math.max(0, Math.min(14, cols - 12));
	const head: Seg[] = [
		seg(padEnd(clipW(row.label, GUTTER_LABEL), GUTTER_LABEL), row.tone, undefined, true),
		seg("  "),
		seg(row.summary || "—", "text"),
	];
	const out: Seg[][] = [meta && metaRoom ? fit(head, [seg(clipW(meta, metaRoom), row.state === "error" ? "error" : "dim")], cols) : clipSegs(head, cols)];
	for (const line of bodyLines(row, open, opts, cols - GUTTER_RULE - 2)) out.push([seg(`${spaces(GUTTER_RULE)}│ `, "dim"), ...line]);
	out.push(...nestedBlock(row, cols - GUTTER_RULE - 2, opts, 2).map((line) => [seg(`${spaces(GUTTER_RULE)}│ `, "dim"), ...line]));
	const hint = hintSegs(row, open, opts.keyHint);
	if (hint) out.push([seg(`${spaces(GUTTER_RULE)}│ `, "dim"), ...clipSegs(hint, cols - GUTTER_RULE - 2)]);
	return out;
}

/* ------------------------------------------------------------------ *
 * 04 deck — each call boxed; a nested call is a box inside its parent
 * ------------------------------------------------------------------ */
function deckLines(row: Row, cols: number, open: boolean, opts: Required<LayoutOptions>): Seg[][] {
	const inner = Math.max(8, cols - 2);
	const out: Seg[][] = [];
	const left: Seg[] = [
		seg("╭─", "dim"),
		seg(row.state === "pending" ? "○" : "●", row.state === "error" ? "error" : row.tone),
		seg(" "),
		seg(padEnd(clipW(row.label, 10), 10), row.tone, undefined, true),
		seg(" "),
		seg(row.summary || "—", "text"),
		seg(" "),
	];
	const meta = [row.count, row.time].filter(Boolean).join(" · ");
	const metaRoom = Math.max(0, Math.min(22, cols - 26));
	const right: Seg[] = [seg(meta && metaRoom ? ` ${clipW(meta, metaRoom)} ` : " ", "dim"), seg("─╮", "dim")];
	out.push(fit(left, right, cols, "─"));

	for (const line of bodyLines(row, open, opts, inner - 2)) {
		const ink = line.find((s) => s.ink)?.ink;
		const fill = line.find((s) => s.fill)?.fill;
		out.push([seg("│", "dim"), seg(padEnd(` ${clipW(line.map((s) => s.t).join(""), inner - 2)}`, inner), ink, fill), seg("│", "dim")]);
	}
	for (const line of nestedBlock(row, cols - 4, opts, 0)) {
		const gap = Math.max(0, cols - 4 - segsWidth(line));
		out.push([seg("│ ", "dim"), ...line, seg(" ".repeat(gap)), seg(" │", "dim")]);
	}
	const hint = hintSegs(row, open, opts.keyHint);
	if (hint) out.push([seg("│", "dim"), seg(padEnd(` ${clipW(hint[0].t, inner - 2)}`, inner), "dim"), seg("│", "dim")]);
	out.push([seg(`╰${"─".repeat(Math.max(0, cols - 2))}╯`, "dim")]);
	return out;
}

/* ------------------------------------------------------------------ *
 * 05 rail — a trace spine; nested work hangs off its parent
 * ------------------------------------------------------------------ */
const RAIL_LABEL = 6;

function rail(row: Row, cols: number, open: boolean, opts: Required<LayoutOptions>): Seg[][] {
	const head: Seg[] = [
		seg(row.state === "pending" ? "○" : "●", row.state === "error" ? "error" : row.tone),
		seg(" "),
		seg(padEnd(clipW(row.label, RAIL_LABEL), RAIL_LABEL), row.tone, undefined, true),
		seg("  "),
		seg(row.summary || "—", "text"),
	];
	const meta = [row.count, row.time].filter(Boolean).join(" · ");
	const metaRoom = Math.max(0, Math.min(22, cols - 14));
	const out: Seg[][] = [meta && metaRoom ? fit(head, [seg(clipW(meta, metaRoom), "dim")], cols) : clipSegs(head, cols)];
	for (const line of bodyLines(row, open, opts, cols - 3)) out.push([seg("│ ", "dim"), ...line]);
	out.push(...railChildren(row, cols, opts));
	const hint = hintSegs(row, open, opts.keyHint);
	if (hint) out.push([seg("│ ", "dim"), ...clipSegs(hint, cols - 2)]);
	return out;
}

function railChildren(row: Row, cols: number, opts: Required<LayoutOptions>): Seg[][] {
	const kids = row.nested ?? [];
	const out: Seg[][] = [];
	kids.forEach((kid, i) => {
		const last = i === kids.length - 1;
		const head: Seg[] = [
			seg(`│ ${last ? "└─" : "├─"}`, "dim"),
			seg(kid.state === "pending" ? "○" : "●", kid.state === "error" ? "error" : kid.tone),
			seg(" "),
			seg(padEnd(clipW(kid.label, RAIL_LABEL), RAIL_LABEL), kid.tone, undefined, true),
			seg("  "),
			seg(kid.summary || "—", "text"),
		];
		out.push(clipSegs(head, cols));
		for (const line of bodyLines(kid, true, opts, cols - 6)) out.push([seg(last ? "│   " : "│ │ ", "dim"), ...line]);
	});
	return out;
}

/* ------------------------------------------------------------------ *
 * 06 timeline — one bar per call, git-log flavored
 * ------------------------------------------------------------------ */
const T_BAR = 8;
const T_MS_PER_CELL = 25;
const T_LABEL = 6;
/** Below this the argument stops being an argument; it is the point to shed a column. */
const T_SUMMARY_MIN = 6;

/** 25ms per cell, capped at the bar's eight cells. A running call has no duration yet. */
function barCells(ms: number | undefined): number {
	if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return 0;
	return Math.min(T_BAR, Math.ceil(ms / T_MS_PER_CELL));
}

function barSegs(row: Row): Seg[] {
	const filled = row.state === "pending" ? 0 : barCells(row.ms);
	const ink: Ink = row.state === "error" ? "error" : row.state === "pending" ? "dim" : row.tone;
	const bar: Seg[] = [];
	if (filled > 0) bar.push(seg("▇".repeat(filled), ink));
	if (filled < T_BAR) bar.push(seg(spaces(T_BAR - filled)));
	return bar;
}

/** A running call has no duration worth printing; the ellipsis is the honest stand-in. */
function timelineMeta(row: Row): Seg[] {
	if (row.state === "pending") return [seg("…", "dim")];
	const parts: Seg[] = [];
	if (row.time) parts.push(seg(row.time, "dim"));
	if (row.diff) {
		if (parts.length > 0) parts.push(seg("  ", "dim"));
		parts.push(seg(`+${row.diff.added}`, "add"), seg(" ", "dim"), seg(`−${row.diff.removed}`, "del"));
	}
	return parts;
}

/**
 * The bar is a fixed eight-cell column, so labels line up down the transcript; the glyph states the
 * call, the label is six cells and the argument takes the rest. When the width runs out the bar goes
 * first, then the metadata: a bar with no room for the argument it belongs to is worse than no bar.
 */
function timelineHead(row: Row, cols: number, indent: number): Seg[] {
	const glyph = row.state === "pending" ? "○" : row.state === "error" ? "✖" : "●";
	const glyphInk: Ink = row.state === "error" ? "error" : row.state === "pending" ? "dim" : row.tone;
	const right = timelineMeta(row);
	const rightW = segsWidth(right);
	const metaW = rightW > 0 ? rightW + 1 : 0;
	// Width without the bar's nine cells: indent + glyph + gap + label + gap.
	const bare = indent + 1 + 1 + T_LABEL + 2;
	const withBar = cols - bare - (T_BAR + 1) - metaW >= T_SUMMARY_MIN;
	// The bar goes first, then the metadata: the wider form wins only if the long one had no room.
	const withRight = withBar || cols - bare - metaW >= T_SUMMARY_MIN;
	const core: Seg[] = [
		seg(glyph, glyphInk),
		seg(" "),
		seg(padEnd(clipW(row.label, T_LABEL), T_LABEL), row.tone, undefined, true),
		seg("  "),
		seg(row.summary || "—", "text"),
	];
	const left = withBar ? [seg(spaces(indent)), ...barSegs(row), seg(" "), ...core] : [seg(spaces(indent)), ...core];
	return withRight && rightW > 0 ? fit(left, right, cols) : clipSegs(left, cols);
}

/** One call, its body when open, and its children as the same row two cells deeper. */
function timelineLines(row: Row, cols: number, open: boolean, opts: Required<LayoutOptions>, depth: number): Seg[][] {
	const indent = depth * 2;
	// The body hangs two cells in, under the bar it belongs to.
	const bodyIndent = indent + 2;
	const out: Seg[][] = [timelineHead(row, cols, indent)];

	// Collapsed shows the head and nothing else — except the one line that names what is withheld.
	if (!open && row.tail && row.hiddenCount > 0) {
		out.push([seg(`${spaces(bodyIndent)}${clipW(`… ${row.hiddenCount} ${row.hiddenLabel}`, cols - bodyIndent)}`, "dim")]);
	}
	if (open) {
		const maxLine = Math.max(1, cols - bodyIndent);
		for (const line of bodyLines(row, open, opts, maxLine)) out.push([seg(spaces(bodyIndent)), ...line]);
		for (const kid of row.nested ?? []) out.push(...timelineLines(kid, cols, true, opts, depth + 1));
	}
	// Only the outermost row owns the affordance: a nested call is not clickable on its own.
	if (depth === 0) {
		const hint = hintSegs(row, open, opts.keyHint);
		if (hint) out.push([seg(spaces(bodyIndent)), ...clipSegs(hint, Math.max(1, cols - bodyIndent))]);
	}
	return out;
}

function timeline(row: Row, cols: number, open: boolean, opts: Required<LayoutOptions>): Seg[][] {
	return timelineLines(row, cols, open, opts, 0);
}

/* ------------------------------------------------------------------ *
 * shared body + nesting
 * ------------------------------------------------------------------ */
function bodyLines(row: Row, open: boolean, opts: Required<LayoutOptions>, maxLine: number): Seg[][] {
	if (row.state === "pending" && row.preview.length === 0) return [[seg("…", "dim")]];
	if (row.diff) {
		const lines: Seg[][] = diffRows(row, open).map((line) => [seg(clipW(line.s, maxLine), DIFF_INK[line.t])]);
		lines.push([seg(`+${row.diff.added} −${row.diff.removed}`, "dim")]);
		return lines;
	}
	const out: Seg[][] = [];
	if (row.tail) out.push([seg(clipW(`… ${row.hiddenCount} ${row.hiddenLabel}`, maxLine), "dim")]);
	for (const line of clipped(row.preview, maxLine)) out.push([seg(line, "muted")]);
	if (open) for (const line of clipped(row.hidden, maxLine)) out.push([seg(line, "muted")]);
	return out;
}

/**
 * One level of nesting, rendered in the incumbent's compact chip form rather than in the
 * parent's own direction: a child should stay recognisable at the indent, and a chip is the
 * densest thing that still names the tool and its target.
 */
function nestedBlock(row: Row, cols: number, opts: Required<LayoutOptions>, indent: number): Seg[][] {
	const kids = row.nested ?? [];
	if (kids.length === 0) return [];
	const childCols = Math.max(8, cols - indent);
	// The outer clip is what keeps a deeply indented child inside the terminal even when the
	// child's own layout had to fall back to its own minimum width.
	return kids.flatMap((kid) => layout("badge", kid, childCols, true, opts).map((line) => clipSegs([seg(spaces(indent)), ...line], cols)));
}

/* ------------------------------------------------------------------ *
 * one segment is one physical line
 *
 * Everything a caller hands in is untrusted single-line text: a shell command can be a
 * multi-line heredoc, a subagent's prompt can carry newlines, a code block arrives with
 * tabs. A newline or a bare carriage return inside a segment breaks the frame — the
 * terminal moves the cursor and the row paints over whatever is below it — and a tab
 * jumps to a tab stop, so every column after it is wrong. The rule is enforced once,
 * here, rather than in each direction that happens to render a summary.
 * ------------------------------------------------------------------ */
const CONTROL = /[\r\n\f\v\u0085\u2028\u2029]+/g;

/** Collapse untrusted text to one line: newlines to a space, a tab to its two-space stop. */
function oneLine(text: string): string {
	return text.replace(CONTROL, " ").replace(/\t/g, "  ");
}

function oneLineRow(row: Row): Row {
	return {
		...row,
		summary: oneLine(row.summary),
		count: oneLine(row.count),
		time: oneLine(row.time),
		hiddenLabel: oneLine(row.hiddenLabel),
		preview: row.preview.map(oneLine),
		hidden: row.hidden.map(oneLine),
		diff: row.diff ? { ...row.diff, rows: row.diff.rows.map((r) => ({ ...r, s: oneLine(r.s) })) } : undefined,
		// Children are flattened here too, because a direction may draw them itself (rail) rather
		// than handing them back to layout().
		nested: row.nested?.map(oneLineRow),
	};
}

/* ------------------------------------------------------------------ *
 * entry point
 * ------------------------------------------------------------------ */
export function layout(direction: Direction, row: Row, cols: number, open: boolean, options: LayoutOptions = {}): Seg[][] {
	const opts: Required<LayoutOptions> = {
		keyHint: options.keyHint ?? ((action) => `click ${action}`),
		maxLine: options.maxLine ?? MAX_LINE,
	};
	const clean = oneLineRow(row);
	const w = Math.max(20, cols);
	switch (direction) {
		case "ledger":
			return ledger(clean, w, open, opts);
		case "gutter":
			return gutter(clean, w, open, opts);
		case "deck":
			return deckLines(clean, w, open, opts);
		case "rail":
			return rail(clean, w, open, opts);
		case "timeline":
			return timeline(clean, w, open, opts);
		default:
			return badge(clean, w, open, opts);
	}
}
