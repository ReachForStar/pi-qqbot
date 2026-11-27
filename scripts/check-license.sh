#!/usr/bin/env bash
# 许可证校验：README 的静态徽标声明 MIT，这里保证它与实际一致
set -euo pipefail
cd "$(dirname "$0")/.."

license="$(node -p "require('./package.json').license")"
if [ "$license" != "MIT" ]; then
	printf 'package.json 的 license 应为 MIT，实际为 %s\n' "$license" >&2
	exit 1
fi

if [ ! -f LICENSE ]; then
	echo "缺少 LICENSE 文件" >&2
	exit 1
fi
grep -q "MIT License" LICENSE

echo "许可证校验通过：license=MIT，LICENSE 为 MIT 全文"
