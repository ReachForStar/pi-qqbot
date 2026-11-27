import type { ReplyTarget } from "@tencent-connect/qqbot-nodejs";

/**
 * QQ 的被动回复额度：同一条触发消息有时间窗口与次数上限，超了平台会拒绝。
 *
 * 预算按触发消息的 msg_id 计；用完或过期后返回去掉 msgId 的目标，
 * 由调用方改走主动发送（需要在开放平台开通主动消息）。
 */
export class ReplyBudget {
	private readonly used = new Map<string, { count: number; since: number }>();

	constructor(
		private readonly limit: number,
		private readonly ttlMs: number,
		private readonly now: () => number = Date.now,
	) {}

	/** 预留一次回复额度；返回实际应使用的目标。 */
	reserve(target: ReplyTarget): ReplyTarget {
		if (!target.msgId || this.limit <= 0) return target;

		const now = this.now();
		const entry = this.used.get(target.msgId);
		if (!entry || now - entry.since >= this.ttlMs) {
			this.used.set(target.msgId, { count: 1, since: now });
			this.sweep(now);
			return target;
		}
		if (entry.count >= this.limit) {
			const { msgId: _dropped, ...rest } = target;
			return rest;
		}
		entry.count += 1;
		return target;
	}

	/** 该触发消息已用掉多少额度，用于诊断。 */
	usedFor(msgId: string): number {
		return this.used.get(msgId)?.count ?? 0;
	}

	private sweep(now: number): void {
		if (this.used.size < 64) return;
		for (const [msgId, entry] of this.used) if (now - entry.since >= this.ttlMs) this.used.delete(msgId);
	}
}
