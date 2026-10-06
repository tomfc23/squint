/**
 * The /squint menu model.
 *
 * squint draws two things now — tool calls (directions.ts) and fenced code blocks
 * (codeblocks.ts) — so the command has two families behind one entry point. `/squint` opens a
 * menu that asks which family, then the family's own picker; a bare name still works, and a
 * qualified one (`code off`, `tui rail`) says which family it meant.
 *
 * Deciding that here, as pure functions, keeps the routing testable without a session: the pi
 * adapter only opens select dialogs and applies what it is told.
 */
import { DIRECTIONS, isDirection, type Direction } from "./directions.ts";
import { CODE_STYLES, isCodeStyle, type CodeStyle } from "./codeblocks.ts";

/** Every tool-call mode, including the escape hatch. */
export type ToolMode = Direction | "off";

export type Pick =
	/** No argument: ask which family first. */
	| { kind: "menu" }
	/** The family's own picker. */
	| { kind: "tool-menu" }
	| { kind: "code-menu" }
	| { kind: "tool"; id: ToolMode }
	| { kind: "code"; id: CodeStyle }
	| { kind: "key"; value?: string }
	| { kind: "custom"; instructions?: string }
	| { kind: "unknown"; value: string };

export interface MenuEntry {
	id: "tools" | "code";
	/** The exact line the picker shows, stating what that family draws now. */
	text: string;
}

/** The first level: the two families, each with its current mode. */
export function menuEntries(state: { direction: ToolMode; codeBlock: CodeStyle }): MenuEntry[] {
	return [
		{ id: "tools", text: `Tool calls — ${state.direction}` },
		{ id: "code", text: `Code blocks — ${state.codeBlock}` },
	];
}

const TOOL_MENU = new Set(["tui", "tool", "tools", "tool-calls", "calls"]);
const CODE_MENU = new Set(["code", "code-block", "code-blocks", "blocks"]);

/** Route one /squint argument. Blank means the menu; unknown names are reported, never guessed. */
export function resolveArg(raw: string): Pick {
	const trimmed = raw.trim();
	if (!trimmed) return { kind: "menu" };

	const space = trimmed.indexOf(" ");
	const head = (space === -1 ? trimmed : trimmed.slice(0, space)).toLowerCase();
	const tail = space === -1 ? "" : trimmed.slice(space + 1).trim();

	if (TOOL_MENU.has(head)) return tail && isDirection(tail) ? { kind: "tool", id: tail } : { kind: "tool-menu" };
	if (CODE_MENU.has(head)) return tail && isCodeStyle(tail) ? { kind: "code", id: tail } : { kind: "code-menu" };
	if (head === "key") return { kind: "key", ...(tail ? { value: tail } : {}) };
	if (head === "custom") return { kind: "custom", ...(tail ? { instructions: tail } : {}) };

	// A bare name: tool calls own "off", because that is what it has always meant here.
	if (head === "off" || isDirection(head)) return { kind: "tool", id: head as ToolMode };
	if (isCodeStyle(head)) return { kind: "code", id: head };
	return { kind: "unknown", value: head };
}

/** The arguments the completer offers: both families, the two family names, and the rest. */
export function completions(prefix: string): ReadonlyArray<{ value: string; label: string }> | null {
	const typed = prefix.trim().toLowerCase();
	const all: ReadonlyArray<{ value: string; label: string }> = [
		...DIRECTIONS.map((direction) => ({ value: direction.id as string, label: `${direction.id} — tool calls: ${direction.blurb}` })),
		{ value: "off", label: "off — tool calls: pi draws them itself (code blocks: \"code off\")" },
		...CODE_STYLES.filter((style) => style.id !== "off").map((style) => ({ value: style.id as string, label: `${style.id} — code blocks: ${style.blurb}` })),
		{ value: "tui", label: "tui — pick how tool calls render" },
		{ value: "code", label: `code — pick how code blocks render (${CODE_STYLES.map((style) => style.id).join(", ")})` },
		{ value: "custom", label: "custom — describe a tool call layout; pi builds it with a preview" },
		{ value: "key", label: "key <binding> — set the expand/collapse shortcut" },
	];
	const matches = all.filter((entry) => entry.value.startsWith(typed));
	return matches.length > 0 ? matches : null;
}
