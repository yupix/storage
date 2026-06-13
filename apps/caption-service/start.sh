#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8500}"

# --- モデル選択 ---
MODEL="${1:-}"
if [[ -z "$MODEL" ]]; then
  echo "使用するモデルを選択してください:"
  echo "  1) moondream2   (~1.7GB, CPU: ~10-30秒/枚)"
  echo "  2) Florence-2-base (~270MB, CPU: ~5-10秒/枚)"
  echo "  3) Florence-2-large (~770MB, CPU: ~15-30秒/枚, 高精度)"
  read -rp "番号を入力 [1-3]: " choice
  case "$choice" in
    1) MODEL="moondream" ;;
    2) MODEL="florence-base" ;;
    3) MODEL="florence-large" ;;
    *) echo "無効な選択です" >&2; exit 1 ;;
  esac
fi

case "$MODEL" in
  moondream)
    SCRIPT="moondream_service.py"
    PACKAGES="moondream pillow fastapi 'uvicorn[standard]' python-multipart"
    EXTRA_ARGS=""
    ;;
  florence-base)
    SCRIPT="florence2_service.py"
    PACKAGES="transformers torch pillow fastapi 'uvicorn[standard]' python-multipart einops timm"
    EXTRA_ARGS="--model microsoft/Florence-2-base"
    ;;
  florence-large)
    SCRIPT="florence2_service.py"
    PACKAGES="transformers torch pillow fastapi 'uvicorn[standard]' python-multipart einops timm"
    EXTRA_ARGS="--model microsoft/Florence-2-large"
    ;;
  *)
    echo "不明なモデル: $MODEL" >&2
    echo "使用可能: moondream / florence-base / florence-large" >&2
    exit 1
    ;;
esac

# --- 仮想環境のセットアップ ---
if [[ ! -d "$VENV_DIR" ]]; then
  echo ">>> 仮想環境を作成しています..."
  python3 -m venv "$VENV_DIR"
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

echo ">>> 依存パッケージをインストールしています..."
pip install --quiet --upgrade pip
eval pip install --quiet $PACKAGES

# --- 起動 ---
echo ""
echo ">>> $MODEL を起動します (http://${HOST}:${PORT})"
echo "    停止: Ctrl+C"
echo ""
cd "$SCRIPT_DIR"
exec python "$SCRIPT" --host "$HOST" --port "$PORT" $EXTRA_ARGS
