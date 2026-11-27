import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomInt } from "node:crypto";

/** 身份来源：`seed` 来自环境变量初始白名单，`pair` 来自配对码。 */
export type MemberSource = "seed" | "pair";

export interface Member {
	openid: string;
	addedAt: string;
	source: MemberSource;
	/** 被移除的时间；移除前签发的配对码不能把人加回来。 */
	revokedAt?: string;
	/** 撤销序号，用于判断配对码是否早于撤销（同一毫秒内也能区分）。 */
	revokedSeq?: number;
}

export interface PairCode {
	code: string;
	issuedAt: number;
	expiresAt: number;
	issuedBy: string;
	/** 签发序号，与撤销序号比较决定能否重新加入。 */
	seq: number;
}

/** 默认配对码有效期。 */
export const DEFAULT_CODE_TTL_MS = 10 * 60 * 1000;
/** 需要按序号操作时的顺序：只列有效成员。 */
export type ClaimResult =
	| { kind: "joined" }
	| { kind: "already" }
	| { kind: "invalid" }
	| { kind: "rotated"; revokedAt: string };

interface StoreShape {
	members: Member[];
	codes: PairCode[];
	/** 单调递增的事件序号，签发与撤销共用。 */
	nextSeq: number;
}

/**
 * 身份库：替代「改 .env 再重启」的白名单管理。
 *
 * 落一个 JSON 文件，写入走临时文件加改名；环境变量里的初始白名单只作种子导入，
 * 之后以本文件为准（种子成员被 revoke 后不会被重新导入）。
 */
export class Members {
	private data: StoreShape;

	constructor(
		readonly path: string,
		private readonly io: MembersIo = diskIo,
		private readonly onCorrupt: (message: string) => void = () => {},
	) {
		this.data = this.load();
	}

	/** 导入环境变量种子名单；已存在的记录保持原状，被撤销的不会被复活。 */
	seed(openids: Iterable<string>): void {
		let changed = false;
		for (const openid of openids) {
			if (this.data.members.some((member) => member.openid === openid)) continue;
			this.data.members.push({ openid, addedAt: new Date().toISOString(), source: "seed" });
			changed = true;
		}
		if (changed) this.save();
	}

	/** 当前有效成员。 */
	list(): Member[] {
		return this.data.members.filter((member) => member.revokedAt === undefined);
	}

	isMember(openid: string): boolean {
		return this.list().some((member) => member.openid === openid);
	}

	revoke(openid: string): boolean {
		const member = this.data.members.find((entry) => entry.openid === openid && entry.revokedAt === undefined);
		if (!member) return false;
		member.revokedAt = new Date().toISOString();
		member.revokedSeq = this.data.nextSeq;
		this.data.nextSeq += 1;
		this.save();
		return true;
	}

	/** 签发配对码；同一时间只保留未过期的码，避免越堆越多。 */
	issueCode(issuedBy: string, ttlMs: number = DEFAULT_CODE_TTL_MS): PairCode {
		const now = Date.now();
		this.data.codes = this.data.codes.filter((code) => code.expiresAt > now);
		const code: PairCode = {
			code: randomCode(),
			issuedAt: now,
			expiresAt: now + ttlMs,
			issuedBy,
			seq: this.data.nextSeq,
		};
		this.data.nextSeq += 1;
		this.data.codes.push(code);
		this.save();
		return code;
	}

	claim(code: string, openid: string): ClaimResult {
		const now = Date.now();
		const normalized = code.trim().toUpperCase();
		const match = this.data.codes.find((entry) => entry.code === normalized && entry.expiresAt > now);
		if (!match) return { kind: "invalid" };

		const existing = this.data.members.find((member) => member.openid === openid);
		if (existing && existing.revokedAt === undefined) return { kind: "already" };
		if (existing?.revokedAt !== undefined) {
			// 旧码不能把人加回来：撤销之后必须由管理员签发新码
			if (existing.revokedSeq !== undefined && match.seq < existing.revokedSeq) {
				return { kind: "rotated", revokedAt: existing.revokedAt };
			}
			existing.revokedAt = undefined;
			existing.revokedSeq = undefined;
			existing.addedAt = new Date(now).toISOString();
			existing.source = "pair";
			this.save();
			return { kind: "joined" };
		}

		this.data.members.push({ openid, addedAt: new Date(now).toISOString(), source: "pair" });
		this.save();
		return { kind: "joined" };
	}

