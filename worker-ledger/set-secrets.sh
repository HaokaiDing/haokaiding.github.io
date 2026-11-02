#!/bin/sh
# Sets the ledger worker's secrets without printing them. Run it yourself:
#   worker-ledger/set-secrets.sh [path/to/.env] [PREFIX]
# 1. asks for the login password (typed twice, hidden) -> PASSWORD
# 2. copies the Gemini relay settings from a .env (default: the short-drama project's,
#    PREFIX defaults to YUNWU -> YUNWU_BASE / YUNWU_API_KEY) -> GEMINI_BASE / GEMINI_KEY
set -eu
cd "$(dirname "$0")"
ENV_FILE=${1:-"$HOME/Documents/ChatGPT/ai 短剧/videoclaw/.env"}
PREFIX=${2:-YUNWU}
put() { printf '%s' "$2" | npx -y wrangler@4 secret put "$1" >/dev/null && echo "✓ $1 set"; }

stty -echo
printf '记账登录密码: '; read -r P1; echo
printf '再输一次: '; read -r P2; echo
stty echo
[ -n "$P1" ] && [ "$P1" = "$P2" ] || { echo "✗ 两次不一样或为空"; exit 1; }
put PASSWORD "$P1"

value() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
KEY=$(value "${PREFIX}_API_KEY")
if [ -n "$KEY" ]; then
  put GEMINI_KEY "$KEY"
  put GEMINI_BASE "$(value "${PREFIX}_BASE")"
else
  echo "✗ ${PREFIX}_API_KEY not found in $ENV_FILE; Gemini features stay off"
fi
