import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { servicePaths, startService, statusService, stopService, tailLog } from "../src/service/daemon.ts";

const roots: string[] = [];

function stateDir(): string {
	mkdirSync("tmp", { recursive: true });
	const root = mkdtempSync(join("tmp", "service-"));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("service daemon", () => {
	it("启动真实子进程、识别就绪、优雅停止", async () => {
		const dir = stateDir();
		const paths = servicePaths(dir);
		const result = await startService({
			paths,
			cwd: process.cwd(),
			command: process.execPath,
			args: ["--import", "tsx", "tests/fixtures/service-child.ts", dir],
			readyMarker: "ready-marker",
			readyTimeoutMs: 20_000,
		});

		expect(result.ready).toBe(true);
		const status = statusService(paths);
		expect(status.running).toBe(true);
		expect(status.pid).toBe(result.pid);

		expect(await stopService(paths, 5_000)).toBe("stopped");
		expect(statusService(paths).running).toBe(false);
		expect(tailLog(paths)).toContain("got SIGTERM");
	}, 40_000);

	it("已在运行时拒绝重复启动", async () => {
		const dir = stateDir();
		const paths = servicePaths(dir);
		const first = await startService({
			paths,
			cwd: process.cwd(),
			command: process.execPath,
			args: ["--import", "tsx", "tests/fixtures/service-child.ts", dir],
			readyMarker: "ready-marker",
			readyTimeoutMs: 20_000,
		});
		expect(first.ready).toBe(true);
		await expect(
			startService({
				paths,
				cwd: process.cwd(),
				command: process.execPath,
				args: ["--import", "tsx", "tests/fixtures/service-child.ts", dir],
				readyMarker: "ready-marker",
				readyTimeoutMs: 5_000,
			}),
		).rejects.toThrow(/已有实例在运行/);
		await stopService(paths, 5_000);
	}, 60_000);

	it("没有 PID 记录时 stop 返回 not-running", async () => {
		expect(await stopService(servicePaths(stateDir()), 1_000)).toBe("not-running");
	});

	it("日志超过上限时启动会先轮转", async () => {
		const dir = stateDir();
		const paths = servicePaths(dir);
		mkdirSync(dir, { recursive: true });
		const big = "x".repeat(4_096);
		await import("node:fs").then(({ writeFileSync }) => writeFileSync(paths.logFile, big, "utf8"));

		const result = await startService({
			paths,
			cwd: process.cwd(),
			command: process.execPath,
			args: ["--import", "tsx", "tests/fixtures/service-child.ts", dir],
			readyMarker: "ready-marker",
			readyTimeoutMs: 20_000,
			maxLogBytes: 1_024,
		});
		expect(result.rotated).toBe(true);
		expect(readFileSync(`${paths.logFile}.1`, "utf8")).toHaveLength(4_096);
		await stopService(paths, 5_000);
	}, 40_000);
});
