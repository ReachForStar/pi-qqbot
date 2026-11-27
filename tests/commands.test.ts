import { describe, expect, it } from "vitest";
import { helpText, parseCommand, runCommand, type CommandContext } from "../src/commands.ts";
import { Members } from "../src/members.ts";
import type { SessionSummary } from "../src/router.ts";
import { FakeBackend } from "./fake-backend.ts";

function memoryIo() {
	const files = new Map<string, string>();
	return {
		exists: (path: string) => files.has(path),
		read: (path: string) => files.get(path) ?? "",
		write: (path: string, content: string) => files.set(path, content),
	};
}

function context(
	backend = new FakeBackend("/sessions/1.jsonl"),
): CommandContext & { resetCount: () => number; fake: FakeBackend; setLastTurn: (turn: { text: string; tools: number } | undefined) => void; setSessions: (list: SessionSummary[]) => void } {
	let resets = 0;
	let lastTurn: { text: string; tools: number } | undefined = { text: "上一条提问", tools: 0 };
	let sessions: SessionSummary[] = [];
	let persona: string | undefined;
	return {
		backend,
		openid: "USER_OPENID",
		peer: { scope: "c2c", peerId: "USER_OPENID" },
		reset: async () => {
			resets += 1;
			return new FakeBackend("/sessions/2.jsonl");
		},
		receivedAt: Date.now(),
		eventTime: Date.now() - 100,
		members: new Members("unused.json", memoryIo()),
		isOwner: true,
		lastTurn: () => lastTurn,
		sessions: async () => sessions,
		resume: async (index) => `已切换到会话 ${index}`,
		persona: (next) => {
			if (next === undefined) return persona ?? "本会话没有单独的人设";
			persona = next === "clear" || next === "" ? undefined : next;
			return persona ? `已设置本会话人设（${persona.length} 字）` : "已清除本会话人设";
		},
		resetCount: () => resets,
		fake: backend,
		setLastTurn: (turn) => {
			lastTurn = turn;
		},
		setSessions: (list) => {
			sessions = list;
		},
	};
}

describe("parseCommand", () => {
	it("识别已知命令并保留参数", () => {
		expect(parseCommand("/model deepseek/deepseek-chat")).toEqual({ name: "model", args: "deepseek/deepseek-chat" });
		expect(parseCommand("/HELP")).toEqual({ name: "help", args: "" });
	});

	it("支持 dsh-qqbot 风格的别名", () => {
		expect(parseCommand("/bot-ping")?.name).toBe("bot-ping");
		expect(parseCommand("/bot-help")?.name).toBe("bot-help");
	});

	it("非命令与未知命令放行给模型", () => {
		expect(parseCommand("帮我看下 /etc/hosts")).toBeUndefined();
		expect(parseCommand("/unknown")).toBeUndefined();
		expect(parseCommand("普通提问")).toBeUndefined();
	});
});

