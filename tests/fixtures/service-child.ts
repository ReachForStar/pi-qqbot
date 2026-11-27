/** 测试专用的“长时间运行服务”：写自己的 PID 记录、打就绪标记、收到 SIGTERM 优雅退出。 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writePidRecord, processIdentity } from "../../src/service/pid.ts";

const stateDir = process.argv[2];
if (!stateDir) throw new Error("缺少状态目录参数");
mkdirSync(stateDir, { recursive: true });

const identity = processIdentity(process.pid);
writePidRecord(join(stateDir, "bot.pid"), {
	pid: process.pid,
	startedAt: identity?.startedAt ?? "",
	command: identity?.command ?? `node ${import.meta.url}`,
	entry: "service-child",
});
appendFileSync(join(stateDir, "bot.log"), `[child] ready-marker pid=${process.pid}\n`);

process.on("SIGTERM", () => {
	appendFileSync(join(stateDir, "bot.log"), "[child] got SIGTERM, exiting\n");
	process.exit(0);
});

setInterval(() => undefined, 1_000);
