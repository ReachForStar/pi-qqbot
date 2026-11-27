import { describe, expect, it } from "vitest";
import { matchModel } from "../src/agent.ts";

const models = [
	{ provider: "vendor", id: "family/fast-model" },
	{ provider: "vendor", id: "family/big-model" },
	{ provider: "other", id: "fast" },
];

describe("matchModel", () => {
	it("精确匹配 provider/id", () => {
		expect(matchModel(models, "vendor/family/fast-model")?.id).toBe("family/fast-model");
	});

	it("匹配裸 id", () => {
		expect(matchModel(models, "family/big-model")?.provider).toBe("vendor");
	});

	it("唯一后缀匹配", () => {
		expect(matchModel(models, "big-model")?.id).toBe("family/big-model");
	});

	it("后缀命中多个时拒绝猜测", () => {
		const ambiguous = [
			{ provider: "a", id: "family/fast" },
			{ provider: "b", id: "third/fast" },
		];
		expect(matchModel(ambiguous, "fast")).toBeUndefined();
	});

	it("不存在时返回 undefined", () => {
		expect(matchModel(models, "nope")).toBeUndefined();
	});
});
