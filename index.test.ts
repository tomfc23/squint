/** Adapter regression: node index.test.ts (uses the installed pi runtime, no new dependencies). */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentDir } from "./shim.ts";

const install = join(agentDir(), "install");
const version = readFileSync(join(install, "current-version"), "utf8").trim();
const modules = join(install, "releases", version, "node_modules");
const requirePi = createRequire(join(modules, "@earendil-works/pi-coding-agent/package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui") } });
const originalDir = process.env.PI_CODING_AGENT_DIR;
const temp = mkdtempSync(join(tmpdir(), "squint-test-"));
process.env.PI_CODING_AGENT_DIR = temp;
writeFileSync(join(temp, "squint.json"), JSON.stringify({ direction: "rail", key: "super+e", codeBlock: "off" }));

try {
	const { default: squint } = await jiti.import(new URL("./index.ts", import.meta.url).pathname);
	const handlers = new Map();
	let resolveRenderer, shortcut;
	squint({
		on: (name, handler) => handlers.set(name, handler),
		registerMarkdownTransformer() {}, registerCommand() {},
		registerShortcut: (_key, spec) => { shortcut = spec.handler; },
		registerToolRenderer: (resolver) => { resolveRenderer = resolver; },
	});
	const parent = "saved-codemode";
	const branch = [{ type: "message", message: {
		role: "toolResult", toolCallId: parent, toolName: "codemode", timestamp: 1,
		nestedCalls: { complete: true, calls: [
			{ id: `${parent}/1`, name: "read", arguments: { path: "large.md" }, status: "ok", durationMs: 3 },
			{ id: `${parent}/2`, name: "bash", arguments: { command: "false" }, status: "error", error: "exit 1", durationMs: 2 },
		] },
	} }];
	const ctx = { sessionManager: { getBranch: () => branch }, ui: { setHiddenThinkingLabel() {} } };
	const theme = { colors: { text: "#fff" }, style: (text) => text };
	const context = { toolCallId: parent, isError: false, invalidate() {} };
	const renderer = resolveRenderer("codemode", () => undefined);
	const head = renderer.renderCall({}, theme, context);
	const body = renderer.renderResult({ content: [], details: undefined }, { isPartial: false }, theme, context);
	const draw = () => [...head.render(120), ...body.render(120)];
	assert.ok(!draw().some((line) => line.includes("large.md")), "no live events have been emitted");
	handlers.get("session_start")({ reason: "reload" }, ctx);
	const restored = draw();
	assert.ok(restored.some((line) => line.startsWith("│ ├─● READ") && line.includes("large.md")), "reload restores the read branch");
	assert.ok(restored.some((line) => line.startsWith("│ └─● SHELL") && line.includes("false")), "reload restores the last branch");
	assert.ok(restored.length < 10, "restored metadata stays compact");
	handlers.get("session_start")({ reason: "resume" }, ctx);
	assert.deepEqual(draw(), restored, "resuming does not duplicate branches");

	// Live child results still use the normal collapsed limit; expanding remains reversible.
	handlers.get("tool_execution_end")({ toolCallId: `${parent}/1`, parentToolCallId: parent, isError: false,
		result: { content: [{ type: "text", text: Array.from({ length: 500 }, (_, i) => `nested-line-${i}`).join("\n") }] } });
	const closed = draw();
	const outputCount = () => draw().filter((line) => /nested-line-\d+/.test(line)).length;
	assert.equal(outputCount(), 4);
	await shortcut();
	assert.equal(outputCount(), 400);
	await shortcut();
	assert.deepEqual(draw(), closed, "re-collapse restores the compact branches");
	console.log("squint adapter: ok — reload/resume restores branches, live output stays minimized");
} finally {
	if (originalDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalDir;
	rmSync(temp, { recursive: true, force: true });
}
