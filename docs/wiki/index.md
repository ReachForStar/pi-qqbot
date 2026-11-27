---
title: 知识库索引
type: index
tags: [索引]
created: 2026-11-27
updated: 2026-11-27
status: active
---

# 知识库索引

项目 `pi-qqbot` 的知识沉淀。查询优先用 `qmd search` / `qmd query`，索引见本页。

## entities

- [pi-qqbot（本项目实现现状）](entities/pi-qqbot.md) —— 模块划分、配置面、已验证与未验证事项、设计取舍
- [dsh-qqbot](entities/dsh-qqbot.md) —— QQ Bot 接入 DeepSeek Harness 的官方插件：仓库事实、模块划分、会话模型、配置面、版本轨迹
- [tencent-connect 组织](entities/tencent-connect-org.md) —— 13 个仓库全景、三代技术线、与 openclaw-qqbot 的对比
- [pi（@earendil-works/pi-coding-agent）接入面](entities/pi-coding-agent.md) —— SDK / RPC / 扩展三种边界、会话事件、创建选项、审批机制、实机探测结果

## concepts

- [QQ Bot 渠道插件模式](concepts/qqbot-channel-plugin.md) —— 入站翻译 / 会话映射 / 出站订阅 / 能力映射 / 凭据绑定 / 宿主漂移收口

## sources

- [dsh-qqbot README 总结](sources/dsh-qqbot-readme.md)
- [tencent-connect 组织仓库快照](sources/tencent-connect-org-snapshot.md)
- [dsh-qqbot 活跃 fork 调研](sources/dsh-qqbot-forks-survey.md) —— 17 个活跃 fork 的主题分布、13 条可借鉴功能与落点排序

## decisions

- [ADR-001 pi agent 接入 QQ Bot 的桥接方案](decisions/adr-001-pi-qqbot-channel-bridge.md) —— 选定进程内 SDK 桥接，扩展只做工具与权限门；含模块划分、关键 API 与风险
- [ADR-002 以编译产物发行到 npm](decisions/adr-002-npm-distribution.md) —— `tsc` 构建到 `dist/`、`bin` 薄封装、`files` 白名单、配置跟 cwd

## queries

- [代码审查记录（ocr / 2026-11-27）](queries/code-review-2026-11-27.md) —— 37 条意见的复核结果、需修问题排序、判定有误的条目
- [隐私扫描记录（2026-11-27）](queries/privacy-audit-2026-11-27.md) —— 公开仓库的凭据/openid/本机痕迹扫描结果与未处理项
