import { existsSync } from "node:fs";
import { join } from "node:path";
import { processIdentity, removePidRecord, writePidRecord } from "./service/pid.ts";
import { ProcessLock } from "./service/lock.ts";
import { servicePaths } from "./service/daemon.ts";
import { createAgentFactory } from "./agent.ts";
import { loadConfig } from "./config.ts";
import { startGateway } from "./gateway.ts";
import { SessionRouter } from "./router.ts";
import { MappingStore } from "./store.ts";

const config = loadConfig();
const log = (message: string): void => {
	process.stderr.write(`[${new Date().toISOString()}] ${message}\n`);
};

// 单实例：状态目录只允许一个进程，PID 记录带启动时刻与命令行，避免 PID 复用误杀
const paths = servicePaths(config.stateDir);
const identity = processIdentity(process.pid);
const pidRecord = {
	pid: process.pid,
	startedAt: identity?.startedAt ?? "",
	command: identity?.command ?? "",
	entry: "src/main.ts",
};
const lock = new ProcessLock(paths.lockFile);
try {
	lock.acquire(pidRecord);
} catch (error) {
	log(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
writePidRecord(paths.pidFile, pidRecord);

const router = new SessionRouter({
	create: createAgentFactory(config, log),
	store: new MappingStore(join(config.stateDir, "sessions.json")),
	idleMs: config.idleMs,
	sessionDir: join(config.stateDir, "sessions"),
	cwd: config.cwd,
});

log(
	`启动：AppID ${config.appId}，白名单 ${config.allow.size} 个，模型 ${config.model ?? "宿主默认"}，思考 ${config.thinking ?? "宿主默认"}，工具 ${config.tools.join(",")}`,
);

const gateway = startGateway({ config, router, log });
const sweeper = setInterval(() => {
	for (const key of router.sweep()) log(`回收闲置会话：${key}`);
}, 60_000);
sweeper.unref();

const shutdown = (): void => {
	log("收到退出信号，正在停止");
	clearInterval(sweeper);
	router.shutdown();
	gateway.stop();
	removePidRecord(paths.pidFile);
	lock.release();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

try {
	await gateway.start();
} catch (error) {
	log(`启动失败：${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
	process.exitCode = 1;
} finally {
	router.shutdown();
	removePidRecord(paths.pidFile);
	lock.release();
}
