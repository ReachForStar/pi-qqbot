---
title: tencent-connect 组织仓库快照（2026-11-27）
type: source
tags: [tencent-connect, qqbot, 仓库清单]
created: 2026-11-27
updated: 2026-11-27
sources: [raw/references/tencent-connect-org-repos.md]
status: active
---

# tencent-connect 组织仓库快照

原始材料：[raw/references/tencent-connect-org-repos.md](../../raw/references/tencent-connect-org-repos.md)（2026-11-27 通过 GitHub API `orgs/tencent-connect/repos?type=all` 采集，13 条，按 `pushed_at` 倒序）。

## 要点

1. 组织共 13 个公开仓库，无归档仓库；创建于 2021-08-17，官网 <https://bot.q.qq.com>。
2. 活跃线只有三个仓库在 2026 年有推送：`dsh-qqbot`（2026-11-24）、`qqbot-nodejs`（2026-11-23）、`openclaw-qqbot`（2026-10-12）。
3. 另有 2026 年上半年推送的 `qqbot-agent-sdk`（Python，2026-05）与 `tencent-channel-community`（2026-04）。
4. 其余 8 个 `bot-*` 仓库属 QQ 频道时代的 SDK、文档、示例与工具，最后推送在 2022–2025 年，星标存量高于活跃线（`botpy` 917、`botgo` 393、`bot-docs` 272）。
5. 星标最高的新仓库是 `openclaw-qqbot`（1554），高于 `dsh-qqbot`（633）。

## 解读

组织已完成从「QQ 频道 SDK」到「QQ 机器人 API v2 + Agent 宿主插件」的重心转移：协议层收敛为 `qqbot-nodejs`（Node）与 `qqbot-agent-sdk`（Python），宿主适配层按宿主分化（dsh、OpenClaw）。仓库定位与对比见 [tencent-connect 组织](../entities/tencent-connect-org.md)。
