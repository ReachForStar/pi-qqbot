#!/usr/bin/env bash
# 兼容入口：启停逻辑统一在 src/service-cli.ts，这里只转发
set -euo pipefail
cd "$(dirname "$0")/.."
exec node --import tsx src/service-cli.ts "${1:-restart}"
