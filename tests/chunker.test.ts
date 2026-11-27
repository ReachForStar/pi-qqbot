import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "../src/chunker.ts";

describe("chunkMarkdown", () => {
	it("短文本原样返回一片", () => {
		expect(chunkMarkdown("你好", 100)).toEqual(["你好"]);
	});

	it("空文本返回空数组", () => {
		expect(chunkMarkdown("   \n\n", 100)).toEqual([]);
	});

	it("按行切分且每片不超过上限", () => {
		const text = Array.from({ length: 50 }, (_, index) => `第 ${index} 行内容`).join("\n");
		const chunks = chunkMarkdown(text, 60);
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(60);
		expect(chunks.join("\n").replace(/\s+/g, "")).toBe(text.replace(/\s+/g, ""));
	});

	it("代码块跨片时补闭合围栏并在下一片重开", () => {
		const code = Array.from({ length: 20 }, (_, index) => `const v${index} = ${index};`).join("\n");
		const text = `说明文字\n\n\`\`\`ts\n${code}\n\`\`\``;
		const chunks = chunkMarkdown(text, 80);
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			const fences = chunk.split("\n").filter((line) => line.trim().startsWith("```")).length;
			expect(fences % 2).toBe(0);
		}
		const reopened = chunks.find((chunk) => chunk.startsWith("```ts"));
		expect(reopened).toBeDefined();
	});

	it("消息以代码块开头时也补闭合并重开围栏", () => {
		const code = Array.from({ length: 20 }, (_, index) => `const v${index} = ${index};`).join("\n");
		const chunks = chunkMarkdown("```ts\n" + code + "\n```", 80);
		expect(chunks.length).toBeGreaterThan(1);
		for (const chunk of chunks) {
			const fences = chunk.split("\n").filter((line) => line.trim().startsWith("```")).length;
			expect(fences % 2).toBe(0);
		}
	});

	it("超限单行被硬切", () => {
		const text = "x".repeat(250);
		const chunks = chunkMarkdown(text, 100);
		expect(chunks.length).toBe(3);
		expect(chunks.join("")).toBe(text);
	});

	it("上限非法时抛出", () => {
		expect(() => chunkMarkdown("a", 0)).toThrow();
	});
});
