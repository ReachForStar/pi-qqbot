import { describe, expect, it } from "vitest";
import { Members, type MembersIo } from "../src/members.ts";

function memoryIo(): MembersIo & { files: Map<string, string> } {
	const files = new Map<string, string>();
	return {
		files,
		exists: (path) => files.has(path),
		read: (path) => files.get(path) ?? "",
		write: (path, content) => files.set(path, content),
	};
}

describe("Members", () => {
	it("种子名单导入后即为成员，重复导入幂等", () => {
		const io = memoryIo();
		const members = new Members("members.json", io);
		members.seed(["A", "B"]);
		members.seed(["B", "C"]);
		expect(members.list().map((m) => m.openid).sort()).toEqual(["A", "B", "C"]);
		expect(members.isMember("A")).toBe(true);
		expect(members.isMember("Z")).toBe(false);
	});

	it("配对码认领后加入名单，同一码可加多人", () => {
		const members = new Members("members.json", memoryIo());
		const code = members.issueCode("OWNER");
		expect(members.claim(code.code, "NEW1")).toEqual({ kind: "joined" });
		expect(members.claim(code.code.toLowerCase(), "NEW2")).toEqual({ kind: "joined" });
		expect(members.isMember("NEW1")).toBe(true);
		expect(members.isMember("NEW2")).toBe(true);
	});

	it("已在名单内不重复加入", () => {
		const members = new Members("members.json", memoryIo());
		members.seed(["A"]);
		const code = members.issueCode("OWNER");
		expect(members.claim(code.code, "A")).toEqual({ kind: "already" });
	});

	it("过期码无效", () => {
		const members = new Members("members.json", memoryIo());
		const code = members.issueCode("OWNER", -1);
		expect(members.claim(code.code, "NEW")).toEqual({ kind: "invalid" });
	});

	it("错误码无效", () => {
		const members = new Members("members.json", memoryIo());
		members.issueCode("OWNER");
		expect(members.claim("WRONGCODE", "NEW")).toEqual({ kind: "invalid" });
	});

	it("移除后旧码不能加回来，新码可以", () => {
		const members = new Members("members.json", memoryIo());
		const oldCode = members.issueCode("OWNER");
		members.claim(oldCode.code, "NEW");
		expect(members.revoke("NEW")).toBe(true);
		expect(members.isMember("NEW")).toBe(false);

		const rotated = members.claim(oldCode.code, "NEW");
		expect(rotated.kind).toBe("rotated");

		const fresh = members.issueCode("OWNER");
		expect(members.claim(fresh.code, "NEW")).toEqual({ kind: "joined" });
		expect(members.isMember("NEW")).toBe(true);
	});

	it("被撤销的种子成员不会被再次 seed 复活", () => {
		const members = new Members("members.json", memoryIo());
		members.seed(["A"]);
		members.revoke("A");
		members.seed(["A"]);
		expect(members.isMember("A")).toBe(false);
	});

	it("文件损坏时备份原文并按空库继续", () => {
		const io = memoryIo();
		io.files.set("members.json", "{不是 JSON");
		const warnings: string[] = [];
		const members = new Members("members.json", io, (message) => warnings.push(message));

		expect(members.list()).toEqual([]);
		expect(warnings[0]).toContain("已备份");
		const backupKey = [...io.files.keys()].find((key) => key.startsWith("members.json.corrupt-"));
		expect(backupKey).toBeDefined();
		expect(io.files.get(backupKey ?? "")).toBe("{不是 JSON");
	});

	it("写入文件后可被新实例读回", () => {
		const io = memoryIo();
		const first = new Members("members.json", io);
		first.seed(["A"]);
		const code = first.issueCode("OWNER");
		first.claim(code.code, "B");

		const second = new Members("members.json", io);
		expect(second.list().map((m) => m.openid).sort()).toEqual(["A", "B"]);
	});
});
