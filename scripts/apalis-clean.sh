#!/usr/bin/env bash
# apalis-redis のワーカー登録・ジョブデータを Redis から削除するスクリプト
#
# 使い方:
#   ./scripts/apalis-clean.sh                  # ワーカー + 全ジョブを削除
#   ./scripts/apalis-clean.sh --workers-only   # ゴーストワーカーのみ削除
#   ./scripts/apalis-clean.sh --dry-run        # 削除せずキーを表示
#   ./scripts/apalis-clean.sh --workers-only --dry-run
#
# 前提: redis-cli が PATH にあること
# REDIS_URL 環境変数で接続先を指定可能 (デフォルト: redis://127.0.0.1:6379)

set -euo pipefail

REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
DRY_RUN=false
WORKERS_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --dry-run)      DRY_RUN=true ;;
    --workers-only) WORKERS_ONLY=true ;;
    *) echo "不明なオプション: $arg" >&2; exit 1 ;;
  esac
done

# redis-cli 接続引数を URL からパース
parse_redis_args() {
  local url="$1"
  # redis://[:password@]host[:port][/db]
  local host port db pass args=()
  url="${url#redis://}"
  if [[ "$url" == *"@"* ]]; then
    pass="${url%%@*}"
    pass="${pass#:}"
    url="${url#*@}"
    args+=(-a "$pass")
  fi
  host="${url%%/*}"
  db="${url#*/}"
  [[ "$db" == "$url" ]] && db="0"
  if [[ "$host" == *":"* ]]; then
    port="${host##*:}"
    host="${host%:*}"
  else
    port="6379"
  fi
  args+=(-h "$host" -p "$port" -n "$db")
  echo "${args[@]}"
}

REDIS_ARGS=($(parse_redis_args "$REDIS_URL"))

rcli() {
  redis-cli "${REDIS_ARGS[@]}" --no-auth-warning "$@"
}

del_key() {
  local key="$1"
  if $DRY_RUN; then
    echo "  [dry-run] DEL $key"
  else
    rcli DEL "$key" > /dev/null
    echo "  削除: $key"
  fi
}

# apalis が型名を namespace として使う (type_name::<T>())
QUEUES=(
  "api::jobs::ocr::OcrJob"
  "api::jobs::embed::EmbedJob"
  "api::jobs::caption::CaptionJob"
)

# ワーカー関連キー
WORKER_SUFFIXES=(
  ":workers"           # ZSET: ワーカー登録
  ":workers:metadata"  # HASH: ワーカーメタデータ
)

# ジョブデータ関連キー（--workers-only のときはスキップ）
JOB_SUFFIXES=(
  ":active"
  ":dead"
  ":done"
  ":failed"
  ":inflight"
  ":data"
  ":meta"
  ":scheduled"
  ":signal"
  ":idempotency"
)

echo "=== apalis Redis クリーンアップ ==="
echo "接続先 : $REDIS_URL"
echo "モード  : $( $DRY_RUN && echo 'dry-run (削除しない)' || echo '実行')"
echo "対象   : $( $WORKERS_ONLY && echo 'ワーカーのみ' || echo 'ワーカー + 全ジョブ')"
echo ""

for queue in "${QUEUES[@]}"; do
  echo "--- キュー: $queue ---"

  for suffix in "${WORKER_SUFFIXES[@]}"; do
    key="${queue}${suffix}"
    exists=$(rcli EXISTS "$key")
    if [[ "$exists" == "1" ]]; then
      count=$(rcli ZCARD "$key" 2>/dev/null || rcli HLEN "$key" 2>/dev/null || echo "?")
      echo "  発見: $key ($count エントリ)"
      del_key "$key"
    else
      echo "  スキップ (存在しない): $key"
    fi
  done

  if ! $WORKERS_ONLY; then
    for suffix in "${JOB_SUFFIXES[@]}"; do
      key="${queue}${suffix}"
      exists=$(rcli EXISTS "$key")
      if [[ "$exists" == "1" ]]; then
        del_key "$key"
      fi
    done
  fi

  echo ""
done

# グローバルキュー一覧 (全削除時のみ)
if ! $WORKERS_ONLY; then
  global_key="core::apalis::queues::list"
  exists=$(rcli EXISTS "$global_key")
  if [[ "$exists" == "1" ]]; then
    echo "--- グローバルキュー一覧 ---"
    del_key "$global_key"
  fi
fi

echo "=== 完了 ==="
