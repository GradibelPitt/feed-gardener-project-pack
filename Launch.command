#!/bin/zsh
set -eu

cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/share/mise/installs/node/24/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"

if ! command -v node >/dev/null 2>&1; then
  print '需要 Node.js 22.13 或更新版本。请按 README.md 安装后重新启动。'
  read -r '?按回车退出…'
  exit 1
fi
if node scripts/launch.mjs; then
  exit 0
else
  status=$?
  print 'Feeder 启动失败。请查看上面的错误。'
  read -r '?按回车退出…'
  exit "$status"
fi
