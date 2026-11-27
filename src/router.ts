import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { MappingStore } from "./store.ts";
import type { AgentBackend } from "./types.ts";

export interface SessionRouterOptions {
	/** 打开已有会话文件或新建会话，由 agent 侧实现。 */
	create(key: string, sessionFile: string | undefined): Promise<AgentBackend>;
	store: MappingStore;
	idleMs: number;
	now?: () => number;
	/** 会话目录与工作目录，用于列出历史会话（`/sessions`）。 */
	sessionDir?: string;
	cwd?: string;
}

/** 历史会话条目，供 `/sessions` 展示。 */
export interface SessionSummary {
	id: string;
	path: string;
	firstMessage: string;
	modified: Date;
	messageCount: number;
}

interface Entry {
	backend: AgentBackend;
	lastUsed: number;
}

/**
 * peer → agent 会话的路由与生命周期。
 *
 * 两层状态：内存里的运行中会话、磁盘上的 peer → 会话文件映射。
 * 回收只释放内存，映射保留，下一条消息按会话文件恢复历史。
 * 同一个 peer 的并发请求通过 pending 合并，避免重复创建会话实例。
 */
export class SessionRouter {
	private readonly entries = new Map<string, Entry>();
	private readonly pending = new Map<string, Promise<AgentBackend>>();
	private readonly now: () => number;

	constructor(private readonly options: SessionRouterOptions) {
		this.now = options.now ?? Date.now;
	}

	async acquire(key: string): Promise<AgentBackend> {
		const entry = this.entries.get(key);
		if (entry) {
			entry.lastUsed = this.now();
			return entry.backend;
		}

		const inflight = this.pending.get(key);
		if (inflight) return inflight;

		const task = this.open(key).finally(() => this.pending.delete(key));
		this.pending.set(key, task);
		return task;
	}

	/** `/new`：丢弃当前会话与映射，下一次 acquire 创建全新会话。 */
	async reset(key: string): Promise<AgentBackend> {
		// 创建会话可能还在进行（加载资源要时间），先等它落地再丢弃，否则会残留一份没人回收的实例
		const inflight = this.pending.get(key);
		if (inflight) await inflight.catch(() => undefined);
		this.disposeEntry(key);
		this.options.store.delete(key);
		return this.acquire(key);
	}

	/** 列出该工作目录下的历史会话，按最近修改排序。 */
	async listSessions(limit = 5): Promise<SessionSummary[]> {
		if (!this.options.sessionDir || !this.options.cwd) return [];
		const sessions = await SessionManager.list(this.options.cwd, this.options.sessionDir);
		return sessions
			.sort((left, right) => right.modified.getTime() - left.modified.getTime())
			.slice(0, limit)
			.map((info) => ({
				id: info.id,
				path: info.path,
				firstMessage: info.firstMessage,
				modified: info.modified,
				messageCount: info.messageCount,
			}));
	}

	/** 切到指定会话文件（`/resume`）。 */
	async switchTo(key: string, sessionPath: string): Promise<AgentBackend> {
		const inflight = this.pending.get(key);
		if (inflight) await inflight.catch(() => undefined);
		this.disposeEntry(key);
		this.options.store.set(key, sessionPath);
		return this.acquire(key);
	}

	/** 回收闲置会话，返回被回收的 peer 键；映射保留以便下次恢复。 */
	sweep(): string[] {
		const evicted: string[] = [];
		for (const [key, entry] of this.entries) {
			// 正在跑的一轮可能远超 idleMs，回收会把对话中途杀掉
			if (entry.backend.isRunning) continue;
			if (this.now() - entry.lastUsed < this.options.idleMs) continue;
			this.disposeEntry(key);
			evicted.push(key);
		}
		return evicted;
	}

	shutdown(): void {
		for (const key of [...this.entries.keys()]) this.disposeEntry(key);
	}

	private async open(key: string): Promise<AgentBackend> {
		const backend = await this.options.create(key, this.options.store.get(key));
		if (backend.sessionFile) this.options.store.set(key, backend.sessionFile);
		this.entries.set(key, { backend, lastUsed: this.now() });
		return backend;
	}

	private disposeEntry(key: string): void {
		const entry = this.entries.get(key);
		if (!entry) return;
		entry.backend.dispose();
		this.entries.delete(key);
	}
}
