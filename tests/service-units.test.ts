import { describe, expect, it } from "vitest";
import { launchdPlist, systemdUnit } from "../src/service/units.ts";

const context = {
	nodePath: "/usr/bin/node",
	cwd: "/opt/pi-qqbot",
	entry: "/opt/pi-qqbot/src/main.ts",
	stateDir: "/home/u/.pi-qqbot",
	configPath: "/opt/pi-qqbot/pi-qqbot.json",
};

describe("systemdUnit", () => {
	it("包含绝对路径、配置文件与重启策略", () => {
		const unit = systemdUnit(context);
		expect(unit).toContain("ExecStart=/usr/bin/node --import tsx /opt/pi-qqbot/src/main.ts");
		expect(unit).toContain("WorkingDirectory=/opt/pi-qqbot");
		expect(unit).toContain("Environment=PI_QQBOT_CONFIG=/opt/pi-qqbot/pi-qqbot.json");
		expect(unit).toContain("Restart=on-failure");
		expect(unit).toContain("WantedBy=default.target");
		expect(unit).toContain("StandardOutput=append:/home/u/.pi-qqbot/service.log");
	});

	it("launchd 也传配置文件路径", () => {
		expect(launchdPlist(context)).toContain("<key>PI_QQBOT_CONFIG</key>");
	});
});

describe("launchdPlist", () => {
	it("包含程序参数与工作目录", () => {
		const plist = launchdPlist(context);
		expect(plist).toContain("<string>/usr/bin/node</string>");
		expect(plist).toContain("<string>/opt/pi-qqbot/src/main.ts</string>");
		expect(plist).toContain("<key>WorkingDirectory</key>");
		expect(plist).toContain("<key>Label</key>\n\t<string>eu.pi-qqbot</string>");
	});
});
