import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { TOOL_DISPLAY_MODES, type ToolDisplay } from "./binder.ts";

/** 会话忙时新消息的处理方式：排队等当前轮结束，或插话进当前轮。 */
export const MESSAGE_MODES = ["queue", "steer"] as const;
export type MessageMode = (typeof MESSAGE_MODES)[number];

/** 与 pi 的 ThinkingLevel 对齐；留空表示沿用宿主 settings。 */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** 默认工具集：问答 + 改文件 + 跑命令。 */
export const DEFAULT_TOOLS = ["read", "ls", "grep", "find", "edit", "write", "bash"];

/** 配置文件默认位置：**当前工作目录**下的 `pi-qqbot.json`，随 `PI_QQBOT_CONFIG` 覆盖。 */
export const CONFIG_FILE_NAME = "pi-qqbot.json";

export interface Config {
	appId: string;
	appSecret: string;
	/** 初始白名单（种子）：首次启动导入身份库，之后以身份库为准。 */
	allow: Set<string>;
	/** 管理员 openid；留空时种子白名单即为管理员。 */
	owner: Set<string>;
	/** agent 工作目录，所有 peer 共用。 */
	cwd: string;
	tools: string[];
	/** 群聊是否必须 @ 机器人才响应。 */
	requireMention: boolean;
	/** 私聊是否流式输出；QQ 流式消息仅支持私聊。 */
	streaming: boolean;
	/** 模型标识（`provider/model` 或可唯一后缀），留空沿用宿主设置。 */
	model?: string;
	/** 思考级别，留空沿用宿主设置。 */
	thinking?: ThinkingLevel;
	/** 会话闲置多久后回收（仅释放内存，历史留在会话文件里）。 */
	idleMs: number;
	/** 会话文件与映射表的存放目录。 */
	stateDir: string;
	/** 工具调用展示方式：summary 轮末汇总 / live 实时 / off 只报失败。 */
	toolDisplay: ToolDisplay;
	/** 私聊是否发送「正在输入」状态。 */
	typing: boolean;
	/** 是否用 Markdown 发送回复（需要平台开通 Markdown 权限）。 */
	markdown: boolean;
	/** 会话忙时新消息的处理方式。 */
	mode: MessageMode;
	/** 单用户每分钟消息上限，0 表示不限。 */
	ratePerMinute: number;
	/** 单轮处理超时（毫秒），超时中止并告知用户；0 表示不设超时。 */
	timeoutMs: number;
	/** 同一条触发消息最多发几条被动回复，0 表示不限。 */
	replyLimit: number;
	/** 被动回复窗口（毫秒），超窗口改走主动发送。 */
	replyTtlMs: number;
	/** 分条发送策略：chunk 按长度切；paragraph 按段落拆成多条气泡。 */
	chunkMode: "chunk" | "paragraph";
	/** paragraph 模式下每轮最多的气泡数。 */
	paragraphLimit: number;
	/** 表情包目录，空表示不启用表情。 */
	stickerDir?: string;
	/** 每轮最多发几张表情。 */
	stickerMax: number;
	/** 是否忽略其它机器人发来的消息，避免两个 bot 互聊。 */
	ignoreBots: boolean;
	/** 群聊无人 @ 时的接话概率，0 关闭。 */
	groupReplyChance: number;
	/** 是否在提示里注入当前时间。 */
	injectTimestamp: boolean;
	/** 模型输出该标记时本轮不回复。 */
	noReplyToken: string;
	/** 全局人设补充，拼在每轮消息之前。 */
	persona?: string;
	debug: boolean;
}

export type ConfigFile = Partial<Omit<Config, "allow" | "owner">> & {
	allow?: string[];
	owner?: string[];
};

export interface LoadConfigOptions {
	/** 配置文件路径；缺省取 `PI_QQBOT_CONFIG` 或项目根目录的 `pi-qqbot.json`。 */
	configPath?: string;
	/** 环境变量来源，仅用于覆盖凭据与配置路径。 */
	env?: NodeJS.ProcessEnv;
}

/**
 * 读配置：JSON 文件是唯一权威来源。
 *
 * 环境变量只留两个口子：`PI_QQBOT_CONFIG` 指到别的配置文件，
 * `QQBOT_APPID` / `QQBOT_SECRET` 供服务单元注入凭据（不必把密钥写进文件）。
 */
