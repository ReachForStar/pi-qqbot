import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeSkippedAttachments, downloadImages, sniffImageMime, transcribeVoice } from "../src/media.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPEG = Buffer.from("ffd8ffe000104a464946000101000001", "hex");
const GIF = Buffer.from("474946383961", "hex");
const TEXT = Buffer.from("这不是图片", "utf8");

let server: Server;
let base = "";

beforeAll(async () => {
	server = createServer((request, response) => {
		const body = request.url === "/jpeg" ? JPEG : request.url === "/gif" ? GIF : request.url === "/text" ? TEXT : PNG;
		response.writeHead(200, { "content-type": "application/octet-stream" });
		response.end(body);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("测试服务器未取得端口");
	base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("downloadImages", () => {
	it("只下载图片并按文件头纠正 mime", async () => {
		const images = await downloadImages([
			{ content_type: "image/png", url: `${base}/jpeg` },
			{ content_type: "image/png", url: `${base}/gif` },
			{ content_type: "text/plain", url: `${base}/text` },
		]);
		expect(images.map((image) => image.mimeType)).toEqual(["image/jpeg", "image/gif"]);
		expect(Buffer.from(images[0].data, "base64")).toEqual(JPEG);
	});

	it("超过大小上限的跳过", async () => {
		const images = await downloadImages([{ content_type: "image/png", url: `${base}/png`, size: 4096 }], 1024);
		expect(images).toEqual([]);
	});

	it("声明大小在上限内但实际超限也跳过", async () => {
		const images = await downloadImages([{ content_type: "image/png", url: `${base}/png` }], 4);
		expect(images).toEqual([]);
	});

	it("下载失败不抛出", async () => {
		const images = await downloadImages([{ content_type: "image/png", url: "http://127.0.0.1:65531/none" }]);
		expect(images).toEqual([]);
	});
});

describe("sniffImageMime", () => {
	it("识别常见格式", () => {
		expect(sniffImageMime(PNG)).toBe("image/png");
		expect(sniffImageMime(JPEG)).toBe("image/jpeg");
		expect(sniffImageMime(GIF)).toBe("image/gif");
	});

	it("认不出时返回 undefined", () => {
		expect(sniffImageMime(TEXT)).toBeUndefined();
		expect(sniffImageMime(Buffer.alloc(0))).toBeUndefined();
	});
});

describe("describeSkippedAttachments", () => {
	it("只有图片时不需要提示", () => {
		expect(describeSkippedAttachments([{ content_type: "image/png", url: "u" }])).toBeUndefined();
		expect(describeSkippedAttachments([])).toBeUndefined();
	});

	it("列出被跳过的附件", () => {
		const text = describeSkippedAttachments([
			{ content_type: "image/png", url: "u" },
			{ content_type: "application/pdf", url: "u", filename: "报表.pdf" },
		]);
		expect(text).toContain("1 个暂不支持的附件");
		expect(text).toContain("报表.pdf");
	});
});

describe("transcribeVoice", () => {
	it("用平台转写文本作为输入", () => {
		expect(
			transcribeVoice([{ content_type: "audio/silk", url: "u", asr_refer_text: "帮我看看这个报错" }]),
		).toBe("帮我看看这个报错");
	});

	it("多条语音拼接，空转写忽略", () => {
		expect(
			transcribeVoice([
				{ content_type: "audio/silk", url: "u", asr_refer_text: "第一句" },
				{ content_type: "audio/silk", url: "u" },
				{ content_type: "audio/silk", url: "u", asr_refer_text: "第二句" },
			]),
		).toBe("第一句\n第二句");
	});

	it("没有语音时返回 undefined", () => {
		expect(transcribeVoice([{ content_type: "image/png", url: "u" }])).toBeUndefined();
	});
});

describe("describeSkippedAttachments 与语音", () => {
	it("语音不再提示不支持", () => {
		expect(describeSkippedAttachments([{ content_type: "audio/silk", url: "u", voice_wav_url: "w" }])).toBeUndefined();
	});
});
