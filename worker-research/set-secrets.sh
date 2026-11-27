#!/bin/sh
# Sets the Research Hub worker's PASSWORD secret without printing it.
# Usage:
#   /Users/haokai/Projects/haokaiding.github.io/worker-research/set-secrets.sh
set -eu
cd "$(dirname "$0")"
WRANGLER="${HOME}/.npm/_npx/c943b712072b77c4/node_modules/.bin/wrangler"
[ -x "$WRANGLER" ] || WRANGLER="npx -y wrangler@4"

stty -echo
printf 'Research Hub 登录密码: '; read -r P1; echo
printf '再输一次: '; read -r P2; echo
stty echo
[ -n "$P1" ] && [ "$P1" = "$P2" ] || { echo "✗ 两次不一样或为空"; exit 1; }
printf '%s' "$P1" | $WRANGLER secret put PASSWORD >/dev/null && echo "✓ PASSWORD set"
