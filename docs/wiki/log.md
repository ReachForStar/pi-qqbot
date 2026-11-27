# 知识库操作日志

> 最新记录在最上方。

## [2026-11-27] 修首次配置死路并重写快速开始

- 发现真实缺陷：未授权提示里的 openid 被 `maskOpenid` 脱敏，新装用户拿不到完整标识，而 `/me`、`/pair` 又要求已在名单内 —— 首次配置没有任何可行路径。改为私聊回完整「你的 openid」、群聊回完整「本群的 openid」（本人/本群标识，不属于第三方泄漏）。
- 配套：`/members` 名单脱敏（群里执行不暴露彼此），`/revoke` 支持按序号移除；文案由 `format.ts#unauthorizedText` 生成，新增 2 项测试。
- README 快速开始重写为 6 步（先决条件 → 安装 → 建配置 → 启动 → 首次进名单 → 群聊 → 日常），并给出实测过的失败样例 `Failed to get access_token: {"code":10004,"message":"机器人不存在"}` 与常见问题对应行。
- 实测：干净目录安装 `pi-qqbot@0.1.3` 后 `status` / `version` / 缺配置报错 / `start` 失败输出逐一核对；本地实例已重启（PID 3054076）跑新代码。
- 新踩的坑记入实体页：service CLI 优先执行 `dist/main.js`，只改 src 不 build 会重启成旧代码。
- 发布 0.1.4（含上述修复与文档）。

## [2026-11-27] 徽标对齐 pi-weixin-bridge 并发布 0.1.3

- 查明版本徽标是橙色而非蓝色：shields.io 的 `npm/v` 按语义化版本上色，0.x 一律橙色、≥1.0 才蓝色（实测 `ms` 蓝、`wtfnode` 橙、`tinygrad` 橙），不是错误。
- README 徽标改为四枚并与 `pi-weixin-bridge` 对齐：版本 `?color=blue`、`License-MIT-yellow`、`Node-%3E%3D22-339933`；许可证校验脚本升级为 `scripts/check-package-meta.sh`，同时校验 `license`、`engines.node` 与 README 里三枚徽标写法是否存在（实测改 engines、删徽标都会失败）。
- 发布 0.1.3：CI 三任务绿；Release 任务 3m55s 成功（registry 生效慢，靠 10 分钟轮询等到位），`latest` 指向 0.1.3，徽标 URL 实取到 blue / yellow / #339933。

## [2026-11-27] 修徽标报错并发布 0.1.2

- 现象：npm 页面许可证徽标显示 `package not found`。根因是 `img.shields.io/npm/l/pi-qqbot` 在 0.1.1 被 npm 暂存期间查不到包，而 shields 对错误结果缓存 4 小时（`cache-control: max-age=14400`）。
- 修法：徽标改为静态 `badge/license-MIT-green`，并新增 `scripts/check-license.sh`（`package.json.license` 必须为 MIT、`LICENSE` 必须含 MIT 全文）挂进 CI 与发布流程，保证静态声明不会与实际授权漂移。
- 发布：0.1.2 首发时「可见性回查」只等 2 分钟就失败（registry 实际约 3.5 分钟才生效），且 `npm stage list` 在 runner 的 npm 上不存在。改为轮询最多 10 分钟、发布步骤容忍 409「previously published/staged」、`npm stage` 命令存在才调用；重跑成功建出 Release。
- 结果：`pi-qqbot@0.1.2` 为 latest，Release v0.1.1 与 v0.1.2 均在；下载已发布 tarball 核对：README 徽标正确、`license: MIT`、`LICENSE` 在包内、`src/tests/docs` 未入包。
- CI 与 Release 运行均 success。

## [2026-11-27] 发布 0.1.1 到 npm

