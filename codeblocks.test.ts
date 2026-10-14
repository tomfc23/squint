/**
 * Runnable self-check for the code block styles and the renderer shim:  node codeblocks.test.ts
 *
 * The styles are pure, so they are checked against a stub theme and stub highlighting; the
 * shim is checked against the real stock renderer in the installed pi release, which is the
 * file it actually patches.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODE_STYLES, DEFAULT_CODE_STYLE, cellWidth, isCodeStyle, renderCodeBlock, unwrapFence, unwrapQuotedMarkdown, type CodeArea, type CodeStyle } from "./codeblocks.ts";
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

// pi-tui's visibleWidth counts wide glyphs as two cells; this stub stands in for it.
const widthOf = (text: string) => [...text.replace(/\x1b\[[0-9;]*m/g, "")].reduce((n, ch) => n + (ch.codePointAt(0)! > 0x2e80 ? 2 : 1), 0);
// Hard wrap at the cell boundary, standing in for pi-tui's wrapTextWithAnsi.
const hardWrap = (text: string, room: number) => {
	const out: string[] = [];
	let line = "";
	for (const ch of [...text.replace(/\x1b\[[0-9;]*m/g, "")]) {
		if (widthOf(line + ch) > room) { out.push(line); line = "" }
		line += ch;
	}
	if (line) out.push(line);
	return out;
};
const context = (style: CodeStyle, ink?: unknown) => ({ style, theme: stubTheme, area, ink, width: widthOf, wrap: hardWrap });

const CODE = 'const a = 1; // one\nthis.filterModels?.(this.searchInput?.getValue() ?? "");';
const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));

/* ------------------------- pasted fenced blocks ------------------------- */

// Copying a fenced snippet out of a chat message brings the outer fence with it.
assert.deepEqual(unwrapFence("```ts\nconst a = 1;\n```"), { text: "const a = 1;", lang: "ts" }, "an outer fence is unwrapped");
assert.deepEqual(unwrapFence("````md\n```ts\nconst a = 1;\n```\n````"), { text: "```ts\nconst a = 1;\n```", lang: "md" }, "one level only");
assert.deepEqual(unwrapFence("const a = 1;\nconst b = 2;"), { text: "const a = 1;\nconst b = 2;" }, "ordinary code is left alone");
assert.deepEqual(unwrapFence("```ts\nconst a = 1;"), { text: "```ts\nconst a = 1;" }, "an unclosed fence is left alone");
assert.deepEqual(unwrapFence("const a = 1;\n```"), { text: "const a = 1;\n```" }, "a lone closing fence is left alone");

{
	const pasted = renderCodeBlock(context("spine"), "```ts\nconst a = 1;\n```", undefined, 74)!;
	const text = plain(pasted).join("\n");
	assert.ok(!text.includes("```"), "a pasted block never shows the fence it was pasted with");
	assert.deepEqual(plain(pasted), ["  ts", "  │ const a = 1;"], "it renders as the block it wraps");
	assert.ok(pasted.some((line) => line.includes(A.code)), "and the inner language is the one highlighted");
}

// A whole document pasted out of a fenced chat message: the outer fence goes, the inner
// markdown is handed back to pi, which is what turns it into headings and code blocks.
const sheet = "````md\n# Title\n\nText.\n\n```ts\nconst a = 1;\n```\n````";
assert.equal(unwrapQuotedMarkdown(sheet), "# Title\n\nText.\n\n```ts\nconst a = 1;\n```", "a pasted document is unwrapped for pi to parse");
assert.equal(unwrapQuotedMarkdown("\n\n" + sheet + "\n\n"), "# Title\n\nText.\n\n```ts\nconst a = 1;\n```", "surrounding blank lines do not stop it");
assert.equal(unwrapQuotedMarkdown("`````\n````\n```ts\n````\n`````"), "````\n```ts\n````", "one level, however deep");
assert.equal(unwrapQuotedMarkdown("```ts\nconst a = 1;\n```"), "```ts\nconst a = 1;\n```", "an ordinary code paste is left alone");
assert.equal(unwrapQuotedMarkdown("````\nconst a = 1;\n````"), "````\nconst a = 1;\n````", "four backticks with nothing fenced inside are left alone");
assert.equal(unwrapQuotedMarkdown("Here it is:\n\n````md\n```ts\n````"), "Here it is:\n\n````md\n```ts\n````", "a fence inside prose is left alone");
assert.equal(unwrapQuotedMarkdown("# Title\n\n```ts\nconst a = 1;\n```"), "# Title\n\n```ts\nconst a = 1;\n```", "plain markdown is left alone");

/* ------------------------------- styles -------------------------------- */

assert.equal(renderCodeBlock(context("off"), CODE, "ts", 74), undefined, "off hands the block back to pi");
assert.deepEqual(plain(renderCodeBlock(context("spine"), "", "ts", 74) ?? []), ["  ts", "  │ "], "an empty block still draws its chrome, never pi's fences");
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

