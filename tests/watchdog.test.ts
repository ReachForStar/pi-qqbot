import { afterEach, describe, expect, it, vi } from "vitest";
import { createWatchdog } from "../src/watchdog.ts";

describe("createWatchdog", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("到点触发一次并自动解除", () => {
		vi.useFakeTimers();
		const watchdog = createWatchdog(1_000);
		let fired = 0;
		watchdog.arm(() => {
			fired += 1;
		});
		expect(watchdog.armed).toBe(true);
		vi.advanceTimersByTime(999);
		expect(fired).toBe(0);
		vi.advanceTimersByTime(1);
		expect(fired).toBe(1);
		expect(watchdog.armed).toBe(false);
		vi.advanceTimersByTime(5_000);
		expect(fired).toBe(1);
	});

	it("本轮结束解除计时", () => {
		vi.useFakeTimers();
		const watchdog = createWatchdog(1_000);
		let fired = 0;
		watchdog.arm(() => {
			fired += 1;
		});
		watchdog.disarm();
		vi.advanceTimersByTime(5_000);
		expect(fired).toBe(0);
		expect(watchdog.armed).toBe(false);
	});

	it("重复 arm 重置计时", () => {
		vi.useFakeTimers();
		const watchdog = createWatchdog(1_000);
		let fired = 0;
		const onTimeout = (): void => {
			fired += 1;
		};
		watchdog.arm(onTimeout);
		vi.advanceTimersByTime(800);
		watchdog.arm(onTimeout);
		vi.advanceTimersByTime(800);
		expect(fired).toBe(0);
		vi.advanceTimersByTime(300);
		expect(fired).toBe(1);
	});

	it("timeoutMs 为 0 时不计时", () => {
		vi.useFakeTimers();
		const watchdog = createWatchdog(0);
		let fired = 0;
		watchdog.arm(() => {
			fired += 1;
		});
		expect(watchdog.armed).toBe(false);
		vi.advanceTimersByTime(60_000);
		expect(fired).toBe(0);
	});
});
