/**
 * squint — pure classification and preview logic.
 *
 * No imports, no terminal rendering: this module is testable with plain node.
 */

export type Tone = "blue" | "coral" | "gold" | "violet" | "teal" | "green" | "gray";

export type Kind =
	| "read"
	| "grep"
	| "find"
	| "ls"
	| "edit"
	| "write"
	| "shell"
	| "agent"
	| "web"
	| "todo"
	| "ask"
	| "code"
	| "other";

/** Pi logo colors, plus a few additions for the categories the logo does not cover. */
export const TONE_HEX: Record<Tone, string> = {
	blue: "#4D9ABF", // pi logo
	coral: "#F09082", // pi logo
	gold: "#F1BE58", // pi logo
	violet: "#9D7CD8",
	teal: "#56B6C2",
	green: "#98C379",
	gray: "#8A95A8",
};

const KIND_TONE: Record<Kind, Tone> = {
	read: "blue",
	grep: "blue",
	find: "blue",
	ls: "blue",
	edit: "coral",
	write: "coral",
	shell: "gold",
	agent: "violet",
	ask: "violet",
	web: "teal",
	todo: "green",
	code: "green",
	other: "gray",
};

/** Order matters: the first match wins. */
const RULES: Array<[RegExp, Kind]> = [
	[/^(read|readfile|read_file|readimage|read_image)/, "read"],
	[/^(grep|search|ripgrep)/, "grep"],
	[/^(find|glob)/, "find"],
	[/^(ls|list|listdir|list_dir)/, "ls"],
	[/^(edit|multiedit|multi_edit|applypatch|apply_patch|patch|strreplace|str_replace)/, "edit"],
	[/^(write|create|createfile|create_file|writefile|write_file)/, "write"],
	[/^(codemode|eval|script|runjs|run_js)/, "code"],
	[/^(bash|powershell|shell|exec|runcommand|run_command)/, "shell"],
	[/^(subagent|task|agent|delegate)/, "agent"],
	[/^(web_search|websearch|webfetch|web_fetch|fetch|browser|browse|http)/, "web"],
	[/^(todo|todowrite|todo_write|plan)/, "todo"],
	[/^(question|ask|qna)/, "ask"],
];

export interface Classification {
	kind: Kind;
	label: string;
	tone: Tone;
}

export function classify(toolName: string): Classification {
	const name = normalize(toolName);
	for (const [pattern, kind] of RULES) {
		if (pattern.test(name)) {
			return { kind, label: kind.toUpperCase(), tone: KIND_TONE[kind] };
		}
	}
	return { kind: "other", label: badgeLabel(toolName), tone: KIND_TONE.other };
}

/** MCP tools are named `mcp__<server>__<tool>`; classify on the tool segment. */
function normalize(toolName: string): string {
	const lower = toolName.toLowerCase();
	if (!lower.startsWith("mcp__")) return lower;
	const parts = lower.split("__");
	return parts[parts.length - 1] || lower;
}

export function badgeLabel(toolName: string): string {
	const lower = toolName.toLowerCase();
	const segment = lower.startsWith("mcp__") ? lower.split("__").pop() ?? toolName : toolName;
	const cleaned = (segment || toolName).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
	if (!cleaned) return "OTHER";
	return cleaned.length > 12 ? `${cleaned.slice(0, 11)}…` : cleaned;
}

export function clip(text: string, max = 200): string {
	if (text.length <= max) return text;
	// Slice by code points: half a surrogate pair prints as a broken glyph.
	const points = [...text];
	return points.length <= max ? text : `${points.slice(0, max - 1).join("")}…`;
}

function shorten(value: unknown, max = 90): string {
	const text = typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
	if (!text) return "";
	return clip(text, max);
}

/** One line of context for the badge row: the argument that identifies the call. */
export function summarizeArgs(kind: Kind, args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const a = args as Record<string, unknown>;
	const path = a.path ?? a.file_path ?? a.filePath ?? a.file;
	let primary = "";

	switch (kind) {
		case "read":
			primary = path == null ? "" : `${shorten(path, 120)}${lineRange(a)}`;
			break;
		case "edit":
		case "write":
			primary = shorten(path, 140);
			break;
		case "ls":
			primary = shorten(path ?? ".", 140);
			break;
		case "grep": {
			const pattern = a.pattern ?? a.query;
			const scope = a.path ?? a.glob;
			primary = pattern == null && scope == null ? "" : shorten(`/${pattern ?? ""}/ ${scope ?? ""}`.trim(), 140);
			break;
		}
		case "find":
			primary = shorten([a.pattern ?? a.glob, a.path].filter((value) => value != null).join(" "), 140);
			break;
		case "shell":
			primary = shorten(a.command ?? a.script ?? a.cmd, 160);
			break;
		case "agent":
			primary = shorten(a.description ?? a.task ?? a.prompt ?? a.agent, 140);
			break;
		case "web":
			primary = shorten(a.query ?? a.url ?? a.pattern, 140);
			break;
		case "ask":
			primary = shorten(a.question ?? a.prompt, 140);
			break;
		default:
			break;
	}

	if (primary) return primary;

	// Nothing recognizable: show the arguments verbatim so MCP and one-off tools stay useful.
	const keys = Object.keys(a).filter((key) => a[key] !== undefined && a[key] !== "");
	if (keys.length === 0) return "";
	return shorten(keys.map((key) => `${key}=${shorten(a[key], 30)}`).join(" "), 140);
}

