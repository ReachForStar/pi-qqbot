import type { AgentBackend, AgentEvent, ImageAttachment } from "../src/types.ts";

/** 最小测试替身：记录调用，手动驱动事件。 */
export class FakeBackend implements AgentBackend {
	readonly sent: { text: string; images: ImageAttachment[]; mode: "queue" | "steer" }[] = [];
	disposed = false;
	isRunning = false;
	queueLength = 0;
	skillNames: readonly string[] = ["demo-skill"];
	aborted = 0;
	constructor(public readonly sessionFile: string | undefined) {}

	private readonly listeners = new Set<(event: AgentEvent) => void>();

	subscribe(listener: (event: AgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(event: AgentEvent): void {
		for (const listener of this.listeners) listener(event);
	}

	async send(text: string, images: ImageAttachment[], mode: "queue" | "steer"): Promise<void> {
		this.sent.push({ text, images, mode });
	}

	async abort(): Promise<void> {
		this.aborted += 1;
	}

	async compact(): Promise<string> {
		return "已压缩会话历史";
	}

	async reload(): Promise<string> {
		this.reloads += 1;
		return "已重新扫描技能与资源，上下文保留";
	}

	reloads = 0;

	async status(): Promise<string> {
		return `状态：${this.sessionFile ?? "内存会话"}`;
	}

	async model(query?: string): Promise<string> {
		return query ? `已切换到 ${query}` : "当前模型：fake/model";
	}

	dispose(): void {
		this.disposed = true;
		this.listeners.clear();
	}
}
