/**
 * 单轮超时看门狗。
 *
 * 长任务卡在模型或工具上时，用户只能干等；超时后中止本轮并给一句说明，
 * 比无限期挂着好。`timeoutMs <= 0` 表示不设超时。
 */
export interface Watchdog {
	/** 开始计时；重复调用会重置计时。 */
	arm(onTimeout: () => void): void;
	/** 本轮结束，取消计时。 */
	disarm(): void;
	readonly armed: boolean;
}

export function createWatchdog(timeoutMs: number): Watchdog {
	let timer: NodeJS.Timeout | undefined;

	const disarm = (): void => {
		if (timer === undefined) return;
		clearTimeout(timer);
		timer = undefined;
	};

	return {
		arm(onTimeout: () => void): void {
			if (timeoutMs <= 0) return;
			disarm();
			timer = setTimeout(() => {
				timer = undefined;
				onTimeout();
			}, timeoutMs);
			// 不要因为看门狗把进程钉住
			timer.unref();
		},
		disarm,
		get armed(): boolean {
			return timer !== undefined;
		},
	};
}
