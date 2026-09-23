#!/bin/zsh
set -eu

cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/share/mise/installs/node/24/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"

if curl --fail --silent --max-time 2 http://127.0.0.1:3000 | /usr/bin/grep -q 'Feeder · Your interests, your feed'; then
  open http://127.0.0.1:3000
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  print '需要 Node.js 和 pnpm。请按 README.md 安装后重新启动。'
  read -r '?按回车退出…'
  exit 1
fi

if [[ ! -d node_modules ]]; then
  pnpm install --frozen-lockfile
fi

print 'Feeder 正在启动：http://127.0.0.1:3000'
print '关闭此终端或按 Ctrl+C 可停止服务。'
(
  for attempt in {1..30}; do
    if curl --fail --silent --max-time 2 http://127.0.0.1:3000 | /usr/bin/grep -q 'Feeder · Your interests, your feed'; then
      open http://127.0.0.1:3000
      exit 0
    fi
    sleep 1
  done
) &

exec pnpm dev
