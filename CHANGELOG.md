# 更新日志

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.1.0] - 2026-11-27

首个可用版本：把 pi agent 接到 QQ 私聊与群聊。

### 新增

- **会话桥接**：QQ 消息驱动 pi 会话，回复与工具活动回送 QQ；私聊按用户、群聊按群（频道按子频道）各一份独立会话，历史落盘、重启续接。
- **工具链**：默认 `read,ls,grep,find,edit,write,bash`，模型能改文件、跑命令。
- **流式与切分**：私聊实时刷新同一条消息（QQ 仅私聊支持 `stream_messages`）；群聊按 4500 字符切分，代码块不截断；`chunkMode: paragraph` 可把长回复拆成多条气泡。
- **过程提示**：工具调用轮末汇总（`🛠 工具调用 N 次：bash ×5、read`）、模型重试、上下文压缩、单轮超时；失败始终单独提示。
- **消息理解**：图片送进模型并按文件头纠正 QQ 误标的 `image/png`；语音直接用平台转写文本（`asr_refer_text`）；其它附件给出明确提示。
- **表情包**：配置 `stickerDir` 后模型可写 `[表情:名字]` 发图，受 `stickerMax` 约束。
- **忙时策略**：`mode: queue|steer` 排队或插话并回执队位；`ratePerMinute` 限流；`timeoutMs` 超时看门狗。
- **身份库**：成员存 `<stateDir>/members.json`，`/pair` 配对码加人（同一码可连续加多人、24 小时上限）、`/members` 查名单、`/revoke` 移除且旧码失效。
- **命令**：`/new` `/compact` `/model` `/stop` `/retry` `/sessions` `/resume` `/status` `/ping` `/version` `/me` `/persona` `/reload` `/help`（兼容 `bot-` 前缀别名）。
- **技能**：启动扫描 pi 的技能目录；`/reload` 重新扫描且保留上下文。
- **后台服务**：`pi-qqbot start|stop|restart|status|logs|install|uninstall`，PID 身份校验、单实例锁、日志轮转、systemd / launchd 自启定义。
- **配置**：单一 `pi-qqbot.json`（当前工作目录），逐字段校验、未知字段报错、`~/` 展开；凭据可由 `QQBOT_APPID` / `QQBOT_SECRET` 注入。
- **被动回复额度**：按触发消息计次与窗口，超限自动降级为主动发送。

### 说明

- 要求 Node.js ≥ 22；跑在本机的 pi 环境之上，模型与凭据由 pi 侧提供。
- pi 不内置工具审批，本项目以「白名单 + 独立工作目录 + 工具集收窄」控制风险。

[0.1.0]: https://github.com/ReachForStar/pi-qqbot/releases/tag/v0.1.0
