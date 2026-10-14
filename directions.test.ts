/**
 * Runnable self-check for squint's direction layout:  node directions.test.ts
 *
 * The whole game here is alignment, so every check is a width or a column claim:
 * a line that overflows the terminal, or a column that does not line up between
 * two rows, is the bug this file exists to catch.
 */
import assert from "node:assert/strict";
import { buildRow, DIRECTIONS, cellWidth, clipW, collapsedLimit, layout, padEnd, padStart, segsWidth, type Direction, type Row } from "./directions.ts";
import { classify } from "./logic.ts";

const WIDTHS = [24, 40, 61, 80, 120, 200];

const normal: Row = {
	label: "READ", tone: "blue", summary: "extensions/squint/directions.ts", count: "42 lines", time: "0.3s", state: "ok",
	preview: [" 39#BRBH:const COLLAPSED: Record<Kind, number> = {", " 40#RPNH:\tread: 6,"],
	hidden: [" 47#PMYW:\tagent: 4,", " 48#QHNR:\tweb: 4,", " 49#JQRB:\ttodo: 6,"],
	hiddenCount: 34, hiddenLabel: "more",
};

const tail: Row = { ...normal, label: "SHELL", tone: "gold", summary: "npm test", count: "exit 0", time: "0.9s",
	preview: ["  Tests  2 passed (2)"], hidden: ["  ✓ badgeLabel"], hiddenCount: 206, hiddenLabel: "earlier lines", tail: true };

const err: Row = { ...normal, label: "SHELL", tone: "gold", summary: "git push origin main", count: "exit 1", state: "error",
	preview: [" ! [rejected]        main -> main (fetch first)", "error: failed to push some refs"], hidden: ["hint: Updates were rejected"], hiddenCount: 2 };

const pending: Row = { ...normal, label: "READ", summary: "dist/interactive-mode.js", count: "streaming", state: "pending", preview: [], hidden: ["2188#KKAA:  this.viewport.append(...)"], hiddenCount: 1 };

const edit: Row = { ...normal, label: "EDIT", tone: "coral", summary: "extensions/squint/index.ts", count: "+3 −1", diff: {
	rows: [{ t: "ctx", s: "const COLLAPSED = {" }, { t: "del", s: "-\tread: 6," }, { t: "add", s: "+\tread: 8," }, { t: "ctx", s: "};" }], added: 3, removed: 1 },
	preview: [], hidden: ["\tgrep: 8,"], hiddenCount: 2, hiddenLabel: "context lines" };

const child: Row = { ...normal, label: "GREP", summary: "/previewLines/ · docs", count: "3 matches", time: "0.2s", preview: ["docs/tui.md:88:  previewLines(...)"], hidden: [], hiddenCount: 0 };
const agent: Row = { ...normal, label: "AGENT", tone: "violet", summary: "review-team · correctness", count: "3 tools", time: "12.4s",
	nested: [child, { ...child, label: "READ", summary: "logic.ts" }, { ...child, label: "WEB", tone: "teal", summary: "pi tui okhsl theme" }], hiddenCount: 0 };

const bare: Row = { ...normal, label: "LS", summary: "extensions/squint", count: "3 entries", preview: ["index.ts", "logic.ts"], hidden: [], hiddenCount: 0 };
const huge: Row = { ...normal, label: "BROWSER_CLI…", tone: "gray", summary: "mcp__playwright__browser_click", count: "mcp", preview: ["element=\"Expand every row\"  ref=\"e19\""], hidden: [], hiddenCount: 0 };

// A shell command can be a multi-line heredoc, a subagent prompt carries newlines, a code
// block arrives with tabs and a stray carriage return. None of that may reach the terminal
// as a control character: a raw newline paints outside the row, and a tab breaks every column
// after it. This row is the regression guard for the frame-corruption bug.
const nasty: Row = {
	...normal, label: "SHELL", tone: "gold",
	summary: "python3 - <<'PY'\np='x'\r\ns=open(p).read()\tlog(p)\nPY",
	preview: ["line one\nline two", "tab\there", "cr\rreturn", "esc\u001b[2Jhere", "bell\u0007here"],
	hidden: ["hidden\nline", "also\ttabbed", "esc\u001b]0;title\u0007"],
	hiddenCount: 3,
	diff: { rows: [{ t: "add", s: "+\tindented\nplus a newline" }, { t: "ctx", s: " ctx\r" }, { t: "add", s: "+esc\u001b[31mred" }], added: 2, removed: 0 },
	nested: [{ ...child, summary: "nested\nsummary", preview: ["kid\tline"] }],
};

