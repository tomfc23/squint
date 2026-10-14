import type { Theme } from "@earendil-works/pi-coding-agent";
import { HStack, Image, Text, getCapabilities, getImageDimensions, matchesKey, truncateToWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import type { ImageMode } from "./image-modes.ts";
export interface ImageBlock { type: string; data?: string; mimeType?: string }
export interface Attachment { block: ImageBlock; label: string }
export function attachments(content: ImageBlock[], args: unknown): Attachment[] {
	const path = (args as { path?: unknown } | undefined)?.path;
	const label = typeof path === "string" ? path.replace(/[\x00-\x1f\x7f-\x9f]/g, " ") : "Image";
	return content.filter((block) => block.type === "image").map((block, i) => ({ block, label: `${label}${i ? ` · ${i + 1}` : ""}` }));
}
/** Strict base64, as the terminal's image protocol requires: a BEL or ESC inside would end it early. */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** The image types pi-tui can encode; anything else has no protocol path and no dimensions. */
const SUPPORTED_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * The payload may be spliced verbatim into an OSC 1337 / APC _G sequence, so only strict base64
 * with a supported type is allowed through; everything else falls back to the text placeholder.
 */
function safeImage(block: ImageBlock): { data: string; mimeType: string } | undefined {
	const { data, mimeType } = block;
	if (typeof data !== "string" || typeof mimeType !== "string") return undefined;
	if (!SUPPORTED_MIME.has(mimeType) || data.length === 0 || data.length % 4 !== 0) return undefined;
	return BASE64.test(data) ? { data, mimeType } : undefined;
}

function preview(item: Attachment, theme: Theme, height: number): Component {
	const safe = safeImage(item.block);
	const dimensions = safe ? getImageDimensions(safe.data, safe.mimeType) : undefined;
	if (!safe || !dimensions || dimensions.widthPx <= 0 || dimensions.heightPx <= 0) return new Text(theme.fg("toolOutput", "Image preview unavailable"), 0, 0);
	return new Image(safe.data, safe.mimeType, { fallbackColor: (s) => theme.fg("toolOutput", s) }, { maxWidthCells: 100, maxHeightCells: height }, dimensions);
}
/** Cached Image instances retain IDs and transcoded data across typing and redraws. */
export class ImageResult implements Component {
	readonly squintImages = true;
	private small: Component[];
	private large: Component[];
	constructor(private body: Component, private items: Attachment[], private theme: Theme, private mode: () => ImageMode, private expanded: () => boolean, private show: boolean, private hint: string | (() => string)) {
		this.small = items.map((item) => preview(item, theme, 6));
		this.large = items.map((item) => preview(item, theme, 18));
	}
	invalidate() { this.body.invalidate(); for (const p of [...this.small, ...this.large]) p.invalidate(); }
	render(width: number): string[] {
		const lines = [...this.body.render(width)];
		if (!this.items.length) return lines;
		const mode = this.mode();
		const open = this.expanded();
		const label = (item: Attachment) => this.theme.fg("toolOutput", truncateToWidth(`${item.label} · ${(item.block.mimeType ?? "image").replace(/[\x00-\x1f\x7f-\x9f]/g, " ")}`, width));
		if (!this.show || !getCapabilities().images || (!open && (mode === "compact" || mode === "inspector"))) {
			const hint = typeof this.hint === "function" ? this.hint() : this.hint;
			return [...lines, ...this.items.map(label), truncateToWidth(this.theme.fg("dim", !this.show ? "Images hidden in pi settings" : `${hint} ${mode === "inspector" ? "inspect images" : "expand images"}`), width)];
		}
		if (mode === "strip" && !open && width >= 40) {
			const columns = Math.max(1, Math.min(3, Math.floor(width / 24)));
			for (let start = 0; start < this.items.length; start += columns) {
				const group = this.items.slice(start, start + columns);
				const cellWidth = Math.floor((width - 2 * (columns - 1)) / columns);
				const previews = group.map((_, i) => this.small[start + i].render(cellWidth));
				// Text compositing drops subsequent image escapes; position each protocol sequence explicitly.
				for (let row = 0; row < Math.max(...previews.map(p => p.length)); row++) {
					lines.push(previews.map((p, i) => p[row] ? `\x1b7\x1b[${i * (cellWidth + 2) + 1}G${p[row]}\x1b8` : "").join(""));
				}
				lines.push(...new HStack(group.map(item => ({ component: new Text(this.theme.fg("toolOutput", truncateToWidth(item.label, cellWidth)), 0, 0), basis: cellWidth })), { gap: 2 }).render(width));
			}
		} else {
			this.items.forEach((item, i) => { lines.push(label(item), ...((open || (mode !== "strip" && i === 0)) ? this.large[i] : this.small[i]).render(width)); });
		}
		return lines;
	}
}
/** One shared, read-only overlay; arrow keys replace its image instead of stacking previews. */
export class ImageInspector implements Component {
	private previews: Component[] = [];
	private height = 0;
	constructor(private items: Attachment[], private selected: number, private tui: TUI, private theme: Theme, private done: () => void, private show: boolean) {}
	invalidate() { for (const p of this.previews) p.invalidate(); }
	handleInput(data: string) {
		if (matchesKey(data, "escape")) { this.done(); return; }
		const delta = matchesKey(data, "right") || matchesKey(data, "down") ? 1 : matchesKey(data, "left") || matchesKey(data, "up") ? -1 : 0;
		if (delta) { this.selected = (this.selected + delta + this.items.length) % this.items.length; this.tui.requestRender(); }
	}
	render(width: number): string[] {
		const item = this.items[this.selected];
		const header = this.theme.fg("accent", truncateToWidth(`Images · ${this.selected + 1}/${this.items.length} · ←/→ select · Esc close`, width));
		const height = Math.max(1, Math.floor(this.tui.terminal.rows * .9) - 4);
		if (height !== this.height) {
			this.height = height;
			this.previews = this.items.map(entry => preview(entry, this.theme, height));
		}
		const listWidth = Math.floor(width * .3);
		const start = Math.max(0, this.selected - height + 1);
		const list = new Text(this.items.slice(start, start + height).map((entry, i) => truncateToWidth(`${i + start === this.selected ? ">" : " "} ${entry.label}`, listWidth)).join("\n"), 0, 0);
		const image = this.show ? this.previews[this.selected] : new Text(truncateToWidth("Images hidden in pi settings", width), 0, 0);
		const body = width >= 70 ? new HStack([{ component: list, basis: listWidth }, { component: image, basis: 0, grow: 1 }], { gap: 2 }).render(width) : image.render(width);
		return [header, truncateToWidth(item.label, width), ...body];
	}
}
