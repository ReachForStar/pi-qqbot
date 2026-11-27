import {
	QQBot,
	type QQBotInboundMessage,
	contentSanitizer,
	errorHandler,
	mentionGate,
	messageFilter,
	rateLimiter,
	typingIndicator,
} from "@tencent-connect/qqbot-nodejs";
import type { Logger } from "./agent.ts";
import { createBinder, type Binder } from "./binder.ts";
import { chunkMarkdown } from "./chunker.ts";
import { runCommand } from "./commands.ts";
import type { Config } from "./config.ts";
import { planEnqueue } from "./enqueue.ts";
import { ReplyBudget } from "./reply-budget.ts";
import { extractStickers, loadStickers, stickerPrompt } from "./stickers.ts";
import { describeSkippedAttachments, downloadImages, transcribeVoice } from "./media.ts";
import { Members } from "./members.ts";
import { resolvePeer } from "./peers.ts";
import type { SessionRouter } from "./router.ts";
import { createSink, TEXT_LIMIT } from "./sink.ts";
import { peerKey, type Sink } from "./types.ts";
import { join } from "node:path";
import { unauthorizedText } from "./format.ts";
import { MappingStore } from "./store.ts";

export interface GatewayOptions {
	config: Config;
	router: SessionRouter;
	log: Logger;
}

export interface Gateway {
	start(signal?: AbortSignal): Promise<void>;
	stop(): void;
}

/** 每个 peer 只有一份在用的 sink/binder，避免排队消息另开一路流式。 */
interface Turn {
	sink: Sink;
	binder: Binder;
	unsubscribe: () => void;
}

