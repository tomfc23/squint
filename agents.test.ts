// node agents.test.ts — installed Pi components, no model calls or terminal required.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentDir } from "./shim.ts";

const install = join(agentDir(), "install");
const version = readFileSync(join(install, "current-version"), "utf8").trim();
const modules = join(install, "releases", version, "node_modules");
const requirePi = createRequire(join(modules, "@earendil-works/pi-coding-agent/package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, { alias: {
	"@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui"),
	"@earendil-works/pi-coding-agent": join(modules, "@earendil-works/pi-coding-agent/dist/index.js"),
} });
const { AgentTranscripts, AgentScreen, agentStatus, registerAgentViews } = await jiti.import(new URL("./agents.ts", import.meta.url).pathname);
const piRuntime = await import(join(modules, "@earendil-works/pi-coding-agent/dist/index.js"));
piRuntime.initTheme("dark", false);
const { visibleWidth } = await import(requirePi.resolve("@earendil-works/pi-tui"));
const store = new AgentTranscripts();
const makeAgent = (task = "Review the diff") => ({ agent: "reviewer", task, exitCode: -1, messages: [] });
assert.equal(store.update("ignored", { results: [null, {}] }), false);
store.update("batch", { results: [makeAgent(), makeAgent("Check security")] });
store.update("other", { results: [makeAgent("Other invocation")] });
assert.deepEqual([...store.agents.keys()], ["batch:0", "batch:1", "other:0"]);
assert.equal(store.cycle(undefined, 1), "batch:0");
assert.equal(store.cycle(undefined, -1), "other:0");
assert.equal(store.cycle("other:0", 1), undefined, "wrap returns Main");
assert.equal(store.cycle("batch:0", -1), undefined);
store.update("batch", { results: [makeAgent(), makeAgent()] });
assert.equal(store.agents.size, 3, "updates replace rather than duplicate views");
assert.equal(agentStatus(makeAgent()), "running");
assert.equal(agentStatus({ ...makeAgent(), exitCode: 0 }), "completed");
assert.equal(agentStatus({ ...makeAgent(), exitCode: 0, stopReason: "length" }), "failed");
assert.equal(agentStatus({ ...makeAgent(), stopReason: "aborted" }), "aborted");

const assistant = { role: "assistant", content: [
	{ type: "thinking", thinking: "private thought visible on request" },
	{ type: "text", text: "Review in progress" },
	{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "example.ts" } },
], stopReason: "toolUse" };
const result = { role: "toolResult", toolCallId: "tool-1", content: [{ type: "text", text: Array.from({ length: 60 }, (_, i) => `output-${i}`).join("\n") }] };
store.update("batch", { results: [{ ...makeAgent(), messages: [assistant, result] }] });
let closed = 0, renders = 0;
const tui = { terminal: { rows: 18 }, requestRender: () => renders++ };
const theme = { fg: (_tone, text) => text };
const style = (_theme, line) => line.map((s) => s.t).join("");
const screen = new AgentScreen(store, "batch:0", tui, theme, () => closed++, () => "rail", style, "super+e");
for (const width of [20, 40, 80, 120]) {
	const lines = screen.render(width);
	assert.ok(lines.every((line) => visibleWidth(line) <= width), `fits width ${width}`);
	assert.ok(lines[0].includes("reviewer"), "identity stays pinned");
	assert.ok(lines[1].startsWith("READ ONLY"), "no mistaken input destination");
}
assert.ok(!screen.render(120).join("\n").includes("private thought"));
screen.handleInput("t");
assert.ok(screen.render(120).join("\n").includes("private thought"));
screen.handleInput("\x1b[101;9u"); // Kitty Super+E
screen.render(120);
screen.handleInput("\x1b[H");
assert.ok(screen.render(120).join("\n").includes("Task: Review"));
screen.handleInput("\x1b[F");
assert.ok(screen.render(120).join("\n").includes("output-59"), "expanded output can be scrolled to end");
screen.handleInput("\x1b[H");
const toolY = screen.render(120).findIndex((line) => line.includes("● READ"));
assert.ok(toolY >= 2);
assert.equal(screen.handleMouse({ type: "click", button: "left", x: 1, y: toolY, width: 120, height: 18 })?.handled, true);
assert.ok(!screen.render(120).join("\n").includes("output-10"), "click collapses the tool in scrolled coordinates");
screen.handleInput("\x1b[101;9u");
screen.render(120);
screen.handleMouse({ type: "wheel", wheelDelta: 3, y: 4 });
assert.ok(!screen.render(120).join("\n").includes("Task: Review"), "wheel scrolls down");
assert.ok(renders > 0);
screen.cycle(1);
assert.ok(screen.render(120)[0].includes("task 2/3"));
screen.cycle(-1);
screen.cycle(-1);
assert.equal(closed, 1, "cycling to Main exits observation");

// Wire through real lifecycle contracts, including nested codemode delegation and resume.
const events = new Map(), shortcuts = new Map();
const open = registerAgentViews({
	on: (name, handler) => events.set(name, handler),
	registerShortcut: (key, spec) => shortcuts.set(key, spec.handler),
}, () => "rail", style, "super+e");
let active, customCalls = 0, notices = [], mainStatus;
const ctx = { mode: "tui", sessionManager: { getBranch: () => [] }, ui: {
	notify: (message) => notices.push(message),
	setStatus: (_key, text) => { mainStatus = text; },
	custom: (factory) => { customCalls++; return new Promise((resolve) => {
		active = factory(tui, theme, {}, resolve);
	}); },
} };
await open(ctx);
assert.equal(customCalls, 0);
assert.ok(notices.pop().includes("no subagent"));
events.get("tool_execution_update")({ toolCallId: "code/1", parentToolCallId: "code", toolName: "subagent",
	partialResult: { details: { results: [makeAgent(), makeAgent()] } } });
const observing = shortcuts.get("ctrl+shift+right")(ctx);
assert.equal(customCalls, 1);
assert.ok(active.render(120)[0].includes("task 1/2"));
events.get("tool_execution_end")({ toolCallId: "code/1", toolName: "subagent",
	result: { details: { results: [{ ...makeAgent(), exitCode: 1, errorMessage: "test failure" }, makeAgent()] } } });
assert.ok(active.render(120)[1].includes("failed"));
assert.ok(active.render(120).join("\n").includes("test failure"));
active.handleInput("\t");
assert.ok(active.render(120)[0].includes("task 2/2"));
assert.ok(active.render(120)[1].includes("failed"), "a terminated invocation cannot leave a placeholder running forever");
active.handleInput("\t");
await observing;
const saved = { type: "message", message: { role: "toolResult", toolCallId: "saved", toolName: "subagent", details: { results: [makeAgent()] } } };
events.get("session_start")({}, { sessionManager: { getBranch: () => [saved] } });
const resumed = open(ctx);
assert.ok(active.render(120)[0].includes("task 1/1"));
events.get("session_shutdown")();
await resumed;
events.get("session_start")({}, ctx);
assert.equal(mainStatus, "Observing: Main");
await open(ctx);
assert.ok(notices.pop().includes("no subagent"), "session change clears old agents");
await open({ ...ctx, mode: "rpc" });
assert.ok(notices.pop().includes("terminal UI"));
console.log("squint agents: ok — identity, cycling, transcript, scrolling, live updates, resume, cleanup");
