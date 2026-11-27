import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createExclusive, isRecordedProcessAlive, type PidRecord } from "./pid.ts";

/**
 * 单实例锁：一个状态目录只允许一个进程持有。
 *
 * 残留锁只有在能确认持有者已不存在时才回收；锁文件损坏时明确报错，
 * 不自动删除看不懂的东西。
 */
export class ProcessLock {
	private held = false;

	constructor(readonly path: string) {}

	acquire(record: PidRecord): void {
		if (createExclusive(this.path)) {
			writeFileSync(this.path, `${JSON.stringify(record)}\n`, "utf8");
			this.held = true;
			return;
		}

		const holder = this.readHolder();
		if (holder && isRecordedProcessAlive(holder)) {
			throw new Error(`已有实例在运行（PID ${holder.pid}），先停止它再启动`);
		}
		// 持有者已经不在：回收残留锁
		writeFileSync(this.path, `${JSON.stringify(record)}\n`, "utf8");
		this.held = true;
	}

	release(): void {
		if (!this.held) return;
		if (existsSync(this.path)) unlinkSync(this.path);
		this.held = false;
	}

	readHolder(): PidRecord | undefined {
		if (!existsSync(this.path)) return undefined;
		const raw = readFileSync(this.path, "utf8").trim();
		if (raw === "") return undefined;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			throw new Error(`锁文件损坏，请人工确认后删除：${this.path}`);
		}
		if (typeof parsed !== "object" || parsed === null) throw new Error(`锁文件损坏，请人工确认后删除：${this.path}`);
		const record = parsed as Record<string, unknown>;
		if (typeof record.pid !== "number") throw new Error(`锁文件缺少 PID：${this.path}`);
		return {
			pid: record.pid,
			startedAt: String(record.startedAt ?? ""),
			command: String(record.command ?? ""),
			entry: String(record.entry ?? ""),
		};
	}
}