const ROWS: Array<[string, Row]> = [["normal", normal], ["tail", tail], ["error", err], ["pending", pending], ["edit", edit], ["agent", agent], ["bare", bare], ["huge", huge], ["nasty", nasty]];

/* ---- helpers ------------------------------------------------------- */
assert.equal(cellWidth("abc"), 3);
assert.equal(cellWidth("…"), 1, "ellipsis is one cell");
assert.equal(cellWidth("日本"), 4, "wide glyphs are two cells");
assert.equal(cellWidth("e\u0301"), 1, "a combining mark adds nothing");
assert.equal(clipW("abcdef", 4), "abc…");
assert.equal(clipW("abc", 4), "abc");
assert.equal(clipW("abcdef", 1), "…");
assert.equal(clipW("abcdef", 0), "");
assert.equal(padEnd("ab", 4), "ab  ");
assert.equal(padStart("ab", 4), "  ab");
assert.equal(padEnd("abcdef", 2), "abcdef", "never truncates");

/* ---- collapsed limits --------------------------------------------- */
assert.equal(collapsedLimit("ledger", "read"), 0, "ledger shows nothing until opened");
assert.equal(collapsedLimit("badge", "read"), 6, "incumbent badge limits are unchanged");
assert.equal(collapsedLimit("badge", "edit"), 10);
assert.equal(collapsedLimit("badge", "write"), 4);
assert.equal(collapsedLimit("badge", "unknown-kind" as never), 6, "unknown kinds fall back to six");

/* ---- every line fits every width, in both states ------------------ */
for (const { id } of DIRECTIONS) {
	for (const [name, row] of ROWS) {
		for (const open of [false, true]) {
			for (const cols of WIDTHS) {
				for (const line of layout(id, row, cols, open)) {
					const w = segsWidth(line);
					assert.ok(w <= cols, `${id}/${name}/${open ? "open" : "closed"}@${cols}: line is ${w} cells, "${line.map((s) => s.t).join("")}"`);
					assert.ok(!line.some((s) => s.t.includes("\n")), `${id}/${name}: line contains a newline`);
				}
			}
		}
	}
}

/* ---- the hidden remainder appears only when open ------------------ */
for (const { id } of DIRECTIONS) {
	const closed = layout(id, normal, 80, false).map((l) => l.map((s) => s.t).join("")).join("\n");
	const open = layout(id, normal, 80, true).map((l) => l.map((s) => s.t).join("")).join("\n");
	assert.ok(!closed.includes("agent: 4,"), `${id}: hidden lines must not render while collapsed`);
	assert.ok(open.includes("agent: 4,"), `${id}: hidden lines must render when open`);
	assert.ok(open.split("\n").length > closed.split("\n").length, `${id}: opening must add lines`);
}

/* ---- a row with nothing behind it carries no affordance ------------ */
const empty: Row = { ...normal, label: "LS", summary: "extensions/squint", count: "0 lines", preview: [], hidden: [], hiddenCount: 0 };
for (const { id } of DIRECTIONS) {
	for (const open of [false, true]) {
		const flat = layout(id, empty, 80, open).map((l) => l.map((s) => s.t).join("")).join("\n");
		assert.ok(!/expand|collapse|▸|▾/.test(flat), `${id}: an empty row must not offer to open anything`);
	}
}

/* ---- an open row reveals what a collapsed row withholds ------------ */
// Which lines are withheld is the caller's slice (makeRow). What layout owns is that `open`
// reveals `hidden`, and that a collapsed diff hides its context lines. The truthful-count
// claim spans both modules, so it is covered end to end in render.test.ts.
for (const { id } of DIRECTIONS) {
	const openFlat = layout(id, normal, 80, true).map((l) => l.map((s) => s.t).join("")).join("\n");
	assert.ok(openFlat.includes("agent: 4,"), `${id}: an open row reveals the withheld lines`);
	const closed = layout(id, tail, 100, false).map((l) => l.map((s) => s.t).join("")).join("\n");
	if (id !== "ledger") assert.ok(closed.includes("206 earlier lines"), `${id}: a collapsed shell row names its earlier lines`);
}

