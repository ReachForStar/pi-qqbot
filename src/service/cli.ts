/**
 * 服务子命令：start / stop / restart / status / logs / install / uninstall。
 *
 * 只操作本项目自己的进程与文件；安装自启时写用户级 systemd / launchd 定义。
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultConfigPath, loadConfig } from "../config.ts";
import { servicePaths, startService, statusService, stopService, tailLog } from "./daemon.ts";
import { launchdPlist, systemdUnit, type UnitContext } from "./units.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Settings {
	stateDir: string;
	maxLogBytes: number;
	stopGraceMs: number;
	configPath: string;
}

/** 已发布包里跑 dist，源码仓库里跑 tsx；两种形态都能起服务。 */
function resolveEntry(): { command: string; args: string[] } {
	const distEntry = join(projectRoot, "dist", "main.js");
	if (existsSync(distEntry)) return { command: process.execPath, args: [distEntry] };
	return { command: process.execPath, args: ["--import", "tsx", join(projectRoot, "src", "main.ts")] };
}

export async function runServiceCli(argv: string[]): Promise<void> {
	const command = argv[0] ?? "status";

	try {
		const settings = readSettings();
		switch (command) {
			case "start":
				await start(settings);
				return;
			case "stop":
				await stop(settings);
				return;
			case "restart":
				await stop(settings);
				await start(settings);
				return;
			case "status":
				status(settings);
				return;
			case "logs":
				logs(settings, argv[1]);
				return;
			case "install":
				install(settings);
				return;
			case "uninstall":
				uninstall();
				return;
			default:
				process.stderr.write(`未知命令：${command}\n用法：start|stop|restart|status|logs|install|uninstall\n`);
				process.exitCode = 2;
		}
	} catch (error) {
		process.stderr.write(`✖ ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 2;
	}
}

function readSettings(): Settings {
	// 启停要知道状态目录：与主程序同一份配置，不另开一套环境变量
	const config = loadConfig();
	return {
		stateDir: config.stateDir,
		maxLogBytes: Number(process.env.PI_QQBOT_LOG_MAX_MB ?? 5) * 1024 * 1024,
		stopGraceMs: Number(process.env.PI_QQBOT_STOP_GRACE_MS ?? 8_000),
		configPath: resolve(process.env.PI_QQBOT_CONFIG ?? defaultConfigPath()),
	};
}

function pathsOf(settings: Settings) {
	mkdirSync(settings.stateDir, { recursive: true });
	return servicePaths(settings.stateDir);
}

async function start(settings: Settings): Promise<void> {
	const paths = pathsOf(settings);
	const entry = resolveEntry();
	const result = await startService({
		paths,
		cwd: process.cwd(),
		command: entry.command,
		args: entry.args,
		readyMarker: "已连接 QQ 开放平台",
		maxLogBytes: settings.maxLogBytes,
	});
	if (result.rotated) process.stderr.write(`日志已轮转到 ${paths.logFile}.1\n`);
	if (!result.ready) {
		process.stderr.write(`启动未就绪（PID ${result.pid}），日志尾部：\n${result.tail ?? "(空)"}\n`);
		process.exitCode = 1;
		return;
	}
	process.stderr.write(`已启动并就绪（PID ${result.pid}），日志 ${paths.logFile}\n`);
}

async function stop(settings: Settings): Promise<void> {
	const paths = pathsOf(settings);
	const outcome = await stopService(paths, settings.stopGraceMs);
	if (outcome === "not-running") process.stderr.write("没有在运行的实例\n");
	else if (outcome === "stopped") process.stderr.write("已停止\n");
	else if (outcome === "forced") process.stderr.write("宽限期结束仍未退出，已强制结束\n");
	else {
		process.stderr.write("进程未能停止，PID 记录已保留，请人工检查\n");
		process.exitCode = 1;
	}
}

function status(settings: Settings): void {
	const current = statusService(pathsOf(settings));
	if (!current.running) {
		process.stderr.write(`未运行（${current.detail ?? "未知原因"}）\n`);
		process.exitCode = 3;
		return;
	}
	const uptime = current.startedAt ? formatUptime(Date.now() - Date.parse(current.startedAt)) : "未知";
	process.stderr.write(`运行中 PID ${current.pid}，已运行 ${uptime}\n${current.detail ?? ""}\n`);
}

function logs(settings: Settings, raw: string | undefined): void {
	const lines = Number(raw ?? 30);
	process.stdout.write(`${tailLog(pathsOf(settings), Number.isFinite(lines) ? lines : 30)}\n`);
}

function install(settings: Settings): void {
	const context: UnitContext = {
		nodePath: process.execPath,
		cwd: process.cwd(),
		entry: resolveEntry().args.at(-1) ?? join(projectRoot, "src", "main.ts"),
		stateDir: settings.stateDir,
		configPath: settings.configPath,
	};

	if (process.platform === "linux") {
		const unitPath = join(homedir(), ".config", "systemd", "user", "pi-qqbot.service");
		mkdirSync(dirname(unitPath), { recursive: true });
		writeFileSync(unitPath, systemdUnit(context), "utf8");
		process.stderr.write(`已写入 ${unitPath}\n启用：systemctl --user daemon-reload && systemctl --user enable --now pi-qqbot\n`);
		return;
	}
	if (process.platform === "darwin") {
		const plistPath = join(homedir(), "Library", "LaunchAgents", "eu.pi-qqbot.plist");
		mkdirSync(dirname(plistPath), { recursive: true });
		writeFileSync(plistPath, launchdPlist(context), "utf8");
		process.stderr.write(`已写入 ${plistPath}\n启用：launchctl load -w ${plistPath}\n`);
		return;
	}
	process.stderr.write(`当前平台（${process.platform}）暂不支持自动安装；可交给任务计划程序：\n${process.execPath} ${resolveEntry().args.join(" ")}\n`);
	process.exitCode = 1;
}

function uninstall(): void {
	const candidates =
		process.platform === "linux"
			? [join(homedir(), ".config", "systemd", "user", "pi-qqbot.service")]
			: process.platform === "darwin"
				? [join(homedir(), "Library", "LaunchAgents", "eu.pi-qqbot.plist")]
				: [];
	if (candidates.length === 0) {
		process.stderr.write(`当前平台（${process.platform}）没有可卸载的自启定义\n`);
		return;
	}
	for (const path of candidates) {
		if (!existsSync(path)) continue;
		rmSync(path);
		process.stderr.write(`已删除 ${path}\n`);
	}
	process.stderr.write(
		process.platform === "linux" ? "记得执行 systemctl --user daemon-reload\n" : "记得执行 launchctl unload 对应 plist\n",
	);
}

function formatUptime(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "未知";
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 60) return `${minutes} 分钟`;
	return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
}
