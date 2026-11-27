/**
 * 真实链路验证：`/reload` 是否重新扫描技能且保留上下文，`/new` 是否清空上下文。
 * 手动执行：node --import tsx tests/integration-reload.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAgentFactory } from "../src/agent.ts";
import { testConfig } from "./config-fixture.ts";
import { SessionRouter } from "../src/router.ts";
import { MappingStore, type StoreIo } from "../src/store.ts";

mkdirSync("tmp", { recursive: true });
const rootDir = mkdtempSync(join("tmp", "reload-"));

try {
	const workDir = join(rootDir, "run");
	mkdirSync(workDir, { recursive: true });
	const stateDir = join(workDir, "state");
	const cwd = join(workDir, "workspace");
	mkdirSync(cwd, { recursive: true });

	const config = testConfig({ cwd, stateDir, tools: [] });
	const files = new Map<string, string>();
	const memoryIo: StoreIo = {
		exists: (path) => files.has(path),
		read: (path) => files.get(path) ?? "",
		write: (path, content) => files.set(path, content),
	};
	const router = new SessionRouter({
		create: createAgentFactory(config, (message) => console.log(`[log] ${message}`)),
		store: new MappingStore("memory.json", memoryIo),
		idleMs: config.idleMs,
	});

	const userMessages = (status: string): string => status.split("\n").find((line) => line.startsWith("消息：")) ?? "";
	const skills = (backend: { skillNames: readonly string[] }): string =>
		backend.skillNames.includes("reload-verify") ? "已加载 reload-verify" : "未加载 reload-verify";

	const backend = await router.acquire("c2c:smoke");
	const sessionFile = backend.sessionFile;
	console.log(`初次后端技能数：${backend.skillNames.length}，${skills(backend)}`);
	await backend.send("记住数字 42，只回复「好」。", [], "queue");
	console.log(`首轮后：${userMessages(await backend.status())}`);

	// 模拟运行期间新增技能
	mkdirSync(join(cwd, ".pi", "skills", "reload-verify"), { recursive: true });
	writeFileSync(
		join(cwd, ".pi", "skills", "reload-verify", "SKILL.md"),
		"---\nname: reload-verify\ndescription: 仅用于验证重新扫描；当用户说 reload-verify 时使用。\n---\n\n# reload-verify\n\n回复 reload-verify-ok。\n",
		"utf8",
	);

	await backend.reload();
	console.log(`重载后技能：${skills(backend)}，技能数：${backend.skillNames.length}`);
	console.log(`重载后：${userMessages(await backend.status())}`);
	console.log(`会话文件未变：${backend.sessionFile === sessionFile}`);

	const reset = await router.reset("c2c:smoke");
	console.log(`/new 后：${userMessages(await reset.status())}`);

	router.shutdown();
} finally {
	rmSync(rootDir, { recursive: true, force: true });
}
