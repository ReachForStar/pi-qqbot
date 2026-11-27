import type { ReplyTarget } from "@tencent-connect/qqbot-nodejs";
import { chunkMarkdown } from "./chunker.ts";
import type { ReplyBudget } from "./reply-budget.ts";
import type { Sticker } from "./stickers.ts";
import type { Sink } from "./types.ts";

/** QQ 单条纯文本消息的实际上限，留出余量避免被平台拒绝。 */
export const TEXT_LIMIT = 4500;
/** QQ 流式消息允许的最小刷新间隔。 */
export const STREAM_THROTTLE_MS = 300;

/** sink 只用到的 bot 能力，便于独立测试。 */
export interface BotLike {
	sendText(target: ReplyTarget, text: string): Promise<unknown>;
	sendMarkdown(target: ReplyTarget, text: string): Promise<unknown>;
	sendImage(target: ReplyTarget, source: { localPath: string }): Promise<unknown>;
	openStream(options: { target: ReplyTarget; throttleMs?: number }): StreamLike;
}

export interface StreamLike {
	update(text: string): Promise<void>;
	complete(): Promise<unknown>;
}

export interface SinkOptions {
	/** 私聊走流式；群聊与关掉流式时按上限切分。 */
	streaming: boolean;
	/** 用 Markdown 发送（需要平台权限）。 */
	markdown: boolean;
	/** 按段落拆成多条气泡，模拟真人分条发消息。 */
	paragraph?: boolean;
	/** 分条模式下每轮最多的气泡数。 */
	paragraphLimit?: number;
	limit?: number;
	/** 被动回复额度，缺省不限制。 */
	budget?: ReplyBudget;
	/** 可发送的表情，缺省不支持表情。 */
	stickers?: readonly Sticker[];
}

export function createSink(bot: BotLike, target: ReplyTarget, options: SinkOptions): Sink {
	return options.streaming ? new StreamSink(bot, target) : new TextSink(bot, target, options);
}

/** 私聊：QQ 的 stream_messages 只在私聊可用，边生成边刷新同一条消息。 */
class StreamSink implements Sink {
	private readonly stream: StreamLike;

	constructor(
		private readonly bot: BotLike,
		private readonly target: ReplyTarget,
	) {
		this.stream = bot.openStream({ target, throttleMs: STREAM_THROTTLE_MS });
	}

	update(text: string): void {
		// 流式刷新失败不能变成未处理拒绝（Node 默认会让进程退出），最终内容由 finish 兜底
		void this.stream.update(text).catch(() => undefined);
	}

	async finish(text: string): Promise<void> {
		if (text.trim()) await this.stream.update(text).catch(() => undefined);
		await this.stream.complete().catch(() => undefined);
	}

	async notice(text: string): Promise<void> {
		await this.bot.sendText(this.target, text);
	}

	async sticker(): Promise<void> {
		// 流式消息只承载文本，表情走普通发送
	}
}

/** 群聊与非流式场景：按上限切分或按段落分条后逐条发送。 */
class TextSink implements Sink {
	private readonly limit: number;

	constructor(
		private readonly bot: BotLike,
		private readonly target: ReplyTarget,
		private readonly options: SinkOptions,
	) {
		this.limit = options.limit ?? TEXT_LIMIT;
	}

	update(): void {}

	async finish(text: string): Promise<void> {
		if (!text.trim()) {
			await this.notice("（本轮没有输出）");
			return;
		}
		for (const chunk of this.split(text)) await this.send(chunk);
	}

	async notice(text: string): Promise<void> {
		for (const chunk of chunkMarkdown(text, this.limit)) await this.sendText(chunk);
	}

	async sticker(name: string): Promise<void> {
		const available = this.options.stickers ?? [];
		const sticker = available.find((candidate) => candidate.name === name);
		if (!sticker) return;
		await this.bot.sendImage(this.reserve(), { localPath: sticker.path });
	}

	/** 段落模式把回复拆成多条气泡；段落太长时退化成按长度切。 */
	private split(text: string): string[] {
		if (!this.options.paragraph) return chunkMarkdown(text, this.limit);
		const paragraphs = text
			.split(/\n{2,}/)
			.map((paragraph) => paragraph.trim())
			.filter((paragraph) => paragraph.length > 0);
		const limit = this.options.paragraphLimit ?? 3;
		if (paragraphs.length <= 1) return chunkMarkdown(text, this.limit);
		const merged = paragraphs.slice(0, limit - 1);
		const tail = paragraphs.slice(limit - 1).join("\n\n");
		return [...merged, tail].filter((part) => part.length > 0).flatMap((part) => chunkMarkdown(part, this.limit));
	}

	private async send(chunk: string): Promise<void> {
		const target = this.reserve();
		if (this.options.markdown) await this.bot.sendMarkdown(target, chunk);
		else await this.bot.sendText(target, chunk);
	}

	private async sendText(chunk: string): Promise<void> {
		await this.bot.sendText(this.reserve(), chunk);
	}

	/** 每次发送都消耗一次被动回复额度，用完自动降级为主动发送。 */
	private reserve(): ReplyTarget {
		return this.options.budget?.reserve(this.target) ?? this.target;
	}
}
