import { describe, expect, it } from "vitest";
import { formatToolLine, formatToolResult, maskOpenid } from "../src/format.ts";

describe("formatToolLine", () => {
	it("优先用 command/path 之类的关键参数", () => {
		expect(formatToolLine("bash", { command: "ls -la" })).toBe("▸ bash: ls -la");
		expect(formatToolLine("read", { path: "src/main.ts" })).toBe("▸ read: src/main.ts");
		expect(formatToolLine("grep", { pattern: "TODO" })).toBe("▸ grep: TODO");
	});

	it("没有关键参数时退化成 JSON", () => {
		expect(formatToolLine("mcp__x", { a: 1 })).toBe('▸ mcp__x: {"a":1}');
	});

	it("空参数只留名字", () => {
		expect(formatToolLine("ls", {})).toBe("▸ ls");
		expect(formatToolLine("ls", undefined)).toBe("▸ ls");
	});

	it("压平换行并截断长参数", () => {
		expect(formatToolLine("bash", { command: "echo a\necho b" })).toBe("▸ bash: echo a echo b");
		const long = formatToolLine("bash", { command: "x".repeat(200) });
		expect(long.length).toBeLessThanOrEqual("▸ bash: ".length + 80);
		expect(long.endsWith("…")).toBe(true);
	});
});

describe("formatToolResult", () => {
	it("成功行带耗时与结果摘要", () => {
		expect(formatToolResult({ name: "bash", isError: false, durationMs: 812, preview: "total 12\nmain.ts" })).toBe(
			"✓ bash（812ms）: total 12 main.ts",
		);
		expect(formatToolResult({ name: "read", isError: false, durationMs: 1450 })).toBe("✓ read（1.5s）");
	});

	it("失败行用 ✗ 并给原因", () => {
		expect(formatToolResult({ name: "bash", isError: true, durationMs: 30, preview: "command not found" })).toBe(
			"✗ bash（30ms）: command not found",
		);
		expect(formatToolResult({ name: "bash", isError: true })).toBe("✗ bash 失败");
	});

	it("长结果截断成一行", () => {
		const line = formatToolResult({ name: "bash", isError: false, preview: "x".repeat(300) });
		expect(line.endsWith("…")).toBe(true);
		expect(line).not.toContain("\n");
	});
});

describe("maskOpenid", () => {
	it("长 openid 只留头尾", () => {
		expect(maskOpenid("A1B2C3D4E5F60718293A4B5C6D7E8F90")).toBe("A1B2C3…8F90");
	});

	it("短标识原样返回", () => {
		expect(maskOpenid("ABC123")).toBe("ABC123");
	});
});
