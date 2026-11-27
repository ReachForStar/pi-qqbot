---
title: dsh-qqbot 活跃 fork 调研（可借鉴功能）
type: source
tags: [dsh-qqbot, fork, 调研, qqbot, 功能借鉴]
created: 2026-11-27
updated: 2026-11-27
sources: [raw/references/dsh-qqbot-readme-zh.md]
status: active
---

# dsh-qqbot 活跃 fork 调研

调研对象：<https://github.com/tencent-connect/dsh-qqbot/forks?include=active&sort=stargazers>（"活跃 fork" = 有独立提交）。采集时间 2026-11-27，方法：GitHub API 拉 77 个 fork，对 2026-10-29 之后有推送的 47 个逐个 `compare/main...fork`，取 `ahead_by > 0` 的 17 个并读其提交说明与关键文件。

## 前提：能借用什么

上游是 **dsh（Cordis 插件）** 的渠道插件，本项目是 **pi SDK** 的桥接服务。fork 的改动分两类：

| 类别 | 可移植性 | 说明 |
| --- | --- | --- |
| QQ 平台层（发送/切分/表情/语音/引用/被动回复窗口/群聊策略） | 可直接借鉴，几乎照搬 | 只依赖 `qqbot-nodejs` 与平台协议，与宿主无关 |
| 宿主层（会话树 fork、preset、审批通道、面板 UI、workspace 挂载） | 只能借思路 | 原语不同：dsh 是 Cordis 服务注入，pi 是 `AgentSession` 方法 |

## 活跃 fork 一览（按提交数）

| fork | ahead | 主题 |
| --- | --- | --- |
| `yjrqz777/dsh-qqbot-lite` | 64 | per-conversation persona（每会话人设覆盖 + 持久化 + 交互式菜单）、QQ 图片块转换进对话、图片 URL 回退、lite 发布 |
| `495258544/dsh-qqbot` | 59 | 「AI 伴侣」重度改造：唤醒/潜水状态机、兴趣驱动接话、表情库工具、口癖学习、日记、引用归属索引、Steam/Dota 查询 |
| `xuan25/dsh-qqbot` | 37 | 传输层大修：被动回复 TTL 按平台窗口对齐、reply limiter 入站播种、C2C reply-id TTL 60 分钟、按 scope 镜像平台限频、`NO_REPLY` 机制、审批 gating、命令按 scope 可见性 |
| `RiversJin/dsh-qqbot` | 7 | **QQ 会话列表与切换**、**`/bot-retry` 干净重生成**、compaction/browser 状态暴露、入站诊断 |
| `kirigayakazima/dsh-qqbot` | 10 | **语音附件转写**、**QQ 引用回复（message_reference）**、多段去重、主动发送兜底 |
| `elyoncatnecoe/dsh-qqbot` | 8 | plus 分支：BOM 守卫、保守默认、扫码写入正确条目、群主动推送与群提醒 |
| `ChenChenyaqi/dsh-qqbot` | 4 | **表情包发送（`[表情:名]` 标记 → sendImage）**、分段发送（多气泡） |
| `zjDing42/dsh-qqbot` | 4 | 群聊「是否该回」判断提示词、本地文件系统提示词 |
| `zqlyz/dsh-qqbot` | 4 | 入站消息时间戳、群历史缓存媒体、群聊定时批量回复 |
| `chaorenzeng/dsh-qqbot` | 3 | 排队/插话模式、访问控制默认收紧（上游已并入） |
| `learningmuch/dsh-qqbot` | 3 | 宿主会话绑定 QQ 双向同步 |
| `huicongyao/dsh-qqbot` | 2 | **群聊概率接话**、**出站 @ 群友**、上下文不出现完整 openid |
| `CaveNightingale/dsh-qqbot` | 2 | `send_file` 接受沙箱路径 |
| `hu568/dsh-qqbot` | 1 | 分条发送（多气泡） |
| `s1eke/dsh-qqbot` | 1 | 后台任务与会话控制 |
| `uphome/dsh-qqbot` | 1 | 端内面板相对路径（修反向代理子路径 404） |

