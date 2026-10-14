/**
 * Code block styles — the second thing squint draws.
 *
 * Tool calls have directions (directions.ts); fenced code blocks have styles, switched the
 * same way (/squint code). Each style is a pure layout over the highlighted lines of one code
 * token:
 *
 *   off      hand the block back to pi, fences and all        (the escape hatch)
 *   spine    a muted language label, one left rule per line    (default)
 *   card     a closed card, label set into the top rail
 *   panel    a full-width ground, no glyphs spent on chrome
 *   listing  a dim line-number gutter and a stated line count
 *   rule     one hairline header carrying the language
 *   chip     a filled language badge on the first line
 *
 * Every style keeps pi's syntax highlighting: the code comes from the markdown theme's own
 * `highlightCode`, so a theme change moves the blocks with it. Chrome is painted from the
 * tokens pi itself uses for code (`mdCodeBlockBorder`) plus the panel/link tokens, never a
 * hard-coded hex; only the chip's ink is squint's own, and it is handed in by the caller.
 *
 * pi draws these through the shim in shim.ts. Without the shim the choice is inert and pi
 * keeps its fences; /squint code says so instead of pretending.
 *
 * This module imports nothing at runtime: it is the unit under codeblocks.test.ts.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";

export type CodeStyle = "off" | "spine" | "card" | "panel" | "listing" | "rule" | "chip";

export const CODE_STYLES: ReadonlyArray<{ id: CodeStyle; label: string; blurb: string }> = [
	{ id: "spine", label: "spine", blurb: "a muted language label, one left rule per line" },
	{ id: "card", label: "card", blurb: "a closed card with the label in its top rail" },
	{ id: "panel", label: "panel", blurb: "a full-width ground, no glyphs on chrome" },
	{ id: "listing", label: "listing", blurb: "a line-number gutter and a line count" },
	{ id: "rule", label: "rule", blurb: "one hairline header carrying the language" },
	{ id: "chip", label: "chip", blurb: "a filled language badge on the first line" },
	{ id: "off", label: "off", blurb: "pi's own fences, exactly as they ship" },
];

export const DEFAULT_CODE_STYLE: CodeStyle = "spine";

export function isCodeStyle(value: unknown): value is CodeStyle {
	return typeof value === "string" && CODE_STYLES.some((style) => style.id === value);
}

/**
 * The slice of pi's markdown theme the styles read. pi highlights fenced blocks with
 * `theme.highlightCode` and paints their chrome with `codeBlockBorder`, so squint uses the
 * same two functions and inherits every theme and language decision pi makes.
 */
export interface CodeArea {
	codeBlockBorder: (text: string) => string;
	highlightCode: (code: string, lang?: string) => string[];
}

/** Everything a style needs beyond the code itself. `ink` is a pi-tui Color, opaque here. */
export interface CodeContext {
	style: CodeStyle;
	theme: Theme;
	area: CodeArea;
	/** The chip's text colour: resolved by the caller, which can reach pi-tui's parseColor. */
	ink?: unknown;
	/**
	 * Cell width of a styled line, for the padded styles. The caller passes pi-tui's
	 * visibleWidth so a comment in Japanese or an emoji in a string keeps the right rail
	 * straight; the fallback counts code points, which is only right for ASCII.
	 */
	width?: (text: string) => number;
	/**
	 * pi-tui's wrapTextWithAnsi. The styles that claim a boundary wrap their own content, so a
	 * long line grows the block instead of tearing a hole in the right rail; without it the
	 * line is left whole and pi's component wraps it.
	 */
	wrap?: (text: string, width: number) => string[];
}

/**
 * A block whose entire content is itself one fenced block: what you get when a fenced
 * snippet is copied out of a chat message and pasted into a prompt, outer fence and all.
 * One level is unwrapped, because the alternative on screen is a code block whose first and
 * last lines are backticks. `off` still shows pi's own reading of the same text.
 */
export function unwrapFence(text: string): { text: string; lang?: string } {
	const lines = text.split("\n");
	if (lines.length < 2) return { text };
	const open = /^\s*(`{3,}|~{3,})([^\s`]*)\s*$/.exec(lines[0]);
	const close = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[lines.length - 1]);
	if (!open || !close) return { text };
	if (open[1][0] !== close[1][0] || close[1].length < open[1].length) return { text };
	return { text: lines.slice(1, -1).join("\n"), lang: open[2] || undefined };
}

/**
 * The same mistake one level up: pasting a whole *document* that was itself fenced — a 4+
 * backtick block quoting markdown that contains 3-backtick blocks. pi parses that as one code
 * block, so the sheet arrives as a card full of fence markers instead of as headings and code.
 *
 * Only a message that is nothing but that one fence is touched, only fences of 4+ backticks,
 * and only when the inside really does carry a fence — which is the reason anyone writes four
 * backticks in the first place. A straight 3-backtick code block, the common paste, is left
 * exactly as it is.
 */
export function unwrapQuotedMarkdown(markdown: string): string {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	while (lines.length && lines[0].trim() === "") lines.shift();
	while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
	if (lines.length < 4) return markdown;

	const open = /^(`{3,}|~{3,})([^\s`]*)$/.exec(lines[0]);
	const close = /^(`{3,}|~{3,})$/.exec(lines[lines.length - 1]);
	if (!open || !close) return markdown;
	if (open[1][0] !== close[1][0] || open[1].length < 4 || close[1].length < open[1].length) return markdown;

	const body = lines.slice(1, -1);
	if (!body.some((line) => /^\s*(`{3,}|~{3,})/.test(line))) return markdown;
	return body.join("\n");
}

/** Lines of terminal text: one string per physical line, already styled. */
export type CodeLines = string[];

