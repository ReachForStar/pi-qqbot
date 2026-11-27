import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskOpenid } from "./format.ts";
import type { SessionSummary } from "./router.ts";
import { DEFAULT_CODE_TTL_MS, type Members } from "./members.ts";
import type { AgentBackend, Peer } from "./types.ts";

/** 命令执行上下文，由网关按消息装配。 */
export interface CommandContext {
	backend: AgentBackend;
	openid: string;
	peer: Peer;
	/** `/new` 需要重建会话，由路由层实现。 */
	reset(): Promise<AgentBackend>;
	/** 网关收到消息的时刻（毫秒），用于 `/ping` 拆解延迟。 */
	receivedAt: number;
	/** QQ 事件时间（毫秒），拿不到时为 undefined。 */
	eventTime?: number;
	/** 身份库与管理员判定，用于配对码相关命令。 */
	members: Members;
	isOwner: boolean;
	/** 该 peer 上一轮的输入与工具调用次数，供 `/retry` 判断风险。 */
	lastTurn(): { text: string; tools: number } | undefined;
	/** 历史会话列表。 */
	sessions(): Promise<SessionSummary[]>;
	/** 按 `/sessions` 的序号切换会话。 */
	resume(index: number): Promise<string>;
	/** 读取或设置本会话的人设补充；传空串表示清除。 */
	persona(text?: string): string;
}

export type CommandCategory = "agent" | "qqbot";

interface CommandSpec {
	name: string;
	aliases?: readonly string[];
	category: CommandCategory;
	description: string;
	run(ctx: CommandContext, args: string): Promise<string>;
}

/** 与 dsh-qqbot 一致：agent 是模型能力，qqbot 是通道自身能力，`/help` 分组展示。 */
const COMMANDS: readonly CommandSpec[] = [
	{
		name: "new",
		aliases: ["reset"],
		category: "agent",
		description: "开始新会话（清空上下文）",
		run: async (ctx) => {
			await ctx.reset();
			return "已开始新会话，上下文已清空";
		},
	},
	{
		name: "compact",
		category: "agent",
		description: "压缩会话历史，保留要点",
		run: (ctx) => ctx.backend.compact(),
	},
	{
		name: "model",
		category: "agent",
		description: "查看或切换模型：/model [名称]",
		run: (ctx, args) => ctx.backend.model(args || undefined),
	},
	{
		name: "stop",
		category: "agent",
		description: "中止当前任务",
		run: async (ctx) => {
			await ctx.backend.abort();
			return "已中止当前任务";
		},
	},
	{
		name: "retry",
		category: "agent",
		description: "重发上一条消息（用过一个以上工具时需 /retry force）",
		run: async (ctx, args) => {
			const last = ctx.lastTurn();
			if (!last) return "还没有可重发的内容";
			const force = args.trim() === "force";
			if (last.tools > 0 && !force) {
				return `⚠️ 上一轮调用过 ${last.tools} 次工具，重发可能重复产生外部操作。\n确认后请用 /retry force`;
			}
			if (ctx.backend.isRunning) return "当前任务进行中，先 /stop 再重发";
			await ctx.backend.send(last.text, [], "queue");
			return "已重发上一条消息";
		},
	},
	{
		name: "sessions",
		category: "qqbot",
		description: "列出历史会话（最多 5 条）",
		run: async (ctx) => {
			const list = await ctx.sessions();
			if (list.length === 0) return "没有历史会话";
			const lines = list.map((session, index) => {
				const first = session.firstMessage.replace(/\s+/g, " ").slice(0, 24) || "（空会话）";
				return `${index + 1}. ${session.id.slice(0, 8)}｜${session.modified.toISOString().slice(0, 16).replace("T", " ")}｜${first}`;
			});
			return ["历史会话（/resume <序号> 切换）：", ...lines].join("\n");
		},
	},
	{
		name: "resume",
		category: "qqbot",
		description: "切换到历史会话：/resume <序号>",
		run: async (ctx, args) => {
			const index = Number(args.trim());
			if (!Number.isInteger(index) || index <= 0) return "用法：/resume <序号>（序号来自 /sessions）";
			return ctx.resume(index);
		},
	},
	{
		name: "persona",
		category: "qqbot",
		description: "查看或设置本会话的人设补充：/persona [文本|clear]",
		run: async (ctx, args) => ctx.persona(args.trim() === "" ? undefined : args.trim()),
	},
	{
		name: "status",
		aliases: ["bot-status"],
		category: "qqbot",
		description: "查看会话状态",
		run: async (ctx) => {
			const where = ctx.peer.scope === "c2c" ? "私聊" : "群聊";
			return [`场景：${where}`, `对端：${ctx.peer.peerId}`, await ctx.backend.status()].join("\n");
		},
	},
	{
		name: "ping",
		aliases: ["bot-ping"],
		category: "qqbot",
		description: "测试与 QQ 的往返与处理耗时",
		run: async (ctx) => {
			const now = Date.now();
			const pluginMs = now - ctx.receivedAt;
			if (ctx.eventTime === undefined) return `✅ pong！\n插件处理：${pluginMs}ms`;
			// 事件时间到网关接收之间是平台与网络耗时；本机时钟偏斜时钳到 0，不显示负数
			const network = Math.max(0, ctx.receivedAt - ctx.eventTime);
			return ["✅ pong！", `延迟：${network + pluginMs}ms`, `  ├ 网络传输：${network}ms`, `  └ 插件处理：${pluginMs}ms`].join(
				"\n",
			);
		},
	},
	{
		name: "version",
		aliases: ["bot-version"],
		category: "qqbot",
		description: "查看版本信息",
		run: async () => `pi-qqbot v${pluginVersion()}（Node ${process.version}）`,
	},
	{
		name: "me",
		aliases: ["whoami", "bot-me"],
		category: "qqbot",
		description: "查看本对话的 openid",
		run: async (ctx) => `openid：${ctx.openid}\n会话：${ctx.peer.scope}:${ctx.peer.peerId}`,
	},
	{
		name: "help",
		aliases: ["bot-help"],
		category: "qqbot",
		description: "查看所有指令",
		run: async () => helpText(),
	},
	{
		name: "pair",
		category: "qqbot",
		description: "生成配对码（管理员）：/pair [有效分钟数]",
		run: async (ctx, args) => {
			if (!ctx.isOwner) return "仅管理员可以签发配对码";
			const minutes = Number(args);
			const requested = Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : DEFAULT_CODE_TTL_MS;
			const ttl = Math.min(requested, MAX_CODE_TTL_MS);
			const code = ctx.members.issueCode(ctx.openid, ttl);
			return [
				`配对码：${code.code}`,
				`有效期至 ${new Date(code.expiresAt).toLocaleString("zh-CN")}（上限 24 小时）`,
				"让对方在私聊或群里直接发送这串码即可加入，同一个码可以连续加多人。",
			].join("\n");
		},
	},
	{
		name: "members",
		category: "qqbot",
		description: "查看身份库成员（管理员）",
		run: async (ctx) => {
			if (!ctx.isOwner) return "仅管理员可以查看成员名单";
			const list = ctx.members.list();
			if (list.length === 0) return "身份库为空";
			// 群里执行也能用，所以名单里的 openid 脱敏；移除按序号即可
			const lines = list.map((member, index) => {
				const source = member.source === "seed" ? "初始" : "配对";
				return `${index + 1}. ${maskOpenid(member.openid)}（${source}，${member.addedAt.slice(0, 10)}）`;
			});
			return [`成员 ${list.length} 人（/revoke <序号> 移除）：`, ...lines].join("\n");
		},
	},
	{
		name: "revoke",
		category: "qqbot",
		description: "移除成员（管理员）：/revoke <序号|openid>",
		run: async (ctx, args) => {
			if (!ctx.isOwner) return "仅管理员可以移除成员";
			const argument = args.trim();
			if (!argument) return "用法：/revoke <序号>（序号来自 /members）或 /revoke <openid>";
			// 名单本身脱敏，所以按序号移除是常规路径；完整 openid 也仍然可用
			const index = Number(argument);
			const openid = Number.isInteger(index) && index >= 1 ? ctx.members.list()[index - 1]?.openid : argument;
			if (!openid) return `名单里没有第 ${index} 人`;
			// 撤掉自己会同时失去成员与签发资格，只能靠改配置恢复
			if (openid === ctx.openid) return "不能移除自己；请让另一位管理员操作";
			return ctx.members.revoke(openid) ? `已移除 ${maskOpenid(openid)}（可用 /pair 重新签发配对码加入）` : `名单里没有 ${openid}`;
		},
	},
	{
		name: "reload",
		category: "qqbot",
		description: "重新扫描技能与资源（上下文保留）",
		run: (ctx) => ctx.backend.reload(),
	},
];

