import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { extractStickers, loadStickers, stickerPrompt } from "../src/stickers.ts";

const dir = join(mkdtempSync(join("tmp", "stickers-")), "stickers");
mkdirSync(dir, { recursive: true });
for (const file of ["开心.PNG", "无语.gif", "note.txt"]) writeFileSync(join(dir, file), "x");

afterAll(() => {
	rmSync(join(dir, ".."), { recursive: true, force: true });
});

describe("loadStickers", () => {
	it("只收图片并按文件名小写命名", () => {
		expect(loadStickers(dir).map((sticker) => sticker.name)).toEqual(["开心", "无语"]);
	});

	it("目录不存在时返回空数组", () => {
		expect(loadStickers("/nonexistent/stickers")).toEqual([]);
		expect(loadStickers(undefined)).toEqual([]);
	});
});

describe("extractStickers", () => {
	const available = loadStickers(dir);

	it("抽出已知名字并从文本里剥掉标记", () => {
		expect(extractStickers("好耶\n[表情:开心]", available, 1)).toEqual({ text: "好耶", names: ["开心"] });
	});

	it("全角冒号也认，未知名字只剥标记不发送", () => {
		const parsed = extractStickers("看图[表情：无语][表情:不存在]", available, 1);
		expect(parsed.names).toEqual(["无语"]);
		expect(parsed.text).toBe("看图");
	});

	it("受每轮上限约束", () => {
		expect(extractStickers("[表情:开心][表情:无语]", available, 1).names).toEqual(["开心"]);
	});

	it("没有标记时原样返回", () => {
		expect(extractStickers("普通回复", available, 1)).toEqual({ text: "普通回复", names: [] });
	});
});

describe("stickerPrompt", () => {
	it("列出可用名字", () => {
		expect(stickerPrompt(loadStickers(dir))).toContain("开心");
	});

	it("没有表情时返回 undefined", () => {
		expect(stickerPrompt([])).toBeUndefined();
	});
});
