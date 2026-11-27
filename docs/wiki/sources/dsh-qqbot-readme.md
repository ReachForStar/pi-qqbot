---
title: dsh-qqbot 仓库 README 总结
type: source
tags: [dsh-qqbot, qqbot, dsh, readme]
created: 2026-11-27
updated: 2026-11-27
sources: [raw/references/dsh-qqbot-readme-zh.md]
status: active
---

# dsh-qqbot README 总结

原始材料：[raw/references/dsh-qqbot-readme-zh.md](../../raw/references/dsh-qqbot-readme-zh.md)（2026-11-27 从 `tencent-connect/dsh-qqbot` 默认分支 `main` 抓取的简体中文 README 全文，248 行）。

## 要点

1. 定位：基于 deepseek-harness（dsh）的 QQ Bot 插件，把 DeepSeek AI 助手接入 QQ 私聊与群聊；MIT 许可，npm 包 `@tencent-connect/dsh-qqbot`。
2. 架构：`QQ 用户 → QQ WebSocket → dsh-qqbot → ctx.agents → dsh agent loop → LLM`，回复经 `session/event` 回到 `sendMarkdown`。
3. 安装四条路径：桌面端插件页添加 + 设置页扫码、`npx @deepseek-ai/dsh plugin --profile qqbot add`、本地路径安装、`--patch ./cordis.dev.yml` 开发模式。凭据缺失时自动进入扫码引导，`QQBOT_BIND_OPEN_BROWSER=1` 可拉起浏览器扫码页。
4. 配置面分五组：基础（模型、消息切分、超时、排队/插话）、访问控制（私聊/群聊/命令三套 open|allowlist|disabled）、主动推送、富媒体与视觉理解、附件发送；白名单支持配对码、手动 OpenID、导出三种添加方式。
5. 设计原则七条：纯 Cordis 插件、声明式依赖 `inject = ['agents']`、会话隔离、preset 支持、闲置回收、Markdown 输出与能力工具（视觉理解、附件发送、问答互动、操作确认）。

## 边界

README 只覆盖用户视角的安装与配置，不含内部模块说明；模块职责、宿主适配层与版本兼容细节见 [dsh-qqbot 页面](../entities/dsh-qqbot.md)。
