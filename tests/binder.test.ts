import { afterEach, describe, expect, it, vi } from "vitest";
import { createBinder } from "../src/binder.ts";
import type { Sink } from "../src/types.ts";

class RecordingSink implements Sink {
	readonly updates: string[] = [];
	readonly notices: string[] = [];
	readonly finished: string[] = [];
	readonly stickers: string[] = [];

	update(text: string): void {
		this.updates.push(text);
	}

	async finish(text: string): Promise<void> {
		this.finished.push(text);
	}

	async notice(text: string): Promise<void> {
		this.notices.push(text);
	}

	async sticker(name: string): Promise<void> {
		this.stickers.push(name);
	}
}

function toolCall(name: string, durationMs = 10): { start: never; end: never } {
	// 事件形状在用例里显式构造，避免 helper 掩盖参数
	return {
		start: { type: "tool_start", name, args: { command: "ls" } } as never,
		end: { type: "tool_end", name, isError: false, durationMs, preview: "ok" } as never,
	};
}

describe("createBinder", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("累积增量并在 settled 时收尾", async () => {
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "summary" });
		await binder.onEvent({ type: "text_delta", delta: "你好，" });
		await binder.onEvent({ type: "text_delta", delta: "世界" });
		expect(sink.updates).toEqual(["你好，", "你好，世界"]);
		await binder.onEvent({ type: "settled", aborted: false });
		expect(sink.finished).toEqual(["你好，世界"]);
		expect(binder.text).toBe("");
	});

	it("summary 模式只在轮末发一条汇总", async () => {
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "summary" });
		for (let index = 0; index < 5; index += 1) {
			const call = toolCall("bash");
			await binder.onEvent(call.start);
			await binder.onEvent(call.end);
		}
		const read = toolCall("read");
		await binder.onEvent(read.start);
		await binder.onEvent(read.end);
		expect(sink.notices).toEqual([]);
		await binder.onEvent({ type: "settled", aborted: false });
		expect(sink.notices).toEqual(["🛠 工具调用 6 次：bash ×5、read"]);
	});

	it("失败调用立即提示，且不计入噪音", async () => {
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "summary" });
		await binder.onEvent({ type: "tool_end", name: "bash", isError: true, durationMs: 20, preview: "not found" });
		expect(sink.notices).toEqual(["✗ bash（20ms）: not found"]);
		await binder.onEvent({ type: "settled", aborted: false });
		expect(sink.notices).toEqual(["✗ bash（20ms）: not found", "🛠 工具调用 1 次：bash"]);
	});

	it("live 模式按窗口合并，轮末补齐剩余", async () => {
		vi.useFakeTimers();
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "live", flushMs: 1_000 });

		for (let index = 0; index < 3; index += 1) {
			const call = toolCall("bash");
			await binder.onEvent(call.start);
			await binder.onEvent(call.end);
		}
		expect(sink.notices).toEqual([]);

		vi.advanceTimersByTime(1_000);
		await Promise.resolve();
		expect(sink.notices.length).toBe(1);
		expect(sink.notices[0].split("\n").length).toBe(6);

		const call = toolCall("read");
		await binder.onEvent(call.start);
		await binder.onEvent(call.end);
		await binder.onEvent({ type: "settled", aborted: false });
		expect(sink.notices.length).toBe(2);
		expect(sink.notices[1]).toContain("read");
	});

	it("live 模式单条超出上限时折叠成计数", async () => {
		vi.useFakeTimers();
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "live", flushMs: 1_000 });
		for (let index = 0; index < 4; index += 1) {
			const call = toolCall("bash");
			await binder.onEvent(call.start);
			await binder.onEvent(call.end);
		}
		await binder.onEvent({ type: "settled", aborted: false });
		const lines = sink.notices[0].split("\n");
		expect(lines.length).toBe(7);
		expect(lines[6]).toBe("… 另有 2 行");
	});

	it("off 模式只报失败", async () => {
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "off" });
		const ok = toolCall("bash");
		await binder.onEvent(ok.start);
		await binder.onEvent(ok.end);
		await binder.onEvent({ type: "tool_end", name: "read", isError: true, preview: "denied" });
		await binder.onEvent({ type: "settled", aborted: false });
		expect(sink.notices).toEqual(["✗ read: denied"]);
	});

	it("重试、压缩、超时都给出提示", async () => {
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "summary" });
		await binder.onEvent({ type: "retry", attempt: 1, maxAttempts: 3, delayMs: 2000, reason: "overloaded" });
		await binder.onEvent({ type: "compaction", phase: "start" });
		await binder.onEvent({ type: "compaction", phase: "end" });
		await binder.onEvent({ type: "timeout" });
		expect(sink.notices).toEqual([
			"⟳ 第 1/3 次重试（2000ms 后）：overloaded",
			"⏳ 正在压缩上下文",
			"✅ 压缩完成",
			"⏱ 处理超时，已中止本轮",
		]);
	});

	it("NO_REPLY 时整轮不发送", async () => {
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "summary", noReplyToken: "NO_REPLY" });
		await binder.onEvent({ type: "text_delta", delta: "NO_REPLY" });
		await binder.onEvent({ type: "settled", aborted: false });
		expect(sink.finished).toEqual([]);
		expect(sink.notices).toEqual([]);
	});

	it("表情标记被剥离并单独发送", async () => {
		const sink = new RecordingSink();
		const stickers = [{ name: "开心", path: "/s/开心.png" }];
		const binder = createBinder(sink, { toolDisplay: "summary", stickers, stickerMax: 1 });
		await binder.onEvent({ type: "text_delta", delta: "好耶\n[表情:开心]" });
		await binder.onEvent({ type: "settled", aborted: false });
		expect(sink.finished).toEqual(["好耶"]);
		expect(sink.stickers).toEqual(["开心"]);
	});

	it("中止时在尾部标注", async () => {
		const sink = new RecordingSink();
		const binder = createBinder(sink, { toolDisplay: "summary" });
		await binder.onEvent({ type: "text_delta", delta: "部分输出" });
		await binder.onEvent({ type: "settled", aborted: true });
		expect(sink.finished).toEqual(["部分输出\n\n（已中止）"]);
	});
});
