---
title: pi-qqbot（本项目实现现状）
type: entity
tags: [pi-qqbot, qqbot, 实现, 桥接]
created: 2026-11-27
updated: 2026-11-27
status: active
---

# pi-qqbot

本项目：把 pi agent 接入 QQ 私聊与群聊的桥接服务。方案见 [ADR-001](../decisions/adr-001-pi-qqbot-channel-bridge.md)，宿主能力见 [pi 接入面](pi-coding-agent.md)，对标实现见 [dsh-qqbot](dsh-qqbot.md)。

## 依赖

| 包 | 作用 |
| --- | --- |
| `@earendil-works/pi-coding-agent` 1.6.1 | agent 会话、事件流、模型与工具 |
| `@tencent-connect/qqbot-nodejs` 1.0.6 | QQ 传输、中间件、发消息、C2C 流式、重连 |
| `tsx` / `typescript` / `vitest` | 运行与验证 |

## 模块

| 文件 | 职责 |
| --- | --- |
| `src/main.ts` | 读 `.env`（`process.loadEnvFile`）、装配路由、启动网关、信号退出 |
| `src/config.ts` | 环境变量解析与边界校验（缺凭据即抛，非法布尔/数字即抛） |
| `src/gateway.ts` | `QQBot` 装配（`errorHandler`/`messageFilter`/`contentSanitizer`/`mentionGate`/`typingIndicator`）、白名单、命令分发、出站编排 |
| `src/sink.ts` | 出站渲染：私聊流式（`openStream`，300ms）与群聊切分（可选 Markdown），`BotLike` 接口便于独立测试 |
| `src/peers.ts` | 消息 → peer 判定（私聊取发送者 openid，群聊取群 openid） |
| `src/members.ts` | 身份库：种子导入、配对码签发/认领、撤销墓碑、原子写 |
| `src/reply-budget.ts` | 被动回复额度：按触发消息计次与 TTL，超限降级为主动发送 |
| `src/stickers.ts` | 表情包：目录扫描、`[表情:名字]` 标记解析、提示词清单 |
| `src/media.ts` | 图片下载、按文件头纠正 mime、单附件失败跳过 |
| `src/format.ts` | 工具行格式化：开始行取 `command`/`path`/`pattern` 等关键参数，结束行带耗时与结果首段文本，单行限长 80 字 |
| `src/router.ts` | peer → 会话：内存复用、磁盘映射恢复、并发合并、闲置回收、`/new` 重置 |
| `src/agent.ts` | pi 会话封装：事件翻译、`send`（排队/插话）、`abort`/`compact`/`status`/`model` |
| `src/binder.ts` | agent 事件 → 渠道输出的状态机，`settled` 收尾 |
| `src/chunker.ts` | Markdown 感知切分，代码块跨片补围栏并重开 |
| `src/store.ts` | peer → 会话文件的原子写映射表，写前合并磁盘条目 |
| `src/commands.ts` | 命令表，按 agent / qqbot 分组，支持 dsh-qqbot 的 `bot-` 别名；只拦已知命令 |
| `src/enqueue.ts` | 会话忙时排队/插话决策与回执文案 |
| `src/watchdog.ts` | 单轮超时看门狗（`timeoutMs <= 0` 关闭，定时器 `unref`） |

## 契约分层

渠道侧与 agent 侧通过 `src/types.ts` 的两个接口解耦：`AgentBackend`（会话）与 `Sink`（渲染目标）。两侧实现互不引用对方的库，测试用最小替身注入（`tests/fake-backend.ts`）。

## 仓库与 CI（2026-11-27）