- 首次打 `v0.1.0` 失败：npm 上该版本曾被他人发布后撤回，版本号不可复用 → 改版本号 0.1.1（CHANGELOG 保留说明）。
- 第二次发现 npm 的「暂存发布」行为：账户要求 2FA 而 token 无法完成验证时，`npm publish` 返回 0 但版本只进暂存区（registry 里只留 `0.0.0-stage` 占位），对外不可见。当时 CI 仍建了 GitHub Release，属误报。
- 修 CI：发布后回查 `npm view pi-qqbot@<version>`（最多 20×6 秒），拿不到就失败并打印 `npm stage list`；发布步骤改为幂等（已存在则跳过上传），重跑可直接补 Release。
- 最终结果：`pi-qqbot@0.1.1` 已上线（`latest`），GitHub Release `v0.1.1` 带 CHANGELOG 抽取的说明；干净目录实测 `npm install pi-qqbot@0.1.1` 后 `pi-qqbot version` 返回 `v0.1.1`。
- 遗留：registry 的 `versions` 里仍有 `0.0.0-stage` 占位（npm 暂存机制的产物），不影响安装。

## [2026-11-27] 完善 CI 并加入发布流程

- CI 增 macOS 任务（`ps` 进程身份与 launchd 定义渲染需要真机验证）+ 版本号格式检查；三个任务（22 / 24 / macos）全绿。
- 新增 `.github/workflows/release.yml`：推 `v*` 标签触发；校验标签与 `package.json` 版本一致 → `npm run verify` → 包内容白名单 → 从 `CHANGELOG.md` 抽取本版段落作发布说明 → `npm publish --provenance` → `gh release create`。支持 `workflow_dispatch` + `dry_run` 演练。
- 新增 `CHANGELOG.md`（Keep a Changelog 格式，0.1.0 完整条目），`files` 白名单补 `CHANGELOG.md`。
- README 增「发布流程」：改版本号 → 写 CHANGELOG → 打标签推送；并说明本地发布与手动演练。
- 实测：`workflow_dispatch` 演练（`v0.1.0`、`dry_run=true`）通过，发布说明成功从 CHANGELOG 抽出「首个可用版本…」，`npm publish --dry-run` 未上传。
- 待办：仓库还没有 `NPM_TOKEN` secret，真正发布会停在那一步；`gh secret set NPM_TOKEN` 后打标签即可。

## [2026-11-27] 删库重建以清除历史隐私

- 旧仓 44 个提交里有 10 个提交残留真实 openid，全部提交带个人 QQ 邮箱；新仓改用单提交重建。
- 做法：`git checkout --orphan` 生成单提交（78 个文件）→ `gh repo delete` → `gh repo create` → 推送 `clean-main:main`；提交作者改用 GitHub noreply（`58105458+ReachForStar@users.noreply.github.com`），并写进本仓库的 `user.email`。
- 旧历史只保留本地 `legacy-backup` 分支，不推送；确认远端 `commits` 长度 1、默认分支 `main`、抽查文件无 openid/AppID/邮箱/model 前缀。
- CI 在新仓首跑 success（19s）。

## [2026-11-27] 隐私扫描

- 扫描当前树 + 全部 42 个提交：无 AppSecret、无本机路径与用户名、无 token。
- 已修：wiki 里的 AppID 与内部模型名脱敏；测试中的真实 openid 换成合成值；示例配置的 `model` 置空。
- 旧仓历史里残留真实 openid 与个人邮箱，经所有者决定改为删库重建：新仓只有 1 个初始化提交，作者邮箱改 GitHub noreply，旧历史仅存本地 `legacy-backup` 分支不推送。
- 新增 `queries/privacy-audit-2026-11-27.md`，README 增「隐私」小节。

## [2026-11-27] 重写 README

- 结构重排：特性表 → 要求 → 快速开始（含首次授权流程）→ 配置（JSON 全量表格 + 仅环境变量的三项）→ 命令分组表 → 后台服务 → 成员管理 → 会话与技能 → 安全 → 常见问题 → 开发（脚本 + 22 个路径的结构表）→ 已知限制 → License。
- 修掉的问题：`src/config.ts` 在结构表里重复出现两次且描述过时、`安装` 与 `安装与配置` 两节重复、命令散落在「能力」列表里、`npm run service` 与 `pi-qqbot` 两套调用方式混写、`allow`/`owner`/`toolDisplay` 被当成环境变量描述。
- 新增：常见问题表（缺配置、重复实例、token 失败、群里不响应、回复被切、工具刷屏、概率接话）、会话键规则、首次授权流程、`pi-qqbot --help` 措辞改为「当前工作目录」。
- 校验：README 内部链接全部有效；`npm test` 19 文件 138 项通过。

