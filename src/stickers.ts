import { readdirSync } from "node:fs";
import { extname, join } from "node:path";

/** 表情图片支持的扩展名。 */
const STICKER_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
/** 注入提示词里的表情名上限，防止目录太大撑爆上下文。 */
const PROMPT_NAME_LIMIT = 100;

export interface Sticker {
	name: string;
	path: string;
}

/** 扫描表情目录；目录不存在时返回空数组，不报错。 */
export function loadStickers(dir: string | undefined): Sticker[] {
	if (!dir) return [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	return entries
		.filter((entry) => STICKER_EXTS.has(extname(entry).toLowerCase()))
		.sort()
		.map((entry) => ({ name: entry.slice(0, entry.length - extname(entry).length).toLowerCase(), path: join(dir, entry) }));
}

/** 标记语法：`[表情:名字]`，全角冒号也认。 */
const MARK = /\[表情[:：]\s*([^[\]\n]+?)\s*\]/g;

/**
 * 抽出文本里的表情标记并剥离。
 * 所有标记都会从文本里去掉；只有目录里真实存在的名字才会被发送，
 * 模型写错名字时最多不发表情，不会把标记原样发给用户。
 */
export function extractStickers(text: string, available: readonly Sticker[], max: number): { text: string; names: string[] } {
	const known = new Map(available.map((sticker) => [sticker.name, sticker]));
	const names: string[] = [];
	for (const match of text.matchAll(MARK)) {
		const name = match[1].trim().toLowerCase();
		if (known.has(name) && names.length < max) names.push(name);
	}
	return { text: text.replace(MARK, "").replace(/[ \t]+\n/g, "\n").trim(), names };
}

/** 给模型的可用表情清单，空目录返回 undefined。 */
export function stickerPrompt(available: readonly Sticker[]): string | undefined {
	if (available.length === 0) return undefined;
	const names = available.slice(0, PROMPT_NAME_LIMIT).map((sticker) => sticker.name);
	return [
		"可直接在回复中插入表情标记来发一张表情包，格式 `[表情:名字]`，每轮最多一张。",
		`可用表情：${names.join("、")}`,
	].join("\n");
}
