/**
 * Runnable self-check for the code block styles and the renderer shim:  node codeblocks.test.ts
 *
 * The styles are pure, so they are checked against a stub theme and stub highlighting; the
 * shim is checked against the real stock renderer in the installed pi release, which is the
 * file it actually patches.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CODE_STYLES, DEFAULT_CODE_STYLE, isCodeStyle, renderCodeBlock, cellWidth, type CodeArea, type CodeStyle } from "./codeblocks.ts";
import { applyShim, SHIM, shimSource, shimTargets, STOCK } from "./shim.ts";

/* ----------------------------- stub theme ------------------------------ */

const A = {
	fg: "\x1b[38;2;157;165;169m",
	dim: "\x1b[38;2;126;136;142m",
	panel: "\x1b[48;2;52;56;58m",
	link: "\x1b[38;2;105;173;208m",
	ink: "\x1b[38;2;24;26;32m",
	code: "\x1b[38;2;105;173;208m",
	bold: "\x1b[1m",
	reset: "\x1b[0m",
} as const;

const stubTheme = {
	colors: { mdCodeBlockBorder: "fg", dim: "dim", toolPendingBg: "panel", mdLink: "link" },
	style: (text: string, options: { fg?: unknown; bg?: unknown; bold?: boolean } = {}) => {
		let prefix = "";
		for (const mark of [options.fg, options.bg, options.bold ? "bold" : undefined]) {
			if (mark) prefix += A[mark as keyof typeof A] ?? "";
		}
		return prefix ? `${prefix}${text}${A.reset}` : text;
	},
} as unknown as Parameters<typeof renderCodeBlock>[0]["theme"];

const area: CodeArea = {
	codeBlockBorder: (text) => `<chrome>${text}</chrome>`,
	highlightCode: (code) => code.split("\n").map((line) => `${A.code}${line}${A.reset}`),
};

const context = (style: CodeStyle, ink?: unknown) => ({ style, theme: stubTheme, area, ink });

const CODE = 'const a = 1; // one\nthis.filterModels?.(this.searchInput?.getValue() ?? "");';
const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));

/* ------------------------------- styles -------------------------------- */

assert.equal(renderCodeBlock(context("off"), CODE, "ts", 74), undefined, "off hands the block back to pi");
assert.equal(renderCodeBlock(context("spine"), "", "ts", 74), undefined, "empty content is left to pi");
assert.equal(renderCodeBlock(context("spine"), CODE, undefined, 74)?.length, 2, "no language means no label line");

for (const { id } of CODE_STYLES) {
	if (id === "off") continue;
	const lines = renderCodeBlock(context(id), CODE, "ts", 74);
	assert.ok(lines && lines.length >= 2, `${id} draws lines`);
	const text = plain(lines).join("\n");
	assert.ok(!text.includes("```"), `${id} never draws a fence`);
	assert.ok(text.includes("const a = 1; // one"), `${id} keeps the code`);
	assert.ok(lines.some((line) => line.includes(A.code)), `${id} keeps syntax highlighting`);
	const codeLines = plain(lines).filter((line) => line.includes("const a = 1") || line.includes("this.filterModels"));
	assert.equal(codeLines.length, 2, `${id} draws one line per code line`);
}

// spine: label above, one rule per line, both in the code chrome token
{
	const lines = plain(renderCodeBlock(context("spine"), CODE, "ts", 74)!);
	assert.deepEqual(lines, ["  ts", '  │ const a = 1; // one', '  │ this.filterModels?.(this.searchInput?.getValue() ?? "");']);
	assert.ok(renderCodeBlock(context("spine"), CODE, "ts", 74)![1].startsWith("  " + A.fg + "│ "), "the rule is painted with pi's code chrome token");
}

// card: closed, every rail the same width, padding inside the right edge
{
	const lines = renderCodeBlock(context("card"), CODE, "ts", 74)!;
	assert.ok(plain(lines)[0].startsWith("╭─ ts "), "the label sits in the top rail");
	assert.ok(plain(lines)[0].endsWith("╮") && plain(lines)[lines.length - 1].endsWith("╯"), "the card closes");
	assert.deepEqual([...new Set(lines.map(cellWidth))], [74], "every card line is exactly the content width");
}

// panel: a ground behind every code line, padded to the full width, label right-aligned above
{
	const lines = renderCodeBlock(context("panel"), CODE, "ts", 74)!;
	assert.equal(lines.length, 3, "label plus two code lines");
	assert.ok(lines[0].startsWith(" ".repeat(74 - 2)), "the label is right-aligned");
	for (const line of lines.slice(1)) {
		assert.ok(line.includes(A.panel), "each code line carries the ground");
		assert.equal(cellWidth(line), 74, "the ground spans the content width");
	}
}

