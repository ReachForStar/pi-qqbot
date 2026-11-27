/**
 * 按 QQ 单条消息上限切分文本。
 *
 * 两条硬约束：代码块被拦腰截断后不可读，所以切在代码块边界并重开围栏；
 * QQ 对超长单行同样会拒绝，所以超限的单行先硬切。
 */
export function chunkMarkdown(text: string, limit: number): string[] {
	if (!Number.isInteger(limit) || limit <= 0) throw new Error(`切分上限必须是正整数：${limit}`);
	const chunks: string[] = [];
	let buffer: string[] = [];
	let size = 0;
	/** 当前所在代码块的围栏行（含语言标记），不在块内为 undefined。 */
	let fence: string | undefined;

	const flush = (): void => {
		if (buffer.length === 0) return;
		if (fence) {
			chunks.push([...buffer, "```"].join("\n"));
			buffer = [fence];
			size = fence.length;
			return;
		}
		chunks.push(buffer.join("\n"));
		buffer = [];
		size = 0;
	};

	for (const raw of text.split("\n")) {
		for (const line of splitLongLine(raw, limit)) {
			const added = buffer.length === 0 ? line.length : line.length + 1;
			if (size + added > limit && buffer.length > 0) flush();
			buffer.push(line);
			size += added;

			const fenceMatch = /^\s*(```|~~~)/.exec(line);
			if (!fenceMatch) continue;
			// 围栏可能就是本片第一行（回复直接用代码块开头），不能因为 buffer 长度而跳过跟踪
			if (fence === undefined) fence = line.trim();
			else if (fence !== undefined && line.trim() === fence.slice(0, 3)) fence = undefined;
		}
	}

	flush();
	return chunks.map((chunk) => chunk.trimEnd()).filter((chunk) => chunk.length > 0);
}

/** 超限单行按上限硬切；正常行原样返回。 */
function splitLongLine(line: string, limit: number): string[] {
	if (line.length <= limit) return [line];
	const pieces: string[] = [];
	for (let index = 0; index < line.length; index += limit) pieces.push(line.slice(index, index + limit));
	return pieces;
}
