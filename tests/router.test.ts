import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { SessionRouter } from "../src/router.ts";
import { MappingStore, type StoreIo } from "../src/store.ts";
import { FakeBackend } from "./fake-backend.ts";

function memoryStore(): MappingStore {
	const files = new Map<string, string>();
	const io: StoreIo = {
		exists: (path) => files.has(path),
		read: (path) => files.get(path) ?? "",
		write: (path, content) => files.set(path, content),
	};
	return new MappingStore("memory.json", io);
}

function setup() {
	let now = 0;
	const created: (string | undefined)[] = [];
	const backends: FakeBackend[] = [];
	const router = new SessionRouter({
		create: async (_key, sessionFile) => {
			created.push(sessionFile);
			const backend = new FakeBackend(sessionFile ?? `/sessions/${backends.length}.jsonl`);
			backends.push(backend);
			return backend;
		},
		store: memoryStore(),
		idleMs: 1_000,
		now: () => now,
	});
	return {
		router,
		created,
		backends,
		advance: (ms: number) => {
			now += ms;
		},
	};
}

describe("SessionRouter", () => {
	it("同一 peer 复用同一后端", async () => {
		const { router, created } = setup();
		const first = await router.acquire("c2c:u1");
		const second = await router.acquire("c2c:u1");
		expect(second).toBe(first);
		expect(created).toEqual([undefined]);
	});

	it("并发请求只创建一次", async () => {
		const { router, created } = setup();
		await Promise.all([router.acquire("group:g1"), router.acquire("group:g1"), router.acquire("group:g1")]);
		expect(created).toEqual([undefined]);
	});

	it("闲置回收后按会话文件恢复", async () => {
		const { router, backends, created, advance } = setup();
		const first = await router.acquire("c2c:u1");
		expect(first.sessionFile).toBe("/sessions/0.jsonl");

		advance(1_500);
		expect(router.sweep()).toEqual(["c2c:u1"]);
		expect(backends[0].disposed).toBe(true);

		const resumed = await router.acquire("c2c:u1");
		expect(created).toEqual([undefined, "/sessions/0.jsonl"]);
		expect(resumed).not.toBe(first);
	});

	it("/new 丢弃旧会话与映射", async () => {
		const { router, created } = setup();
		await router.acquire("c2c:u1");
		const fresh = await router.reset("c2c:u1");
		expect(created).toEqual([undefined, undefined]);
		expect(fresh.sessionFile).toBe("/sessions/1.jsonl");
	});

	it("正在运行的会话不被回收", async () => {
		const { router, backends, advance } = setup();
		await router.acquire("c2c:u1");
		backends[0].isRunning = true;
		advance(10_000);
		expect(router.sweep()).toEqual([]);
		expect(backends[0].disposed).toBe(false);
	});

	it("/new 等在途创建完成后再重置", async () => {
		let release: (backend: FakeBackend) => void = () => {};
		const gate = new Promise<FakeBackend>((resolve) => {
			release = resolve;
		});
		const created: FakeBackend[] = [];
		const router = new SessionRouter({
			create: async (_key, sessionFile) => {
				if (created.length === 0) {
					const backend = new FakeBackend(sessionFile ?? "/sessions/first.jsonl");
					created.push(backend);
					await gate;
					return backend;
				}
				const backend = new FakeBackend("/sessions/second.jsonl");
				created.push(backend);
				return backend;
			},
			store: memoryStore(),
			idleMs: 1_000,
		});

		const acquiring = router.acquire("c2c:u1");
		const resetting = router.reset("c2c:u1");
		release(created[0]);
		await acquiring;
		const fresh = await resetting;
		expect(fresh.sessionFile).toBe("/sessions/second.jsonl");
	});

	it("未到闲置阈值不回收", async () => {
		const { router, advance } = setup();
		await router.acquire("c2c:u1");
		advance(500);
		expect(router.sweep()).toEqual([]);
	});
});

describe("SessionRouter 会话列表与切换", () => {
	it("列出真实会话文件并能切换过去", async () => {
		mkdirSync("tmp", { recursive: true });
		const root = mkdtempSync(join("tmp", "sessions-"));
		const cwd = join(root, "ws");
		const sessionDir = join(root, "sessions");
		mkdirSync(cwd, { recursive: true });

		// 造两个真实会话文件：SessionManager 落盘即真实依赖
		const created: string[] = [];
		for (const index of [1, 2]) {
			const manager = SessionManager.create(cwd, sessionDir);
			manager.appendMessage({
				role: "user",
				content: [{ type: "text", text: `第 ${index} 段对话` }],
				timestamp: Date.now(),
			});
			created.push(manager.getSessionFile() ?? "");
		}

		const router = new SessionRouter({
			create: async (_key, sessionFile) => new FakeBackend(sessionFile ?? "/fallback.jsonl"),
			store: memoryStore(),
			idleMs: 60_000,
			sessionDir,
			cwd,
		});

		const list = await router.listSessions();
		expect(list.length).toBe(2);
		expect(list[0].firstMessage).toContain("第");

		const backend = await router.switchTo("c2c:u1", list[1].path);
		expect(backend.sessionFile).toBe(list[1].path);

		router.shutdown();
		rmSync(root, { recursive: true, force: true });
	});
});