- 远端：<https://github.com/ReachForStar/pi-qqbot>（public，默认分支 `main`）。
- CI：`.github/workflows/ci.yml`，Node 22、Node 24 与 macOS 三个任务（macOS 用于验证 `ps` 进程身份与 launchd 渲染），步骤为 `npm ci` → typecheck → `npm test` → build → `npm pack --dry-run` 白名单校验（缺 `dist/cli.js`、`bin/pi-qqbot.js` 或混入真实 `pi-qqbot.json` 即失败）、`scripts/check-package-meta.sh` 校验 `license`、`engines.node` 与 README 徽标写法一致。
- 发布：推 `v*` 标签触发 `.github/workflows/release.yml`（版本与标签一致 → verify → 包内容 → 许可证 → 从 `CHANGELOG.md` 抽本版段落作 release note → `npm publish --provenance` → 回查 registry 可见性 → `gh release create`）。发布步骤幂等，重跑只会补 Release。
- README 徽标四枚，与 `pi-weixin-bridge` 一致：CI、npm 版本（`?color=blue`）、`License-MIT-yellow`、`Node-%3E%3D22-339933`。
  - 版本徽标必须显式指定颜色：shields.io 按语义化版本上色，**0.x 默认橙色**，1.0.0 起才自动变蓝（实测 `ms@2.1.3` 蓝、`wtfnode@0.10.1` 橙）。
  - 许可证徽标用静态样式：`img.shields.io/npm/l/...` 在 npm 暂存发布期间取不到包会渲染成 `package not found`，且错误结果缓存 4 小时。
- 弃用 Node 20 的原因：vitest 5 依赖 `Map.groupBy`（Node 22+），在 20 上测试进程直接崩，`engines` 同步改为 `>=22`。action 用 `checkout@v7` / `setup-node@v7`，不再出现 Node 20 弃用告警。

## 配置来源（2026-11-27 改为 JSON 文件）

配置不再用 `.env`。唯一来源是项目根目录的 `pi-qqbot.json`（`PI_QQBOT_CONFIG` 可指向别处）：

- 逐字段校验：未知字段直接报错、类型/枚举/取值范围不符立即失败，避免拼错的键被静默忽略。
- `~/` 路径自动展开；空字符串按未配置处理。
- 环境变量只留两个口子：`PI_QQBOT_CONFIG`（配置文件位置）、`QQBOT_APPID` / `QQBOT_SECRET`（服务单元注入凭据，密钥不必落盘）。
- `pi-qqbot.json` 已进 `.gitignore`；示例见 `pi-qqbot.example.json`。

## 后台服务（2026-11-27）

参考 `ReachForStar/pi-weixin-bridge` 的守护层做法，本项目实现了：

| 文件 | 职责 |
| --- | --- |
| `src/service/pid.ts` | PID 记录 + 身份旁路（`ps -o lstart=` 固定 `TZ=UTC`/`LC_ALL=C`），比对命令行判断是否同一进程 |
| `src/service/lock.ts` | 单实例锁：残留锁只有确认持有者已消失才回收，损坏锁明确报错 |
| `src/service/rotate.ts` | 启动前日志轮转（`.1`） |
| `src/service/daemon.ts` | `start`（派生脱离子进程 + 等就绪标记）、`stop`（SIGTERM → 宽限期 → SIGKILL）、`status`、`tailLog` |
| `src/service/units.ts` | systemd unit 与 launchd plist 渲染（纯函数，可测） |
| `src/service-cli.ts` | `npm run service -- start\|stop\|restart\|status\|logs\|install\|uninstall` |

`src/main.ts` 启动时获取单实例锁并写 PID 记录，退出时释放；`scripts/restart.sh` 只剩转发到 service CLI 的薄封装。

踩坑：`spawn` 早期用 `stdio: "inherit"`，子进程继承了调用方的管道，`| tail` 永远等不到 EOF（命令看起来“卡住”1 分钟以上）；改为子进程直接写日志文件描述符。

## 配置面

`QQBOT_APPID` / `QQBOT_SECRET`（必填）、`PI_QQBOT_ALLOW`（openid 白名单，空即全拒）、`PI_QQBOT_CWD`、`PI_QQBOT_STATE_DIR`、`PI_QQBOT_TOOLS`、`PI_QQBOT_REQUIRE_MENTION`、`PI_QQBOT_STREAMING`、`PI_QQBOT_IDLE_MS`、`PI_QQBOT_DEBUG`。

## 已验证（2026-11-27）

