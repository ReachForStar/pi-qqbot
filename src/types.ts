/** 渠道侧与 agent 侧之间的最小契约；两侧各自实现，互不引用对方的库。 */

/** 会话维度：私聊、群聊、频道子频道、频道私信各自独立。 */
export type ChatScope = "c2c" | "group" | "guild" | "dm";

/** 一次会话的身份：私聊用用户 openid，群聊用群 openid。 */
export interface Peer {
	scope: ChatScope;
	peerId: string;
}

/** 会话键，落盘映射表与 Map 都用它，避免与 openid 里的字符冲突。 */
export function peerKey(peer: Peer): string {
	return `${peer.scope}:${peer.peerId}`;
}

/** 图片附件。data 为 base64，mimeType 由 QQ 声明的 content_type 决定。 */
export interface ImageAttachment {
	data: string;
	mimeType: string;
}

/** agent 侧吐给渠道的事件，只保留渲染需要的信息。 */
export type AgentEvent =
	| { type: "text_delta"; delta: string }
	| { type: "tool_start"; name: string; args: unknown }
	| {
			type: "tool_end";
			name: string;
			isError: boolean;
			durationMs?: number;
			/** 工具输出的首段文本摘要，可能很长，由渲染层截断。 */
			preview?: string;
	  }
	| { type: "retry"; attempt: number; maxAttempts: number; delayMs: number; reason: string }
	| { type: "compaction"; phase: "start" | "end" }
	| { type: "timeout" }
	| { type: "settled"; aborted: boolean };

/** 渠道侧要渲染的目标。 */
export interface Sink {
	/** 流式刷新全量文本；非流式实现可忽略。 */
	update(text: string): void;
	/** 本轮结束，text 为最终全量文本；实现负责切分与发送。 */
	finish(text: string): Promise<void>;
	/** 短提示：工具活动、错误、系统消息。 */
	notice(text: string): Promise<void>;
	/** 发送一张表情；实现不支持表情时忽略。 */
	sticker(name: string): Promise<void>;
}

/** 一个 peer 对应一个 agent 会话。渠道侧只依赖这个接口。 */
export interface AgentBackend {
	/** 会话文件路径，用于下次按 peer 恢复历史；内存会话为 undefined。 */
	readonly sessionFile: string | undefined;
	readonly isRunning: boolean;
	/** 待处理的插话与排队消息总数。 */
	readonly queueLength: number;
	/** 本次后端加载到的技能名；`reload()` 后重新扫描。 */
	readonly skillNames: readonly string[];
	subscribe(listener: (event: AgentEvent) => void): () => void;
	/** 会话忙时按 mode 排队或插话，SDK 对运行中的 prompt 强制要求二者之一。 */
	send(text: string, images: ImageAttachment[], mode: "queue" | "steer"): Promise<void>;
	abort(): Promise<void>;
	compact(): Promise<string>;
	/** 重新扫描技能与资源（settings + 技能 + 扩展），保留当前上下文。 */
	reload(): Promise<string>;
	status(): Promise<string>;
	/** 无参数时返回模型列表，有参数时切换。 */
	model(query?: string): Promise<string>;
	dispose(): void;
}
