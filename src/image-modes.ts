/** Image settings are separate from tool-call directions. */
export const IMAGE_MODES = [
	{ id: "inline", label: "Bounded inline", blurb: "readable previews with a fixed height cap" },
	{ id: "strip", label: "Contact strip", blurb: "sibling thumbnails; expand for larger previews" },
	{ id: "compact", label: "Attachment rows", blurb: "metadata only until expanded" },
	{ id: "inspector", label: "Shared inspector", blurb: "compact rows; open a shared image browser" },
] as const;
export type ImageMode = typeof IMAGE_MODES[number]["id"];
export const DEFAULT_IMAGE_MODE: ImageMode = "inline";
export const isImageMode = (value: unknown): value is ImageMode => IMAGE_MODES.some((mode) => mode.id === value);