- **QQ 平台连通**：真实凭据启动，`getAppAccessToken` 取到 token → `wss://api.sgroup.qq.com/websocket` READY，日志「已连接 QQ 开放平台（AppID &lt;APPID&gt;）」，SIGTERM 干净退出。
- **真实 QQ 往返**：私聊发「你是谁」「你用的是什么模型？」，第一条立即建会话并跑完（含一次工具调用），第二条在运行中排队；回复发送接口均返回 200。会话文件 `~/.pi-qqbot/sessions/*.jsonl` 里可见 user → assistant → toolResult → assistant 完整链路。
- **真实 pi 链路**（`tests/integration-agent.ts`）：创建会话 → `prompt` → 工具调用（`▸ ls`）→ 文本增量 → `settled` 收尾 → 会话文件落盘 → 用同一文件恢复，状态显示历史保留（用户 1 条、助手 2 条、工具调用 1 次）。
- **单元测试**：6 个文件 27 项通过（切分、映射表、路由、事件绑定、命令、配置）；`tsc --noEmit` 无错误。

## 运维

```bash
bash scripts/restart.sh       # 停旧实例 → 起新实例 → 等 READY（单实例）
tail -f .pi-qqbot/bot.log     # 观察连接、启动配置与会话
```

`scripts/restart.sh` 用 `.pi-qqbot/bot.pid` 记录进程，pidfile 丢失时按命令行兜底清理；启动后轮询日志里的「已连接 QQ 开放平台」确认就绪。脚本内的 `pgrep` 模式写成 `[n]ode ...`，否则会匹配到脚本自身的命令行并把执行者杀掉（踩过）。

启动日志会打印生效配置，用于排查白名单与模型问题：

```
启动：AppID &lt;APPID&gt;，白名单 2 个，模型 &lt;provider/model&gt;，思考 low，工具 read,ls,grep,find,edit,write,bash
```

两条硬约束：

- **改 `.env` 必须重启进程**，包括改白名单。旧进程仍持旧配置，会继续拒绝新加的 openid。
- **同一 AppID 只能跑一个实例**。两个进程都会拿到 READY，消息随机落到其中一个：会话句柄、流式刷写、回复窗口都会争抢。切换时必须先停旧的再起新的。

## 身份库与配对码（取代静态白名单）

点名册在 `<STATE_DIR>/members.json`，增删成员不改 `.env`、不重启。

| 动作 | 入口 | 语义 |
| --- | --- | --- |
| 初始导入 | `PI_QQBOT_ALLOW` | 首次启动导入为 `seed` 成员；被撤销后不会被再次导入 |
| 签发配对码 | `/pair [分钟]`（管理员） | 8 位码（去掉 0/O/1/I），默认 10 分钟，同码可连续加多人 |
| 认领 | 陌生人直接发码 | 成功即入名单并收到「已加入名单」；过期/错误码按未授权处理 |
| 查看 | `/members`（管理员） | 序号、openid、来源（初始/配对）、加入日期 |
| 移除 | `/revoke <openid>`（管理员） | 打撤销墓碑 |
| 撤销后的再授权 | 管理员重新 `/pair` | 用序号比较：撤销前签发的码 `seq < revokedSeq`，不能把人加回来 |

管理员判定：`PI_QQBOT_OWNER`，未配置时用 `PI_QQBOT_ALLOW` 的种子；两者都空则无人能签发（刻意避免陌生人自助进名单）。

实现要点：签发与撤销共用一个单调递增序号 `nextSeq`，避免同一毫秒内「撤销 → 立即发新码」被时间戳精度误判（第一版用 `issuedAt <= revokedAt` 就踩了这个坑，测试直接失败）。

## 命令族（对齐 dsh-qqbot）

| 分组 | 命令 | 说明 |
| --- | --- | --- |
| 通用能力 | `/new`（`/reset`）、`/compact`、`/model [名称]`、`/stop` | 对应 pi 的会话/压缩/模型/中止 |
| 机器人能力 | `/status`（`/bot-status`）、`/ping`（`/bot-ping`）、`/version`、`/me`（`/whoami`）、`/reload`、`/help` | 通道自身能力 |

`/ping` 用 QQ 事件时间与网关接收时间拆出「网络传输 / 插件处理」两段；`/help` 按上述两组渲染，与 dsh-qqbot 的 `/bot-help` 结构一致。命令只拦已知名字，`/etc/hosts` 这类内容照旧进模型。

## 忙时处理与限流

