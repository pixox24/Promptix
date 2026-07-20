#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

./scripts/restart-backend.sh

echo
echo "后台重启完成，可以关闭此窗口。"
read -r -p "按回车键退出..."
