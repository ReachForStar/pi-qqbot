---
title: pi（@earendil-works/pi-coding-agent）接入面
type: entity
tags: [pi, sdk, rpc, 扩展, 宿主]
created: 2026-11-27
updated: 2026-11-27
status: active
---

# pi（@earendil-works/pi-coding-agent）

本机安装版本 1.6.1，路径 `~/.pi/agent/install/releases/1.6.1/node_modules/@earendil-works/pi-coding-agent`。本文只记录接入 QQ Bot 需要的边界，均来自该版本的 `docs/`、`dist/*.d.ts` 与实际运行探测。

## 三种接入边界

| 边界 | 入口 | 能否主动发起 run |
| --- | --- | --- |
| SDK 进程内 | `createAgentSession()` | 能（`session.prompt()`） |
| RPC 子进程 | `pi --mode rpc` / `RpcClient` | 能（`prompt` 命令） |
| 扩展 | `defineTool` / `pi.on(...)` 等工厂 | **不能**，`ExtensionContextActions` 无提交消息的入口 |

机器人场景只能用前两种；扩展只用于加工具、加命令、拦工具调用。

## AgentSession 常用接口（1.6.1，`dist/core/agent-session.d.ts` 实测存在）

`prompt(text, options)`、`steer(text, images, { source })`、`followUp(text, images, { source })`、`abort()`、`waitForIdle()`、`compact()`、`setModel()`、`cycleModel()`、`setThinkingLevel()`、`getLastAssistantText()`、`getSessionStats()`、`getActiveToolNames()`、`setActiveToolsByName()`、`subscribe()`、`bindExtensions()`、`setSessionName()`、`dispose()`。

`PromptOptions`：`expandPromptTemplates`、`images: ImageContent[]`、`streamingBehavior: "steer" | "followUp"`（运行中不指定会抛错）、`source`。

## 会话事件（`AgentSessionEvent`）

运行：`agent_start` / `agent_end{messages, willRetry}` / `agent_settled{aborted}` / `turn_start` / `turn_end{message, toolResults}`。
消息：`message_start` / `message_update{assistantMessageEvent}` / `message_end{message}`。
工具：`tool_execution_start{toolCallId, toolName, args}` / `tool_execution_update{partialResult}` / `tool_execution_end{result, isError, durationMs}`。
其他：`queue_update`、`compaction_start/end`、`auto_retry_start/end`、`entry_appended`、`session_info_changed`、`thinking_level_changed`。

判断「这一轮真的结束」用 `agent_settled`；`agent_end` 之后仍可能有重试、溢出恢复、压缩或排队消息。

流式文本来自 `message_update.assistantMessageEvent`：`text_start/text_delta/text_end`、`thinking_*`、`toolcall_*`。`text_end` 与 `message_end` 给出权威内容，delta 只用于实时显示。

## 创建会话的可选项（`CreateAgentSessionOptions`）

`cwd`、`agentDir`、`modelRuntime`、`model`、`thinkingLevel`、`scopedModels`、`noTools("all"|"builtin")`、`tools`（白名单，支持 `*` 与 `+name/-name`）、`excludeTools`、`customTools`、`resourceLoader`、`sessionManager`、`settingsManager`、`sessionStartEvent`。

`SessionManager.create(cwd, dir)` / `open(path)` / `continueRecent(cwd)` / `inMemory()` / `list(cwd)`。

## 权限与交互

pi **不内置**工具审批：`docs/security.md` 明确「不会在每次工具调用前请求批准」。审批由扩展自行实现：

```ts
pi.on("tool_call", async (event, ctx) => {
  if (!(await ctx.ui.confirm("允许执行？", event.toolName))) return { block: true, reason: "未批准" };
});
```

工具注解 `annotations`（`readOnlyHint`/`destructiveHint`/`openWorldHint`）可用来决定哪些调用要确认。UI 原语是 `ExtensionUIContext`：`select` / `confirm` / `input` / `notify`，其余是纯终端能力。SDK 可用 `bindExtensions({ uiContext, mode })` 注入自定义实现；RPC 模式对应 `extension_ui_request` / `extension_ui_response`。

## 实机探测结果（2026-11-27）

- `createAgentSession({ sessionManager: SessionManager.inMemory(), cwd })` 成功，模型取自本机 settings（`group/ds-router`），默认加载了 13 个工具（含 MCP）。
- `prompt("只回复两个字：就绪")` 返回 `"就绪"`，事件序列 `agent_start → turn_start → message_start → message_update → message_end → turn_end → agent_end → agent_settled`。
- `tools: []` 时无工具可用，其余行为不变。
- 副作用：SDK 默认继承 `~/.pi/agent` 的资源，本机的 TUI 类扩展会在无 TUI 环境下报 `ctx is stale` 之类噪声；机器人场景应显式传 `resourceLoader`/`settingsManager` 收窄资源。

## 待确认

- 图片入站：`prompt({ images })` 接受 `ImageContent[]`，但 QQ 附件下载后能否直接复用需真机验证。
- 扩展命令表 `pi.getCommands()` 只在扩展上下文内可用；机器人侧斜杠命令建议自建命令表，不依赖宿主命令。
