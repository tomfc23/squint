/**
 * Runnable self-check for the /squint menu model:  node menu.test.ts
 *
 * The command has two families now — tool calls and code blocks — and one entry point. What
 * belongs to which family, and what a bare name means, is decided here rather than inside the
 * pi adapter, so the routing can be checked without a session.
 */
import assert from "node:assert/strict";
import { completions, menuEntries, resolveArg } from "./menu.ts";

/* ------------------------------- the menu ------------------------------- */

const entries = menuEntries({ direction: "rail", codeBlock: "spine" });
assert.deepEqual(entries.map((entry) => entry.id), ["tools", "code"], "the menu offers the two families, tool calls first");
assert.deepEqual(entries.map((entry) => entry.text), ["Tool calls — rail", "Code blocks — spine"], "each entry states what it draws now");
assert.deepEqual(
	menuEntries({ direction: "off", codeBlock: "off" }).map((entry) => entry.text),
	["Tool calls — off", "Code blocks — off"],
	"off is readable in both families",
);

/* ------------------------------ routing --------------------------------- */

assert.deepEqual(resolveArg(""), { kind: "menu" }, "no argument opens the menu");
assert.deepEqual(resolveArg("  "), { kind: "menu" }, "whitespace is no argument");

// a bare name belongs to whichever family owns it
assert.deepEqual(resolveArg("rail"), { kind: "tool", id: "rail" }, "a direction name sets tool calls");
assert.deepEqual(resolveArg("CARD"), { kind: "code", id: "card" }, "a style name sets code blocks, case-insensitively");
assert.deepEqual(resolveArg("chip"), { kind: "code", id: "chip" });
assert.deepEqual(resolveArg("off"), { kind: "tool", id: "off" }, "off still means tool calls, as it always has");

// the families can be asked for by name
assert.deepEqual(resolveArg("code"), { kind: "code-menu" }, "code opens the code block picker");
assert.deepEqual(resolveArg("code-blocks"), { kind: "code-menu" }, "aliases open the same picker");
assert.deepEqual(resolveArg("tui"), { kind: "tool-menu" }, "tui opens the tool call picker");
assert.deepEqual(resolveArg("tools"), { kind: "tool-menu" });
assert.deepEqual(resolveArg("calls"), { kind: "tool-menu" });

// a qualified argument reaches past the ambiguity
assert.deepEqual(resolveArg("code off"), { kind: "code", id: "off" }, "code off hands code blocks back to pi");
assert.deepEqual(resolveArg("code spine"), { kind: "code", id: "spine" });
assert.deepEqual(resolveArg("tui rail"), { kind: "tool", id: "rail" });

// the rest of the surface, unchanged
assert.deepEqual(resolveArg("key"), { kind: "key" }, "key without a binding opens the input");
assert.deepEqual(resolveArg("key ctrl+o"), { kind: "key", value: "ctrl+o" });
assert.deepEqual(resolveArg("custom"), { kind: "custom" });
assert.deepEqual(resolveArg("custom a narrow ledger"), { kind: "custom", instructions: "a narrow ledger" });
assert.deepEqual(resolveArg("nonsense"), { kind: "unknown", value: "nonsense" }, "an unknown name is reported, not guessed");

/* ---------------------------- completions ------------------------------- */

const values = completions("")?.map((entry) => entry.value) ?? [];
assert.deepEqual(values.filter((value) => value === "off"), ["off"], "off is offered once, for tool calls");
assert.deepEqual(values.filter((value) => value === "code"), ["code"], "the code family is offered");
assert.deepEqual(values.filter((value) => value === "tui"), ["tui"], "the tool family is offered");
for (const name of ["rail", "ledger", "badge", "gutter", "deck", "spine", "card", "panel", "listing", "rule", "chip", "custom", "key"]) {
	assert.ok(values.includes(name), `${name} is offered`);
}
// Every offered argument is one the router can act on.
for (const value of values) {
	if (value === "code" || value === "tui") continue;
	assert.notEqual(resolveArg(value).kind, "unknown", `${value} is routable`);
}
assert.deepEqual(completions("ca")?.map((entry) => entry.value), ["card"], "a prefix narrows to its family");
assert.deepEqual(completions("zzz"), null, "nothing matches, so nothing is offered");
assert.ok(completions("co")?.some((entry) => entry.value === "code"), "co offers the code family");

console.log("squint menu: ok — two families, one entry point");