| 能力 | 实现 | 开关 |
| --- | --- | --- |
| 排队 | pi 的 `followUp`，回执「已排队（前面还有 N 条）」 | `PI_QQBOT_MODE=queue`（默认） |
| 插话 | pi 的 `steer`，回执「已插入当前任务」 | `PI_QQBOT_MODE=steer` |
| 限流 | SDK `rateLimiter`，`onLimit` 回一句提示 | `PI_QQBOT_RATE_PER_MINUTE`（默认 20，0 关闭） |
| 非图片附件 | 提示「已收到 N 个暂不支持的附件」并继续处理文本 | 固定 |

队列长度来自 pi 的 `queue_update` 事件（steering + followUp 计数）。

## 过程提示与超时

| 事件 | 提示 | 来源 |
| --- | --- | --- |
| 模型重试 | `⟳ 第 1/3 次重试（2000ms 后）：overloaded` | pi `auto_retry_start` |
| 上下文压缩 | `⏳ 正在压缩上下文` / `✅ 压缩完成` | pi `compaction_start` / `compaction_end` |
| 处理超时 | `⏱ 处理超时，已中止本轮` | `watchdog`，`PI_QQBOT_TIMEOUT_MS` 默认 30 分钟 |

超时由 `src/watchdog.ts` 实现：`send()` 发起新一轮时 arm，`agent_settled` 时 disarm，到点先发提示再 `abort()`。定时器 `unref()`，不会拖住进程退出。

`/compact` 在小会话上会拿到 pi 的 `Nothing to compact (session too small)`，后端把它翻译成「当前会话太短，无需压缩」，不再当异常抛给用户。

## 从 dsh-qqbot fork 借鉴并落地的能力（2026-11-27）

| 能力 | 来源 fork | 实现 |
| --- | --- | --- |
| 被动回复额度与窗口 | `xuan25` | `reply-budget.ts`：每条触发消息 `PI_QQBOT_REPLY_LIMIT` 次、`PI_QQBOT_REPLY_TTL_MS` 窗口，超限自动去掉 `msgId` 改主动发送 |
| 语音转写 | `kirigayakazima` | `media.ts#transcribeVoice`：直接用 QQ 的 `asr_refer_text`，语音不再提示「不支持」 |
| 表情包 | `ChenChenyaqi` | `stickers.ts` + sink 新增 `sticker()`：模型写 `[表情:名字]`，标记剥离后单独 `sendImage`，受 `PI_QQBOT_STICKER_MAX` 约束 |
| 分条发送（多气泡） | `ChenChenyaqi`、`hu568` | `PI_QQBOT_CHUNK_MODE=paragraph`，按段落拆条并受 `PI_QQBOT_PARAGRAPH_LIMIT` 约束 |
| 群聊概率接话 | `huicongyao`、`ZjDing42` | `mentionGate` 的 `isImplicitMention` + `PI_QQBOT_GROUP_REPLY_CHANCE` |
| `/retry` 重发上一轮 | `RiversJin` | 记录每 peer 上一轮输入；用过工具时要 `/retry force`（简化版，不做会话树分支） |
| `/sessions` + `/resume` | `RiversJin` | `router.listSessions()`（`SessionManager.list`）与 `router.switchTo()` |
| 入站时间戳注入 | `zqlyz` | `composeInput()` 每轮拼 `[时间 …]`，`PI_QQBOT_INJECT_TIMESTAMP` 控制 |
| NO_REPLY 静默 | `xuan25` | binder 在 settled 时比对 `PI_QQBOT_NO_REPLY`，命中整轮不发 |
| bot 消息门禁 | `495258544` | `PI_QQBOT_IGNORE_BOTS`（默认开）+ SDK `messageFilter` |
| openid 脱敏 | `huicongyao` | `format.ts#maskOpenid`，未授权提示与 `/revoke` 回执都脱敏 |
| 引用回复 | `kirigayakazima` | 已具备：被动回复本身就锚定触发消息（`replyTarget.msgId`），无需额外 `message_reference` |
| 每会话人设覆盖 | `yjrqz777` | `/persona` + `<stateDir>/persona.json`，按 peer 持久化 |

## 出站能力（2026-11-27 完善）