/** 命令名与别名的查找表。 */
/** 配对码有效期上限：再长就等于长期后门。 */
const MAX_CODE_TTL_MS = 24 * 60 * 60 * 1000;

const LOOKUP = new Map<string, CommandSpec>();
for (const command of COMMANDS) {
	LOOKUP.set(command.name, command);
	for (const alias of command.aliases ?? []) LOOKUP.set(alias, command);
}

/** 只有首段是已知命令才拦下，避免把普通提问里带斜杠的内容当成命令。 */
export function parseCommand(text: string): { name: string; args: string } | undefined {
	if (!text.startsWith("/")) return undefined;
	const [head, ...rest] = text.slice(1).trim().split(/\s+/);
	if (!head) return undefined;
	const name = head.toLowerCase();
	if (!LOOKUP.has(name)) return undefined;
	return { name, args: rest.join(" ") };
}

/** 执行命令并返回要回复的文案；不是命令时返回 undefined。 */
export async function runCommand(text: string, ctx: CommandContext): Promise<string | undefined> {
	const parsed = parseCommand(text);
	if (!parsed) return undefined;
	const command = LOOKUP.get(parsed.name);
	if (!command) return undefined;
	return command.run(ctx, parsed.args);
}

/** 按 agent / qqbot 分组展示，与 dsh-qqbot 的 `/bot-help` 一致。 */
export function helpText(): string {
	const render = (category: CommandCategory): string[] =>
		COMMANDS.filter((command) => command.category === category).map((command) => {
			const aliases = command.aliases?.length ? `（别名 ${command.aliases.map((a) => `/${a}`).join(" ")}）` : "";
			return `/${command.name} —— ${command.description}${aliases}`;
		});

	return [
		"通用能力：",
		...render("agent"),
		"",
		"机器人能力：",
		...render("qqbot"),
		"",
		`pi-qqbot v${pluginVersion()}`,
	].join("\n");
}

let cachedVersion: string | undefined;

/** 版本号取自 package.json，避免手写第二份。 */
function pluginVersion(): string {
	if (cachedVersion) return cachedVersion;
	const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
	const parsed: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
	if (typeof parsed !== "object" || parsed === null || typeof (parsed as { version?: unknown }).version !== "string") {
		throw new Error(`package.json 缺少 version：${packagePath}`);
	}
	cachedVersion = (parsed as { version: string }).version;
	return cachedVersion;
}
