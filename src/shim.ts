/**
 * The code-block shim.
 *
 * pi's Markdown renderer draws the ``` fences itself, and no extension API can change that:
 * `registerMarkdownTransformer` only rewrites markdown text, and every fenced block is parsed
 * back into a code token the renderer wraps in backticks. So squint patches the renderer once,
 * and the patch stays direction-agnostic:
 *
 *     globalThis.__squintCodeBlock(code, lang, width, markdownTheme) -> styled lines | undefined
 *
 * Lines replace pi's fence rendering; nothing (squint unloaded, style "off", a broken style)
 * keeps pi's own output. The inserted code cannot throw into the render path, so a bad style
 * can never break the transcript.
 *
 * The shim lives inside the pi release, so a new release ships the stock renderer again.
 * `ensureShim()` is idempotent and version-aware: it re-installs a missing shim, and replaces
 * an older one from the pristine backup rather than stacking on it. The first install only
 * takes effect after pi restarts, which /squint code says out loud.
 */
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ShimKind = "minified" | "pretty";

/**
 * The stock renderer's code branch, exactly as shipped: the case label plus the first line of
 * its body. Replacing this keeps braces balanced in both builds.
 */
export const STOCK: Record<ShimKind, string> = {
	minified: 'case"code":{let indent=this.theme.codeBlockIndent??"  ";',
	pretty: '            case "code": {\n                const indent = this.theme.codeBlockIndent ?? "  ";',
};

/** What pi's renderer gets instead: ask squint, then fall through to the stock body. */
export const SHIM: Record<ShimKind, string> = {
	minified:
		'case"code":{try{let sq=globalThis.__squintCodeBlock,out=sq&&sq(token.text,token.lang,width,this.theme);if(out&&out.length){lines.push(...out),nextTokenType&&nextTokenType!=="space"&&lines.push("");break}}catch{}let indent=this.theme.codeBlockIndent??"  ";',
	pretty: `            case "code": {
                try {
                    const squintLines = globalThis.__squintCodeBlock?.(token.text, token.lang, width, this.theme);
                    if (squintLines?.length) {
                        lines.push(...squintLines);
                        if (nextTokenType && nextTokenType !== "space") lines.push("");
                        break;
                    }
                }
                catch {
                    // A broken hook must never break the transcript.
                }
                const indent = this.theme.codeBlockIndent ?? "  ";`,
};

export interface ShimPatch {
	text: string;
	action: "present" | "installed" | "pattern-missing";
}

/** A source already carrying this shim. The whole body, not a prefix: a truncated file is not current. */
const isCurrent = (source: string, kind: ShimKind) => source.includes(SHIM[kind]);

/**
 * Insert the shim into one renderer source. Pure: the caller owns reading, writing and the
 * backup, and `ensureShim` hands it the pristine source when a patch is already present, so
 * versions replace each other instead of stacking.
 */
export function applyShim(source: string, kind: ShimKind): ShimPatch {
	if (isCurrent(source, kind)) return { text: source, action: "present" };
	if (!source.includes(STOCK[kind])) return { text: source, action: "pattern-missing" };
	return { text: source.replace(STOCK[kind], SHIM[kind]), action: "installed" };
}

export interface ShimTarget {
	kind: ShimKind;
	path: string;
}

/** The pi release the running session belongs to: `install/current-version`. */
export function agentDir(): string {
	return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

/**
 * The two copies that draw a code block: the bundle chunk pi's own transcript runs (bin ->
 * dist/bundle/cli.js) and the pi-tui package, which extensions that render Markdown
 * themselves — pi's subagent output, for one — import.
 */
export function shimTargets(): ShimTarget[] {
	const root = join(agentDir(), "install");
	let release = "";
	try {
		release = readFileSync(join(root, "current-version"), "utf8").trim();
	} catch {
		return [];
	}
	if (!release) return [];
	const modules = join(root, "releases", release, "node_modules", "@earendil-works");
	const chunks = join(modules, "pi-coding-agent", "dist", "bundle", "chunks");
	const targets: ShimTarget[] = [];
	try {
		for (const file of readdirSync(chunks)) {
			if (!file.endsWith(".js")) continue;
			const path = join(chunks, file);
			if (readFileSync(path, "utf8").includes(STOCK.minified) || readFileSync(path, "utf8").includes(SHIM.minified.slice(0, 40))) {
				targets.push({ kind: "minified", path });
			}
		}
	} catch {
		// No bundle: an SDK-style install renders through pi-tui alone.
	}
	const tui = join(modules, "pi-tui", "dist", "components", "markdown.js");
	if (existsSync(tui)) targets.push({ kind: "pretty", path: tui });
	return targets;
}

/** The backup, but only while it still looks like pi's own unpatched file. */
function pristineSource(path: string, kind: ShimKind): string | undefined {
	const backup = `${path}.orig`;
	if (!existsSync(backup)) return undefined;
	const text = readFileSync(backup, "utf8");
	return text.includes(STOCK[kind]) && !text.includes("__squintCodeBlock") ? text : undefined;
}

/**
 * The source to patch. A file that still carries a squint marker but is not exactly this shim over
 * the pristine backup is squint's own damaged or outdated patch, so it is rebuilt from the backup.
 * A file with no marker is pi's, and pi's own update is never overwritten by a stored copy.
 */
export function shimSource(path: string, kind: ShimKind): string {
	const current = readFileSync(path, "utf8");
	const base = pristineSource(path, kind);
	if (!base || current.includes(STOCK[kind])) return current;
	if (current === applyShim(base, kind).text) return current;
	return current.includes("__squintCodeBlock") ? base : current;
}

export interface ShimResult {
	path: string;
	kind: ShimKind;
	action: ShimPatch["action"] | "missing-file";
}

/** Install the shim where it is missing or out of date. Cheap enough to run on every load. */
export function ensureShim(): ShimResult[] {
	const results: ShimResult[] = [];
	for (const target of shimTargets()) {
		if (!existsSync(target.path)) {
			results.push({ path: target.path, kind: target.kind, action: "missing-file" });
			continue;
		}
		const current = readFileSync(target.path, "utf8");
		if (isCurrent(current, target.kind)) {
			results.push({ path: target.path, kind: target.kind, action: "present" });
			continue;
		}
		const source = shimSource(target.path, target.kind);
		const patched = applyShim(source, target.kind);
		if (patched.action === "installed") {
			// A source that is the file itself has changed since the backup, so it becomes the pristine
			// copy; when the backup stood in, it is already pristine and stays untouched.
			if (source === current) copyFileSync(target.path, `${target.path}.orig`);
			// Write beside the target and rename, so an interrupted write cannot truncate pi's file.
			const temporary = `${target.path}.squint-tmp`;
			writeFileSync(temporary, patched.text);
			renameSync(temporary, target.path);
		}
		results.push({ path: target.path, kind: target.kind, action: patched.action });
	}
	return results;
}