	private load(): StoreShape {
		if (!this.io.exists(this.path)) return { members: [], codes: [], nextSeq: 1 };
		const raw = this.io.read(this.path);
		if (raw.trim() === "") return { members: [], codes: [], nextSeq: 1 };
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
			if (typeof parsed !== "object" || parsed === null) throw new Error("内容不是对象");
		} catch (error) {
			// 身份库损坏不该让机器人起不来：备份原文件后按空库启动，管理员可手工恢复
			this.backupCorrupt(raw, error instanceof Error ? error.message : String(error));
			return { members: [], codes: [], nextSeq: 1 };
		}
		const record = parsed as { members?: unknown; codes?: unknown; nextSeq?: unknown };
		let members: Member[];
		let codes: PairCode[];
		try {
			members = Array.isArray(record.members) ? record.members.map(readMember) : [];
			codes = Array.isArray(record.codes) ? record.codes.map(readCode) : [];
		} catch (error) {
			this.backupCorrupt(raw, error instanceof Error ? error.message : String(error));
			return { members: [], codes: [], nextSeq: 1 };
		}
		// 老文件没有序号时按现有记录推一个起点，保证序号继续单调
		const highest = Math.max(0, ...members.map((member) => member.revokedSeq ?? 0), ...codes.map((code) => code.seq));
		const nextSeq = typeof record.nextSeq === "number" && record.nextSeq > highest ? record.nextSeq : highest + 1;
		return { members, codes, nextSeq };
	}

	private backupCorrupt(raw: string, reason: string): void {
		const backup = `${this.path}.corrupt-${Date.now()}`;
		this.io.write(backup, raw);
		this.onCorrupt(`身份库无法解析（${reason}），原文件已备份到 ${backup}，本次按空库启动`);
	}

	private save(): void {
		this.io.write(this.path, JSON.stringify(this.data, null, "\t"));
	}
}

/** 便于测试替换的最小文件操作集合。 */
export interface MembersIo {
	exists(path: string): boolean;
	read(path: string): string;
	write(path: string, content: string): void;
}

const diskIo: MembersIo = {
	exists: (path) => existsSync(path),
	read: (path) => readFileSync(path, "utf8"),
	write: (path, content) => {
		mkdirSync(dirname(path), { recursive: true });
		const temp = `${path}.${process.pid}.tmp`;
		writeFileSync(temp, content, "utf8");
		renameSync(temp, path);
	},
};

/** 去掉容易读错的 0/O/1/I。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(): string {
	let code = "";
	for (let index = 0; index < 8; index += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	return code;
}

function readMember(value: unknown): Member {
	if (typeof value !== "object" || value === null) throw new Error("身份库成员不是对象");
	const record = value as Record<string, unknown>;
	if (typeof record.openid !== "string" || typeof record.addedAt !== "string") throw new Error("身份库成员缺少字段");
	if (record.source !== "seed" && record.source !== "pair") throw new Error("身份库成员来源非法");
	return {
		openid: record.openid,
		addedAt: record.addedAt,
		source: record.source,
		...(typeof record.revokedAt === "string" ? { revokedAt: record.revokedAt } : {}),
		...(typeof record.revokedSeq === "number" ? { revokedSeq: record.revokedSeq } : {}),
	};
}

function readCode(value: unknown): PairCode {
	if (typeof value !== "object" || value === null) throw new Error("身份库配对码不是对象");
	const record = value as Record<string, unknown>;
	if (
		typeof record.code !== "string" ||
		typeof record.issuedAt !== "number" ||
		typeof record.expiresAt !== "number" ||
		typeof record.issuedBy !== "string"
	) {
		throw new Error("身份库配对码缺少字段");
	}
	return {
		code: record.code,
		issuedAt: record.issuedAt,
		expiresAt: record.expiresAt,
		issuedBy: record.issuedBy,
		seq: typeof record.seq === "number" ? record.seq : 0,
	};
}
