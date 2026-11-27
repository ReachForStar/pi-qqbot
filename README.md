# pi-qqbot

[![CI](https://github.com/ReachForStar/pi-qqbot/actions/workflows/ci.yml/badge.svg)](https://github.com/ReachForStar/pi-qqbot/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/pi-qqbot.svg?color=blue)](https://www.npmjs.com/package/pi-qqbot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/ReachForStar/pi-qqbot/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D22-339933.svg)](https://nodejs.org)

把 [pi](https://github.com/earendil-works/pi) agent 接到 QQ 私聊与群聊：QQ 消息进来驱动一次 pi 会话，pi 的回复与工具活动回送到 QQ。

每个私聊用户、每个群各有一份独立会话，历史落盘，重启后继续同一段上下文。

## 特性

| 能力 | 说明 |
| --- | --- |
| 会话隔离 | 私聊按用户、群聊按群各一份会话；进程重启后按会话文件恢复 |
| 真实工具链 | 默认 `read,ls,grep,find,edit,write,bash`：能读文件、改代码、跑命令 |
| 流式回复 | 私聊实时刷新同一条消息（QQ 仅私聊支持）；群聊按上限切分 |
| 过程可见 | 工具调用轮末汇总、模型重试、上下文压缩、超时中止都有提示 |
| 语音转写 | 直接用 QQ 平台自带的转写文本参与对话，不需要自己跑 ASR |
| 表情包 | 配置目录后模型可写 `[表情:名字]` 发图（受每轮张数约束） |
| 消息理解 | 图片送进模型（按文件头纠正 QQ 误标格式），文档/语音之外的附件给出明确提示 |
| 忙时策略 | 排队或插话可选，回执告知队位；单用户限流；单轮超时 |
| 身份库 | 成员存 `<stateDir>/members.json`，用 `/pair` 配对码加人、`/revoke` 移除，不必改配置重启 |
| 后台服务 | PID 身份校验、单实例锁、日志轮转、systemd / launchd 自启定义 |

## 要求

- Node.js ≥ 22
- 一个 QQ 开放平台的机器人：`AppID` 与 `AppSecret`
- 本机已配置好 pi 的模型与凭据（`pi` 能正常对话）

## 快速开始

```bash
npm i -g pi-qqbot

mkdir my-bot && cd my-bot
cp "$(npm root -g)/pi-qqbot/pi-qqbot.example.json" ./pi-qqbot.json
# 编辑 pi-qqbot.json：至少填 appId、appSecret
```

启动并确认连接：

```bash
pi-qqbot start      # 后台启动，等到「已连接 QQ 开放平台」才返回
pi-qqbot status     # PID、已运行时长
pi-qqbot logs 30    # 最近 30 行日志
```

第一次给机器人发消息时，它会回复自己的 openid 并说明加入方式（因为白名单还是空的）：

1. 把这串 openid 填进 `pi-qqbot.json` 的 `allow` 数组（或 `owner`）；
2. `pi-qqbot restart`；
3. 之后随时用 `/pair` 给其他人发配对码，不必再改配置。

## 配置

只有一个配置文件：**当前工作目录下的 `pi-qqbot.json`**。`PI_QQBOT_CONFIG` 可以指向别处。

- 未知字段直接报错，拼错的键不会被静默忽略；类型、枚举、取值范围都会校验。
- 路径支持 `~/` 展开；空字符串按「未配置」处理。
- 环境变量只留三个口子：`PI_QQBOT_CONFIG`（配置文件位置）、`QQBOT_APPID` / `QQBOT_SECRET`（供服务单元注入凭据，密钥不必落盘）。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `appId` / `appSecret` | 必填 | QQ 开放平台凭据 |
| `allow` | `[]` | 初始白名单（种子）；之后增删成员走身份库 |
| `owner` | `[]` | 管理员 openid；留空时 `allow` 里的人都是管理员 |
| `stateDir` | `~/.pi-qqbot` | 会话、身份库、日志、PID 的存放目录 |
| `cwd` | `<stateDir>/workspace` | agent 工作目录（它读写文件的范围起点） |
| `tools` | `read,ls,grep,find,edit,write,bash` | 可用工具白名单 |
| `model` / `thinking` | 空 | 模型 `provider/model` 与思考级别，留空沿用 pi 的设置 |
| `requireMention` | `true` | 群聊是否必须 @ 机器人才响应 |
| `streaming` | `true` | 私聊是否流式输出（群聊始终按切分发送） |
| `idleMs` | `1800000` | 会话闲置多久回收（只释放内存，历史保留） |
| `typing` | `true` | 私聊是否发送「正在输入」 |
| `markdown` | `false` | 用 Markdown 发送（需要平台开通权限） |
| `toolDisplay` | `summary` | `summary` 轮末汇总 / `live` 实时两行 / `off` 只报失败。失败始终提示 |
| `mode` | `queue` | 会话忙时新消息：`queue` 排队 / `steer` 插话 |
| `ratePerMinute` | `20` | 单用户每分钟消息上限，`0` 关闭 |
| `timeoutMs` | `1800000` | 单轮超时，超时中止并告知；`0` 关闭 |
| `replyLimit` / `replyTtlMs` | `5` / `300000` | 同一条触发消息的被动回复次数与窗口，超出改主动发送 |
| `chunkMode` / `paragraphLimit` | `chunk` / `3` | `paragraph` 把长回复按段落拆成多条气泡 |
| `stickerDir` / `stickerMax` | 空 / `1` | 表情包目录（png/jpg/gif/webp）与每轮最多张数 |
| `ignoreBots` | `true` | 忽略其它机器人的消息，避免两个 bot 互聊刷屏 |
| `groupReplyChance` | `0` | 群聊无人 @ 时的接话概率（0–1），`0` 关闭 |
| `injectTimestamp` | `true` | 每轮输入前注入当前时间 |
| `noReplyToken` | `NO_REPLY` | 模型输出该标记时本轮不回复 |
| `persona` | 空 | 全局人设补充；可用 `/persona` 按会话覆盖 |
| `debug` | `false` | 调试日志 |

后台服务相关（仅环境变量，不进配置文件）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PI_QQBOT_LOG_MAX_MB` | `5` | 启动前日志轮转阈值 |
| `PI_QQBOT_STOP_GRACE_MS` | `8000` | SIGTERM 后等多久再 SIGKILL |
| `PI_QQBOT_STATE_DIR` | 配置里的 `stateDir` | 覆盖状态目录（多实例/测试用） |

## 命令

`/help` 会按下面两组列出所有命令，并带上 `bot-` 前缀别名（如 `/bot-ping`）。

| 分组 | 命令 | 说明 |
| --- | --- | --- |
| 通用能力 | `/new`（`/reset`） | 开始新会话，清空上下文 |
| | `/compact` | 压缩会话历史 |
| | `/model [名称]` | 查看或切换模型 |
| | `/stop` | 中止当前任务 |
| | `/retry [force]` | 重发上一条；上一轮用过工具时需 `force` |
| | `/sessions` · `/resume <序号>` | 列出历史会话 / 切换过去 |
| 机器人能力 | `/status` | 模型、消息数、token、上下文占用、工具、技能 |
| | `/ping` | 网络传输与插件处理耗时 |
| | `/version` | 版本号 |
| | `/me` | 本对话的 openid 与会话键 |
| | `/persona [文本\|clear]` | 查看或设置本会话人设 |
| | `/reload` | 重新扫描技能与资源（上下文保留） |
| | `/help` | 命令列表 |
| 管理员 | `/pair [分钟]` | 签发配对码（默认 10 分钟，上限 24 小时） |
| | `/members` | 查看成员名单 |
| | `/revoke <openid>` | 移除成员（不能移除自己） |

## 后台服务

```bash
pi-qqbot start | stop | restart | status | logs [n] | install | uninstall | run | version
```

- `start` 派生脱离子进程，等到日志出现「已连接 QQ 开放平台」才返回；未就绪会打印日志尾部并非零退出。
- `stop` 先 SIGTERM，`PI_QQBOT_STOP_GRACE_MS` 后仍在则 SIGKILL。
- PID 记录带启动时刻与命令行，停止前核对身份——PID 被系统复用也不会误杀无关进程。
- 同一 `stateDir` 只允许一个实例；锁文件损坏时明确报错，不自动删除。
- `install` 在 Linux 写 `~/.config/systemd/user/pi-qqbot.service`，在 macOS 写 `~/Library/LaunchAgents/eu.pi-qqbot.plist`；Windows 打印需要手动注册的命令。

从源码运行：

```bash
npm install
npm run build            # tsc → dist/
npm run service -- start # 源码仓库里自动走 tsx src/main.ts，发布包里走 dist/
npm start                # 前台调试
npm run dev              # watch 模式
```

## 成员管理

成员保存在 `<stateDir>/members.json`，**加人减人都不用改配置、不用重启**。

- 首次启动把 `allow` 里的 openid 导入为种子成员；种子被移除后不会被再次导入。
- `/pair` 生成的 8 位码可以让多人先后加入，到期自动失效。
- `/revoke` 之后，撤销前签发的码无法把人加回来，需要重新 `/pair`。
- 被撤销的成员若还留着旧码，会收到「这个配对码已失效，请向管理员要新的码」。

## 会话与技能

- 会话键：私聊 `c2c:<用户 openid>`、群聊 `group:<群 openid>`、频道 `guild:<子频道 id>`、频道私信 `dm:<guild id>`；同一个人在不同容器里不会串上下文。
- 会话文件在 `<stateDir>/sessions/`，映射在 `<stateDir>/sessions.json`。
- 技能扫描 `~/.pi/agent/skills/`、`~/.agents/skills/`、`<cwd>/.pi/skills/`、`<cwd>/.agents/skills/`。新增技能后发 `/reload` 即可生效，上下文不丢。

## 安全

这个机器人能改文件、跑命令——白名单成员等于拿到本机 shell。因此：

- 只把可信的 openid 加进白名单；不确定就用 `/revoke` 移除。
- pi 不内置工具审批，本项目靠「白名单 + 独立工作目录 + 工具集收窄」控制风险，没有逐次确认。要更严就把 `tools` 收成 `read,ls,grep`。
- 凭据只放在本机的 `pi-qqbot.json`（已进 `.gitignore`）或服务单元注入的环境变量里，不要提交。
- 成员与配对码在 `<stateDir>/members.json`，`stateDir` 默认 `~/.pi-qqbot`，不在仓库内。
- 发包前跑 `npm run verify`；包内容白名单由 CI 的 `npm pack --dry-run` 校验。

## 隐私

- 凭据只放在本机 `pi-qqbot.json`（已进 `.gitignore`）或由服务进程的环境变量注入，不写入源码。
- 成员 openid、配对码、会话历史都在 `stateDir`（默认 `~/.pi-qqbot`），不在仓库里。
- 分享日志或提问前先自查：日志里有 AppID、openid 与会话内容；`/me` 回显的是完整 openid，必要时用前 6 位代替。
- 仓库内测试与文档统一使用合成 openid，不要粘真实值。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `✖ 缺少 appId` | 当前工作目录没有 `pi-qqbot.json`，或没填 `appId`；也可用 `QQBOT_APPID` 注入 |
| `已有实例在运行（PID …）` | 同一 `stateDir` 已有进程；`pi-qqbot stop` 或换 `stateDir` |
| `启动未就绪` + `Failed to get access_token` | AppID/AppSecret 不对，或机器人在开放平台被停用 |
| 群里发消息没反应 | 默认需要 @ 机器人；或该群 openid 未在名单里（先私聊配对） |
| 回复只有一半 | 长回复被切分；调 `chunkMode: paragraph` 或增大 `replyLimit` |
| 工具调用刷屏 | 设 `toolDisplay: "summary"`（默认已开） |
| 想让它在该群里偶尔接话 | 设 `groupReplyChance: 0.1`（上限 1） |

## 开发

```bash
npm run typecheck                 # tsc --noEmit
npm test                          # 19 个文件 138 项单测
npm run verify                    # typecheck + test + build
node --import tsx tests/integration-agent.ts    # 真实 pi 会话冒烟（需要本机模型可用）
node --import tsx tests/integration-reload.ts   # 技能重载与 /new 行为
```

代码结构：

| 路径 | 职责 |
| --- | --- |
| `src/cli.ts` | 命令行入口（`run`/服务子命令/`version`/`help`） |
| `src/main.ts` | 进程入口：读配置、单实例锁、PID 记录、装配路由与网关、信号处理 |
| `src/config.ts` | 配置读取与逐字段校验（JSON 为唯一来源） |
| `src/gateway.ts` | QQ 连接、中间件编排、身份闸门、命令分发、输入拼装 |
| `src/router.ts` | peer → 会话路由、并发合并、闲置回收、`/new` 重置、会话列表与切换 |
| `src/agent.ts` | pi 会话封装：事件翻译、排队/插话、看门狗、模型与状态查询 |
| `src/binder.ts` | agent 事件 → 渠道输出的状态机（含工具汇总、静默标记、表情标记） |
| `src/sink.ts` | 出站渲染：流式、切分、段落分条、Markdown、表情 |
| `src/reply-budget.ts` | 被动回复额度与窗口，超限降级为主动发送 |
| `src/chunker.ts` | 按 QQ 上限切分，代码块跨片补围栏 |
| `src/format.ts` | 工具行格式化、openid 脱敏 |
| `src/peers.ts` | 消息 → 会话键判定 |
| `src/media.ts` | 图片下载与 mime 纠正、语音转写、附件提示 |
| `src/members.ts` | 身份库：种子导入、配对码、撤销墓碑 |
| `src/stickers.ts` | 表情目录扫描与 `[表情:名字]` 解析 |
| `src/store.ts` | 原子写 JSON 映射（会话映射、人设） |
| `src/enqueue.ts` | 忙时排队/插话决策 |
| `src/watchdog.ts` | 单轮超时看门狗 |
| `src/service/` | 后台服务：PID 身份、锁、日志轮转、systemd/launchd 定义、CLI |
| `bin/pi-qqbot.js` | 发布包入口（薄封装，转 dist/cli.js） |
| `tests/` | 单元测试、真实链路脚本、测试替身与 fixture |

设计与踩坑记录在 `docs/wiki/`：架构决策见 [ADR-001](docs/wiki/decisions/adr-001-pi-qqbot-channel-bridge.md) 与 [ADR-002 npm 发行](docs/wiki/decisions/adr-002-npm-distribution.md)，实现现状见 [entities/pi-qqbot.md](docs/wiki/entities/pi-qqbot.md)，代码审查记录见 [queries/code-review-2026-11-27.md](docs/wiki/queries/code-review-2026-11-27.md)。

## 已知限制

- QQ `stream_messages` 仅私聊，群聊没有流式输出。
- 群聊回复只能落在被动回复窗口内（必须回复触发消息），主动推送需要平台开通主动消息。
- 默认纯文本发送；Markdown 渲染需要平台开通对应权限（`markdown: true`）。
- 同一 AppID 只跑一个实例；多账号要拆多个 `stateDir` 与配置文件。

## License

[MIT](./LICENSE) © 2026 ReachForStar

可自由使用、修改、分发与商用，保留版权声明与许可声明即可；软件按「现状」提供，不附带担保。
