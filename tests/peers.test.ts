import { describe, expect, it } from "vitest";
import { resolvePeer } from "../src/peers.ts";

describe("resolvePeer", () => {
	it("私聊取发送者 openid", () => {
		expect(resolvePeer({ kind: "c2c", author: { id: "USER" }, replyTarget: { targetId: "USER" } })).toEqual({
			scope: "c2c",
			peerId: "USER",
		});
	});

	it("群聊取群 openid", () => {
		expect(
			resolvePeer({ kind: "group", author: { id: "USER" }, groupOpenid: "GROUP", replyTarget: { targetId: "GROUP" } }),
		).toEqual({ scope: "group", peerId: "GROUP" });
	});

	it("频道与频道私信按回复目标独立建会话", () => {
		expect(resolvePeer({ kind: "guild", author: { id: "USER" }, replyTarget: { targetId: "CHANNEL1" } })).toEqual({
			scope: "guild",
			peerId: "CHANNEL1",
		});
		expect(resolvePeer({ kind: "dm", author: { id: "USER" }, replyTarget: { targetId: "GUILD1" } })).toEqual({
			scope: "dm",
			peerId: "GUILD1",
		});
	});

	it("群 openid 缺失时回退到回复目标", () => {
		expect(resolvePeer({ kind: "group", author: { id: "USER" }, replyTarget: { targetId: "GROUP" } })).toEqual({
			scope: "group",
			peerId: "GROUP",
		});
	});
});
