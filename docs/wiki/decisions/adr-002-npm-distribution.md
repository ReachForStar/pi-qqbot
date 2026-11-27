---
title: ADR-002 以编译产物发行到 npm
type: decision
tags: [npm, 发布, 打包, 发行]
created: 2026-11-27
updated: 2026-11-27
status: active
---

# ADR-002：以编译产物发行到 npm

## 背景

项目要发布为公开 npm 包 `pi-qqbot`。源码是 TypeScript，且：

- 源码里的导入写的是 `.ts` 后缀（`allowImportingTsExtensions`），直接发布需要用户机器上跑 TS。
- 前台/后台两种启动方式都要在**用户的工作目录**下工作，而包目录（`node_modules/pi-qqbot`）是只读的。
- 运行期依赖只有 `@earendil-works/pi-coding-agent` 与 `@tencent-connect/qqbot-nodejs`；`tsx`、`vitest`、`typescript` 只是开发依赖。

## 备选方案

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| A. 发布源码 + `tsx` 运行时依赖 | 不需要构建步骤，改动即生效 | 每次启动现场编译，冷启动慢；用户机器上要有 tsx；包体包含 `src/` 与测试 |
| B. `tsc` 编译到 `dist/`（选用） | 启动快、包体小、运行时无构建链 | 需要一个构建配置与 `.ts` 导入改写 |
| C. 打包成单文件（esbuild/tsdown） | 包体最小 | 依赖原生模块与动态 require 时容易踩坑，调试困难 |

## 决策

采用 **方案 B**：

- `tsconfig.build.json`：`outDir: dist`、`rootDir: src`、`declaration: true`、`rewriteRelativeImportExtensions: true`（把 `.ts` 导入改写成 `.js`）。
- `package.json`：`bin.pi-qqbot → bin/pi-qqbot.js`（薄封装，`import "../dist/cli.js"`）、`main`/`exports` 指向 `dist/cli.js`、`files` 只放 `dist`、`bin`、示例配置、README、LICENSE。
- `prepublishOnly` 跑 `npm run verify`（typecheck + 测试 + 构建）。
- 配置默认路径改为 `process.cwd()/pi-qqbot.json`：装成全局包后包目录只读，配置必须跟着用户工作目录。

## 理由

1. 用户侧零构建：`npx pi-qqbot start` 直接跑 `dist/`，不需要 tsx 或 TypeScript。
2. 包边界干净：测试、源码、真实配置都不进 tarball，避免把凭据或 130 多条测试带进用户的 node_modules。
3. 后台服务派生进程时同一份产物即可（`resolveEntry()` 优先 `dist/main.js`，源码仓库回退到 `tsx src/main.ts`），源码开发与发布包共用一套启动逻辑。

## 后果

- 发布前必须构建：`npm publish` 由 `prepublishOnly` 兜住，忘记构建会被拦住。
- `dist/` 是产物，改源码后要重新 `npm run build`；`npm pack` 里能看到是否有遗漏文件。
- `repository` / `homepage` / `bugs` 字段暂时留空：对应的 GitHub 仓库还没建，填错不如不填，建好后再补并重新发布。
