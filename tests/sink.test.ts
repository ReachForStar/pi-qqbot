import type { ReplyTarget } from "@tencent-connect/qqbot-nodejs";
import { describe, expect, it } from "vitest";
import { ReplyBudget } from "../src/reply-budget.ts";
import { createSink, type BotLike, type StreamLike } from "../src/sink.ts";

const target: ReplyTarget = { scope: "group", targetId: "GROUP" };

class RecordingStream implements StreamLike {
	readonly updates: string[] = [];
	completed = 0;
	async update(text: string): Promise<void> {
		this.updates.push(text);
	}
	async complete(): Promise<unknown> {
		this.completed += 1;
		return {};
	}
}

class RecordingBot implements BotLike {
	readonly texts: string[] = [];
	readonly markdowns: string[] = [];
	readonly images: string[] = [];
	readonly streams: RecordingStream[] = [];

	readonly sentTargets: ReplyTarget[] = [];

	async sendText(target: ReplyTarget, text: string): Promise<unknown> {
		this.texts.push(text);
		this.sentTargets.push(target);
		return {};
	}

	async sendMarkdown(target: ReplyTarget, text: string): Promise<unknown> {
		this.markdowns.push(text);
		this.sentTargets.push(target);
		return {};
	}

	async sendImage(_target: ReplyTarget, source: { localPath: string }): Promise<unknown> {
		this.images.push(source.localPath);
		return {};
	}

	openStream(): StreamLike {
		const stream = new RecordingStream();
		this.streams.push(stream);
		return stream;
	}
}

describe("createSink", () => {
	it("非流式按上限切分并用文本发送", async () => {
		const bot = new RecordingBot();
		const sink = createSink(bot, target, { streaming: false, markdown: false, limit: 8 });
		await sink.finish("第一行内容\n第二行内容\n第三行内容");
		expect(bot.texts.length).toBeGreaterThan(1);
		for (const text of bot.texts) expect(text.length).toBeLessThanOrEqual(8);
		expect(bot.texts.join("\n").replace(/\s+/g, "")).toBe("第一行内容第二行内容第三行内容");
	});

	it("打开 markdown 后用 sendMarkdown 发送", async () => {
		const bot = new RecordingBot();
		const sink = createSink(bot, target, { streaming: false, markdown: true });
		await sink.finish("**粗体**");
		expect(bot.markdowns).toEqual(["**粗体**"]);
		expect(bot.texts).toEqual([]);
	});

	it("流式走 update + complete", async () => {
		const bot = new RecordingBot();
		const sink = createSink(bot, target, { streaming: true, markdown: false });
		sink.update("部分");
		await sink.finish("完整文本");
		expect(bot.streams[0].updates).toEqual(["部分", "完整文本"]);
		expect(bot.streams[0].completed).toBe(1);
	});

	it("空输出给一句提示而不是发空消息", async () => {
		const bot = new RecordingBot();
		const sink = createSink(bot, target, { streaming: false, markdown: false });
		await sink.finish("   ");
		expect(bot.texts).toEqual(["（本轮没有输出）"]);
	});

	it("段落模式拆成多条气泡且受条数上限约束", async () => {
		const bot = new RecordingBot();
		const sink = createSink(bot, target, { streaming: false, markdown: false, paragraph: true, paragraphLimit: 3 });
		await sink.finish("第一段\n\n第二段\n\n第三段\n\n第四段");
		expect(bot.texts.length).toBe(3);
		expect(bot.texts[0]).toBe("第一段");
		expect(bot.texts[2]).toContain("第四段");
	});

	it("被动回复额度用完后降级为不带 msgId 的发送", async () => {
		const bot = new RecordingBot();
		const budget = new ReplyBudget(1, 60_000);
		const sink = createSink(bot, { ...target, msgId: "MSG1" }, { streaming: false, markdown: false, budget });
		await sink.finish("第一段\n\n第二段");
		await sink.notice("提示");
		expect(bot.sentTargets[0].msgId).toBe("MSG1");
		expect(bot.sentTargets[1].msgId).toBeUndefined();
	});

	it("表情按名字发送图片，未知名字忽略", async () => {
		const bot = new RecordingBot();
		const stickers = [{ name: "开心", path: "/stickers/开心.png" }];
		const sink = createSink(bot, target, { streaming: false, markdown: false, stickers });
		await sink.sticker("开心");
		await sink.sticker("不存在");
		expect(bot.images).toEqual(["/stickers/开心.png"]);
	});

	it("提示行始终用纯文本发送（即使开了 markdown）", async () => {
		const bot = new RecordingBot();
		const sink = createSink(bot, target, { streaming: false, markdown: true, limit: 10 });
		await sink.notice("▸ bash: ls -la");
		expect(bot.markdowns).toEqual([]);
		expect(bot.texts.join("")).toBe("▸ bash: ls -la");
		expect(bot.texts.length).toBeGreaterThan(1);
	});
});