describe("runCommand", () => {
	it("帮助按 agent / qqbot 分组", async () => {
		const text = await runCommand("/help", context());
		expect(text).toContain("通用能力：");
		expect(text).toContain("/compact");
		expect(text).toContain("机器人能力：");
		expect(text).toContain("/ping");
		expect(text).toBe(helpText());
	});

	it("身份查询同时给出 openid 与对端", async () => {
		expect(await runCommand("/whoami", context())).toBe("openid：USER_OPENID\n会话：c2c:USER_OPENID");
	});

	it("/new 走路由重置，/stop 走后端中止", async () => {
		const ctx = context();
		expect(await runCommand("/new", ctx)).toContain("新会话");
		expect(ctx.resetCount()).toBe(1);
		expect(await runCommand("/stop", ctx)).toContain("中止");
		expect(ctx.fake.aborted).toBe(1);
	});

	it("/reload 重建资源但保留上下文", async () => {
		const ctx = context();
		expect(await runCommand("/reload", ctx)).toContain("上下文保留");
		expect(ctx.fake.reloads).toBe(1);
	});

	it("/model 无参数列出、有参数切换", async () => {
		const ctx = context();
		expect(await runCommand("/model", ctx)).toBe("当前模型：fake/model");
		expect(await runCommand("/model fake/other", ctx)).toBe("已切换到 fake/other");
	});

	it("/ping 拆出网络与处理耗时", async () => {
		const text = await runCommand("/ping", context());
		expect(text).toContain("pong");
		expect(text).toMatch(/网络传输：\d+ms/);
		expect(text).not.toMatch(/：-\d/);
		expect(text).toMatch(/插件处理：\d+ms/);
	});

	it("/version 带包版本", async () => {
		expect(await runCommand("/version", context())).toMatch(/pi-qqbot v\d+\.\d+\.\d+/);
	});

	it("/pair 只给管理员签发配对码", async () => {
		const ctx = context();
		const reply = await runCommand("/pair 5", ctx);
		expect(reply).toContain("配对码：");
		expect(reply).toContain("有效期至");

		const guest = { ...context(), isOwner: false };
		expect(await runCommand("/pair", guest)).toBe("仅管理员可以签发配对码");
	});

	it("/members 与 /revoke 只给管理员", async () => {
		const ctx = context();
		expect(await runCommand("/members", ctx)).toBe("身份库为空");
		ctx.members.seed(["OPENID_A"]);
		expect(await runCommand("/members", ctx)).toContain("OPENID_A");
		expect(await runCommand("/revoke OPENID_A", ctx)).toBe("已移除 OPENID_A");
		const guest = { ...context(), isOwner: false };
		expect(await runCommand("/revoke OPENID_A", guest)).toBe("仅管理员可以移除成员");
	});

	it("不能撤销自己", async () => {
		const ctx = context();
		ctx.members.seed(["USER_OPENID"]);
		expect(await runCommand("/revoke USER_OPENID", ctx)).toContain("不能移除自己");
		expect(ctx.members.isMember("USER_OPENID")).toBe(true);
	});

	it("/pair 的有效期上限 24 小时", async () => {
		const reply = await runCommand("/pair 100000", context());
		expect(reply).toContain("上限 24 小时");
	});

	it("/retry 无上一轮时提示，用过工具时要 force", async () => {
		const empty = context();
		empty.setLastTurn(undefined);
		expect(await runCommand("/retry", empty)).toBe("还没有可重发的内容");

		const risky = context();
		risky.setLastTurn({ text: "重跑", tools: 2 });
		expect(await runCommand("/retry", risky)).toContain("/retry force");
		expect(risky.fake.sent).toEqual([]);
		expect(await runCommand("/retry force", risky)).toBe("已重发上一条消息");
		expect(risky.fake.sent[0].text).toBe("重跑");
	});

	it("/sessions 列出历史，/resume 按序号切换", async () => {
		const ctx = context();
		expect(await runCommand("/sessions", ctx)).toBe("没有历史会话");
		ctx.setSessions([
			{ id: "abcdef12-3456", path: "/s/a.jsonl", firstMessage: "第一条消息", modified: new Date("2026-11-27T08:00:00Z"), messageCount: 2 },
		]);
		expect(await runCommand("/sessions", ctx)).toContain("第一条消息");
		expect(await runCommand("/resume 1", ctx)).toBe("已切换到会话 1");
		expect(await runCommand("/resume x", ctx)).toContain("用法");
	});

	it("/persona 读写与清除", async () => {
		const ctx = context();
		expect(await runCommand("/persona", ctx)).toBe("本会话没有单独的人设");
		expect(await runCommand("/persona 你是猫娘", ctx)).toBe("已设置本会话人设（4 字）");
		expect(await runCommand("/persona", ctx)).toBe("你是猫娘");
		expect(await runCommand("/persona clear", ctx)).toBe("已清除本会话人设");
	});

	it("非命令返回 undefined", async () => {
		expect(await runCommand("你好", context())).toBeUndefined();
	});
});
