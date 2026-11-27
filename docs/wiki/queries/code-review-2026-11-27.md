---
title: 代码审查记录（ocr / 2026-11-27）
type: query
tags: [code-review, ocr, 缺陷, pi-qqbot]
created: 2026-11-27
updated: 2026-11-27
sources: []
status: active
---

# 代码审查记录（ocr / 2026-11-27）

## 审查范围与方法

- 工具：open-code-review v1.14.3（`ocr review --audience agent --from 43d7bfc --to HEAD --effort low`）。
- 覆盖：全部代码提交（`src/` 10 个模块、`tests/` 14 个文件、`scripts/restart.sh`），排除 `package-lock.json`、`docs/**`。
- 产出：37 条意见（1 security·high、7 bug·high、14 bug·medium、2 maintainability·medium、1 security·medium、1 test·medium、1 performance·medium，其余 low）。
- 说明：ocr 的 `code_search` 步骤因 `git grep` 正则报错被跳过（`isMember(|claim(...` 未转义），不影响主流程，仅少了跨文件引用线索。

## 需要修的问题（按严重度）

| 位置 | 严重度 | 问题 | 复核状态 |
| --- | --- | --- | --- |
| `src/gateway.ts:84` | security·high | 身份校验用 `peer.peerId`，群聊里这是**群 openid**：群里任何人发配对码会把整群写入名单，等价授权群内所有人执行 bash/edit/write；未授权提示也把群 openid 当「你的 openid」 | 读码确认 |
| `src/sink.ts:45` | bug·high | `void this.stream.update(text)` 无 `.catch()`，流式刷新失败会产生未处理拒绝，Node 默认直接退出进程，所有 peer 会话一起失效 | 读码确认 |
| `src/chunker.ts:37` | bug·high | 围栏跟踪多了 `buffer.length > 1` 条件：消息以代码块开头时（最常见）不跟踪围栏，跨片既不补闭合也不重开。实测 20 行代码块切成 5 片，中间 3 片无任何围栏 | 已复现 |
| `src/agent.ts:158` | bug·high | `prompt()` 抛错时不会收到 `agent_settled`，看门狗不解除；`dispose()` 也不 disarm。遗留定时器会误杀后续轮次并给用户错误提示 | 读码确认 |
| `scripts/restart.sh:19` | bug·high | pidfile 里的 PID 未校验身份就 `kill`，PID 被复用时会误杀无关进程 | 读码确认 |
| `tests/integration-{agent,reload}.ts` | bug·high | `mkdtempSync(join("tmp", ...))` 要求父目录存在，`tmp/` 在 `.gitignore` 里，干净检出时脚本直接 ENOENT；`integration-agent.ts` 还用 `stateDir.split("/")[1]` 反推清理路径（Windows 上为 `undefined`） | 读码确认 |
| `src/router.ts:59` | bug·medium | `sweep()` 只看 `lastUsed`（仅 `acquire` 时刷新）：跑得比 `idleMs` 久的一轮任务会被中途回收，`dispose()` 直接杀掉正在进行的对话 | 读码确认 |
| `src/router.ts:49` | bug·medium | `/new` 的 `reset()` 不处理在途 `pending`：创建会话期间发 `/new` 可能拿到旧会话或产生两个实例 | 读码确认 |
| `src/agent.ts:146` | bug·medium | `running` 只在异步 `agent_start` 里置位，同一 peer 相邻两条消息都可能读到 `false` 并各自 `prompt()`，第二条被 SDK 拒绝 | 读码确认 |
| `src/gateway.ts:132` | bug·medium | 每条消息新建 sink/binder，订阅只活到 `send` 返回：排队/插话消息的 binder 立即解除，导致文本混到上一轮、第二个 `StreamSink` 永不 `complete` | 读码确认 |
| `src/gateway.ts:120` | bug·medium | 以「原始附件非空」放行，但图片可能全部被跳过（非图片/下载失败），此时会以空 prompt 调 `send("")` | 读码确认 |
| `src/gateway.ts:106` | bug·medium | 成员闸门在命令分发之前：管理员若只配了 `PI_QQBOT_OWNER` 未进种子名单，或被 `/revoke`，将永远走不到 `/pair`，无法自助恢复 | 读码确认 |
| `src/binder.ts:59` | bug·medium | 定时间回调里 `void flushPending()` 脱离 catch：`sink.notice` 拒绝会变成未处理拒绝 | 读码确认 |
| `src/members.ts:136` | bug·medium | `load()` 对损坏 JSON 直接抛错，身份库被截断会让整个机器人起不来 | 读码确认（与 store 同样的权衡） |
| `src/commands.ts:153` | bug·medium | `/revoke` 允许管理员撤销自己：撤销后既不是成员也不是能签发的人，锁死 | 读码确认 |
| `src/commands.ts:123` | security·medium | `/pair` 的 TTL 无上限，`/pair 100000` 会签出约 69 天有效的码 | 读码确认 |
| `src/peers.ts:16` | bug·medium | `guild`/`dm` 落进 `c2c` 分支，同一用户在私聊与频道间共用一份会话 | 待核验（取决于 QQ 是否投递 guild/dm） |
| `src/media.ts:40` | performance·medium | `fetch` 无超时/AbortSignal，慢附件会阻塞整轮 | 读码确认 |

