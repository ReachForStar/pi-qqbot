import type { MessageMode } from "./config.ts";

export interface EnqueuePlan {
	/** 实际使用的入队方式。 */
	mode: MessageMode;
	/** 需要回复给用户的提示，空闲时无需提示。 */
	notice?: string;
}

/**
 * 会话忙时新消息怎么处理。空闲时直接开新一轮，不需要提示；
 * 忙时按配置插话或排队，并告知排在谁后面，避免用户以为消息丢了。
 */
export function planEnqueue(isRunning: boolean, mode: MessageMode, queueLength: number): EnqueuePlan {
	if (!isRunning) return { mode };
	const ahead = queueLength + 1;
	return {
		mode,
		notice: mode === "steer" ? "已插入当前任务" : `已排队（前面还有 ${ahead} 条）`,
	};
}
