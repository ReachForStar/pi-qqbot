import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	type AgentSession,
	DefaultResourceLoader,
	SessionManager,
	SettingsManager,
	createAgentSession,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import type { Config } from "./config.ts";
import { createWatchdog, type Watchdog } from "./watchdog.ts";
import type { AgentBackend, AgentEvent, ImageAttachment } from "./types.ts";

export type Logger = (message: string) => void;

/** 每个 peer 一个 pi 会话，会话文件按 peer 持久化，进程重启后继续同一段历史。 */
export function createAgentFactory(config: Config, log: Logger) {
	const sessionDir = join(config.stateDir, "sessions");
	mkdirSync(sessionDir, { recursive: true });

	return async (_key: string, sessionFile: string | undefined): Promise<AgentBackend> => {
		const settingsManager = SettingsManager.create(config.cwd);
		const resourceLoader = new DefaultResourceLoader({
			cwd: config.cwd,
			agentDir: getAgentDir(),
			settingsManager,
			// 只跑本项目的内联扩展：宿主目录里给终端界面写的扩展在无界面进程里会报 ctx 失效
			noExtensions: true,
		});
		// 只要自己传 resourceLoader，createAgentSession 就不会替你加载资源；不显式 reload 会导致技能、提示模板为空
		await resourceLoader.reload();
		const { session } = await createAgentSession({
			cwd: config.cwd,
			tools: config.tools,
			sessionManager: sessionFile ? SessionManager.open(sessionFile) : SessionManager.create(config.cwd, sessionDir),
			settingsManager,
			resourceLoader,
		});

		if (config.thinking) session.setThinkingLevel(config.thinking);
		if (config.model) {
			const match = matchModel(await session.modelRuntime.getAvailable(), config.model);
			if (!match) throw new Error(`模型不存在：${config.model}`);
			await session.setModel(match);
		}
		log(
			`会话已就绪：${session.sessionId}（${sessionFile ? "恢复" : "新建"}，模型 ${session.model ? label(session.model) : "未选择"}，思考 ${session.thinkingLevel}，技能 ${resourceLoader.getSkills().skills.length} 个）`,
		);
		return new PiBackend(session, resourceLoader, config.cwd, config.timeoutMs, log);
	};
}

class PiBackend implements AgentBackend {
	private readonly listeners = new Set<(event: AgentEvent) => void>();
	private readonly unsubscribeAgent: () => void;
	private running = false;
	private queue = 0;
	/** 串行化 send：running 由异步事件置位，相邻两条消息可能同时看到 false。 */
	private chain: Promise<void> = Promise.resolve();

	private skills: readonly string[] = [];
	private readonly watchdog: Watchdog;

	constructor(
		private readonly session: AgentSession,
		private readonly resourceLoader: DefaultResourceLoader,
		private readonly cwd: string,
		timeoutMs: number,
		private readonly log: Logger,
	) {
		this.watchdog = createWatchdog(timeoutMs);
		this.skills = resourceLoader.getSkills().skills.map((skill) => skill.name);
		this.unsubscribeAgent = session.subscribe((event) => {
			switch (event.type) {
				case "agent_start":
					this.running = true;
					return;
				case "auto_retry_start":
					this.emit({
						type: "retry",
						attempt: event.attempt,
						maxAttempts: event.maxAttempts,
						delayMs: event.delayMs,
						reason: event.errorMessage,
					});
					return;
				case "compaction_start":
					this.emit({ type: "compaction", phase: "start" });
					return;
				case "compaction_end":
					this.emit({ type: "compaction", phase: "end" });
					return;
				case "queue_update":
					this.queue = event.steering.length + event.followUp.length;
					return;
				case "agent_settled":
					this.running = false;
					this.watchdog.disarm();
					this.emit({ type: "settled", aborted: event.aborted });
					return;
				case "message_update":
					if (event.assistantMessageEvent.type === "text_delta") {
						this.emit({ type: "text_delta", delta: event.assistantMessageEvent.delta });
					}
					return;
				case "tool_execution_start":
					this.emit({ type: "tool_start", name: event.toolName, args: event.args });
					return;
				case "tool_execution_end":
					this.emit({
						type: "tool_end",
						name: event.toolName,
						isError: event.isError,
						...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
						...(previewToolResult(event.result) === undefined ? {} : { preview: previewToolResult(event.result) }),
					});
					return;
				default:
					return;
			}
		});
	}

	get skillNames(): readonly string[] {
		return this.skills;
	}

	get sessionFile(): string | undefined {
		return this.session.sessionFile;
	}

	get isRunning(): boolean {
		return this.running;
	}

	get queueLength(): number {
		return this.queue;
	}

