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
const jiti = createJiti(import.meta.url, { alias: {
    "@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui"),
    "@earendil-works/pi-coding-agent": join(modules, "@earendil-works/pi-coding-agent/dist/index.js"),
} });
const originalDir = process.env.PI_CODING_AGENT_DIR;
const temp = mkdtempSync(join(tmpdir(), "squint-test-"));
process.env.PI_CODING_AGENT_DIR = temp;
writeFileSync(join(temp, "squint.json"), JSON.stringify({ direction: "rail", key: "super+e", codeBlock: "off" }));

try {
	const { default: squint } = await jiti.import(new URL("./index.ts", import.meta.url).pathname);
	const handlers = new Map();
	let resolveRenderer, shortcut, command, sentMessage = "";
	squint({
		on: (name, handler) => {
			const previous = handlers.get(name);
			handlers.set(name, (...args) => { previous?.(...args); return handler(...args); });
		},
		registerMarkdownTransformer() {}, registerCommand: (_name, spec) => { command = spec.handler; },
		registerShortcut: (key, spec) => { if (key === "super+e") shortcut = spec.handler; },
		registerToolRenderer: (resolver) => { resolveRenderer = resolver; },
		sendUserMessage: (message) => { sentMessage = message; },
	});
	const parent = "saved-codemode";
	const branch = [{ type: "message", message: {
		role: "toolResult", toolCallId: parent, toolName: "codemode", timestamp: 1,
		nestedCalls: { complete: true, calls: [
			{ id: `${parent}/1`, name: "read", arguments: { path: "large.md" }, status: "ok", durationMs: 3 },
			{ id: `${parent}/2`, name: "bash", arguments: { command: "false" }, status: "error", error: "exit 1", durationMs: 2 },
		] },
	} }];
	const ctx = { sessionManager: { getBranch: () => branch }, ui: { setHiddenThinkingLabel() {}, notify() {} } };
	const theme = { colors: { text: "#fff" }, style: (text) => text, fg: (_color, text) => text };
	const context = { toolCallId: parent, isError: false, invalidate() {}, state: {}, showImages: true };
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

	// Live child results show one line while the parent is collapsed; expanding remains reversible.
	handlers.get("tool_execution_end")({ toolCallId: `${parent}/1`, parentToolCallId: parent, isError: false,
		result: { content: [{ type: "text", text: Array.from({ length: 500 }, (_, i) => `nested-line-${i}`).join("\n") }] } });
	const closed = draw();
	const outputCount = () => draw().filter((line) => /nested-line-\d+/.test(line)).length;
	assert.equal(outputCount(), 1);
	await shortcut();
	assert.equal(outputCount(), 400);
	await shortcut();
	assert.deepEqual(draw(), closed, "re-collapse restores the compact branches");
	await command("images compact", ctx);
	assert.equal(JSON.parse(readFileSync(join(temp, "squint.json"), "utf8")).images, "compact");
	const imageContext = { ...context, toolCallId: "image-read", args: { path: "test.png" }, state: {}, squintImagesSupported: true };
	const imageRenderer = resolveRenderer("read", () => undefined);
	imageRenderer.renderCall(imageContext.args, theme, imageContext);
	const imageBody = imageRenderer.renderResult({ content: [{ type: "image", mimeType: "image/png" }] }, { isPartial: false }, theme, imageContext);
	assert.equal(imageBody.squintImages, true, "core suppression is opt-in");
	assert.ok(imageBody.render(100).some(line => line.includes("test.png")));
	assert.deepEqual(imageBody.render(100), imageBody.render(100), "redraws do not append duplicate lines");
	const legacy = imageRenderer.renderResult({ content: [] }, { isPartial: false }, theme, { ...imageContext, squintImagesSupported: false });
	assert.equal(legacy.squintImages, undefined, "without a loaded shim, core keeps ownership");
	await command("images inline", ctx);
	assert.equal(JSON.parse(readFileSync(join(temp, "squint.json"), "utf8")).images, "inline");
	// A restored row carries pi's own duration; showing it must not need live execution events.
	{
		const durationRenderer = resolveRenderer("bash", () => undefined);
		const durationContext = { ...context, toolCallId: "saved-time", state: {}, durationMs: 1234 };
		const call = durationRenderer.renderCall({ command: "sleep 1" }, theme, durationContext);
		const body = durationRenderer.renderResult({ content: [], details: undefined }, { isPartial: false }, theme, durationContext);
		assert.ok([...call.render(120), ...body.render(120)].join("\n").includes("1.2s"), "a row restored from a saved session keeps its duration");
	}

	// pi asks a renderShell:"self" renderer to apply outputPad itself.
	{
		const padRenderer = resolveRenderer("bash", () => undefined);
		const padContext = { ...context, toolCallId: "padded", state: {}, outputPad: 1 };
		const call = padRenderer.renderCall({ command: "ls" }, theme, padContext);
		const body = padRenderer.renderResult({ content: [], details: undefined }, { isPartial: false }, theme, padContext);
		for (const line of [...call.render(80), ...body.render(80)]) {
			assert.ok(line.startsWith(" "), `every line carries the outputPad margin: ${JSON.stringify(line)}`);
			assert.ok(line.length <= 80, `padding does not overflow the width: ${JSON.stringify(line)}`);
		}
		const unpadded = padRenderer.renderCall({ command: "ls" }, theme, { ...padContext, outputPad: 0 }).render(80);
		assert.ok(unpadded.every((line) => !line.startsWith(" ")), "outputPad 0 leaves no margin");
	}

	// Rows are measured by the frame writer's own cell model, so a line can never be refused.
	{
		const directions = await jiti.import(new URL("./directions.ts", import.meta.url).pathname);
		const { visibleWidth } = await jiti.import(requirePi.resolve("@earendil-works/pi-tui"));
		for (const sample of ["plain", "日本語テキスト", "\u{1F680}".repeat(3), "\u2764\uFE0F", "\u{1F1FA}\u{1F1F8}", "a\u0301", "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}", "e\u0301\u0301", "\u0000\u001b[2m"]) {
			assert.equal(directions.cellWidth(sample), visibleWidth(sample), `agrees with the frame writer on ${JSON.stringify(sample)}`);
		}
		const emojiRow = { label: "SHELL", tone: "gold", summary: "\u{1F680}".repeat(20) + " tail", count: "1 lines", time: "1ms", state: "ok",
			preview: ["\u2764\uFE0F".repeat(30)], hidden: [], hiddenCount: 0, hiddenLabel: "more" };
		for (const { id } of directions.DIRECTIONS) {
			for (const width of [24, 40, 61, 80]) {
				for (const line of directions.layout(id, emojiRow, width, false)) {
					const flat = line.map((s) => s.t).join("");
					assert.ok(visibleWidth(flat) <= width, `${id}@${width}: ${visibleWidth(flat)} cells`);
				}
			}
		}
	}

	// The preview instruction must keep the model's local server on the loopback interface.
	{
		await command("custom a compact two-line direction", { ...ctx, hasUI: true, isIdle: () => true });
		assert.ok(sentMessage.includes("--bind 127.0.0.1"), "the preview server is told to bind loopback only");
	}

	console.log("squint adapter: ok — reload/resume restores branches and durations, live output stays minimized");
} finally {
	if (originalDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
	else process.env.PI_CODING_AGENT_DIR = originalDir;
	rmSync(temp, { recursive: true, force: true });
}
