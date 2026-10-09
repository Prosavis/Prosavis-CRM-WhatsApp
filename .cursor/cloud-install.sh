#!/usr/bin/env bash
# Cloud Agent install. Idempotent. No production secrets. No Playwright browsers.
set -euo pipefail
export HUSKY=0
export NPM_CONFIG_FUND=false
export NPM_CONFIG_AUDIT=false
export CI=true
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

ensure_node22() {
  if command -v node >/dev/null 2>&1; then
    local maj
    maj="$(node -v)"
    maj="${maj#v}"
    maj="${maj%%.*}"
    if [ "$maj" = "22" ]; then
      return 0
    fi
  fi
  local name tmp
  name="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | awk '/node-v22\..*-linux-x64\.tar\.xz$/ { print $2; exit }')"
  if [ -z "$name" ]; then
    echo "No encontre el tarball linux-x64 de Node 22" >&2
    exit 1
  fi
  tmp="$(mktemp)"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/${name}" -o "$tmp"
  sudo tar -xJf "$tmp" -C /usr/local --strip-components=1
  rm -f "$tmp"
  hash -r
  node -v
}

ensure_node22
npm ci
