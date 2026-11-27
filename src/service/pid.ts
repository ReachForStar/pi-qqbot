import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** PID 文件旁边的身份旁路：仅凭 PID 会误杀被系统复用的无关进程。 */
export interface ProcessIdentity {
	pid: number;
	/** 进程启动时刻（ISO），来自 `ps -o lstart=`。 */
	startedAt: string;
	/** 用于日志与诊断的进程命令行。 */
	command: string;
}

export interface PidRecord extends ProcessIdentity {
	entry: string;
}

/** 读取 `ps` 拿进程身份；进程不存在返回 undefined。 */
export function processIdentity(pid: number): ProcessIdentity | undefined {
	if (!Number.isInteger(pid) || pid <= 0) return undefined;
	try {
		// 固定 TZ 与语区：launchd 与用户 shell 的时区不同会把同一进程判成不同
		const output = execFileSync("ps", ["-p", String(pid), "-o", "lstart=", "-o", "command="], {
			encoding: "utf8",
			env: { ...process.env, TZ: "UTC", LC_ALL: "C", LANG: "C" },
		}).trim();
		const match = /^(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.*)$/.exec(output);
		if (!match) return output === "" ? undefined : { pid, startedAt: "", command: output };
		const startedAt = new Date(`${match[1]} UTC`).toISOString();
		return { pid, startedAt: Number.isNaN(Date.parse(startedAt)) ? "" : startedAt, command: match[2] };
	} catch {
		return undefined;
	}
}

export function writePidRecord(path: string, record: PidRecord): void {
	writeFileSync(path, `${JSON.stringify(record, null, "\t")}\n`, "utf8");
}

export function readPidRecord(path: string): PidRecord | undefined {
	if (!existsSync(path)) return undefined;
	const raw = readFileSync(path, "utf8").trim();
	if (raw === "") return undefined;
	const parsed: unknown = JSON.parse(raw);
	if (typeof parsed !== "object" || parsed === null) throw new Error(`PID 文件内容不是对象：${path}`);
	const record = parsed as Record<string, unknown>;
	if (typeof record.pid !== "number" || typeof record.startedAt !== "string" || typeof record.command !== "string") {
		throw new Error(`PID 文件缺少字段：${path}`);
	}
	return { pid: record.pid, startedAt: record.startedAt, command: record.command, entry: String(record.entry ?? "") };
}

export function removePidRecord(path: string): void {
	if (existsSync(path)) unlinkSync(path);
}

/** 判断记录里的进程是否还活着且确实是同一个（防 PID 复用）。 */
export function isRecordedProcessAlive(record: PidRecord): boolean {
	const current = processIdentity(record.pid);
	if (!current) return false;
	if (!record.command) return true;
	// 命令行尾部一致即可：入口脚本路径不会随重启改变
	const recordedTail = record.command.split(/\s+/).slice(-2).join(" ");
	const currentTail = current.command.split(/\s+/).slice(-2).join(" ");
	return recordedTail === currentTail;
}

/** 独占创建文件；已存在返回 false。 */
export function createExclusive(path: string): boolean {
	try {
		closeSync(openSync(path, "wx"));
		return true;
	} catch {
		return false;
	}
}
