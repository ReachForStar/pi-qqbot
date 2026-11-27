import { describe, expect, it } from "vitest";
import { planEnqueue } from "../src/enqueue.ts";

describe("planEnqueue", () => {
	it("空闲时不提示，按配置方式入队", () => {
		expect(planEnqueue(false, "queue", 0)).toEqual({ mode: "queue" });
		expect(planEnqueue(false, "steer", 0)).toEqual({ mode: "steer" });
	});

	it("忙时排队给出队位", () => {
		expect(planEnqueue(true, "queue", 2)).toEqual({ mode: "queue", notice: "已排队（前面还有 3 条）" });
	});

	it("忙时插话提示已插入", () => {
		expect(planEnqueue(true, "steer", 1)).toEqual({ mode: "steer", notice: "已插入当前任务" });
	});
});