	subscribe(listener: (event: AgentEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async send(text: string, images: ImageAttachment[], mode: "queue" | "steer"): Promise<void> {
		const content = images.map((image) => ({ type: "image" as const, data: image.data, mimeType: image.mimeType }));
		// 排队调用本身很快返回，但串行化能保证「忙判断」与「提交」不被并发穿透
		const run = this.chain.then(async () => {
			if (this.running) {
				// 运行中的 prompt 必须显式声明排队方式，SDK 不做猜测
				await (mode === "steer" ? this.session.steer(text, content) : this.session.followUp(text, content));
				return;
			}
			this.watchdog.arm(() => {
				this.emit({ type: "timeout" });
				void this.session.abort().catch((error: unknown) => {
					this.log(`超时中止失败：${error instanceof Error ? error.message : String(error)}`);
				});
			});
			try {
				await this.session.prompt(text, { images: content });
			} catch (error) {
				// prompt 抛错时不会有 agent_settled，必须自己解除看门狗
				this.watchdog.disarm();
				throw error;
			}
		});
		this.chain = run.catch(() => undefined);
		return run;
	}

	async abort(): Promise<void> {
		await this.session.abort();
	}

	async compact(): Promise<string> {
		try {
			await this.session.compact();
			return "已压缩会话历史";
		} catch (error) {
			// pi 对没到阈值的会话直接抛错，这不是故障，别把原始异常甩给用户
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("Nothing to compact")) return "当前会话太短，无需压缩";
			throw error;
		}
	}

	async reload(): Promise<string> {
		// 运行中重建扩展会拆掉正在使用的工具与事件订阅
		if (this.running) throw new Error("当前任务进行中，先 /stop 再 /reload");
		await this.session.reload();
		this.skills = this.resourceLoader.getSkills().skills.map((skill) => skill.name);
		return `已重新扫描技能与资源，上下文保留\n${await this.status()}`;
	}

	async status(): Promise<string> {
		const stats = this.session.getSessionStats();
		const model = this.session.model;
		const context = stats.contextUsage;
		return [
			`模型：${model ? `${model.provider}/${model.id}` : "未选择"}`,
			`思考级别：${this.session.thinkingLevel}`,
			`消息：用户 ${stats.userMessages} / 助手 ${stats.assistantMessages} / 工具调用 ${stats.toolCalls}`,
			`token：输入 ${stats.tokens.input} / 输出 ${stats.tokens.output} / 缓存读 ${stats.tokens.cacheRead}`,
			context
				? `上下文占用：${context.tokens ?? "?"} / ${context.contextWindow}${context.percent === null ? "" : `（${context.percent.toFixed(1)}%）`}`
				: "上下文占用：未知",
			`工具：${this.session.getActiveToolNames().join(", ") || "无"}`,
			`工作目录：${this.cwd}`,
			`运行中：${this.running ? "是" : "否"}`,
			`技能：${this.skillNames.length} 个${this.skillNames.length > 0 ? `（${this.skillNames.join(", ")}）` : ""}`,
			`会话：${this.session.sessionId}`,
		].join("\n");
	}

	async model(query?: string): Promise<string> {
		const available = await this.session.modelRuntime.getAvailable();
		const names = available.map(label);
		if (!query) {
			const current = this.session.model;
			return [`当前模型：${current ? label(current) : "未选择"}`, `可用模型：${names.join(", ") || "无"}`].join("\n");
		}
		const hit = matchModel(available, query);
		if (!hit) return `未找到模型：${query}`;
		await this.session.setModel(hit);
		return `已切换到 ${label(hit)}`;
	}

	dispose(): void {
		this.watchdog.disarm();
		this.unsubscribeAgent();
		this.listeners.clear();
		this.session.dispose();
	}

	private emit(event: AgentEvent): void {
		for (const listener of this.listeners) {
			// 渲染失败不能打断 agent 运行，只记录
			void Promise.resolve(listener(event)).catch((error: unknown) => {
				this.log(`渲染事件失败：${error instanceof Error ? error.message : String(error)}`);
			});
		}
	}
}

/**
 * 工具结果的首段文本。`result` 在类型上是 any，按结构取 content 里的 text 块，
 * 取不到就当作没有摘要。
 */
function previewToolResult(result: unknown): string | undefined {
	if (typeof result !== "object" || result === null) return undefined;
	const content = (result as { content?: unknown }).content;
	if (!Array.isArray(content)) return undefined;
	const text = content
		.filter((block): block is { type: string; text: string } => {
			return typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string";
		})
		.map((block) => block.text)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
	return text === "" ? undefined : text;
}

/** 先精确匹配 `provider/id`，再匹配裸 id，最后按唯一后缀匹配。 */
export function matchModel<T extends { provider: string; id: string }>(models: readonly T[], query: string): T | undefined {
	const exact = models.find((candidate) => label(candidate) === query) ?? models.find((candidate) => candidate.id === query);
	if (exact) return exact;
	const bySuffix = models.filter((candidate) => label(candidate).endsWith(`/${query}`));
	return bySuffix.length === 1 ? bySuffix[0] : undefined;
}

function label(model: { provider: string; id: string }): string {
	return `${model.provider}/${model.id}`;
}