/* ---- tail rows state their earlier lines exactly once -------------- */
for (const { id } of DIRECTIONS) {
	const flat = layout(id, tail, 100, false).map((l) => l.map((s) => s.t).join("")).join("\n");
	// Ledger shows nothing while collapsed at all, so it states the count only once opened.
	const mentions = flat.split("206").length - 1;
	assert.equal(mentions, id === "ledger" ? 0 : 1, `${id}: the tail count must appear once, not in both the marker and the hint`);
	const opened = layout(id, tail, 100, true).map((l) => l.map((s) => s.t).join("")).join("\n");
	assert.equal(opened.split("206").length - 1, 1, `${id}: an open tail row states its count exactly once`);
}

/* ---- ledger columns line up between rows -------------------------- */
{
	const first = layout("ledger", normal, 100, false)[0];
	const second = layout("ledger", tail, 100, false)[0];
	assert.equal(segsWidth(first), 100, "a ledger row fills the width");
	assert.equal(segsWidth(second), 100);
	// mark(1) sp(1) label(8) sp(1) summary(grow) sp(1) count(7) sp(1) time(6) sp(1) chevron(1)
	const countAt = (segs: typeof first) => segsWidth(segs.slice(0, segs.length - 5));
	assert.equal(countAt(first), countAt(second), "the count column starts at the same cell in every row");
}

/* ---- deck draws a closed box --------------------------------------- */
for (const cols of WIDTHS) {
	for (const open of [false, true]) {
		const lines = layout("deck", agent, cols, open).map((l) => l.map((s) => s.t).join(""));
		assert.ok(lines[0].startsWith("╭") && lines[0].endsWith("─╮"), `deck@${cols}: top border`);
		assert.equal(lines[lines.length - 1], `╰${"─".repeat(cols - 2)}╯`, `deck@${cols}: bottom border closes the box`);
		for (const l of lines) assert.equal(cellWidth(l), cols, `deck@${cols}: every box line is the full width`);
	}
}

/* ---- rail keeps one spine column and one label column -------------- */
{
	const lines = layout("rail", agent, 100, false);
	assert.ok(lines[0][0].t === "●", "the parent head starts with its node");
	const spineAt = lines.slice(1).map((l) => l[0].t[0]);
	assert.ok(spineAt.every((c) => c === "│"), "every body line of an expanded nested block sits on the spine");
	const elbow = lines.map((l) => l.map((s) => s.t).join("")).filter((t) => t.startsWith("│ ├─") || t.startsWith("│ └─"));
	assert.equal(elbow.length, 3, "each nested call gets an elbow");
	assert.ok(elbow[2].startsWith("│ └─"), "the last nested call closes the elbow");
}

/* ---- rail draws a call a nested call made --------------------------- */
{
	// codemode → subagent → its own tool: pi reports two levels, so rail must draw two levels.
	const grandchild: Row = { ...child, label: "READ", summary: "inner.ts" };
	const parent: Row = { ...empty, label: "CODE", summary: "codemode", nested: [{ ...child, label: "AGENT", summary: "review-team", nested: [grandchild] }] };
	const text = layout("rail", parent, 100, false).map((l) => l.map((s) => s.t).join("")).join("\n");
	assert.ok(text.includes("│   └─● READ"), "the grandchild hangs one spine further out, not nowhere");
	// Every direction can reach it: ledger hides its nested block until the row is open, the others
	// draw it while collapsed too.
	for (const { id } of DIRECTIONS) {
		for (const open of id === "ledger" ? [true] : [true, false]) {
			const lines = layout(id, parent, 100, open);
			assert.ok(lines.map((l) => l.map((s) => s.t).join("")).join("\n").includes("inner.ts"), `${id}: the grandchild is drawn (open: ${open})`);
			for (const line of lines) assert.ok(segsWidth(line) <= 100, `${id}: nested lines fit the width`);
		}
	}
}

/* ---- untrusted text cannot inject a control character --------------- */
{
	const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
	for (const { id } of DIRECTIONS) {
		for (const open of [false, true]) {
			for (const cols of WIDTHS) {
				const lines = layout(id, nasty, cols, open);
				for (const line of lines) {
					const text = line.map((s) => s.t).join("");
					assert.ok(!CONTROL.test(text), `${id}/${open ? "open" : "closed"}@${cols}: a control character reached the frame: ${JSON.stringify(text)}`);
					assert.ok(segsWidth(line) <= cols, `${id}/${open ? "open" : "closed"}@${cols}: ${segsWidth(line)} cells after flattening`);
				}
			}
			// The head is one physical line however many lines the caller put in the summary.
			const [head, ...rest] = layout(id, nasty, 80, open);
			assert.equal(head.length > 0, true, `${id}: a head line exists`);
			assert.equal(rest.every((l) => l.length > 0), true, `${id}: no empty line`);
		}
	}
}