export function loadConfig(options: LoadConfigOptions = {}): Config {
	const env = options.env ?? process.env;
	const configPath = resolve(options.configPath ?? env.PI_QQBOT_CONFIG ?? defaultConfigPath());
	const file = existsSync(configPath) ? parseConfigFile(configPath) : {};

	const appId = env.QQBOT_APPID ?? file.appId;
	const appSecret = env.QQBOT_SECRET ?? file.appSecret;
	if (!appId) throw new Error(`缺少 appId：在 ${configPath} 里配置，或设置环境变量 QQBOT_APPID`);
	if (!appSecret) throw new Error(`缺少 appSecret：在 ${configPath} 里配置，或设置环境变量 QQBOT_SECRET`);

	const stateDir = resolve(expandHome(env.PI_QQBOT_STATE_DIR ?? file.stateDir ?? join(homedir(), ".pi-qqbot")));
	const cwd = resolve(expandHome(file.cwd ?? join(stateDir, "workspace")));
	mkdirSync(stateDir, { recursive: true });
	mkdirSync(cwd, { recursive: true });

	return {
		appId,
		appSecret,
		allow: new Set(file.allow ?? []),
		owner: new Set(file.owner ?? []),
		cwd,
		tools: file.tools && file.tools.length > 0 ? file.tools : DEFAULT_TOOLS,
		requireMention: file.requireMention ?? true,
		streaming: file.streaming ?? true,
		...(optionalText(file.model) === undefined ? {} : { model: optionalText(file.model) }),
		...(file.thinking === undefined ? {} : { thinking: file.thinking }),
		idleMs: file.idleMs ?? 30 * 60 * 1000,
		stateDir,
		toolDisplay: file.toolDisplay ?? "summary",
		typing: file.typing ?? true,
		markdown: file.markdown ?? false,
		mode: file.mode ?? "queue",
		ratePerMinute: file.ratePerMinute ?? 20,
		timeoutMs: file.timeoutMs ?? 30 * 60 * 1000,
		replyLimit: file.replyLimit ?? 5,
		replyTtlMs: file.replyTtlMs ?? 5 * 60 * 1000,
		chunkMode: file.chunkMode ?? "chunk",
		paragraphLimit: Math.max(1, file.paragraphLimit ?? 3),
		...(optionalPath(file.stickerDir) === undefined ? {} : { stickerDir: optionalPath(file.stickerDir) }),
		stickerMax: file.stickerMax ?? 1,
		ignoreBots: file.ignoreBots ?? true,
		groupReplyChance: file.groupReplyChance ?? 0,
		injectTimestamp: file.injectTimestamp ?? true,
		noReplyToken: file.noReplyToken ?? "NO_REPLY",
		...(optionalText(file.persona) === undefined ? {} : { persona: optionalText(file.persona) }),
		debug: file.debug ?? false,
	};
}

/** 配置文件里可以写 `~/...`，展开成用户目录。 */
function expandHome(path: string): string {
	if (path === "~") return homedir();
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function optionalText(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function optionalPath(value: string | undefined): string | undefined {
	const text = optionalText(value);
	return text === undefined ? undefined : resolve(expandHome(text));
}

/**
 * 默认配置文件 = 启动命令所在目录下的 `pi-qqbot.json`。
 *
 * 装成全局包时包目录是只读的 node_modules，配置必须跟着用户的工作目录走。
 */
export function defaultConfigPath(): string {
	return join(process.cwd(), CONFIG_FILE_NAME);
}

const VALIDATORS: Record<string, (value: unknown, key: string) => unknown> = {
	appId: stringField,
	appSecret: stringField,
	allow: stringList,
	owner: stringList,
	cwd: stringField,
	stateDir: stringField,
	tools: stringList,
	model: stringField,
	thinking: (value, key) => oneOf(value, key, THINKING_LEVELS),
	requireMention: booleanField,
	streaming: booleanField,
	idleMs: nonNegativeNumber,
	toolDisplay: (value, key) => oneOf(value, key, TOOL_DISPLAY_MODES),
	typing: booleanField,
	markdown: booleanField,
	mode: (value, key) => oneOf(value, key, MESSAGE_MODES),
	ratePerMinute: nonNegativeNumber,
	timeoutMs: nonNegativeNumber,
	replyLimit: nonNegativeNumber,
	replyTtlMs: nonNegativeNumber,
	chunkMode: (value, key) => oneOf(value, key, ["chunk", "paragraph"] as const),
	paragraphLimit: nonNegativeNumber,
	stickerDir: stringField,
	stickerMax: nonNegativeNumber,
	ignoreBots: booleanField,
	groupReplyChance: (value, key) => {
		const parsed = nonNegativeNumber(value, key);
		if (parsed > 1) throw new Error(`配置项 ${key} 必须在 0–1 之间：${parsed}`);
		return parsed;
	},
	injectTimestamp: booleanField,
	noReplyToken: stringField,
	persona: stringField,
	debug: booleanField,
};

/** 逐项校验；未知字段直接报错，避免拼错的键被静默忽略。 */
function parseConfigFile(path: string): ConfigFile {
	const raw = readFileSync(path, "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`配置文件不是合法 JSON：${path}（${error instanceof Error ? error.message : String(error)}）`);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`配置文件必须是对象：${path}`);
	}

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
		const validator = VALIDATORS[key];
		if (!validator) throw new Error(`配置文件里有未知字段：${key}（${path}）`);
		if (value === undefined || value === null) continue;
		result[key] = validator(value, key);
	}
	return result as ConfigFile;
}

function stringField(value: unknown, key: string): string {
	if (typeof value !== "string") throw new Error(`配置项 ${key} 必须是字符串`);
	return value;
}

function stringList(value: unknown, key: string): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new Error(`配置项 ${key} 必须是字符串数组`);
	}
	return value as string[];
}

function booleanField(value: unknown, key: string): boolean {
	if (typeof value !== "boolean") throw new Error(`配置项 ${key} 必须是布尔值`);
	return value;
}

function nonNegativeNumber(value: unknown, key: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`配置项 ${key} 必须是非负数字`);
	}
	return value;
}

function oneOf<T extends readonly string[]>(value: unknown, key: string, allowed: T): T[number] {
	if (typeof value !== "string") throw new Error(`配置项 ${key} 必须是字符串`);
	const match = allowed.find((item) => item === value.toLowerCase());
	if (!match) throw new Error(`配置项 ${key} 只能是 ${allowed.join(" / ")}：${value}`);
	return match;
}