其余 60 个 fork 与上游同步或无独立提交。

## 对 pi-qqbot 值得抄的（按价值排序）

| 优先级 | 功能 | 来源 | 落点 | 成本 |
| --- | --- | --- | --- | --- |
| 1 | **被动回复窗口与限频**：回复锚点 TTL、每条消息的回复条数预算、按 c2c/group 镜像平台限制 | `xuan25` | `src/sink.ts`（发送预算）+ 新 `src/reply-limiter.ts` | 中 |
| 2 | **语音转写**：QQ 语音附件带 `asr_refer_text`，直接当文本喂模型 | `kirigayakazima` | `src/media.ts` + `src/gateway.ts` | 低 |
| 3 | **表情包**：prompt 注入表情名 → 模型写 `[表情:名字]` → 出站解析后 `sendImage`，与文本共享一轮 4 条预算 | `ChenChenyaqi` | 新 `src/stickers.ts` + `binder` 解析 | 中 |
| 4 | **分条发送（多气泡）**：长回复按段落拆成多条，像真人发消息 | `ChenChenyaqi`、`hu568` | `src/sink.ts`（TextSink 切分策略） | 低 |
| 5 | **引用回复**：出站带 `message_reference`，群聊看清在回谁 | `kirigayakazima` | `src/sink.ts` + `replyTarget` | 低 |
| 6 | **出站不暴露完整 openid**：未授权提示与 `/me` 脱敏（前 6 位 + 省略） | `huicongyao` | `src/gateway.ts`、`src/commands.ts` | 极低 |
| 7 | **群聊概率接话**：无人 @ 时按概率接一句，替代纯 @ 门控 | `huicongyao`、`ZjDing42` | `src/gateway.ts`（`mentionGate` 的 `isImplicitMention`） | 低 |
| 8 | **`/retry` 重生成上一轮**：pi 用会话树分支实现，上一轮用过工具时要求 `force` | `RiversJin` | `src/router.ts` + `src/commands.ts` | 中 |
| 9 | **会话列表与切换**：`/sessions` 列出该 peer 的历史会话，`/resume <id>` | `RiversJin` | `src/router.ts`（`SessionManager.list`） | 中 |
| 10 | **每会话人设/模型覆盖**：按 peer 持久化 persona 或 preset，`/persona` 切换 | `yjrqz777` | `src/router.ts` + `members` 同款 JSON | 中 |
| 11 | **入站消息时间戳注入**：给模型一个时间锚 | `zqlyz` | `src/gateway.ts` 拼 prompt | 极低 |
| 12 | **NO_REPLY 静默**：模型判定不需回应时不发消息 | `xuan25` | `src/binder.ts` | 低 |
| 13 | **bot 消息门禁**：忽略其它机器人消息，防两个 bot 互聊刷屏 | `495258544` | `src/gateway.ts`（`messageFilter` 已挡自身，需扩展） | 极低 |

排在后面的（不推荐现在做）：per-conversation persona 的完整 UI、唤醒/潜水状态机、兴趣驱动接话、口癖学习、日记与自我叙述、Steam/Dota 查询——这些是「AI 伴侣」路线的重度定制，与「把 pi 接到 QQ」的目标不同；`uphome` 的面板修复只对 dsh 端内 UI 有意义。

## 结论

- 活跃 fork 集中在两类：**平台边界修补**（`xuan25` 的被动回复窗口/限频最系统）与**人格化改造**（`495258544`、`yjrqz777`）。
- 对本项目真正值钱的是前三条：被动回复窗口与限频（不改会被平台拒）、语音转写（附件里直接有 ASR 文本）、表情包（`[表情:名]` 标记法简单好用）。
- 所有 QQ 层实现都可以直接读代码照搬；宿主层（会话树、preset、审批、面板）只借思路，落到 pi 的 `AgentSession` 上要重写。

相关：[dsh-qqbot 实体页](../entities/dsh-qqbot.md)、[pi-qqbot 实现现状](../entities/pi-qqbot.md)、[代码审查记录](../queries/code-review-2026-11-27.md)。
