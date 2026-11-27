import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * peer → 会话文件的映射，落一个 JSON 文件。
 *
 * 写入走临时文件加改名，进程被杀不会留下半个 JSON；写前合并磁盘上已有条目，
 * 多实例（同一 AppID 起多个进程）不会互相覆盖掉对方的映射。
 */
export class MappingStore {
	constructor(
		readonly path: string,
		private readonly io: StoreIo = diskIo,
	) {}

	get(key: string): string | undefined {
		return this.load()[key];
	}

	set(key: string, value: string): void {
		const entries = this.load();
		if (entries[key] === value) return;
		entries[key] = value;
		this.io.write(this.path, JSON.stringify(entries, null, "\t"));
	}

	delete(key: string): void {
		const entries = this.load();
		if (!(key in entries)) return;
		delete entries[key];
		this.io.write(this.path, JSON.stringify(entries, null, "\t"));
	}

	private load(): Record<string, string> {
		if (!this.io.exists(this.path)) return {};
		const raw = this.io.read(this.path);
		if (raw.trim() === "") return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) throw new Error(`映射文件内容不是对象：${this.path}`);
		const entries: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value !== "string") throw new Error(`映射文件条目不是字符串：${key}`);
			entries[key] = value;
		}
		return entries;
	}
}

/** 便于测试替换的最小文件操作集合。 */
export interface StoreIo {
	exists(path: string): boolean;
	read(path: string): string;
	write(path: string, content: string): void;
}

const diskIo: StoreIo = {
	exists: (path) => existsSync(path),
	read: (path) => readFileSync(path, "utf8"),
	write: (path, content) => {
		mkdirSync(dirname(path), { recursive: true });
		const temp = `${path}.${process.pid}.tmp`;
		writeFileSync(temp, content, "utf8");
		renameSync(temp, path);
	},
};
