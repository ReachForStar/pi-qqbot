import { existsSync, renameSync, statSync } from "node:fs";

/** 日志超过上限就轮转成 `.1`；只在启动时检查，运行中不打断写入。 */
export function rotateLog(path: string, maxBytes: number): boolean {
	if (maxBytes <= 0 || !existsSync(path)) return false;
	const { size } = statSync(path);
	if (size < maxBytes) return false;
	renameSync(path, `${path}.1`);
	return true;
}
