/**
 * Runnable self-check for squint's pure logic:  node logic.test.ts
 */
import assert from "node:assert/strict";
import {
	badgeLabel,
	classify,
	clip,
	diffLineKind,
	diffPreview,
	diffStats,
	keyLabel,
	normalizeKeyId,
	previewLines,
	summarizeArgs,
	tailLines,
	textOf,
	toLines,
} from "./logic.ts";

// classification
assert.equal(classify("read").kind, "read");
assert.equal(classify("read").tone, "blue");
assert.equal(classify("read").label, "READ");
assert.equal(classify("Edit").tone, "coral");
assert.equal(classify("bash").tone, "gold");
assert.equal(classify("subagent").tone, "violet");
assert.equal(classify("mcp__playwright__browser_click").kind, "web");
assert.equal(classify("apply_patch").kind, "edit");
assert.equal(classify("goal_complete").kind, "other");
assert.equal(classify("goal_complete").tone, "gray");

// badge labels
assert.equal(badgeLabel("goal_complete"), "GOAL_COMPLE…");
assert.equal(badgeLabel("a__very__long__tool__name").length, 12);
assert.equal(badgeLabel("mcp__server__browser_click"), "BROWSER_CLI…");

// arg summaries
assert.equal(summarizeArgs("read", { path: "a.ts", offset: 3, limit: 10 }), "a.ts:3-12");
assert.equal(summarizeArgs("shell", { command: "ls -la" }), "ls -la");
assert.equal(summarizeArgs("grep", { pattern: "foo", path: "src" }), "/foo/ src");
assert.equal(summarizeArgs("other", { a: 1, b: "x" }), "a=1 b=x");
assert.equal(summarizeArgs("read", undefined), "");

// diff
const diff = "+1 added\n-2 removed\n 3 context";
assert.deepEqual(diffStats(diff), { added: 1, removed: 1 });
assert.equal(diffLineKind("+++ file"), "ctx");
assert.equal(diffLineKind("--- file"), "ctx");
assert.deepEqual(diffPreview(diff, 10).shown, ["+1 added", "-2 removed"]);
assert.deepEqual(diffPreview(diff, 10, true).shown, ["+1 added", "-2 removed", " 3 context"]);
assert.equal(diffPreview(diff, 1).hidden, 1);

// previews
assert.deepEqual(previewLines(["a", "b", "c"], 2), { shown: ["a", "b"], hidden: 1 });
assert.deepEqual(tailLines(["a", "b", "c"], 2), { shown: ["b", "c"], hidden: 1 });
assert.deepEqual(tailLines(["a"], 2), { shown: ["a"], hidden: 0 });

// text
assert.equal(textOf([{ type: "text", text: "hi" }, { type: "image" }]), "hi");
assert.deepEqual(toLines("\n a \n b \n"), ["a ", " b"]);
assert.equal(clip("abcdef", 4), "abc…");
assert.equal(clip("ab\u{1F600}cd", 4), "ab\u{1F600}…", "clipping never splits an emoji");

// key bindings: the canonical id is what pi's shortcut registry sees
assert.equal(normalizeKeyId("super+e"), "super+e");
assert.equal(normalizeKeyId("Ctrl+Shift+X"), "ctrl+shift+x", "case and modifier order are normalised");
assert.equal(normalizeKeyId("shift+ctrl+x"), "ctrl+shift+x");
assert.equal(normalizeKeyId("pageup"), "pageUp", "pi's own spelling is restored");
assert.equal(normalizeKeyId("ctrl+o"), "ctrl+o");
assert.equal(normalizeKeyId("ctrl+ctrl+x"), undefined, "a repeated modifier is not a key");
assert.equal(normalizeKeyId("hyper+x"), undefined);
assert.equal(normalizeKeyId("ctrl+"), undefined);
assert.equal(normalizeKeyId(""), undefined);
assert.equal(keyLabel("super+e"), "⌘E");
assert.equal(keyLabel("ctrl+shift+pageDown"), "⌃⇧PageDown");

console.log("squint logic: ok");
