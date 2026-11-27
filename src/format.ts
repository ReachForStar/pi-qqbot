/** 工具调用行：名字 + 参数摘要，单行、限长，够看清在干什么又不刷屏。 */
const MAX_ARGS_LENGTH = 80;

export function formatToolLine(name: string, args: unknown): string {
	const summary = summarize(args);
	return summary ? `▸ ${name}: ${summary}` : `▸ ${name}`;
}

/** 工具结束行：状态 + 耗时 + 结果摘要，失败用 ✗ 并给原因。 */
export function formatToolResult(event: { name: string; isError: boolean; durationMs?: number; preview?: string }): string {
	const status = event.isError ? "✗" : "✓";
	const elapsed = event.durationMs === undefined ? "" : `（${formatDuration(event.durationMs)}）`;
	const preview = event.preview ? truncate(event.preview.replace(/\s+/g, " ").trim()) : "";
	const suffix = preview ? `: ${preview}` : event.isError ? " 失败" : "";
	return `${status} ${event.name}${elapsed}${suffix}`;
}

/** openid 脱敏：对话里不留完整标识，管理员用 `/me` 或身份库查全量。 */
export function maskOpenid(openid: string): string {
	return openid.length <= 8 ? openid : `${openid.slice(0, 6)}…${openid.slice(-4)}`;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
}

function summarize(args: unknown): string {
	if (args === undefined || args === null) return "";
	if (typeof args === "string") return truncate(args.replace(/\s+/g, " ").trim());
	if (typeof args !== "object") return truncate(String(args));

	const record = args as Record<string, unknown>;
	// 不同工具的首选字段不同，取第一个有值的；都不命中时退化成 JSON
	const preferred = ["command", "path", "file_path", "pattern", "query", "url", "prompt"];
	for (const key of preferred) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return truncate(value.replace(/\s+/g, " ").trim());
	}
	const json = JSON.stringify(record);
	return json === "{}" ? "" : truncate(json);
}

function truncate(text: string): string {
	return text.length <= MAX_ARGS_LENGTH ? text : `${text.slice(0, MAX_ARGS_LENGTH - 1)}…`;
}