## [2026-11-27] 建仓库并打通 CI

- 用 `gh repo create` 建了 public 仓库 <https://github.com/ReachForStar/pi-qqbot>，`main` 分支推送 39 个提交。
- 新增 `.github/workflows/ci.yml`：Node 22/24 矩阵，`npm ci` → typecheck → test → build → `npm pack --dry-run` 校验包内容白名单。
- 首轮 CI 在 Node 20 上失败：vitest 5 用到 `Map.groupBy`（Node 22+），测试进程直接崩。改为 22/24，`engines.node` 同步 `>=22`，README 注明。
- action 从 v4 升到 v7，消除 Node 20 弃用告警。最终两次运行均绿（22/24 各 16–19 秒）。
- 泄漏检查：`git log --all -- .env` 为空、历史搜不到 appSecret 真值、测试里的真实 openid 已换成合成值。

## [2026-11-27] npm 发布前演练

- 登录态已存在：`npm whoami` 返回 `reachforstar`，registry 为 `https://registry.npmjs.org/`，不需要重新 `npm login`。
- `npm publish --dry-run` 走完整生命周期：`prepublishOnly` → typecheck → 138 项测试 → build，退出码 0。
- 发布动作（`npm publish`）对外且版本不可覆盖，等用户确认后执行。

## [2026-11-27] 准备发布到 npm

- 新增 `tsconfig.build.json`（`dist`、声明文件、`.ts` 导入改写成 `.js`）与 `bin/pi-qqbot.js` 薄封装；`package.json` 补 `bin`/`main`/`exports`/`files`/`engines`/`license`/`publishConfig` 与 `verify`、`prepublishOnly` 脚本。
- 重构 CLI：`src/cli.ts` 统一入口（`run|start|stop|restart|status|logs|install|uninstall|version|help`），`src/service/cli.ts` 承载服务逻辑并优先派生 `dist/main.js`。
- 配置默认路径改为 `process.cwd()/pi-qqbot.json`：全局安装后包目录只读，配置必须跟工作目录；`service start` 与 systemd/launchd 定义的 `WorkingDirectory` 同样改用 cwd。
- 修 `service` 子命令把配置错误打成堆栈的问题（`readSettings()` 移进 try）。
- 实测：`npm run verify` 通过（19 文件 138 项）、`npm pack` 产出 59 个文件（仅 dist/bin/示例/README/LICENSE）；在干净目录安装 tarball 后 `npx pi-qqbot version|--help` 正常，无配置时给友好错误，假凭据 `start` 能派生 `dist/main.js` 并打印启动配置与 token 失败原因。
- 记录决策：`decisions/adr-002-npm-distribution.md`。发布动作（npm login/publish）待用户执行。

## [2026-11-27] 后台服务 + 配置改 JSON 文件

- 配置从 `.env` 改为 `pi-qqbot.json`：逐字段校验、未知字段报错、`~/` 展开；环境变量只留 `PI_QQBOT_CONFIG` 与 `QQBOT_APPID/SECRET` 两个口子。已迁移现有凭据与白名单，`.env` 删除，示例换为 `pi-qqbot.example.json`。
- 新增后台服务层（参考 `ReachForStar/pi-weixin-bridge`）：PID 记录带进程身份（`ps` 固定 TZ/LC_ALL）、单实例锁、日志轮转、SIGTERM 宽限期后强杀、systemd/launchd 定义生成。
- 新增 CLI：`npm run service -- start|stop|restart|status|logs|install|uninstall`；`src/main.ts` 启动即加锁写 PID，退出释放；`scripts/restart.sh` 改为转发。
- 修复：`spawn` 用 `stdio: "inherit"` 时子进程持有调用方管道，导致 `| tail` 卡住不发 EOF —— 改为子进程直接写日志文件描述符。
- 测试：19 文件 138 项通过（新增 `service-units`、`service-pid`（含锁回收/损坏锁/轮转）、`service-daemon`（真实子进程启停、重复启动拒绝、日志轮转），配置测试重写为 JSON 文件用例）；`tsc --noEmit` 无错误。
- 真实验证：`service restart` 停止→启动→就绪约 2 秒，日志与 PID 正常；`status` 显示 PID 与运行时长。

