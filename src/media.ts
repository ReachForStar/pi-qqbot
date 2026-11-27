import type { ImageAttachment } from "./types.ts";

/** 单张图片送入模型的上限。 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** 单附件下载超时：慢链接不该把整轮对话卡住。 */
export const DOWNLOAD_TIMEOUT_MS = 15_000;

/** QQ 附件里图片相关的字段。 */
export interface AttachmentLike {
	content_type?: string;
	url: string;
	size?: number;
	filename?: string;
	/** 语音消息的平台转写文本。 */
	asr_refer_text?: string;
	/** 语音消息的 WAV 地址，有值即视为语音。 */
	voice_wav_url?: string;
}

/**
 * QQ 语音消息自带平台侧识别文本（`asr_refer_text`），直接当用户输入用，
 * 不必自己跑 ASR。
 */
export function transcribeVoice(attachments: readonly AttachmentLike[]): string | undefined {
	const texts = attachments
		.filter((attachment) => attachment.content_type?.startsWith("audio/") || attachment.voice_wav_url !== undefined)
		.map((attachment) => attachment.asr_refer_text?.trim())
		.filter((text): text is string => text !== undefined && text.length > 0);
	return texts.length === 0 ? undefined : texts.join("\n");
}

/** 非图片附件（文件、语音等）目前不处理，但要让发送者知道东西收到了。 */
export function describeSkippedAttachments(attachments: readonly AttachmentLike[]): string | undefined {
	// 语音已经用转写文本参与对话，不再提示「不支持」
	const skipped = attachments.filter(
		(attachment) =>
			!attachment.content_type?.startsWith("image/") &&
			!(attachment.content_type?.startsWith("audio/") || attachment.voice_wav_url !== undefined),
	);
	if (skipped.length === 0) return undefined;
	const names = skipped.map((attachment) => attachment.filename ?? attachment.content_type ?? "未知附件");
	return `已收到 ${skipped.length} 个暂不支持的附件：${names.join("、")}（当前只处理文本与图片）`;
}

/** 下载消息中的图片；非图片、超大、下载失败的一律跳过，不阻断对话。 */
export async function downloadImages(
	attachments: readonly AttachmentLike[],
	maxBytes: number = MAX_IMAGE_BYTES,
): Promise<ImageAttachment[]> {
	const images: ImageAttachment[] = [];
	for (const attachment of attachments) {
		if (!attachment.content_type?.startsWith("image/")) continue;
		if (attachment.size !== undefined && attachment.size > maxBytes) continue;
		// 单个附件失败（链接过期、网络抖动）不该让整轮回复失败
		const buffer = await fetchBytes(attachment.url).catch(() => undefined);
		if (!buffer) continue;
		if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) continue;
		images.push({ data: buffer.toString("base64"), mimeType: sniffImageMime(buffer) ?? attachment.content_type });
	}
	return images;
}

async function fetchBytes(url: string): Promise<Buffer | undefined> {
	const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
	if (!response.ok) return undefined;
	return Buffer.from(await response.arrayBuffer());
}

/**
 * 按文件头识别真实格式。
 * QQ 网关把图片统一标成 image/png，实际多为 GIF/JPEG；照搬标注会让读图工具解码失败。
 */
export function sniffImageMime(buffer: Buffer): string | undefined {
	if (buffer.length >= 3 && buffer.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
	if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
	if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
	if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF") {
		if (buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
	}
	return undefined;
}
