import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	isRecordedProcessAlive,
	processIdentity,
	readPidRecord,
	removePidRecord,
	type PidRecord,
} from "./pid.ts";
import { rotateLog } from "./rotate.ts";

export interface ServicePaths {
	stateDir: string;
	pidFile: string;
	lockFile: string;
	logFile: string;
}

export function servicePaths(stateDir: string): ServicePaths {
	return {
		stateDir,
		pidFile: join(stateDir, "bot.pid"),
		lockFile: join(stateDir, "bot.lock"),
		logFile: join(stateDir, "bot.log"),
	};
}

export interface StartOptions {
	paths: ServicePaths;
	cwd: string;
	command: string;
	args: string[];
	/** 日志里出现该文本即视为就绪。 */
	readyMarker: string;
	readyTimeoutMs?: number;
	maxLogBytes?: number;
}

export interface StartResult {
	pid: number;
	ready: boolean;
	rotated: boolean;
	/** 未就绪时带上日志尾部，便于定位。 */
	tail?: string;
}

/** 后台启动：日志轮转 → 派生脱离子进程 → 等它就绪（子进程自己写 PID 记录）。 */
export async function startService(options: StartOptions): Promise<StartResult> {
	const existing = statusService(options.paths);
	if (existing.running) throw new Error(`已有实例在运行（PID ${existing.pid}），先执行 stop`);

	const rotated = rotateLog(options.paths.logFile, options.maxLogBytes ?? 0);
	// 子进程直接写日志文件：如果继承父进程的管道，父进程退出后管道仍被持有，
	// 调用方的 `| tail` 会一直等不到 EOF
	const logFd = openSync(options.paths.logFile, "a");
	const child = spawn(options.command, options.args, {
		cwd: options.cwd,
		detached: true,
		stdio: ["ignore", logFd, logFd],
		env: process.env,
	});
	child.once("exit", () => closeSync(logFd));
	child.once("error", () => closeSync(logFd));
	child.unref();
	const pid = child.pid;
	if (pid === undefined) throw new Error("派生进程失败：拿不到 PID");

	const deadline = Date.now() + (options.readyTimeoutMs ?? 20_000);
	let ready = false;
	while (Date.now() < deadline) {
		await delay(300);
		const record = safeReadPidRecord(options.paths.pidFile);
		if (record?.pid === pid) ready = true;
		if (ready && tailText(options.paths.logFile).includes(options.readyMarker)) break;
		const identity = processIdentity(pid);
		if (!identity) break;
	}

	const tail = tailText(options.paths.logFile);
	if (!processIdentity(pid)) {
		return { pid, ready: false, rotated, tail };
	}
	if (!ready) return { pid, ready: false, rotated, tail };
	return { pid, ready: tail.includes(options.readyMarker), rotated, tail };
}

export type StopOutcome = "stopped" | "not-running" | "unverified" | "forced";

/** 优雅停止：SIGTERM → 宽限期 → SIGKILL。PID 身份对不上时不动手。 */
export async function stopService(paths: ServicePaths, graceMs = 8_000): Promise<StopOutcome> {
	const record = safeReadPidRecord(paths.pidFile);
	if (!record) return "not-running";
	if (!isRecordedProcessAlive(record)) {
		removePidRecord(paths.pidFile);
		return "not-running";
	}

	process.kill(record.pid, "SIGTERM");
	if (await waitForExit(record, graceMs)) {
		removePidRecord(paths.pidFile);
		return "stopped";
	}

	process.kill(record.pid, "SIGKILL");
	if (await waitForExit(record, 3_000)) {
		removePidRecord(paths.pidFile);
		return "forced";
	}
	// 仍查不到退出：保留 PID 文件，让运维看得见异常
	return "unverified";
}

export interface ServiceStatus {
	running: boolean;
	pid?: number;
	/** 记录里的启动时刻，用于展示 uptime。 */
	startedAt?: string;
	detail?: string;
}

export function statusService(paths: ServicePaths): ServiceStatus {
	const record = safeReadPidRecord(paths.pidFile);
	if (!record) return { running: false, detail: "没有 PID 记录" };
	if (!isRecordedProcessAlive(record)) return { running: false, pid: record.pid, detail: "记录里的进程已不存在" };
	const current = processIdentity(record.pid);
	return { running: true, pid: record.pid, startedAt: record.startedAt, detail: current?.command };
}

export function tailText(path: string, limit = 2_000): string {
	if (!existsSync(path)) return "";
	const content = readFileSync(path, "utf8");
	return content.length <= limit ? content : content.slice(-limit);
}

export function tailLog(paths: ServicePaths, lines = 30): string {
	return tailText(paths.logFile, 200_000)
		.split("\n")
		.slice(-lines)
		.join("\n");
}

function safeReadPidRecord(path: string): PidRecord | undefined {
	try {
		return readPidRecord(path);
	} catch {
		return undefined;
	}
}

async function waitForExit(record: PidRecord, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (!isRecordedProcessAlive(record)) return true;
		await delay(200);
	}
	return !isRecordedProcessAlive(record);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