## [2026-11-27] 落地 fork 调研里的可借鉴能力

- 新增模块：`reply-budget.ts`（被动回复额度与窗口）、`stickers.ts`（表情包）。
- 新增能力：语音转写（`asr_refer_text`）、分条发送（paragraph 模式）、群聊概率接话、`/retry`、`/sessions` + `/resume`、`/persona` 每会话人设、时间戳注入、`NO_REPLY` 静默、忽略其它 bot、openid 脱敏（上一轮已做）。
- 配置新增 11 项：`REPLY_LIMIT`、`REPLY_TTL_MS`、`CHUNK_MODE`、`PARAGRAPH_LIMIT`、`STICKER_DIR`、`STICKER_MAX`、`IGNORE_BOTS`、`GROUP_REPLY_CHANCE`、`INJECT_TIMESTAMP`、`NO_REPLY`、`PERSONA`。
- 测试：16 文件 118 项通过（新增 `reply-budget`、`stickers`、语音转写、段落分条、额度降级、NO_REPLY、表情标记、`/retry`、`/sessions`、`/persona`，以及基于真实会话文件的 `listSessions`/`switchTo`）；`tsc --noEmit` 无错误。
- 真实验证：`/sessions` 在 `.pi-qqbot/sessions` 上列出 5 条历史会话；实例重启 READY。
- 未采纳：会话树分支版重生成（用「重发上一轮」替代）、per-conversation persona 的交互式菜单 UI。

## [2026-11-27] 修复 ocr 审查问题（1 security·high + 6 high + 18 medium）

- 安全：身份校验改用发送者 openid（原来是群 openid，等于认领一次授权整群）；未授权提示与 `/revoke` 回复做 openid 脱敏。
- 稳定性：流式刷新与定时刷新的拒绝全部兜住（原来会让进程退出）；看门狗在 `prompt()` 异常与 `dispose()` 时解除；`sweep()` 跳过运行中会话；`/new` 等待在途创建；`send` 串行化；身份库损坏时备份后空库启动。
- 正确性：代码块开头的围栏跟踪（实测 bug 已修）、`guild`/`dm` 独立会话键、附件下载 15s 超时、`/pair` TTL 上限 24h、禁止撤销自己、`/ping` 负延迟。
- 结构：每个 peer 一份常驻 turn（sink+binder），排队消息不再另开一路流式；空输入直接返回。
- 测试：14 文件 93 项通过；`tsc --noEmit` 无错误；两个真实链路脚本回归通过（清理移入 `finally`）。
- wiki：`queries/code-review-2026-11-27.md` 补「修复结果」与验证记录。

## [2026-11-27] 调研 dsh-qqbot 活跃 fork

- 77 个 fork 中挑 2026-10-29 后有推送的 47 个逐个 compare，得 17 个有独立提交。
- 主题集中在两条线：平台边界修补（`xuan25` 37 个提交，被动回复 TTL/限频/reply limiter 最系统）与人格化改造（`495258544` 59 个、`yjrqz777` 64 个）。
- 对 pi-qqbot 可用清单按价值排序：被动回复窗口与限频、语音转写（附件自带 `asr_refer_text`）、表情包 `[表情:名]`、分条发送、引用回复、openid 脱敏、群聊概率接话、`/retry`、`/sessions`、每会话人设覆盖、时间戳注入、NO_REPLY、bot 消息门禁。
- 新增 wiki：`sources/dsh-qqbot-forks-survey.md`（含可移植性判断与落点）。具体采纳范围待用户选定。

## [2026-11-27] ocr 代码审查

- 用 open-code-review v1.14.3 审查全部代码提交（`--from 43d7bfc --to HEAD`，排除 lock 与 docs），得 37 条意见。
- 复核后确认 1 条 security·high（群聊身份错用群 openid，等于授权整群）、6 条 bug·high（流式未处理拒绝、chunker 围栏首行漏跟踪已实测复现、看门狗不 disarm、pidfile 误杀、测试脚本 tmp 父目录、清理路径反推）。
- 另有 18 条 medium 需处理（router 回收在途会话、`/new` 并发、binder 订阅生命周期、空 prompt、管理员闸门死锁、`/revoke` 自锁等）。
- 判定 1 条意见有误：`src/commands.ts:90` 的「类型检查会失败」不成立（typecheck 全绿），但同条里的负延迟问题成立。
- 新增 wiki：`queries/code-review-2026-11-27.md`（含复核状态与修复顺序）。修复待用户确认后执行。

