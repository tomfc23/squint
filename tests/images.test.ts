/** Rendering regression checks use the installed runtime, no added dependencies. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { agentDir } from "../src/shim.ts";
import { applyImageShim, IMAGE_STOCK, imageShimTargets } from "../src/image-shim.ts";
import { DEFAULT_IMAGE_MODE, IMAGE_MODES, isImageMode } from "../src/image-modes.ts";

assert.equal(DEFAULT_IMAGE_MODE, "inline");
assert.equal(isImageMode("invalid"), false);
for (const mode of IMAGE_MODES) assert.equal(isImageMode(mode.id), true);
for (const kind of ["pretty", "minified"] as const) {
	const source = IMAGE_STOCK[kind].join(";\n");
	const patch = applyImageShim(source, kind);
	assert.equal(patch.action, "installed");
	assert.equal(applyImageShim(patch.text, kind).action, "present");
	assert.equal(applyImageShim("unsupported source", kind).action, "pattern-missing");
	assert.ok(patch.text.includes("resultRendererComponent?.squintImages"));
	assert.ok(patch.text.includes("ensurePngTranscoder"));
}
for (const target of imageShimTargets()) {
	assert.notEqual(applyImageShim(readFileSync(target.path, "utf8"), target.kind).action, "pattern-missing", target.path);
}
const install = join(agentDir(), "install");
const version = readFileSync(join(install, "current-version"), "utf8").trim();
const modules = join(install, "releases", version, "node_modules");
const requirePi = createRequire(join(modules, "@earendil-works/pi-coding-agent/package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, { alias: { "@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui") } });
const { ImageResult, ImageInspector, attachments } = await jiti.import(new URL("../src/images.ts", import.meta.url).pathname);
const tui = await jiti.import(requirePi.resolve("@earendil-works/pi-tui"));
const oldCaps = tui.getCapabilities();
const oldCells = tui.getCellDimensions();
const theme = { fg: (_color, text) => text };
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=";
const block = { type: "image", data: png, mimeType: "image/png" };
const items = attachments([block, { type: "text" }, block, block], { path: "screenshots/test.png" });
assert.equal(items.length, 3);
assert.equal(items[1].label, "screenshots/test.png · 2");
const cachedBody = ["result text"];
const body = { render: () => cachedBody, invalidate() {} };
try {
	tui.setCellDimensions({ widthPx: 8, heightPx: 16 });
	for (const protocol of ["kitty", "iterm2", null]) {
		tui.setCapabilities({ ...oldCaps, images: protocol });
		for (const mode of IMAGE_MODES) {
			let expanded = false;
			const result = new ImageResult(body, items, theme, () => mode.id, () => expanded, true, "click to");
			for (const width of [12, 39, 80, 160]) {
				result.invalidate();
				const closed = result.render(width);
				assert.deepEqual(result.render(width), closed, "stable redraw");
				assert.ok(closed.every(line => line.includes("1337;File=") || tui.visibleWidth(line) <= width), `${mode.id} ${protocol} ${width} fits`);
				if (mode.id === "compact" || mode.id === "inspector" || !protocol) assert.ok(!closed.some(line => line.includes("\x1b_G") || line.includes("1337;File=")));
			}
			expanded = true;
			assert.ok(result.render(100).length <= 1 + 3 * 19, "expanded images have bounded height");
			assert.deepEqual(cachedBody, ["result text"], "image rendering must not mutate cached text");
		}
		if (protocol) {
			const strip = new ImageResult(body, items, theme, () => "strip", () => false, true, "click to").render(100).join("\n");
			const marker = protocol === "kitty" ? /a=T/g : /1337;File=/g;
			assert.equal([...strip.matchAll(marker)].length, 3, "all three thumbnails survive composition");
		}
	}
	const hidden = new ImageResult(body, items, theme, () => "inline", () => true, false, "click to");
	assert.ok(hidden.render(80).includes("Images hidden in pi settings"));
	tui.setCapabilities({ ...oldCaps, images: "kitty" });
	const missing = new ImageResult(body, attachments([{ type: "image" }], {}), theme, () => "inline", () => false, true, "click to");
	assert.equal(missing.render(80).length, 3, "missing images reserve no empty rows");
	// Data that is not strict base64 would be spliced into the image control sequence verbatim.
	const poisoned = new ImageResult(body, attachments([{ type: "image", data: "iVBORw0KGgo\u0007\u001b]52;c;cHduZWQ=\u001b\\", mimeType: "image/png" }], {}), theme, () => "inline", () => false, true, "click to");
	const poisonedLines = poisoned.render(80).join("\n");
	assert.ok(!poisonedLines.includes("\u001b]52"), "an injected OSC never reaches the frame");
	assert.ok(!poisonedLines.includes("\u0007"), "an injected BEL never reaches the frame");
	assert.ok(poisonedLines.includes("Image preview unavailable"), "a non-base64 payload falls back to text");
	// A type pi-tui cannot encode has no protocol path either.
	const unsupported = new ImageResult(body, attachments([{ type: "image", data: png, mimeType: "image/svg+xml" }], {}), theme, () => "inline", () => false, true, "click to");
	assert.ok(unsupported.render(80).join("\n").includes("Image preview unavailable"), "an unsupported type falls back to text");
	// Verify actual core composition: opt-in ownership suppresses duplicates, renderer failures restore core.
	const { initTheme } = await jiti.import(join(modules, "@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js"));
	initTheme("dark", false);
	const { ToolExecutionComponent } = await jiti.import(join(modules, "@earendil-works/pi-coding-agent/dist/modes/interactive/components/tool-execution.js"));
	let supported = false;
	const result = { content: [block], isError: false };
	const core = new ToolExecutionComponent("read", "owned-image", {}, {}, { renderShell: "self",
		renderCall: () => new tui.Text("READ test.png", 0, 0),
		renderResult: (result, options, theme, ctx) => { supported = ctx.squintImagesSupported === true; return supported ? new ImageResult(body, attachments(result.content, {}), theme, () => "inline", () => false, ctx.showImages, "click to") : body; },
	}, { requestRender() {} }, "/tmp");
	core.updateResult(result);
	assert.equal(core.imageComponents.length, supported ? 0 : 1, "ownership is respected; legacy cores keep native images");
	assert.equal([...core.render(100).join("\n").matchAll(/a=T/g)].length, 1);
	assert.deepEqual(result.content, [block], "model-visible results are untouched");
	const fallback = new ToolExecutionComponent("read", "fallback", {}, {}, {
		renderResult: () => { throw new Error("broken renderer"); },
	}, { requestRender() {} }, "/tmp");
	fallback.updateResult(result);
	assert.equal(fallback.imageComponents.length, 1, "renderer failure retains the native image");
	let closed = false;
	const inspector = new ImageInspector(items, 0, { terminal: { rows: 30 }, requestRender() {} }, theme, () => { closed = true; }, true);
	assert.ok(inspector.render(100)[0].includes("1/3"));
	inspector.handleInput("\x1b[C");
	assert.ok(inspector.render(100)[0].includes("2/3"));
	inspector.handleInput("\x1b");
	assert.equal(closed, true);
} finally {
	tui.setCapabilities(oldCaps);
	tui.setCellDimensions(oldCells);
}
console.log("squint images: ok — four modes, both image protocols, fallbacks, inspector and shim");
