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
}

/** Lines of terminal text: one string per physical line, already styled. */
export type CodeLines = string[];

const INDENT = "  ";

/** Width in cells, ignoring ANSI. Code lines are ASCII; pi's markdown theme has no wide-glyph helper. */
export function cellWidth(text: string): number {
	return text.replace(/\x1b\[[0-9;]*m/g, "").length;
}

const pad = (n: number) => " ".repeat(Math.max(0, n));

/**
 * Layout one fenced code block. `undefined` means "pi draws it", which is what an unknown
 * style, empty content, or a caller in trouble must get.
 */
export function renderCodeBlock(context: CodeContext, code: string, lang: string | undefined, width: number): CodeLines | undefined {
	const { style, theme, area, ink } = context;
	if (style === "off") return undefined;
	const text = code.replace(/\r\n?/g, "\n").replace(/\n$/, "");
	if (!text) return undefined;

	const lines = area.highlightCode(text, lang);
	const painted = (value: string) => theme.style(value, { fg: theme.colors.mdCodeBlockBorder });
	const dim = (value: string) => theme.style(value, { fg: theme.colors.dim });
	const label = lang?.trim();
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
			const out: CodeLines = [painted(`${top}${"─".repeat(Math.max(0, width - top.length - 1))}╮`)];
			for (const line of lines) {
				out.push(painted("│ ") + line + pad(body - cellWidth(line)) + painted(" │"));
			}
			out.push(painted(`╰${"─".repeat(Math.max(1, width - 2))}╯`));
			return out;
		}

		case "panel": {
			const out: CodeLines = label ? [pad(width - cellWidth(label)) + painted(label)] : [];
			for (const line of lines) {
				out.push(theme.style(line + pad(width - cellWidth(line)), { bg: theme.colors.toolPendingBg }));
			}
			return out;
		}

		case "listing": {
			const out: CodeLines = label
				? [painted(label) + pad(width - cellWidth(label) - `${lines.length} lines`.length) + dim(`${lines.length} lines`)]
				: [];
			lines.forEach((line, index) => {
				out.push(dim(String(index + 1).padStart(gutter) + " ") + painted("│ ") + line);
			});
			return out;
		}

		case "rule": {
			const out: CodeLines = [];
			if (label) out.push(painted(`${label} `) + painted("─".repeat(Math.max(0, width - cellWidth(label) - 1))));
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
