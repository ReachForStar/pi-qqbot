import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isRecordedProcessAlive, processIdentity, readPidRecord, removePidRecord, writePidRecord } from "../src/service/pid.ts";
import { ProcessLock } from "../src/service/lock.ts";
import { rotateLog } from "../src/service/rotate.ts";

const roots: string[] = [];

function dir(): string {
	mkdirSync("tmp", { recursive: true });
	const root = mkdtempSync(join("tmp", "pid-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("processIdentity", () => {
	it("能读到当前进程的身份", () => {
		const identity = processIdentity(process.pid);
		expect(identity?.pid).toBe(process.pid);
		expect(identity?.command).toContain("node");
	});

	it("不存在的进程返回 undefined", () => {
		expect(processIdentity(999_999)).toBeUndefined();
		expect(processIdentity(-1)).toBeUndefined();
	});
});

describe("PID 记录", () => {
	it("写入、读取、删除", () => {
		const path = join(dir(), "bot.pid");
		const identity = processIdentity(process.pid);
		writePidRecord(path, {
			pid: process.pid,
			startedAt: identity?.startedAt ?? "",
			command: identity?.command ?? "node",
			entry: "src/main.ts",
		});
		const record = readPidRecord(path);
		expect(record?.pid).toBe(process.pid);
		expect(record?.entry).toBe("src/main.ts");
		removePidRecord(path);
		expect(readPidRecord(path)).toBeUndefined();
	});

	it("缺字段时抛错", () => {
		const path = join(dir(), "bot.pid");
		writeFileSync(path, JSON.stringify({ pid: 1 }), "utf8");
		expect(() => readPidRecord(path)).toThrow(/缺少字段/);
	});

	it("命令行不一致时判定为已被复用", () => {
		const identity = processIdentity(process.pid);
		expect(
			isRecordedProcessAlive({
				pid: process.pid,
				startedAt: identity?.startedAt ?? "",
				command: "node /somewhere/else.js",
				entry: "x",
			}),
		).toBe(false);
	});
});

describe("ProcessLock", () => {
	it("第二个持有者被拒绝", () => {
		const path = join(dir(), "bot.lock");
		const record = { pid: process.pid, startedAt: "", command: processIdentity(process.pid)?.command ?? "", entry: "test" };
		const first = new ProcessLock(path);
		first.acquire(record);
		const second = new ProcessLock(path);
		expect(() => second.acquire(record)).toThrow(/已有实例在运行/);
		first.release();
	});

	it("持有者已不存在时回收残留锁", () => {
		const root = dir();
		const path = join(root, "bot.lock");
		writeFileSync(path, JSON.stringify({ pid: 999_999, startedAt: "", command: "node", entry: "x" }), "utf8");
		const lock = new ProcessLock(path);
		lock.acquire({ pid: process.pid, startedAt: "", command: "node", entry: "test" });
		expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(process.pid);
		lock.release();
	});

	it("锁文件损坏时报错而不是删除", () => {
		const path = join(dir(), "bot.lock");
		writeFileSync(path, "{坏掉的", "utf8");
		expect(() => new ProcessLock(path).acquire({ pid: 1, startedAt: "", command: "node", entry: "x" })).toThrow(/锁文件损坏/);
	});

	it("释放后可以重新获取", () => {
		const path = join(dir(), "bot.lock");
		const record = { pid: process.pid, startedAt: "", command: "node", entry: "test" };
		const lock = new ProcessLock(path);
		lock.acquire(record);
		lock.release();
		expect(() => new ProcessLock(path).acquire(record)).not.toThrow();
	});
});

describe("rotateLog", () => {
	it("超过上限时轮转为 .1", () => {
		const path = join(dir(), "bot.log");
		writeFileSync(path, "x".repeat(2048), "utf8");
		expect(rotateLog(path, 1024)).toBe(true);
		expect(readFileSync(`${path}.1`, "utf8")).toHaveLength(2048);
	});

	it("未超上限或上限为 0 时不动", () => {
		const path = join(dir(), "bot.log");
		writeFileSync(path, "small", "utf8");
		expect(rotateLog(path, 1024)).toBe(false);
		expect(rotateLog(path, 0)).toBe(false);
	});
});