export function startGateway({ config, router, log }: GatewayOptions): Gateway {
	// 环境变量里的是种子名单，之后增删人都走身份库，不必改 .env 重启
	const members = new Members(join(config.stateDir, "members.json"), undefined, log);
	members.seed(config.allow);
	// 管理员配置了却没进名单时也要能操作，否则配错一次就锁死
	const owners = config.owner.size > 0 ? config.owner : config.allow;
	for (const owner of owners) if (!members.isMember(owner)) members.seed([owner]);
	log(`身份库：${members.list().length} 人，管理员 ${owners.size} 人`);

	const turns = new Map<string, Turn>();
	/** 上一轮输入，供 `/retry` 重发。 */
	const lastTurns = new Map<string, { text: string; tools: number }>();
	/** 每会话人设补充。 */
	const personas = new MappingStore(join(config.stateDir, "persona.json"));
	const stickers = loadStickers(config.stickerDir);
	const stickerHint = stickerPrompt(stickers);
	const budget = new ReplyBudget(config.replyLimit, config.replyTtlMs);
	const bot = new QQBot({
		appId: config.appId,
		appSecret: config.appSecret,
		logger: { info: log, warn: log, error: log, debug: config.debug ? log : () => {} },
	});

	bot.use(errorHandler({ format: (error) => `处理失败：${error.message}` }));
	bot.use(messageFilter({ skipSelfEcho: true, dedup: { windowMs: 5000 } }));
	bot.use(contentSanitizer({ stripBotMention: true }));
	bot.use(
		mentionGate({
			requireMentionInGroup: config.requireMention,
			// 群聊里没人 @ 时按概率接一句；概率为 0 时等同于严格 @ 门控
			isImplicitMention: () => config.groupReplyChance > 0 && Math.random() < config.groupReplyChance,
		}),
	);
	if (config.ratePerMinute > 0) {
		bot.use(
			rateLimiter({
				perSender: { max: config.ratePerMinute, windowMs: 60_000 },
				onLimit: async (ctx, tier) => {
					await ctx.bot.sendText(ctx.replyTarget, `发得太快了，稍后再试（${tier} 限流）`);
				},
			}),
		);
	}
	// 生成期间的「正在输入」提示；群聊不发，避免刷屏
	if (config.typing) bot.use(typingIndicator({ predicate: (ctx) => ctx.message.kind === "c2c" }));

	bot.on("ready", () => log(`已连接 QQ 开放平台（AppID ${config.appId}）`));
	bot.on("resumed", () => log("连接已恢复"));
	bot.on("disconnected", (event) => log(`连接断开：${event.code}（将${event.willReconnect ? "自动重连" : "停止重连"}）`));
	bot.on("error", (error) => log(`网关错误：${error.message}`));

	bot.on("message", async (_ctx, message) => {
		try {
			await handleMessage(bot, message);
		} catch (error) {
			log(`处理消息失败：${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
			await bot.sendText(message.replyTarget, `处理失败：${error instanceof Error ? error.message : String(error)}`);
		}
	});

	async function handleMessage(bot: QQBot, message: QQBotInboundMessage): Promise<void> {
		const receivedAt = Date.now();
		const peer = resolvePeer(message);
		const text = message.content.trim();

		// 身份维度用发送者 openid；peer 只决定会话上下文归属
		const senderId = message.author.id;
		const isOwner = owners.has(senderId);

		if (!members.isMember(senderId) && !isOwner) {
			// 未入名单时先看是不是在认领配对码；认领成功即入名单
			const claim = members.claim(text, senderId);
			if (claim.kind === "joined") {
				await bot.sendText(message.replyTarget, "已加入名单，可以直接提问了");
				return;
			}
			if (claim.kind === "rotated") {
				await bot.sendText(message.replyTarget, "你之前被移除过，这个配对码已失效，请向管理员要新的码");
				return;
			}
			// 拿不到授权的人不应该能驱动本机的 shell 与文件编辑
			await bot.sendText(
				message.replyTarget,
				unauthorizedText(peer.scope === "group" ? "group" : "c2c", senderId, peer.peerId),
			);
			return;
		}

		const key = peerKey(peer);
		const backend = await router.acquire(key);

		const reply = await runCommand(text, {
			backend,
			openid: senderId,
			peer,
			reset: () => router.reset(key),
			receivedAt,
			eventTime: Number.isNaN(Date.parse(message.timestamp)) ? undefined : Date.parse(message.timestamp),
			members,
			isOwner,
			lastTurn: () => lastTurns.get(key),
			sessions: () => router.listSessions(),
			resume: async (index) => {
				const list = await router.listSessions();
				const target = list[index - 1];
				if (!target) return `没有第 ${index} 条历史会话`;
				await router.switchTo(key, target.path);
				return `已切换到会话 ${target.id.slice(0, 8)}`;
			},
			persona: (next) => {
				const current = personas.get(key) ?? config.persona ?? "";
				if (next === undefined) return current ? `本会话人设：${current}` : "本会话没有单独的人设";
				if (next === "" || next === "clear") {
					personas.delete(key);
					return "已清除本会话人设";
				}
				personas.set(key, next);
				return `已设置本会话人设（${next.length} 字）`;
			},
		});
		if (reply !== undefined) {
			for (const chunk of chunkMarkdown(reply, TEXT_LIMIT)) await bot.sendText(message.replyTarget, chunk);
			return;
		}

		const attachments = message.attachments ?? [];
		const images = await downloadImages(attachments);
		const voice = transcribeVoice(attachments);
		const skipped = describeSkippedAttachments(attachments);
		if (skipped) await bot.sendText(message.replyTarget, skipped);

		const input = composeInput(text || voice || "", personas.get(key), stickerHint);
		// 附件可能全是图片以外的类型、语音没有转写、下载又失败，此时没有可处理的输入
		if (!input && images.length === 0) return;

		const turn = acquireTurn(bot, key, message.replyTarget, peer, backend);
		const plan = planEnqueue(backend.isRunning, config.mode, backend.queueLength);
		if (plan.notice) await turn.sink.notice(plan.notice);
		lastTurns.set(key, { text: input, tools: turn.binder.toolCalls });
		await backend.send(input, images, plan.mode);
	}

	/** 时间、人设、表情清单按轮拼在用户输入前，命令不经过这里。 */
	function composeInput(text: string, persona: string | undefined, stickerHint: string | undefined): string {
		const parts: string[] = [];
		if (config.injectTimestamp) parts.push(`[时间 ${new Date().toLocaleString("zh-CN")}]`);
		const personaText = persona ?? config.persona;
		if (personaText) parts.push(`[人设] ${personaText}`);
		if (stickerHint) parts.push(`[表情] ${stickerHint}`);
		if (text) parts.push(text);
		return parts.join("\n");
	}

	/** 复用该 peer 正在进行的 turn，没有则新建并订阅；settled 后自动回收。 */
	function acquireTurn(
		bot: QQBot,
		key: string,
		target: QQBotInboundMessage["replyTarget"],
		peer: ReturnType<typeof resolvePeer>,
		backend: Awaited<ReturnType<SessionRouter["acquire"]>>,
	): Turn {
		const existing = turns.get(key);
		if (existing) return existing;

		const sink = createSink(bot, target, {
			streaming: config.streaming && peer.scope === "c2c",
			markdown: config.markdown,
			paragraph: config.chunkMode === "paragraph",
			paragraphLimit: config.paragraphLimit,
			budget,
			stickers,
		});
		const binder = createBinder(sink, {
			toolDisplay: config.toolDisplay,
			stickers,
			stickerMax: config.stickerMax,
			noReplyToken: config.noReplyToken,
		});
		const unsubscribe = backend.subscribe((event) => {
			void binder
				.onEvent(event)
				.catch((error: unknown) => log(`渲染事件失败：${error instanceof Error ? error.message : String(error)}`))
				.finally(() => {
					if (event.type !== "settled") return;
					unsubscribe();
					turns.delete(key);
					const turn = turns.get(key);
					if (turn === undefined) lastTurns.set(key, { text: lastTurns.get(key)?.text ?? "", tools: binder.toolCalls });
				});
		});
		const turn: Turn = { sink, binder, unsubscribe };
		turns.set(key, turn);
		return turn;
	}

	return {
		start: (signal) => bot.start(signal),
		stop: () => {
			for (const turn of turns.values()) turn.unsubscribe();
			turns.clear();
			bot.stop();
		},
	};
}