## 判定有误的意见

- `src/commands.ts:90`「判空分支不可达，`npm run typecheck` 会失败」：**不成立**，`npm run typecheck` 全绿。`ctx.eventTime` 是可变对象属性，TS 不做跨行收窄。同一意见里的「时钟偏斜会输出负延迟」成立，值得改。

## 低优先（记录不修）

日志无轮转（`bot.log` 可涨到 GB）、`.pi-qqbot` 默认 umask、`vitest.config.ts` 不在 `tsc include` 内、嵌套三元、`previewToolResult` 求值两次、`splitList` 解析两次、4500 与 `TEXT_LIMIT` 两份常量、测试替身返回值与真实文案完全一致导致断言自证。

## 修复结果（同日完成，含 18 条 medium）

| 问题 | 处理 |
| --- | --- |
| 群身份错用群 openid | 身份校验统一用 `message.author.id`；`peerKey` 只决定会话上下文。频道/频道私信新增独立 scope（`guild`/`dm`） |
| 未授权提示暴露完整 openid | 新增 `maskOpenid()`，对话里只留头 6 位与后 4 位 |
| 流式刷新未处理拒绝 | `StreamSink.update/finish` 全部 `.catch()`，最终内容仍由 `finish` 兜底 |
| chunker 围栏首行漏跟踪 | 去掉 `buffer.length > 1` 条件；新增「消息以代码块开头」用例（此前的实测 bug 已固化） |
| 看门狗不解除 | `prompt()` 抛错与 `dispose()` 都 disarm |
| `sweep()` 回收运行中会话 | 跳过 `backend.isRunning` |
| `/new` 与在途创建冲突 | `reset()` 先 await `pending` 再丢弃 |
| `send` 并发穿透 | 后端内 `chain` 串行化，忙判断与提交不再交错 |
| binder 订阅生命周期 | 每个 peer 一份常驻 turn（sink+binder），`settled` 后回收；排队消息复用同一路流式 |
| 空 prompt | 先算 `images`，`!text && images.length === 0` 直接返回 |
| 管理员闸门死锁 | 启动时把 `PI_QQBOT_OWNER` 补进身份库，闸门同时放行 owner |
| 定时器内未处理拒绝 | `flushPending().catch()` |
| 身份库损坏起不来 | 备份为 `members.json.corrupt-<ts>` 后按空库启动并告警 |
| `/revoke` 自锁 | 禁止移除自己 |
| `/pair` TTL 无上限 | 上限 24 小时 |
| `guild`/`dm` 落进 c2c | 独立 scope，会话键带频道 id |
| 附件下载无超时 | `AbortSignal.timeout(15s)`，失败只跳过该附件 |
| `/ping` 负延迟与冗余判断 | 直接算 `receivedAt - eventTime` 并钳到非负 |

顺带（原 low 项）：`gateway` 复用 `TEXT_LIMIT` 常量，不再重复写 4500。

## 验证

- `npm test`：14 文件 93 项通过（新增：代码块开头的切分、频道/频道私信 peer、openid 脱敏、禁止撤销自己、TTL 上限、`sweep` 跳过运行中、`/new` 等在途、身份库损坏备份）。
- `tsc --noEmit` 无错误；两个真实链路脚本（agent / reload）回归通过，且清理放进 `finally`。
- 实例重启后 READY，身份库仍 2 人，白名单与模型不变。

## 未修（原 low 项）

`bot.log` 无轮转、`.pi-qqbot` 默认 umask、`vitest.config.ts` 不在 `tsc include` 内、`formatToolLine` 的嵌套三元、`splitList` 解析两次、测试替身返回值自证。