## [2026-11-27] 工具调用改为轮末汇总

- 问题：一轮任务十几次工具调用会产出二三十条消息，把对话本身冲掉。
- 改法：`PI_QQBOT_TOOL_DISPLAY=summary|live|off`，默认 `summary` —— 轮末一条 `🛠 工具调用 N 次：bash ×5、read，耗时 12.4s`；`live` 保留逐条但按 2.5s 窗口合并、单条最多 6 行，超出折成「… 另有 N 行」；失败始终立即单独提示。
- 兼容：旧的 `PI_QQBOT_SHOW_TOOLS=false` 等价于 `off`，不必改 `.env`。
- 验证：真实会话汇总出 `🛠 工具调用 1 次：ls`；测试 14 文件 84 项通过（binder 覆盖 summary/live 合并/live 折叠/off/失败优先）；`tsc --noEmit` 无错误。

## [2026-11-27] 过程提示与单轮超时

- 新增事件渲染：重试（`⟳ 第 n/m 次重试`）、压缩（`⏳/✅`）、超时（`⏱ 已中止本轮`）。重试与压缩直接映射 pi 的 `auto_retry_start`、`compaction_start/end`。
- 新增 `src/watchdog.ts`：`send()` arm、`agent_settled` disarm、到点先提示后 `abort()`；`PI_QQBOT_TIMEOUT_MS` 默认 30 分钟，0 关闭。
- 修 `/compact` 在小会话上直接把 pi 的 `Nothing to compact (session too small)` 抛给用户的问题，改为「当前会话太短，无需压缩」。
- 真实验证（`tmp/verify-notices.ts`，跑完即删）：压缩事件渲染出 `⏳ 正在压缩上下文` / `✅ 压缩完成`，`compact()` 返回友好文案而非异常。
- 测试：14 文件 80 项通过（新增 `watchdog.test.ts` 4 项含 fake timers、binder 新增三事件用例、配置项）；`tsc --noEmit` 无错误。

## [2026-11-27] 身份库与配对码取代静态白名单

- 新增 `src/members.ts`：`members.json` 身份库，种子导入 / 配对码签发与认领 / 撤销墓碑 / 原子写。
- 命令：`/pair [分钟]`、`/members`、`/revoke <openid>`，仅管理员可用；未获授权的人发消息会收到自己的 openid 与加入方式。
- 撤销语义：签发与撤销共用一个单调序号，撤销前签发的码不能把人加回来（第一版按毫秒比较，同毫秒撤销+发码会误判，已改）。
- 首次启动把 `.env` 的 `PI_QQBOT_ALLOW` 导入身份库：实测生成 `members.json`，两条种子成员，`nextSeq: 1`，启动日志「身份库：2 人，管理员 2 人」。
- 移除不再使用的 `isAllowed()`（白名单判断已由身份库接管）。
- 测试：13 文件 75 项通过（新增 `members.test.ts` 8 项，含持久化与撤销后重授权）；`tsc --noEmit` 无错误。

## [2026-11-27] 参考 dsh-qqbot 补齐命令族与忙时处理

- 命令表重构：`agent`（`/new /compact /model /stop`）与 `qqbot`（`/status /ping /version /me /reload /help`）两组，保留 dsh-qqbot 的 `bot-` 前缀别名；`/help` 分组渲染。
- `/ping` 用 QQ 事件时间与网关接收时间拆出网络传输与插件处理耗时；`/version` 读 package.json 避免第二份版本号。
- 忙时处理：`PI_QQBOT_MODE=queue|steer` 决定 `followUp` 还是 `steer`，并回执队位；队列长度取自 pi 的 `queue_update`。
- 限流：SDK `rateLimiter`（`PI_QQBOT_RATE_PER_MINUTE`，默认 20，0 关闭），超限回一句提示。
- 非图片附件：回执「已收到 N 个暂不支持的附件」，不再静默丢弃。
- 测试：12 文件 67 项通过（新增 `enqueue`、`describeSkippedAttachments`、配置项与命令用例）；`tsc --noEmit` 无错误；实例重启 READY。

