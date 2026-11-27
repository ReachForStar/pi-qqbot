#!/usr/bin/env bash
# 包元数据与 README 徽标一致性校验：徽标写的是 MIT 与 Node >=22，就必须与实际一致
set -euo pipefail
cd "$(dirname "$0")/.."

license="$(node -p "require('./package.json').license")"
if [ "$license" != "MIT" ]; then
	printf 'package.json 的 license 应为 MIT，实际为 %s\n' "$license" >&2
	exit 1
fi
[ -f LICENSE ] || { echo "缺少 LICENSE 文件" >&2; exit 1; }
grep -q "MIT License" LICENSE

engines="$(node -p "require('./package.json').engines.node")"
if [ "$engines" != ">=22" ]; then
	printf 'package.json 的 engines.node 应为 >=22，实际为 %s\n' "$engines" >&2
	exit 1
fi

# README 里必须出现这三枚徽标，缺一处说明徽标被删改而校验没跟上
grep -q 'badge/License-MIT-yellow' README.md
grep -q 'badge/Node-%3E%3D22-339933' README.md
grep -q 'img.shields.io/npm/v/pi-qqbot.svg?color=blue' README.md

echo "包元数据与徽标一致：license=MIT，engines.node=$engines"
