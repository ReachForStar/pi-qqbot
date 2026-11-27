/**
 * 真实链路冒烟：不接 QQ，用真实 pi 会话验证「入站文本 → agent → 事件流 → 输出文本」。
 * 手动执行：node --import tsx tests/integration-agent.ts
 * 需要本机 pi 已配置可用模型与凭据。
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createAgentFactory } from "../src/agent.ts";
import { createBinder } from "../src/binder.ts";
import { testConfig } from "./config-fixture.ts";
import type { Sink } from "../src/types.ts";

class RecordingSink implements Sink {
	readonly finished: string[] = [];
	update(text: string): void {
		process.stdout.write(`\r[流式] ${text.slice(-40)}`);
	}
	async finish(text: string): Promise<void> {
		this.finished.push(text);
	}
	async notice(text: string): Promise<void> {
		process.stdout.write(`\n[提示] ${text}\n`);
	}
	async sticker(): Promise<void> {}
}

mkdirSync("tmp", { recursive: true });
const tmpRoot = mkdtempSync(join("tmp", "agent-"));

try {
	const stateDir = join(tmpRoot, "state");
	const config = testConfig({
		cwd: join(stateDir, "workspace"),
		stateDir,
		tools: ["read", "ls"],
		idleMs: 1_000,
	});
	mkdirSync(config.cwd, { recursive: true });

	const factory = createAgentFactory(config, (message) => console.log(`[log] ${message}`));
	const sink = new RecordingSink();
	const binder = createBinder(sink, { toolDisplay: "summary" });

	const backend = await factory("c2c:smoke", undefined);
	const sessionFile = backend.sessionFile;
	console.log(`会话文件：${sessionFile}`);
	const unsubscribe = backend.subscribe((event) => void binder.onEvent(event));

	try {
		await backend.send("用一句话说明当前工作目录里有几个文件，不要调用工具以外的解释。", [], "queue");
	} finally {
		unsubscribe();
	}

	console.log(`\n本轮输出：${sink.finished.join("｜") || "(空)"}`);
	console.log(`会话文件存在：${sessionFile !== undefined}`);
	backend.dispose();

	// 恢复同一会话文件，确认历史可续
	const resumed = await factory("c2c:smoke", sessionFile);
	try {
		console.log(`\n恢复后状态：\n${await resumed.status()}`);
	} finally {
		resumed.dispose();
	}
} finally {
	rmSync(tmpRoot, { recursive: true, force: true });
}
