#!/usr/bin/env bash
set -euo pipefail

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"

if [[ ! -f "$PWCLI" ]]; then
  echo "Playwright skill wrapper not found at: $PWCLI" >&2
  exit 1
fi

exec bash "$PWCLI" "$@"
