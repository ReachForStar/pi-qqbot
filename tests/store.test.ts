import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { MappingStore } from "../src/store.ts";

const dirs: string[] = [];

function tempPath(): string {
	mkdirSync("tmp", { recursive: true });
	const dir = mkdtempSync(join("tmp", "store-"));
	dirs.push(dir);
	return join(dir, "sessions.json");
}

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("MappingStore", () => {
	it("读写与删除", () => {
		const store = new MappingStore(tempPath());
		store.set("c2c:u1", "/sessions/a.jsonl");
		expect(store.get("c2c:u1")).toBe("/sessions/a.jsonl");
		expect(store.get("c2c:none")).toBeUndefined();
		store.delete("c2c:u1");
		expect(store.get("c2c:u1")).toBeUndefined();
	});

	it("写前合并磁盘上已有条目，多实例不互相覆盖", () => {
		const path = tempPath();
		const first = new MappingStore(path);
		const second = new MappingStore(path);
		first.set("c2c:u1", "/a.jsonl");
		second.set("c2c:u2", "/b.jsonl");
		const entries = JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
		expect(entries).toEqual({ "c2c:u1": "/a.jsonl", "c2c:u2": "/b.jsonl" });
	});

	it("文件内容损坏时抛出，不静默清空", () => {
		const path = tempPath();
		writeFileSync(path, "{不是 JSON", "utf8");
		expect(() => new MappingStore(path).get("c2c:u1")).toThrow();
	});
});
