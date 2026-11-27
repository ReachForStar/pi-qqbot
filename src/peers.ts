import type { Peer } from "./types.ts";

/** 网关消息里判定 peer 所需的最小形状。 */
export interface InboundLike {
	kind: "c2c" | "group" | "guild" | "dm";
	author: { id: string };
	groupOpenid?: string;
	replyTarget: { targetId: string };
}

/**
 * 会话键按聊天容器划分：私聊用发送者 openid，群聊用群 openid，
 * 频道与频道私信用回复目标的 channel/guild id。身份校验另走发送者 openid，
 * 所以这里只决定「谁的上下文会串在一起」。
 */
export function resolvePeer(message: InboundLike): Peer {
	if (message.kind === "group") {
		return { scope: "group", peerId: message.groupOpenid ?? message.replyTarget.targetId };
	}
	if (message.kind === "guild" || message.kind === "dm") {
		return { scope: message.kind, peerId: message.replyTarget.targetId };
	}
	return { scope: "c2c", peerId: message.author.id };
}