// listing: numbered gutter, stated count, dim numbers
{
	const lines = renderCodeBlock(context("listing"), CODE, "ts", 74)!;
	assert.ok(plain(lines)[0].startsWith("ts") && plain(lines)[0].endsWith("2 lines"), "the header states the count");
	assert.deepEqual(plain(lines).slice(1).map((line) => line.slice(0, 4)), ["1 │ ", "2 │ "], "the gutter counts from one");
	assert.ok(lines[1].startsWith(A.dim + "1 "), "the numbers are dim");
}

// rule: one hairlane header, then plain indented code
{
	const lines = renderCodeBlock(context("rule"), CODE, "ts", 74)!;
	assert.equal(lines.length, 3, "header plus two code lines");
	assert.equal(cellWidth(lines[0]), 74, "the header spans the content width");
	assert.ok(plain(lines)[0].startsWith("ts ─"), "the language opens the rule");
	assert.ok(plain(lines)[1].startsWith("  const"), "code is only indented");
}

// chip: filled badge on the first line only, ink handed in by the caller
{
	const lines = renderCodeBlock(context("chip", "ink"), CODE, "ts", 74)!;
	assert.ok(lines[0].includes(A.ink + A.link + A.bold + " TS "), "the badge carries the language and the ink");
	assert.ok(!lines[1].includes(" TS "), "the badge does not repeat");
	assert.ok(renderCodeBlock(context("chip"), CODE, "ts", 74)![0].includes(A.link + A.bold + " TS "), "the badge still fills without an ink");
}

assert.equal(DEFAULT_CODE_STYLE, "spine");
assert.ok(isCodeStyle("card") && !isCodeStyle("fences") && !isCodeStyle(undefined));

/* -------------------------------- shim --------------------------------- */

// The stock branch, exactly as pi ships it in both builds (shim.ts owns the strings).
const stockMinified = STOCK.minified;
const stockPretty = STOCK.pretty;

/** Brace depth, ignoring strings and comments — the invariant a bad patch breaks. */
const balanced = (source: string) => {
	let depth = 0;
	let quote: string | undefined;
	let line = false;
	for (let i = 0; i < source.length; i++) {
		const char = source[i];
		if (line) { if (char === "\n") line = false; continue; }
		if (quote) { if (char === quote) quote = undefined; continue; }
		if (char === "/" && source[i + 1] === "/") { line = true; continue; }
		if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
		if (char === "{") depth++;
		if (char === "}") depth--;
		if (depth < 0) return false;
	}
	return depth === 0;
};

// A complete, switch-shaped source around the branch, so balance is a real invariant.
const wrap = (branch: string) => `function render(token, width, nextTokenType) {\n  const lines = [];\n  switch (token.type) {\n    ${branch}lines.push("x");break}\n  }\n  return lines;\n}`;

assert.ok(balanced(wrap(stockMinified)), "the stock branch is balanced to start with");
assert.ok(!balanced("function f() { if (x) { }"), "the balance check can fail");

const installed = applyShim(wrap(stockMinified), "minified");
assert.equal(installed.action, "installed");
assert.equal(applyShim(wrap(stockPretty), "pretty").action, "installed", "the pi-tui build is patched too");
assert.ok(installed.text.includes("__squintCodeBlock"), "pi's renderer asks squint");
assert.ok(balanced(installed.text), "the patched branch keeps its braces balanced");
assert.ok(balanced(applyShim(wrap(stockPretty), "pretty").text), "the pretty branch keeps its braces balanced");
assert.ok(installed.text.includes("let indent=this.theme.codeBlockIndent"), "the stock body still runs underneath");

const again = applyShim(installed.text, "minified");
assert.deepEqual(again, { text: installed.text, action: "present" }, "installing twice changes nothing");
assert.equal(applyShim("const untouched = 1;", "minified").action, "pattern-missing", "an unknown renderer is reported, never half-patched");
assert.ok(SHIM.minified.includes("catch{}") && SHIM.pretty.includes("catch {"), "a style that throws falls back to pi's fences");

// The real install: every target either already carries this shim or is one we can patch.
for (const target of shimTargets()) {
	const current = readFileSync(target.path, "utf8");
	const patch = applyShim(current.includes("__squintCodeBlock") ? current : shimSource(target.path), target.kind);
	assert.ok(patch.action === "present" || patch.action === "installed", `${target.path}: ${patch.action}`);
}
if (!shimTargets().length) console.log("shim: no pi release found here, skipped the live check");

console.log(`codeblocks: ok — ${CODE_STYLES.length - 1} styles + off, ${shimTargets().length} shim targets`);