## [2026-11-27] 工具行补全参数、耗时与结果摘要

- 结束行原本只有失败提示，成功调用等于没有反馈。现在 `tool_end` 事件带 `durationMs` 与 `preview`（结果首段文本），渲染为 `✓ bash（812ms）: 结果摘要`，失败为 `✗`。
- 开始行保留 `▸ bash: ls -la`（工具名 + 关键参数摘要，`command`/`path`/`pattern`/`url` 等优先，取不到退化成 JSON）。
- 真实会话验证：`▸ ls: <path>` → `✓ ls（3ms）: (empty directory)`。
- 测试：`formatToolResult` 用例与 binder 用例更新，11 文件 57 项通过。

## [2026-11-27] 出站能力完善

- 拆分模块：`sink.ts`（流式/切分/Markdown）、`peers.ts`（peer 判定与白名单）、`media.ts`（图片下载）、`format.ts`（工具行）。
- 新能力：工具调用行带参数摘要（`▸ bash: ls -la`）、私聊「正在输入」（`typingIndicator`）、可选 Markdown 发送、图片单附件失败只跳过不中断。
- 新增配置：`PI_QQBOT_SHOW_TOOLS`、`PI_QQBOT_TYPING`、`PI_QQBOT_MARKDOWN`；`/status` 增加工作目录、运行状态、上下文百分比、技能名单。
- 测试：11 个文件 54 项通过，其中 `media.test.ts` 用本地 HTTP 服务器 + 真实 `fetch` 验证下载/纠正/上限/失败跳过，`sink.test.ts` 用最小 bot 替身验证切分与 Markdown 分支。
- 两个真实链路脚本回归通过；实例已重启并 READY。

## [2026-11-27] 修技能未加载 + 新增 /reload

- 根因：自定义 `resourceLoader` 时 `createAgentSession()` 不会替你加载资源，首版漏了 `await resourceLoader.reload()`，导致技能数恒为 0（提示模板、主题、项目扩展同样为空）。
- 修复后真实技能数 44；新增 `<cwd>/.pi/skills/` 下的技能后 `/reload`（`AgentSession.reload()`）可重新扫描到 45 个，且会话历史保留、会话文件不变；`/new` 仍清空上下文。
- `/status` 增加技能数量与名单，便于确认跑了哪些技能。
- 测试 34 项通过（`/reload` 命令用例 + 假后端补 `reload`），`tsc --noEmit` 无错误；`tests/integration-reload.ts` 实测通过。

## [2026-11-27] 白名单扩容与单实例启停脚本

- 白名单加入第二个 openid（私聊用户与群 openid 共用一个集合，值不入库）。
- `src/main.ts` 启动时打印生效配置（AppID、白名单数量、模型、思考级别、工具集），便于排查「改了没生效」。
- 新增 `scripts/restart.sh`：停旧进程 → 起新进程 → 轮询日志等 READY，单实例切换不再靠手工 kill；踩坑记录：脚本里的 `pgrep` 必须写成 `[n]ode ...`，否则匹配到自身命令行把执行者杀掉。
- 验证：脚本执行后只有一个 `node --import tsx src/main.ts`，启动日志显示白名单 2 个、模型 `qwen3.8-flash-next-iq3_s`、思考 low，gateway READY。

## [2026-11-27] 流式慢的定位与修复

- 定位：用生产代码路径跑基准，首字延迟主要由模型造成——`ds-router` + high 为 4876ms/6578ms，换 `qwen3.8-flash-next-iq3_s` 后 237–290ms/1.2–1.5s；桥接层只有流式刷新间隔的 200ms 级影响。
- 修复：新增 `PI_QQBOT_MODEL` 与 `PI_QQBOT_THINKING` 两个配置项（含 `matchModel()` 匹配与失败即报错）、流式刷新间隔 500ms → 300ms、`/model` 复用同一匹配函数。
- 验证：`npm test` 7 文件 33 项通过；`tsc --noEmit` 无错误；重启后日志显示「模型 &lt;provider/model&gt;，思考 low」并 READY。
- 运维侧记录：两个实例写同一份日志会混淆（本次重启时出现过），启动脚本应保证先停旧实例。