/* ---- ice: no direction emits an empty line -------------------------- */
for (const { id } of DIRECTIONS) {
	for (const [name, row] of ROWS) {
		for (const open of [false, true]) {
			for (const line of layout(id, row, 80, open)) {
				assert.ok(segsWidth(line) > 0, `${id}/${name}: emitted an empty line`);
			}
		}
	}
}

/* ---- every classified tool kind can be drawn ----------------------- */
{
	const kinds = ["read", "grep", "find", "ls", "edit", "write", "shell", "subagent", "web_search", "todo", "codemode", "question", "mcp__playwright__browser_click", "goal_complete"];
	for (const toolName of kinds) {
		const info = classify(toolName);
		const row: Row = { ...normal, label: info.label, tone: info.tone, hiddenCount: collapsedLimit("rail", info.kind) };
		for (const { id } of DIRECTIONS) {
			const lines = layout(id, row, 80, false);
			assert.ok(lines.length >= 1, `${id}/${toolName}: must draw at least one line`);
			assert.ok(segsWidth(lines[0]) <= 80, `${id}/${toolName}: head line must fit`);
		}
	}
}

/* ---- the key hint is injected, not hardcoded ----------------------- */
assert.ok(layout("rail", normal, 80, false).flat().some((s) => s.t.includes("click to expand")), "default hint says click");
assert.ok(layout("rail", normal, 80, false, { keyHint: (a) => `⌘E ${a}` }).flat().some((s) => s.t.includes("⌘E to expand")), "an injected hint is used verbatim");

/* ------------------------------------------------------------------ *
 * the whole path a session takes: raw tool arguments and output -> row -> lines
 *
 * This is the check that was missing when a multi-line shell command corrupted a live
 * frame. It builds the row the way the extension builds it (buildRow, from raw text)
 * instead of handing layout a Row that is already well-formed.
 * ------------------------------------------------------------------ */
const CONTROL_CHAR = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const checkLines = (label: string, lines: string[], cols: number) => {
	for (const line of lines) {
		assert.ok(!CONTROL_CHAR.test(line), `${label}: a control character reached the frame: ${JSON.stringify(line)}`);
		assert.ok(cellWidth(line) <= cols, `${label}: ${cellWidth(line)} cells, width is ${cols}`);
	}
};

const HEREDOC = "python3 - <<'PY'\np='x'\r\ns=open(p).read()\tlog(s)\nPY";
const OUTPUT = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
const draw = (direction: Direction, open: boolean, cols: number, text = OUTPUT.join("\n"), command = HEREDOC) =>
	layout(direction, buildRow(direction, classify("bash"), { args: { command }, text, isError: false, pending: false, ms: 12, open }), cols, open).map((l) => l.map((s) => s.t).join(""));

for (const { id } of DIRECTIONS) {
	const closed = draw(id, false, 80);
	checkLines(id, closed, 80);
	for (const line of closed) assert.ok(!/[\r\n\t]/.test(line), `${id}: a control character reached the terminal`);
	// Ledger is the one direction whose collapsed row is nothing but the head line.
	assert.equal(closed.length >= 1, true, `${id}: a collapsed row draws its head`);
	if (id !== "ledger") assert.ok(closed.length > 1, `${id}: a collapsed row also shows its preview`);
	assert.ok(closed[0].length <= 80, `${id}: the head is one line`);

	const opened = draw(id, true, 80);
	checkLines(id, opened, 80);
	const joinedOpen = opened.join("\n");
	assert.ok(joinedOpen.includes("line 1"), `${id}: opening reveals the output from the top`);
	if (id !== "ledger") {
		assert.ok(closed.join("\n").includes("line 12"), `${id}: a collapsed shell row shows the tail`);
		assert.ok(closed.join("\n").includes("earlier lines"), `${id}: and names the lines it withholds`);
		assert.ok(!joinedOpen.includes("earlier lines"), `${id}: an open row does not still claim to withhold them`);
	}
	assert.ok(!joinedOpen.includes("+8 more"), `${id}: an open row does not count lines it is already showing`);
	// The regression itself. The module's stated rule is newlines to a space, a tab to its
	// two-space stop; the command must appear on the head line in exactly that form, once.
	const flattened = HEREDOC.replace(/[\r\n]+/g, " ").replace(/\t/g, "  ");
	const wide = draw(id, false, 200);
	assert.ok(wide[0].includes(flattened), `${id}: the whole command is on the head line, flattened`);
	assert.equal(wide.filter((l) => l.includes("log(s)")).length, 1, `${id}: the command appears on exactly one line`);
}

