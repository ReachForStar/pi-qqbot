import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_TOOLS, loadConfig } from "../src/config.ts";

const roots: string[] = [];

/** 建一个状态目录，并写入配置文件（传函数以便引用同一个 stateDir）。 */
function setup(build?: (stateDir: string) => unknown | string): { configPath: string; stateDir: string } {
	mkdirSync("tmp", { recursive: true });
	const root = mkdtempSync(join("tmp", "config-"));
	roots.push(root);
	const stateDir = join(root, "state");
	const configPath = join(root, "pi-qqbot.json");
	if (build) {
		const value = build(stateDir);
		writeFileSync(configPath, typeof value === "string" ? value : JSON.stringify(value), "utf8");
	}
	return { configPath, stateDir };
}

afterAll(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("loadConfig", () => {
	it("缺凭据时报错，并说明去哪里配", () => {
		const { configPath } = setup();
		expect(() => loadConfig({ configPath, env: {} })).toThrow(/缺少 appId/);
	});

	it("全部使用默认值", () => {
		const { configPath } = setup((stateDir) => ({ appId: "1", appSecret: "s", stateDir }));
		const config = loadConfig({ configPath, env: {} });
		expect(config.allow.size).toBe(0);
		expect(config.tools).toEqual(DEFAULT_TOOLS);
		expect(config.idleMs).toBe(1_800_000);
		expect(config.toolDisplay).toBe("summary");
		expect(config.mode).toBe("queue");
		expect(config.ratePerMinute).toBe(20);
		expect(config.timeoutMs).toBe(1_800_000);
		expect(config.chunkMode).toBe("chunk");
		expect(config.ignoreBots).toBe(true);
		expect(config.injectTimestamp).toBe(true);
		expect(config.noReplyToken).toBe("NO_REPLY");
	});

	it("读取白名单、工具集与各类开关", () => {
		const { configPath } = setup((stateDir) => ({
			appId: "1",
			appSecret: "s",
			stateDir,
			allow: ["OPENID_A", "GROUP_B"],
			owner: ["OPENID_A"],
			tools: ["read", "grep"],
			requireMention: false,
			debug: true,
			model: "vendor/fast-model",
			thinking: "low",
			mode: "steer",
			chunkMode: "paragraph",
			groupReplyChance: 0.3,
		}));
		const config = loadConfig({ configPath, env: {} });
		expect([...config.allow]).toEqual(["OPENID_A", "GROUP_B"]);
		expect([...config.owner]).toEqual(["OPENID_A"]);
		expect(config.tools).toEqual(["read", "grep"]);
		expect(config.requireMention).toBe(false);
		expect(config.debug).toBe(true);
		expect(config.model).toBe("vendor/fast-model");
		expect(config.thinking).toBe("low");
		expect(config.mode).toBe("steer");
		expect(config.chunkMode).toBe("paragraph");
		expect(config.groupReplyChance).toBe(0.3);
	});

	it("枚举值大小写不敏感", () => {
		const { configPath } = setup(() => '{"appId":"1","appSecret":"s","thinking":"LOW","mode":"STEER"}');
		const config = loadConfig({ configPath, env: {} });
		expect(config.thinking).toBe("low");
		expect(config.mode).toBe("steer");
	});

	it("环境变量只覆盖凭据与状态目录", () => {
		const { configPath } = setup((stateDir) => ({
			appId: "file-id",
			appSecret: "file-secret",
			stateDir,
			mode: "steer",
		}));
		const config = loadConfig({ configPath, env: { QQBOT_APPID: "env-id", QQBOT_SECRET: "env-secret" } });
		expect(config.appId).toBe("env-id");
		expect(config.appSecret).toBe("env-secret");
		expect(config.mode).toBe("steer");
	});

	it("未知字段直接报错", () => {
		const { configPath } = setup(() => '{"appId":"1","appSecret":"s","unknownField":1}');
		expect(() => loadConfig({ configPath, env: {} })).toThrow(/未知字段：unknownField/);
	});

	it("类型或取值范围不符时报错", () => {
		const wrongType = setup(() => '{"appId":"1","appSecret":"s","allow":"OPENID"}');
		expect(() => loadConfig({ configPath: wrongType.configPath, env: {} })).toThrow(/allow 必须是字符串数组/);

		const wrongEnum = setup(() => '{"appId":"1","appSecret":"s","thinking":"turbo"}');
		expect(() => loadConfig({ configPath: wrongEnum.configPath, env: {} })).toThrow(/thinking 只能是/);

		const wrongRatio = setup(() => '{"appId":"1","appSecret":"s","groupReplyChance":2}');
		expect(() => loadConfig({ configPath: wrongRatio.configPath, env: {} })).toThrow(/0–1 之间/);
	});

	it("非法 JSON 报错并带路径", () => {
		const { configPath } = setup(() => "{不是 JSON");
		expect(() => loadConfig({ configPath, env: {} })).toThrow(/不是合法 JSON/);
	});
});