## [2026-11-27] 首条真实 QQ 消息跑通

- 将用户 openid 写入 `PI_QQBOT_ALLOW`（值不入库），重启后私聊实测：两条消息均完成「入站 → 白名单放行 → 会话 → 工具调用 → 回复发送（接口 200）」，第二条在首条运行中排队。
- 发现并记录两个运维陷阱：改 `.env` 必须重启进程；同一 AppID 双实例会同时拿到 READY 并争抢消息（本次已停旧进程再起新进程）。
- 已知粗糙点：回复用纯文本，模型的 Markdown 标记原样显示。
- 更新 `entities/pi-qqbot.md`：补真实往返验证、运维小节、未验证项收缩到群聊与图片。

## [2026-11-27] 实现 pi-qqbot 首版（方案 A）

- 新增代码：`src/`（config、gateway、router、agent、binder、chunker、store、commands、main）与 `tests/`（6 个测试文件 27 项 + 真实会话冒烟脚本）。
- 契约分层：`src/types.ts` 定义 `AgentBackend` 与 `Sink` 两个接口，渠道侧与 agent 侧互不引用对方的库。
- 真实验证：QQ 开放平台取 token → WebSocket READY；真实 pi 会话完成 prompt → 工具调用 → 流式文本 → 会话文件落盘 → 同文件恢复；`tsc --noEmit` 无错误；`npm test` 全部通过。
- 新增 wiki：`entities/pi-qqbot.md`；`decisions/adr-001-pi-qqbot-channel-bridge.md` 补「实现与验证」节。
- 未验证项已登记在实体页：真实 QQ 消息入站往返、图片入站端到端、群聊限频表现。

## [2026-11-27] pi agent 接入 QQ Bot 的桥接方案

- 验证 pi 1.6.1 三种接入边界：SDK 进程内、RPC 子进程、扩展；确认扩展无法发起 run（`ExtensionContextActions` 无提交消息入口）。
- 实机探测：`createAgentSession({ sessionManager: SessionManager.inMemory(), tools: [] })` + `prompt()` 返回预期文本，事件序列为 `agent_start → turn_start → message_start → message_update → message_end → turn_end → agent_end → agent_settled`；记录副作用：SDK 默认继承 `~/.pi/agent` 资源，TUI 类扩展在无界面环境报错。
- 确认 QQ 侧 `qqbot-nodejs` 已覆盖传输、中间件、限流、@ 门控、C2C 流式、生命周期。
- 新增 wiki：`entities/pi-coding-agent.md`、`decisions/adr-001-pi-qqbot-channel-bridge.md`。
- 结论：采用进程内 SDK 桥接；模块为 `config/gateway/router/binder/commands`，扩展只承担工具权限门与 QQ 专用工具。待用户选定范围与提供凭据后进入实现。

## [2026-11-27] 调研 tencent-connect/dsh-qqbot 与组织仓库

- 采集 dsh-qqbot 仓库元数据、README、目录树、`package.json`、`cordis.yml` / `cordis.patch.yml`、`CHANGELOG`、提交与贡献者数据。
- 采集 tencent-connect 组织 13 个仓库清单，补齐 `qqbot-nodejs`、`openclaw-qqbot`、`qqbot-agent-sdk`、`tencent-channel-community` 的定位信息。
- 新增 raw 材料：`raw/references/dsh-qqbot-readme-zh.md`、`raw/references/tencent-connect-org-repos.md`。
- 新增 wiki：`entities/dsh-qqbot.md`、`entities/tencent-connect-org.md`、`concepts/qqbot-channel-plugin.md`、`sources/dsh-qqbot-readme.md`、`sources/tencent-connect-org-snapshot.md`。
- 结论：dsh-qqbot 是 Cordis 插件形态的渠道适配层，不改进型 agent loop；组织已完成从 QQ 频道 SDK 到「API v2 协议 SDK + 宿主插件」的重心转移。可复用骨架见 concept 页。