/* ---- a collapsed diff states the changed lines it is not showing ----- */
{
	// 50 changed lines and no context: the collapsed slice shows 10, so the other 40 must be counted.
	const added = Array.from({ length: 50 }, (_, i) => `+line ${i + 1}`).join("\n");
	for (const { id } of DIRECTIONS) {
		const row = buildRow(id, classify("edit"), { args: { path: "big.ts" }, text: "", diff: added, isError: false, pending: false, ms: 5, open: false });
		assert.equal(row.hiddenCount, 40, `${id}: the withheld changed lines are counted`);
		assert.equal(row.hiddenLabel, "lines", `${id}: and they are not called context lines`);
		const closed = layout(id, row, 100, false).map((l) => l.map((s) => s.t).join("")).join("\n");
		const opened = layout(id, row, 100, true).map((l) => l.map((s) => s.t).join("")).join("\n");
		assert.ok(opened.includes("line 50"), `${id}: opening reveals the rest`);
		if (id === "ledger") assert.ok(closed.includes("▸"), "ledger: the chevron says the row opens");
		else assert.ok(closed.includes("40 lines"), `${id}: the collapsed row says what it hides`);
	}
	// A diff that withholds only context keeps the wording it always had.
	const withContext = buildRow("rail", classify("edit"), { args: {}, text: "", diff: "+1 added\n-2 removed\n 3 context\n 4 context", isError: false, pending: false, ms: 5, open: false });
	assert.deepEqual([withContext.hiddenCount, withContext.hiddenLabel], [2, "context lines"]);
}

/* ---- output past the cap keeps an honest count ---------------------- */
{
	const hugeText = Array.from({ length: 500 }, (_, i) => `l${i}`).join("\n");
	// Ledger carries no hint line by design; its count column already says 500 lines, so the
	// leftover is visible there instead of in a trailing hint.
	for (const { id } of DIRECTIONS) {
		const open = draw(id, true, 100, hugeText).join("\n");
		if (id === "ledger") assert.ok(open.includes("500 lines"), `${id}: the count column names the full length`);
		else assert.ok(open.includes("100 more"), `${id}: an open row states what the 400-line cap still hides`);
	}
}

/* ---- nested calls follow the parent's expansion state -------------- */
for (const { id } of DIRECTIONS) {
	// Even a pre-sliced child must not leak its hidden remainder or diff context.
	for (const kid of [normal, edit, err]) {
		const parent = { ...empty, label: "CODE", nested: [kid] };
		const closed = layout(id, parent, 100, false).flat().map((s) => s.t).join("\n");
		const opened = layout(id, parent, 100, true).flat().map((s) => s.t).join("\n");
		const withheld = kid.diff ? "const COLLAPSED = {" : kid.hidden[0].trim().replace(/\t/g, "  ");
		assert.ok(!closed.includes(withheld), `${id}: nested hidden output stays collapsed`);
		assert.ok(opened.includes(withheld), `${id}: opening reveals nested output`);
		assert.ok(/expand|▸/.test(closed), `${id}: nested-only output has an expansion affordance`);
	}

	for (const tool of ["read", "grep", "bash"]) {
		for (const isError of [false, true]) {
			for (const pending of [false, true]) {
				const drawNested = (open: boolean) => {
					const kid = buildRow(id, classify(tool), {
						args: { path: "large.md", command: "cat large.md" },
						text: Array.from({ length: 500 }, (_, i) => `output-${i}`).join("\n"),
						isError, pending, open, isNested: true,
					});
					return layout(id, { ...empty, label: "CODE", nested: [kid] }, 100, open)
						.map((l) => l.map((s) => s.t).join(""));
				};
				const closed = drawNested(false);
				const opened = drawNested(true);
				checkLines(`${id}/${tool}/nested/closed`, closed, 100);
				checkLines(`${id}/${tool}/nested/open`, opened, 100);
				const outputCount = (lines: string[]) => lines.filter((line) => /output-\d+/.test(line)).length;
				// Ledger shows no nested child until its parent is open; every other direction shows one line.
				assert.equal(outputCount(closed), id === "ledger" ? 0 : 1, `${id}/${tool}: a collapsed nested child shows one preview line`);
				assert.equal(outputCount(opened), 400, `${id}/${tool}: nested expansion retains the existing cap`);
				assert.ok(opened.length > closed.length, `${id}/${tool}: expansion adds output`);
			}
		}
	}
}

console.log("squint directions: ok");
