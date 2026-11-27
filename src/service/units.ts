/** 服务定义生成：只负责渲染文本，写盘与启用由 CLI 做。 */
export interface UnitContext {
	/** 绝对路径的 node 可执行文件。 */
	nodePath: string;
	/** 项目根目录。 */
	cwd: string;
	/** 入口脚本绝对路径。 */
	entry: string;
	/** 状态目录（日志与 PID）。 */
	stateDir: string;
	/** 配置文件绝对路径（JSON），作为 `PI_QQBOT_CONFIG` 传给进程。 */
	configPath: string;
}

export function systemdUnit(context: UnitContext): string {
	const environment = `Environment=PI_QQBOT_CONFIG=${context.configPath}\n`;
	return `[Unit]
Description=pi-qqbot（pi agent 的 QQ 机器人桥接）
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${context.cwd}
${environment}ExecStart=${context.nodePath} --import tsx ${context.entry}
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=20
StandardOutput=append:${context.stateDir}/service.log
StandardError=append:${context.stateDir}/service.log

[Install]
WantedBy=default.target
`;
}

export function launchdPlist(context: UnitContext): string {
	const environment = `\t<key>EnvironmentVariables</key>\n\t<dict>\n\t\t<key>PI_QQBOT_CONFIG</key>\n\t\t<string>${context.configPath}</string>\n\t</dict>\n`;
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>eu.pi-qqbot</string>
\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${context.nodePath}</string>
\t\t<string>--import</string>
\t\t<string>tsx</string>
\t\t<string>${context.entry}</string>
\t</array>
${environment}\t<key>WorkingDirectory</key>
\t<string>${context.cwd}</string>
\t<key>RunAtLoad</key>
\t<true/>
\t<key>KeepAlive</key>
\t<dict>
\t\t<key>SuccessfulExit</key>
\t\t<false/>
\t</dict>
\t<key>StandardOutPath</key>
\t<string>${context.stateDir}/service.log</string>
\t<key>StandardErrorPath</key>
\t<string>${context.stateDir}/service.log</string>
</dict>
</plist>
`;
}
