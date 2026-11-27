import { formatToolLine, formatToolResult } from "./format.ts";
import { extractStickers, type Sticker } from "./stickers.ts";
import type { AgentEvent, Sink } from "./types.ts";

/** 工具调用的展示方式。 */
export const TOOL_DISPLAY_MODES = ["summary", "live", "off"] as const;
export type ToolDisplay = (typeof TOOL_DISPLAY_MODES)[number];

export interface BinderOptions {
	/** summary：本轮结束汇总一条；live：实时两行（按间隔合并）；off：只报失败。 */
	toolDisplay: ToolDisplay;
	/** live 模式下合并窗口（毫秒）。 */
	flushMs?: number;
	/** 可用表情；为空表示不支持表情标记。 */
	stickers?: readonly Sticker[];
	/** 每轮最多几张表情。 */
	stickerMax?: number;
	/** 模型输出该标记时本轮不回复。 */
	noReplyToken?: string;
}

export interface Binder {
	onEvent(event: AgentEvent): Promise<void>;
	/** 本轮已发生的工具调用次数。 */
	readonly toolCalls: number;
	/** 当前累积的文本，`/stop` 后用于把已生成内容发出去。 */
	readonly text: string;
}

/** 默认合并窗口：一次任务动辄十几次工具调用，逐条发会把对话冲掉。 */
const DEFAULT_FLUSH_MS = 2500;
/** 一条提示里最多列几条工具行，超出的折成计数。 */
const MAX_LINES_PER_NOTICE = 6;

interface ToolTally {
	calls: number;
	durationMs: number;
	byName: Map<string, number>;
}

/**
 * 把 agent 事件流翻译成渠道输出。
 *
 * 工具调用默认只在轮末汇总一次：一轮几十次调用逐条发出去会淹没对话本身。
 * 结束判定用 settled 而不是单轮结束事件：一轮之后仍可能有重试、压缩或排队消息。
 */
export function createBinder(sink: Sink, options: BinderOptions): Binder {
	let text = "";
	const flushMs = options.flushMs ?? DEFAULT_FLUSH_MS;
	const tally: ToolTally = { calls: 0, durationMs: 0, byName: new Map() };
	let pendingLines: string[] = [];
	let timer: NodeJS.Timeout | undefined;

	const flushPending = async (): Promise<void> => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
		if (pendingLines.length === 0) return;
		const lines = pendingLines.slice(0, MAX_LINES_PER_NOTICE);
		const rest = pendingLines.length - lines.length;
		pendingLines = [];
		await sink.notice(rest > 0 ? [...lines, `… 另有 ${rest} 行`].join("\n") : lines.join("\n"));
	};

	const scheduleFlush = (): void => {
		if (timer !== undefined) return;
		timer = setTimeout(() => {
			timer = undefined;
			flushPending().catch(() => undefined);
		}, flushMs);
		timer.unref();
	};

	const record = (name: string, durationMs: number | undefined): void => {
		tally.calls += 1;
		tally.durationMs += durationMs ?? 0;
		tally.byName.set(name, (tally.byName.get(name) ?? 0) + 1);
	};

	return {
		get text(): string {
			return text;
		},
		get toolCalls(): number {
			return tally.calls;
		},
		async onEvent(event: AgentEvent): Promise<void> {
			switch (event.type) {
				case "text_delta": {
					text += event.delta;
					sink.update(text);
					return;
				}
				case "tool_start": {
					if (options.toolDisplay === "off") return;
					if (options.toolDisplay === "summary") return;
					pendingLines.push(formatToolLine(event.name, event.args));
					scheduleFlush();
					return;
				}
				case "tool_end": {
					record(event.name, event.durationMs);
					if (event.isError) {
						// 失败必须让用户看到，不受展示模式限制
						await flushPending();
						await sink.notice(formatToolResult(event));
						return;
					}
					if (options.toolDisplay !== "live") return;
					pendingLines.push(formatToolResult(event));
					scheduleFlush();
					return;
				}
				case "retry": {
					const reason = event.reason ? `：${event.reason}` : "";
					await sink.notice(`⟳ 第 ${event.attempt}/${event.maxAttempts} 次重试（${event.delayMs}ms 后）${reason}`);
					return;
				}
				case "compaction": {
					await sink.notice(event.phase === "start" ? "⏳ 正在压缩上下文" : "✅ 压缩完成");
					return;
				}
				case "timeout": {
					await sink.notice("⏱ 处理超时，已中止本轮");
					return;
				}
				case "settled": {
					await flushPending();
					const summary = toolSummary(tally, options.toolDisplay);
					if (summary) await sink.notice(summary);

					const stickers = options.stickers ?? [];
					// 模型可以用标记附带表情；标记在文本里剥掉，避免原样发出去
					const parsed = event.aborted ? { text, names: [] } : extractStickers(text, stickers, options.stickerMax ?? 1);
					const finalText = event.aborted ? `${text}\n\n（已中止）` : parsed.text;
					text = "";

					const noReply = options.noReplyToken;
					if (!event.aborted && noReply && finalText.trim() === noReply) return;

					await sink.finish(finalText);
					for (const name of parsed.names) await sink.sticker(name);
					return;
				}
			}
		},
	};
}

/** 轮末汇总：次数 + 各工具分布 + 总耗时。 */
function toolSummary(tally: ToolTally, display: ToolDisplay): string | undefined {
	if (display !== "summary" || tally.calls === 0) return undefined;
	const breakdown = [...tally.byName.entries()]
		.sort((left, right) => right[1] - left[1])
		.map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
		.join("、");
	const seconds = tally.durationMs >= 1000 ? `，耗时 ${(Math.round(tally.durationMs / 100) / 10).toFixed(1)}s` : "";
	return `🛠 工具调用 ${tally.calls} 次：${breakdown}${seconds}`;
}
