import type { Config } from "../src/config.ts";

/** 集成脚本用的配置底座：新增字段只改这里，避免每个脚本各写一份。 */
export function testConfig(overrides: Partial<Config> & Pick<Config, "cwd" | "stateDir">): Config {
	return {
		appId: "smoke",
		appSecret: "smoke",
		allow: new Set(["smoke"]),
		owner: new Set(["smoke"]),
		tools: [],
		requireMention: true,
		streaming: false,
		idleMs: 60_000,
		toolDisplay: "summary",
		typing: false,
		markdown: false,
		mode: "queue",
		ratePerMinute: 20,
		timeoutMs: 1_800_000,
		replyLimit: 5,
		replyTtlMs: 5 * 60 * 1000,
		chunkMode: "chunk",
		paragraphLimit: 3,
		stickerMax: 1,
		ignoreBots: true,
		groupReplyChance: 0,
		injectTimestamp: true,
		noReplyToken: "NO_REPLY",
		debug: false,
		...overrides,
	};
}