function lineRange(a: Record<string, unknown>): string {
	if (a.offset == null && a.limit == null) return "";
	const start = typeof a.offset === "number" ? a.offset : 1;
	const end = typeof a.limit === "number" ? start + a.limit - 1 : "";
	return `:${start}${end ? `-${end}` : ""}`;
}

export interface TextBlock {
	type: string;
	text?: string;
}

export function textOf(content: ReadonlyArray<TextBlock> | undefined): string {
	return (content ?? [])
		.filter((block) => block.type === "text" && block.text)
		.map((block) => block.text as string)
		.join("\n")
		.trim();
}

export function toLines(text: string): string[] {
	const trimmed = text.trim();
	return trimmed ? trimmed.split("\n") : [];
}

export interface Preview {
	shown: string[];
	hidden: number;
}

export function previewLines(list: string[], limit: number): Preview {
	return { shown: list.slice(0, limit), hidden: Math.max(0, list.length - limit) };
}

export function tailLines(list: string[], limit: number): Preview {
	if (list.length <= limit) return { shown: list, hidden: 0 };
	return { shown: list.slice(list.length - limit), hidden: list.length - limit };
}

export type DiffKind = "add" | "del" | "ctx";

export function diffLineKind(line: string): DiffKind {
	if (line.startsWith("+") && !line.startsWith("+++")) return "add";
	if (line.startsWith("-") && !line.startsWith("---")) return "del";
	return "ctx";
}

export function diffStats(diff: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diff.split("\n")) {
		const kind = diffLineKind(line);
		if (kind === "add") added++;
		else if (kind === "del") removed++;
	}
	return { added, removed };
}

/* ------------------------------------------------------------------ *
 * key bindings — pure parsing so /squint can validate what the user types
 * ------------------------------------------------------------------ */

const MODIFIER_ORDER = ["ctrl", "shift", "alt", "super"] as const;

/** pi wants pageUp/pageDown; people type pageup/pagedown. Canonicalise those two. */
const SPECIAL_KEYS: Record<string, string> = { pageup: "pageUp", pagedown: "pageDown" };

// Mirrors the key syntax from pi's keybindings reference: modifiers, letters, digits,
// specials, function keys, and the symbol row.
const BASE_KEY = /^(?:[a-z0-9]|escape|esc|enter|return|tab|space|backspace|delete|insert|clear|home|end|pageup|pagedown|up|down|left|right|f(?:[1-9]|1[0-2])|[`\-=[\]\\;',./!@#$%^&*()_+|~{}:<>?])$/;

/**
 * A user-typed binding ("Ctrl+Shift+X") to the canonical id pi expects ("ctrl+shift+x"),
 * or undefined when it is not a key at all. Modifiers are reordered, so the id is stable.
 */
export function normalizeKeyId(raw: string | undefined): string | undefined {
	const parts = (raw ?? "").split("+").map((part) => part.trim().toLowerCase()).filter(Boolean);
	if (parts.length === 0) return undefined;
	const base = parts[parts.length - 1];
	if (!BASE_KEY.test(base)) return undefined;
	const modifiers = parts.slice(0, -1);
	if (modifiers.some((mod) => !(MODIFIER_ORDER as readonly string[]).includes(mod))) return undefined;
	if (new Set(modifiers).size !== modifiers.length) return undefined;
	const ordered = MODIFIER_ORDER.filter((mod) => modifiers.includes(mod));
	return [...ordered, SPECIAL_KEYS[base] ?? base].join("+");
}

const MODIFIER_GLYPH: Record<string, string> = { ctrl: "⌃", shift: "⇧", alt: "⌥", super: "⌘" };

/** "super+e" -> "⌘E". Display only; the binding itself is the canonical id. */
export function keyLabel(id: string): string {
	const parts = id.split("+");
	const base = parts.pop() ?? id;
	const glyphs = parts.map((mod) => MODIFIER_GLYPH[mod] ?? mod).join("");
	const shown = base.length === 1 ? base.toUpperCase() : base.charAt(0).toUpperCase() + base.slice(1);
	return `${glyphs}${shown}`;
}
