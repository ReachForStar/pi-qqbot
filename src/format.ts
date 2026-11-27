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

/**
 * 未授权时的加入指引。
 *
 * 这里必须给完整标识：首次配置的管理员没有别的途径拿到自己的 openid，
 * 群聊也要靠群 openid 才能加白名单，脱敏会把入门流程堵死。
 */
export function unauthorizedText(scope: "c2c" | "group", senderId: string, groupOpenid: string): string {
	const label = scope === "group" ? `本群的 openid：${groupOpenid}` : `你的 openid：${senderId}`;
	return [
		"未授权，两种加入方式：",
		"1）管理员发 /pair 生成配对码，把这串码发给我即可加入（同一个码可加多人）；",
		"2）把下面的 openid 交给管理员，填进 pi-qqbot.json 的 allow 或 owner，然后重启服务。",
		"",
		label,
	].join("\n");
}

/** 成员名单里的 openid 脱敏：群里执行 /members 时不向所有人暴露彼此标识。 */
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
