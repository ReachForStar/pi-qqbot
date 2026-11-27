/**
 * 命令行入口：`pi-qqbot [run|start|stop|restart|status|logs|install|uninstall]`
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runServiceCli } from "./service/cli.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command] = process.argv.slice(2);

switch (command) {
	case undefined:
	case "help":
	case "--help":
	case "-h":
		process.stdout.write(usage());
		break;
	case "version":
	case "--version":
	case "-v":
		process.stdout.write(`${version()}\n`);
		break;
	case "run":
		// 前台运行：交给主程序，信号由它处理
		await import("./main.ts");
		break;
	default:
		await runServiceCli(process.argv.slice(2));
}

function usage(): string {
	return [
		"pi-qqbot —— 把 pi agent 接入 QQ 私聊与群聊",
		"",
		"用法：pi-qqbot <命令>",
		"",
		"  run        前台运行（调试用，Ctrl-C 退出）",
		"  start      后台启动，等到连接就绪才返回",
		"  stop       停止（SIGTERM，宽限期后强杀）",
		"  restart    停旧起新",
		"  status     查看运行状态与 PID",
		"  logs [n]   查看最近 n 行日志",
		"  install    生成用户级 systemd / launchd 自启定义",
		"  uninstall  删除自启定义",
		"  version    版本号",
		"",
		"配置读取当前工作目录的 pi-qqbot.json（PI_QQBOT_CONFIG 可指向别处）。",
		"",
	].join("\n");
}

function version(): string {
	const parsed: unknown = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
	if (typeof parsed !== "object" || parsed === null || typeof (parsed as { version?: unknown }).version !== "string") {
		throw new Error("package.json 缺少 version");
	}
	return `pi-qqbot v${(parsed as { version: string }).version}`;
}
