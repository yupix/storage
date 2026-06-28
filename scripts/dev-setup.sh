#!/usr/bin/env bash
# Coder 起動後の開発環境一発セットアップ
#
# 使い方:
#   ./scripts/dev-setup.sh
#
# 冪等性: 既に完了済みのステップはスキップする。複数回実行しても安全。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ok()   { echo "✓ 完了: $1"; }
skip() { echo "⚠ スキップ: $1"; }
fail() { echo "✗ エラー: $1" >&2; exit 1; }

echo "=== 開発環境セットアップ ==="
echo "作業ディレクトリ: $ROOT_DIR"
echo ""

# Step 1: PostgreSQL 確認
echo "[Step 1] PostgreSQL 確認"
if pg_isready -q; then
  ok "PostgreSQL は起動しています"
else
  fail "PostgreSQL が起動していません (pg_isready が失敗)"
fi
echo ""

# Step 2: Valkey（Redis）確認
echo "[Step 2] Valkey（Redis）確認"
if redis-cli -p 6379 ping 2>/dev/null | grep -q PONG; then
  ok "Valkey は応答しています"
else
  fail "Valkey が応答しません (redis-cli -p 6379 ping)"
fi
echo ""

# Step 3: .env コピー
echo "[Step 3] バックエンド .env 設定"
ENV_FILE="apps/api/.env"
ENV_EXAMPLE="apps/api/.env.example"
if [[ -f "$ENV_FILE" ]]; then
  skip "$ENV_FILE は既に存在します"
else
  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    fail "$ENV_EXAMPLE が見つかりません"
  fi
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  ok "$ENV_EXAMPLE から $ENV_FILE を作成しました"
fi
echo ""

# Step 4: DB マイグレーション
echo "[Step 4] DB マイグレーション"
if (cd apps/api && cargo run -p migration --quiet -- up); then
  ok "マイグレーションを適用しました（未適用分のみ）"
else
  fail "マイグレーションの実行に失敗しました"
fi
echo ""

# Step 5: フロント依存
echo "[Step 5] フロントエンド依存関係"
if [[ -d apps/web/node_modules ]]; then
  skip "apps/web/node_modules は既に存在します"
else
  if (cd apps/web && pnpm install --frozen-lockfile); then
    ok "pnpm install を完了しました"
  else
    fail "pnpm install に失敗しました"
  fi
fi
echo ""

echo "=== セットアップ完了 ==="
echo ""
echo "次のステップ:"
echo "  バックエンド:  cd apps/api && cargo run"
echo "  フロントエンド: cd apps/web && pnpm dev"
echo ""
echo "  フロントエンド: http://localhost:3400"
echo "  バックエンド API: http://localhost:8080"