| 能力 | 实现 | 开关 |
| --- | --- | --- |
| 私聊流式 | `openStream`，最小刷新间隔 300ms | `PI_QQBOT_STREAMING` |
| 群聊切分 | 4500 字符上限，代码块不截断 | 固定 |
| Markdown | `sendMarkdown`（需平台权限），提示行始终纯文本 | `PI_QQBOT_MARKDOWN` |
| 工具活动 | `summary` 轮末 `🛠 工具调用 6 次：bash ×5、read，耗时 12.4s`；`live` 实时两行（2.5s 合并、单条最多 6 行）；失败始终立即提示 | `PI_QQBOT_TOOL_DISPLAY` |
| 正在输入 | `typingIndicator`，仅私聊 | `PI_QQBOT_TYPING` |
| 图片入站 | 下载 + 文件头纠正 mime + 单附件失败跳过 | 固定 |

服务端细节：QQ 的 `msg_seq` 由 SDK 每次发送随机生成，同一条触发消息可发多条回复，不需要自行递增。

## 尚未验证

- 群聊：@ 门控、群 openid 白名单、长回复限频表现（只跑过私聊；`resolvePeer`/`isAllowed` 已有单测）。
- 图片入站到模型的端到端效果：下载、mime 纠正、大小上限已有测试（本地 HTTP 服务器 + 真实 `fetch`），未用 QQ 真图验证。
- 被动回复窗口边界：超过平台限制后的重发行为未测。

## 技能加载与 `/reload`

**踩坑（重要）**：`createAgentSession()` 只在它自己创建 `DefaultResourceLoader` 时才会调用 `loader.reload()`。本项目传入自定义 loader（为了 `noExtensions: true`），首版漏了这一步，导致技能、提示模板、主题、项目扩展全部为空——技能数长期是 0，只是没人注意。补上 `await resourceLoader.reload()` 后技能数从 0 变为 44。

**`/reload`**：走 `AgentSession.reload()`（公开 API），重载 settings 与资源（技能、扩展），**不重建会话、不丢上下文**。任务运行中拒绝执行并提示先 `/stop`，因为重载会替换扩展运行时。`/status` 现在打印技能数量与名单。

实测（`tests/integration-reload.ts`）：

| 步骤 | 技能数 | 上下文 |
| --- | --- | --- |
| 初次后端 | 44 | 用户 1 / 助手 1 |
| 运行中新增 `<cwd>/.pi/skills/reload-verify` 后 `reload()` | 45（含 reload-verify） | 用户 1 / 助手 1（保留） |
| `router.reset()`（`/new`） | 45 | 用户 0 / 助手 0（清空） |

会话文件在 reload 前后保持同一路径。

## 模型与响应速度

两个旋钮都是环境变量，不硬编码在代码里：

- `PI_QQBOT_MODEL`：`provider/model` 或可唯一后缀（`matchModel()`：精确 → 裸 id → 唯一后缀，命中多个后缀时拒绝猜测并报错）。留空沿用宿主设置。
- `PI_QQBOT_THINKING`：`off`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`，留空沿用宿主设置。
- 私聊流式刷新间隔从 SDK 默认 500ms 降到 300ms（QQ 允许的最小值）。

实测（同一提示「用大约 200 字介绍你自己」，本机网络，走生产代码路径）：

| 模型 / 思考 | 首字延迟 | 整轮耗时 |
| --- | --- | --- |
| 通用路由模型（`group/…`）/ high | 4876 ms | 6578 ms（365 字，61 个增量） |
| 轻量模型 / off | 290 ms | 1165 ms |
| 轻量模型 / minimal | 271 ms | 1452 ms |
| 轻量模型 / low | 237 ms | 1194 ms（切模型后首次请求 2980 ms，属冷启动） |

结论：感知到的「慢」主要来自模型与思考级别造成的首字延迟，不是桥接层。桥接只在流式刷新间隔上有 200ms 级的贡献。

## 设计取舍

- 工具审批未实现：pi 无内置审批，本项目以「白名单 + 独立工作目录 + 工具集收窄」控制风险，代价是白名单内用户拥有完整 shell。
- 发送用纯文本而非 Markdown：Markdown 需要平台单独开通权限，纯文本不依赖权限且群聊表现一致。
- 会话按 peer 一个 pi 会话，`/new` 用重置路由而非派生新 id：老会话文件不删除，映射表改指向新文件。
