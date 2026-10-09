import { AssistantMessageComponent, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Container, matchesKey, MouseRegion, Text, truncateToWidth, type Component, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import { buildRow, layout, type Direction, type Seg } from "./directions.ts";
import { classify, keyLabel, textOf } from "./logic.ts";

interface Message {
	role: string;
	content: Array<{ type: string; text?: string; id?: string; name?: string; arguments?: unknown }>;
	toolCallId?: string;
	isError?: boolean;
	details?: unknown;
}
interface Agent {
	id: string;
	agent: string;
	task: string;
	exitCode: number;
	model?: string;
	stopReason?: string;
	errorMessage?: string;
	stderr?: string;
	messages: Message[];
}

/** Identity is invocation + task index, not name: parallel tasks can use the same agent. */
export class AgentTranscripts {
	readonly agents = new Map<string, Agent>();
	revision = 0;

	update(callId: string, details: unknown): boolean {
		const results = (details as { results?: unknown[] } | undefined)?.results;
		if (!Array.isArray(results)) return false;
		let changed = false;
		results.forEach((value, index) => {
			const result = value as Agent;
			if (!result || typeof result.agent !== "string" || !Array.isArray(result.messages)) return;
			const id = `${callId}:${index}`;
			this.agents.set(id, { ...result, id });
			changed = true;
		});
		if (changed) this.revision++;
		return changed;
	}

	cycle(current: string | undefined, delta: number): string | undefined {
		const ids = [undefined, ...this.agents.keys()];
		const index = Math.max(0, ids.indexOf(current));
		return ids[(index + delta + ids.length) % ids.length];
	}

	clear(): void {
		this.agents.clear();
		this.revision++;
	}
}

export function agentStatus(agent: Agent): string {
	if (agent.stopReason === "aborted") return "aborted";
	if (agent.exitCode === -1) return "running";
	if (agent.exitCode !== 0 || ["error", "length"].includes(agent.stopReason ?? "")) return "failed";
	return "completed";
}

export function registerAgentViews(pi: ExtensionAPI, direction: () => Direction, style: (theme: Theme, line: Seg[]) => string, expandKey: string) {
	const store = new AgentTranscripts();
	let screen: AgentScreen | undefined;
	let close: (() => void) | undefined;

	const capture = (id: string, name: string, result: { details?: unknown; content?: Array<{ type: string; text?: string }> } | undefined, ended = false) => {
		if (!/(^|[._])subagent$/.test(name)) return;
		let changed = store.update(id, result?.details);
		if (ended) for (const agent of store.agents.values()) {
			if (!agent.id.startsWith(`${id}:`) || agent.exitCode !== -1) continue;
			agent.exitCode = 1;
			agent.errorMessage = textOf(result?.content ?? []) || "Invocation ended without a final agent result";
			store.revision++;
			changed = true;
		}
		if (changed) screen?.refresh();
	};
	pi.on("tool_execution_update", (event) => capture(event.toolCallId, event.toolName, event.partialResult));
	pi.on("tool_execution_end", (event) => capture(event.toolCallId, event.toolName, event.result, true));
	pi.on("session_start", (_event, ctx) => {
		close?.();
		store.clear();
		if (ctx.mode === "tui") ctx.ui.setStatus("squint-agent", "Observing: Main");
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message" && entry.message.role === "toolResult") {
				capture(entry.message.toolCallId, entry.message.toolName, entry.message);
			}
		}
	});
	pi.on("session_shutdown", () => close?.());

	const open = async (ctx: ExtensionContext, delta = 1) => {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("squint: agent observation needs the terminal UI", "info");
			return;
		}
		if (screen) { screen.cycle(delta); return; }
		const selected = store.cycle(undefined, delta);
		if (!selected) {
			ctx.ui.notify("squint: no subagent transcripts in this branch yet", "info");
			return;
		}
		try {
			await ctx.ui.custom<void>((tui, theme, _keys, done) => {
				close = () => done();
				screen = new AgentScreen(store, selected, tui, theme, done, direction, style, expandKey);
				return screen;
			}, { overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", anchor: "top-left" } });
		} finally {
			screen = undefined;
			close = undefined;
		}
	};
	pi.registerShortcut("ctrl+shift+right", { description: "Observe next agent", handler: (ctx) => open(ctx, 1) });
	pi.registerShortcut("ctrl+shift+left", { description: "Observe previous agent", handler: (ctx) => open(ctx, -1) });
	return open;
}

/** A read-only transcript. The parent keeps running; Escape or cycling to Main restores its editor. */
export class AgentScreen implements Component {
	private body = new Container();
	private cacheKey = "";
	private lines: string[] = [];
	private offset = Infinity;
	private height = 1;
	private openTools = new Set<string>();
	private showThinking = false;
	private latestTool?: string;

	constructor(private store: AgentTranscripts, private selected: string, private tui: TUI, private theme: Theme,
		private done: () => void, private direction: () => Direction, private style: (theme: Theme, line: Seg[]) => string,
		private expandKey: string) {}