// card: wide glyphs and emoji count as two cells, so the right rail stays straight
{
	const wide = renderCodeBlock(context("card"), "const note = \"日本語\"; // ✓ 完了", "ts", 74)!;
	assert.deepEqual([...new Set(wide.map((line) => widthOf(line)))], [74], "a line of wide glyphs still closes the card at the right column");
}

// A language label is arbitrary fence text: measured in cells and clipped, so a wide glyph cannot
// tear the top rail and a long one cannot run past the width the style claims.
{
	for (const lang of ["日本語", "x".repeat(80)]) {
		for (const style of ["card", "listing", "rule", "panel", "spine"] as const) {
			const lines = renderCodeBlock(context(style), CODE, lang, 74)!;
			assert.ok(Math.max(...lines.map(widthOf)) <= 74, `${style}: a ${lang.length}-char label stays inside the width`);
		}
	}
	assert.deepEqual([...new Set(renderCodeBlock(context("card"), CODE, "日本語", 74)!.map(widthOf))], [74], "a wide label still closes the card at the right column");
}

// A fenced block's code and its info string are untrusted: no control byte may reach the frame.
{
	const evil = renderCodeBlock(context("spine"), "a\u001b[2Jb\u0007c", "py\u001b]0;x\u0007", 74)!;
	const text = plain(evil).join("\n");
	// Styles are SGR escapes by design; what must not survive is any other control character.
	assert.ok(plain(evil).every((line) => !/\u001b(?!\[[0-9;]*m)|[\u0000-\u0008\u000b-\u001a\u001c-\u001f\u007f-\u009f\u2028\u2029]/.test(line)), "no injected control character survives the code-block path");
	assert.ok(text.includes("a[2Jb"), "the code text itself is kept");
	assert.ok(text.includes("py ]0;x"), "the label is kept, flattened onto one line");
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

// card and panel wrap their own content, so a long line cannot break the boundary
{
	const long = `const url = "https://example.test/${"x".repeat(70)}/end"; // and a trailing note that runs on`;
	const payload = {
		card: (line: string) => line.slice(2, -2), // between the rails
		panel: (line: string) => line,
		listing: (line: string) => line.replace(/^[^│]*│ ?/, ""), // after the gutter
	};
	const squash = (text: string) => text.replace(/\s+/g, "");
	for (const style of ["card", "panel", "listing"] as const) {
		const lines = renderCodeBlock(context(style), long, "ts", 74)!;
		const rows = lines.map(widthOf);
		assert.ok(Math.max(...rows) <= 74, `${style} keeps every row inside the width`);
		if (style === "card") assert.deepEqual([...new Set(rows)], [74], "a wrapped card keeps both rails at the edge");
		if (style === "panel") assert.deepEqual([...new Set(rows)], [74], "a wrapped panel stays a rectangle");
		assert.ok(lines.length > 1, `${style} grew rows instead of overflowing`);
		const text = squash(plain(lines).map(payload[style]).join(""));
		assert.ok(text.includes(squash("/end")), `${style} keeps the middle of a long line`);
		assert.ok(text.includes(squash("trailing note that runs on")), `${style} keeps the tail of a long line`);
	}
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

// A stale backup must never overwrite the file: if the file itself changed under it, the file wins.
{
	const dir = mkdtempSync(join(tmpdir(), "squint-shim-"));
	const path = join(dir, "markdown.js");
	const pristine = wrap(stockPretty);
	writeFileSync(`${path}.orig`, pristine);
	writeFileSync(path, applyShim(pristine, "pretty").text);
	assert.equal(shimSource(path, "pretty"), applyShim(pristine, "pretty").text, "a file that is exactly this shim needs no rewrite");
	const newer = `${pristine}\n// pi changed this file in place\n`;
	writeFileSync(path, newer);
	assert.equal(shimSource(path, "pretty"), newer, "a file that changed under the backup wins over the stored copy");
	// A truncated or outdated shim must not read as current: shimSource falls back to the backup.
	const patched = applyShim(pristine, "pretty").text;
	assert.equal(applyShim(patched, "pretty").action, "present", "the complete shim is current");
	writeFileSync(path, patched.slice(0, 215));
	assert.equal(applyShim(patched.slice(0, 215), "pretty").action, "pattern-missing", "a truncated shim is not current");
	assert.equal(shimSource(path, "pretty"), pristine, "a truncated shim is rebuilt from the pristine backup");
	writeFileSync(path, patched.replace("squintLines", "squintLinesOld"));
	assert.equal(shimSource(path, "pretty"), pristine, "an outdated shim is rebuilt from the pristine backup");
	rmSync(dir, { recursive: true, force: true });
}

// The real install: every target either already carries this shim or is one we can patch.
for (const target of shimTargets()) {
	const current = readFileSync(target.path, "utf8");
	const patch = applyShim(current.includes("__squintCodeBlock") ? current : shimSource(target.path, target.kind), target.kind);
	assert.ok(patch.action === "present" || patch.action === "installed", `${target.path}: ${patch.action}`);
}
if (!shimTargets().length) console.log("shim: no pi release found here, skipped the live check");

console.log(`codeblocks: ok — ${CODE_STYLES.length - 1} styles + off, ${shimTargets().length} shim targets`);