const INDENT = "  ";

/** Width in cells, ignoring ANSI. Only right for ASCII; the caller passes pi-tui's visibleWidth. */
export function cellWidth(text: string): number {
	return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

const pad = (n: number) => " ".repeat(Math.max(0, n));

/** A language label clipped to `room` cells: a fence's info string is arbitrary text. */
function clipLabel(text: string, room: number, widthOf: (text: string) => number): string {
	if (widthOf(text) <= room) return text;
	let out = "";
	for (const char of text) {
		if (widthOf(out + char) > room - 1) break;
		out += char;
	}
	return `${out}…`;
}

/**
 * Layout one fenced code block. `undefined` means "pi draws it", which is what an unknown
 * style, empty content, or a caller in trouble must get.
 */
export function renderCodeBlock(context: CodeContext, code: string, lang: string | undefined, width: number): CodeLines | undefined {
	const { style, theme, area, ink } = context;
	if (style === "off") return undefined;
	const unwrapped = unwrapFence(code.replace(/\r\n?/g, "\n").replace(/\n$/, ""));
	const text = unwrapped.text;
	// After unwrapping, the code's own language is the one to highlight.
	const highlightedLang = unwrapped.lang ?? lang;
	const lines = area.highlightCode(text, highlightedLang);
	if (lines.length === 0) lines.push("");
	const widthOf = context.width ?? cellWidth;
	// The label is measured in cells and clipped, so a wide or long info string cannot tear the
	// boundary a style claims to respect.
	const label = clipLabel((unwrapped.lang ?? lang)?.trim() ?? "", Math.max(1, width - 6), widthOf);
	const wrapTo = (line: string, room: number): string[] =>
		widthOf(line) <= room || !context.wrap ? [line] : context.wrap(line, room);
	const painted = (value: string) => theme.style(value, { fg: theme.colors.mdCodeBlockBorder });
	const dim = (value: string) => theme.style(value, { fg: theme.colors.dim });
	const gutter = String(lines.length).length;

	switch (style) {
		case "spine": {
			const out: CodeLines = label ? [INDENT + painted(label)] : [];
			for (const line of lines) out.push(INDENT + painted("│ ") + line);
			return out;
		}

		case "card": {
			// Every line is exactly `width` cells: rails are `│ ` + body + fill + ` │`,
			// and the rails above and below close on the same column.
			const body = Math.max(4, width - 4);
			const top = `╭─${label ? ` ${label} ` : ""}`;
			const out: CodeLines = [painted(`${top}${"─".repeat(Math.max(1, width - widthOf(top) - 1))}╮`)];
			for (const line of lines) {
				// A line that does not fit becomes rows, so the card stays closed at both rails.
				for (const part of wrapTo(line, body)) {
					out.push(painted("│ ") + part + pad(body - widthOf(part)) + painted(" │"));
				}
			}
			out.push(painted(`╰${"─".repeat(Math.max(1, width - 2))}╯`));
			return out;
		}

		case "panel": {
			const out: CodeLines = label ? [pad(width - widthOf(label)) + painted(label)] : [];
			for (const line of lines) {
				// The ground is a rectangle, so it wraps rather than letting a line run past it.
				for (const part of wrapTo(line, width)) {
					out.push(theme.style(part + pad(width - widthOf(part)), { bg: theme.colors.toolPendingBg }));
				}
			}
			return out;
		}

		case "listing": {
			// The header carries the label and the line count, so the label gets what the count leaves.
			const count = `${lines.length} lines`;
			const title = clipLabel(label, Math.max(1, width - count.length - 1), widthOf);
			const out: CodeLines = title ? [painted(title) + pad(width - widthOf(title) - count.length) + dim(count)] : [];
			const blank = " ".repeat(gutter + 1);
			lines.forEach((line, index) => {
				const parts = wrapTo(line, Math.max(16, width - gutter - 3));
				parts.forEach((part, row) => {
					out.push(dim((row === 0 ? String(index + 1).padStart(gutter) + " " : blank)) + painted("│ ") + part);
				});
			});
			return out;
		}

		case "rule": {
			const out: CodeLines = [];
			if (label) out.push(painted(`${label} `) + painted("─".repeat(Math.max(0, width - widthOf(label) - 1))));
			for (const line of lines) out.push(INDENT + line);
			return out;
		}

		case "chip": {
			const out: CodeLines = [];
			lines.forEach((line, index) => {
				if (index === 0 && label) {
					const badge = theme.style(` ${label.toUpperCase()} `, { ...(ink ? { fg: ink } : {}), bg: theme.colors.mdLink, bold: true });
					out.push(INDENT + badge + INDENT + line);
					return;
				}
				out.push(INDENT + line);
			});
			return out;
		}
	}
}

/**
 * pi keeps the live Theme in a global slot keyed by this symbol, shared by the bundle pi's
 * transcript runs and by the package extensions import. Reading it is how a code block gets
 * real theme colours before any tool call has handed squint a theme of its own.
 */
const THEME_KEYS = [
	Symbol.for("@earendil-works/pi-coding-agent:theme"),
	Symbol.for("@mariozechner/pi-coding-agent:theme"),
];

export function liveTheme(): Theme | undefined {
	for (const key of THEME_KEYS) {
		const candidate = (globalThis as Record<PropertyKey, unknown>)[key] as Theme | undefined;
		if (candidate && typeof candidate.style === "function" && candidate.colors) return candidate;
	}
	return undefined;
}

/** The function the shim calls, with the style read fresh so a toggle needs no reload. */
export type CodeBlockHook = (code: string, lang: string | undefined, width: number, area: CodeArea) => CodeLines | undefined;
