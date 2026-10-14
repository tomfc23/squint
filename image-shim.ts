/** Core appends images even with renderShell:self. Only opt-in components suppress that copy. */
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentDir, type ShimKind } from "./shim.ts";

export const IMAGE_STOCK = {
	minified: ['getRenderContext(lastComponent){return{args:this.args', 'this.result.content.filter(c=>c.type==="image")'],
	pretty: ['getRenderContext(lastComponent) {\n        return {\n            args: this.args', 'this.result.content.filter((c) => c.type === "image")'],
} as const;
export function applyImageShim(source: string, kind: ShimKind) {
	const [context, images] = IMAGE_STOCK[kind];
	const patchedContext = context.replace(kind === "minified" ? 'args:this.args' : 'args: this.args', kind === "minified" ? 'squintImagesSupported:true,args:this.args' : 'squintImagesSupported: true,\n            args: this.args');
	const patchedImages = `this.resultRendererComponent?.squintImages ? (this.result.content.some(c => c.type === "image" && c.mimeType !== "image/png") && ensurePngTranscoder(() => { this.invalidate(); this.ui.requestRender(); }), []) : ${images}`;
	if (source.includes(patchedContext) && source.includes(patchedImages)) return { text: source, action: "present" } as const;
	if (!source.includes(context) || !source.includes(images)) return { text: source, action: "pattern-missing" } as const;
	return { text: source.replace(context, patchedContext).replace(images, patchedImages), action: "installed" } as const;
}
export function imageShimTargets(): Array<{ path: string; kind: ShimKind }> {
	const install = join(agentDir(), "install");
	let version: string;
	try { version = readFileSync(join(install, "current-version"), "utf8").trim(); } catch { return []; }
	if (!version) return [];
	const dist = join(install, "releases", version, "node_modules", "@earendil-works", "pi-coding-agent", "dist");
	const targets: Array<{ path: string; kind: ShimKind }> = [];
	const pretty = join(dist, "modes", "interactive", "components", "tool-execution.js");
	if (existsSync(pretty)) targets.push({ path: pretty, kind: "pretty" });
	const chunks = join(dist, "bundle", "chunks");
	try {
		for (const file of readdirSync(chunks)) {
			if (!file.endsWith(".js")) continue;
			const path = join(chunks, file);
			if (readFileSync(path, "utf8").includes('getRenderContext(lastComponent){return{')) targets.push({ path, kind: "minified" });
		}
	} catch { /* SDK installations have no bundle. */ }
	return targets;
}
export function ensureImageShim() {
	return imageShimTargets().map(({ path, kind }) => {
		const patch = applyImageShim(readFileSync(path, "utf8"), kind);
		if (patch.action === "installed") {
			const backup = `${path}.squint-images.orig`;
			if (!existsSync(backup)) copyFileSync(path, backup);
			writeFileSync(path, patch.text);
		}
		return { path, kind, action: patch.action };
	});
}
