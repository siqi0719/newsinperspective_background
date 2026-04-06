#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOCAL_NOTEBOOKS_DIR="$ROOT_DIR/notebooks"
CONFIG_FILE="$ROOT_DIR/.drive-sync.env"
DELETE_MODE="${NEWS_NOTEBOOKS_SYNC_DELETE:-false}"
TEMPLATE_NOTEBOOK_FILE="$LOCAL_NOTEBOOKS_DIR/templates/nlp_analysis.py"
ROOT_NOTEBOOK_FILE="$LOCAL_NOTEBOOKS_DIR/nlp_analysis.ipynb"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

drive_mode() {
  if [[ -n "${NEWS_NOTEBOOKS_DRIVE_DIR:-}" ]]; then
    printf 'mounted\n'
    return
  fi

  if [[ -n "${NEWS_NOTEBOOKS_GDRIVE_REMOTE:-}" && -n "${NEWS_NOTEBOOKS_GDRIVE_PATH:-}" ]]; then
    printf 'rclone\n'
    return
  fi

  printf 'unconfigured\n'
}

require_configured_mode() {
  local mode
  mode="$(drive_mode)"

  if [[ "$mode" == "unconfigured" ]]; then
    cat <<'EOF' >&2
Google Drive sync is not configured.
Copy `.drive-sync.env.example` to `.drive-sync.env` and set either:
- NEWS_NOTEBOOKS_DRIVE_DIR for a mounted Drive folder
- NEWS_NOTEBOOKS_GDRIVE_REMOTE and NEWS_NOTEBOOKS_GDRIVE_PATH for rclone
EOF
    exit 1
  fi
}

require_rclone() {
  if ! command -v rclone >/dev/null 2>&1; then
    echo "rclone is not installed or not on PATH." >&2
    exit 1
  fi
}

run_jupytext() {
  if command -v jupytext >/dev/null 2>&1; then
    jupytext "$@"
    return
  fi

  if python3 -m jupytext --version >/dev/null 2>&1; then
    python3 -m jupytext "$@"
    return
  fi

  cat <<'EOF' >&2
Jupytext is required to build notebooks before Drive sync.
Install it with `pip install -r notebooks/requirements.txt` or make `jupytext` available on PATH.
EOF
  exit 1
}

build_shared_notebook() {
  if [[ ! -f "$TEMPLATE_NOTEBOOK_FILE" ]]; then
    echo "Template notebook not found: $TEMPLATE_NOTEBOOK_FILE" >&2
    exit 1
  fi

  run_jupytext --to ipynb --output "$ROOT_NOTEBOOK_FILE" "$TEMPLATE_NOTEBOOK_FILE"
}

mounted_target_dir() {
  printf '%s\n' "${NEWS_NOTEBOOKS_DRIVE_DIR}"
}

rclone_target() {
  printf '%s:%s\n' "${NEWS_NOTEBOOKS_GDRIVE_REMOTE}" "${NEWS_NOTEBOOKS_GDRIVE_PATH}"
}

sync_excludes_rclone() {
  printf '%s\n' \
    "--exclude" "README.md" \
    "--exclude" "**/__pycache__/**" \
    "--exclude" "**/*.py[cod]" \
    "--exclude" "templates/**" \
    "--exclude" "src/**" \
    "--exclude" "exports/**" \
    "--exclude" "requirements.txt"
}

sync_push() {
  local mode
  mode="$(drive_mode)"

  case "$mode" in
    mounted)
      mkdir -p "$(mounted_target_dir)"
      rsync -av --delete="${DELETE_MODE}" \
        --exclude='README.md' \
        --exclude='__pycache__/' \
        --exclude='*.py[cod]' \
        --exclude='templates/' \
        --exclude='src/' \
        --exclude='exports/' \
        --exclude='exports/kagi-consolidated/' \
        --exclude='requirements.txt' \
        "$LOCAL_NOTEBOOKS_DIR"/ "$(mounted_target_dir)"/
      ;;
    rclone)
      require_rclone
      rclone sync "$LOCAL_NOTEBOOKS_DIR" "$(rclone_target)" --progress $(sync_excludes_rclone)
      ;;
    *)
      require_configured_mode
      ;;
  esac
}

sync_pull() {
  local mode
  mode="$(drive_mode)"

  case "$mode" in
    mounted)
      mkdir -p "$LOCAL_NOTEBOOKS_DIR"
      rsync -av --delete="${DELETE_MODE}" \
        --exclude='README.md' \
        --exclude='__pycache__/' \
        --exclude='*.py[cod]' \
        --exclude='templates/' \
        --exclude='src/' \
        --exclude='exports/' \
        --exclude='exports/kagi-consolidated/' \
        --exclude='requirements.txt' \
        "$(mounted_target_dir)"/ "$LOCAL_NOTEBOOKS_DIR"/
      ;;
    rclone)
      require_rclone
      rclone sync "$(rclone_target)" "$LOCAL_NOTEBOOKS_DIR" --progress $(sync_excludes_rclone)
      ;;
    *)
      require_configured_mode
      ;;
  esac
}

sync_status() {
  local mode
  mode="$(drive_mode)"

  case "$mode" in
    mounted)
      printf 'mode=mounted\n'
      printf 'local=%s\n' "$LOCAL_NOTEBOOKS_DIR"
      printf 'remote=%s\n' "$(mounted_target_dir)"
      if [[ -d "$(mounted_target_dir)" ]]; then
        printf 'remote_exists=true\n'
      else
        printf 'remote_exists=false\n'
      fi
      ;;
    rclone)
      require_rclone
      printf 'mode=rclone\n'
      printf 'local=%s\n' "$LOCAL_NOTEBOOKS_DIR"
      printf 'entrypoint=%s\n' "$ROOT_NOTEBOOK_FILE"
      printf 'remote=%s\n' "$(rclone_target)"
      rclone lsf "$(rclone_target)" --max-depth 1
      ;;
    *)
      require_configured_mode
      ;;
  esac
}
