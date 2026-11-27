import type { ReplyTarget } from "@tencent-connect/qqbot-nodejs";
import { describe, expect, it } from "vitest";
import { ReplyBudget } from "../src/reply-budget.ts";

const target: ReplyTarget = { scope: "group", targetId: "GROUP", msgId: "MSG1" };

describe("ReplyBudget", () => {
	it("窗口内按上限放行，超了改主动发送", () => {
		let now = 0;
		const budget = new ReplyBudget(2, 1_000, () => now);
		expect(budget.reserve(target).msgId).toBe("MSG1");
		expect(budget.reserve(target).msgId).toBe("MSG1");
		expect(budget.reserve(target).msgId).toBeUndefined();
		expect(budget.usedFor("MSG1")).toBe(2);
	});

	it("超出窗口后重新计额", () => {
		let now = 0;
		const budget = new ReplyBudget(1, 1_000, () => now);
		expect(budget.reserve(target).msgId).toBe("MSG1");
		expect(budget.reserve(target).msgId).toBeUndefined();
		now = 1_001;
		expect(budget.reserve(target).msgId).toBe("MSG1");
	});

	it("没有 msgId 或上限为 0 时原样返回", () => {
		const budget = new ReplyBudget(0, 1_000);
		expect(budget.reserve(target).msgId).toBe("MSG1");
		const limited = new ReplyBudget(1, 1_000);
		expect(limited.reserve({ scope: "c2c", targetId: "U" })).toEqual({ scope: "c2c", targetId: "U" });
	});

	it("不同触发消息各自计额", () => {
		const budget = new ReplyBudget(1, 1_000);
		expect(budget.reserve(target).msgId).toBe("MSG1");
		expect(budget.reserve({ ...target, msgId: "MSG2" }).msgId).toBe("MSG2");
	});
});