	refresh(): void { this.tui.requestRender(); }
	invalidate(): void { this.cacheKey = ""; this.body.invalidate(); }
	cycle(delta: number): void {
		const next = this.store.cycle(this.selected, delta);
		if (!next) { this.done(); return; }
		this.selected = next;
		this.offset = Infinity;
		this.invalidate();
		this.refresh();
	}
	private toggle(id: string): void {
		if (this.openTools.has(id)) this.openTools.delete(id);
		else this.openTools.add(id);
		this.invalidate();
		this.refresh();
	}
	handleInput(data: string): void {
		if (matchesKey(data, "escape")) { this.done(); return; }
		if (matchesKey(data, "ctrl+shift+right") || matchesKey(data, "tab")) { this.cycle(1); return; }
		if (matchesKey(data, "ctrl+shift+left") || matchesKey(data, "shift+tab")) { this.cycle(-1); return; }
		if (matchesKey(data, this.expandKey as Parameters<typeof matchesKey>[1]) && this.latestTool) { this.toggle(this.latestTool); return; }
		if (matchesKey(data, "t")) { this.showThinking = !this.showThinking; this.invalidate(); }
		const max = Math.max(0, this.lines.length - this.height);
		const at = Math.min(this.offset, max);
		if (matchesKey(data, "up")) this.offset = Math.max(0, at - 1);
		if (matchesKey(data, "down")) this.offset = Math.min(max, at + 1);
		if (matchesKey(data, "pageUp")) this.offset = Math.max(0, at - this.height);
		if (matchesKey(data, "pageDown")) this.offset = Math.min(max, at + this.height);
		if (matchesKey(data, "home")) this.offset = 0;
		if (matchesKey(data, "end")) this.offset = Infinity;
		this.refresh();
	}

	handleMouse(event: TuiMouseEvent) {
		if (event.type === "wheel") {
			const max = Math.max(0, this.lines.length - this.height);
			this.offset = Math.max(0, Math.min(max, Math.min(this.offset, max) + (event.wheelDelta ?? 0)));
			this.refresh();
			return { handled: true };
		}
		if (event.y < 2 || event.y >= this.height + 2) return undefined;
		const offset = Math.min(this.offset, Math.max(0, this.lines.length - this.height));
		const handled = this.body.handleMouse({ ...event, y: event.y - 2 + offset, height: this.lines.length });
		return handled ? { handled: true } : undefined;
	}

	render(width: number): string[] {
		const agent = this.store.agents.get(this.selected);
		if (!agent) return [];
		const key = `${this.selected}|${this.store.revision}|${width}|${this.direction()}`;
		if (key !== this.cacheKey) {
			this.cacheKey = key;
			this.body = new Container();
			this.body.addChild(new Text(`Task: ${agent.task}`, 0, 0));
			const results = new Map(agent.messages.filter((m) => m.role === "toolResult").map((m) => [m.toolCallId, m]));
			const lastTool = agent.messages.filter((m) => m.role === "assistant").flatMap((m) => m.content).filter((p) => p.type === "toolCall" && p.id && p.name).at(-1);
			this.latestTool = lastTool ? `${agent.id}/${lastTool.id}` : undefined;
			for (const message of agent.messages) {
				if (message.role !== "assistant") continue;
				this.body.addChild(new AssistantMessageComponent(message as unknown as AssistantMessage, !this.showThinking, undefined, "THINK · t to show", 0));
				for (const part of message.content) {
					if (part.type !== "toolCall" || !part.id || !part.name) continue;
					const id = `${agent.id}/${part.id}`;
					const result = results.get(part.id);
					const open = this.openTools.has(id);
					const row = buildRow(this.direction(), classify(part.name), {
						args: part.arguments, text: textOf(result?.content ?? []),
						diff: (result?.details as { diff?: string } | undefined)?.diff,
						isError: result?.isError ?? false, pending: !result && agent.exitCode === -1, open,
					});
					const text = layout(this.direction(), row, width, open, { keyHint: (action) => `${id === this.latestTool ? keyLabel(this.expandKey) : "click"} ${action}` }).map((line) => this.style(this.theme, line)).join("\n");
					this.body.addChild(new MouseRegion(new Text(text, 0, 0), (event) => {
						if (event.type !== "click" || event.button !== "left") return undefined;
						this.toggle(id);
						return { handled: true };
					}));
				}
			}
			if (!agent.messages.length) this.body.addChild(new Text(agent.exitCode === -1 ? "Waiting for the first message…" : "No messages recorded.", 0, 0));
			if (agent.errorMessage || agent.stderr) this.body.addChild(new Text(agent.errorMessage || agent.stderr || "", 0, 0));
			this.lines = this.body.render(width);
		}
		this.height = Math.max(1, (this.tui.terminal.rows || 24) - 4);
		const offset = Math.min(this.offset, Math.max(0, this.lines.length - this.height));
		const index = [...this.store.agents.keys()].indexOf(this.selected) + 1;
		const plain = (s: string) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
		const header = `Agent: ${plain(agent.agent)} · task ${index}/${this.store.agents.size}`;
		return [
			truncateToWidth(this.theme.fg("accent", header), width),
			truncateToWidth(this.theme.fg("muted", `READ ONLY · ${agentStatus(agent)} · ${plain(agent.model ?? "unknown")} · Main running independently`), width),
			...this.lines.slice(offset, offset + this.height),
			...Array(Math.max(0, this.height - this.lines.slice(offset, offset + this.height).length)).fill(""),
			truncateToWidth(this.theme.fg("muted", "←/→ Ctrl+Shift cycle · Tab next · ↑/↓ scroll · End follow · t thinking · Esc Main"), width),
		];
	}
}
