---
title: 隐私扫描记录（2026-11-27）
type: query
tags: [隐私, 安全, 审计, npm, 公开仓库]
created: 2026-11-27
updated: 2026-11-27
status: active
---

# 隐私扫描记录（2026-11-27）

仓库已公开（`ReachForStar/pi-qqbot`，public），因此同时扫描当前文件与全部 42 个提交。

## 扫描方法与范围

| 类别 | 方法 |
| --- | --- |
| 凭据与密钥 | `git grep` 搜 `appSecret` 真值、`access_token`、`Bearer`、`ghp_`、`npm_`、`sk-`、`BEGIN RSA/OPENSSH`、`password` |
| 用户标识 | 搜真实 openid（前 8 位）、AppID、邮箱 |
| 本机痕迹 | 搜 `/home/<user>`、项目绝对路径、默认用户名 |
| 全历史 | 对 `git rev-list --all` 每个提交重复上述检索，确认问题是否已进入公开历史 |
| 包内容 | `npm pack --dry-run` 的文件白名单 |

## 结果

| 项 | 位置 | 状态 |
| --- | --- | --- |
| AppSecret 真值 | 从未进入仓库（`.env` 与 `pi-qqbot.json` 均未提交） | 干净 |
| 本机绝对路径 / 用户名 | 当前文件与全历史均无 | 干净 |
| 邮箱 / IP / 主机名 | 当前文件无（提交者邮箱见下） | 部分 |
| 真实 openid | `tests/format.test.ts` 的 **10 个历史提交** | 已修复当前版本；历史通过删库重建清除 |
| AppID | `docs/wiki` 2 处 | 已脱敏为 `<APPID>` |
| 内部模型标识（推理网关的 provider 前缀与路由名） | wiki、示例配置、测试 | 已脱敏为 `vendor/family/fast-model` 等中性名称 |
| 提交者邮箱（个人 QQ 邮箱） | 旧仓的全部 42 个提交 | 已通过删库重建清除；新提交改用 GitHub noreply 地址 |

## 处理

已完成：当前树里的 AppID、内部模型名、测试中的真实 openid 全部脱敏；`pi-qqbot.example.json` 的 `model` 改成空串（留空表示沿用 pi 设置）。

旧仓（含真实 openid 与个人邮箱的历史）已按所有者决定删除重建：新仓库只有一个初始化提交，作者邮箱改为 GitHub noreply 地址，历史里既没有 openid 也没有个人邮箱。旧历史只留在本地 `legacy-backup` 分支，不推送。

## 复发预防

- 测试与文档里的 openid 一律用合成值（写成明显假的 32 位大写十六进制）。
- 凭据只进本机 `pi-qqbot.json`（已 gitignore）或由服务单元注入环境变量。
- 发布包只含 `dist/`、`bin/`、示例配置、README、LICENSE；`docs/`、`tests/`、真实配置都不入包。
- 提交前自查：`git grep -nE "appSecret|openid|/home/"` 与 `git log --format='%an <%ae>'`。
