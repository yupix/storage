# 環境変数

各サービスに必要な環境変数を列挙する。

## Rust API サーバー（services/api/.env）

| 変数名 | 例 | 説明 |
|--------|-----|------|
| DATABASE_URL | postgresql://user:pass@localhost:5432/hyperdrive | PostgreSQL接続文字列 |
| VALKEY_URL | redis://localhost:6379 | Valkey接続文字列 |
| RUSTFS_ENDPOINT | http://localhost:9000 | RustFS エンドポイント |
| RUSTFS_ACCESS_KEY | minioadmin | RustFS アクセスキー |
| RUSTFS_SECRET_KEY | minioadmin | RustFS シークレットキー |
| RUSTFS_BUCKET | hyperdrive | 使用バケット名 |
| PYTHON_AI_SERVICE_URL | http://localhost:8000 | Python FastAPI エンドポイント |
| SESSION_TTL_SECONDS | 86400 | セッション有効期間（秒） |
| P2P_ROOM_TTL_SECONDS | 600 | P2Pルーム有効期間（秒） |
| SMTP_HOST | smtp.example.com | メール送信サーバー（凍結通知） |
| SMTP_PORT | 587 | SMTPポート |
| SMTP_USER | noreply@example.com | SMTP認証ユーザー |
| SMTP_PASS | password | SMTP認証パスワード |
| API_PORT | 8080 | APIサーバーポート |

## Python AI サービス（services/ai/.env）

| 変数名 | 例 | 説明 |
|--------|-----|------|
| QDRANT_URL | http://localhost:6333 | Qdrant エンドポイント |
| QDRANT_COLLECTION | hyperdrive_files | コレクション名 |
| VALKEY_URL | redis://localhost:6379 | タスクキュー用Valkey |
| EMBED_MODEL | intfloat/multilingual-e5-base | 埋め込みモデル名 |
| OCR_ENGINE | paddleocr | paddleocr または easyocr |
| AI_PORT | 8000 | AIサービスポート |

## フロントエンド（apps/web/.env）

| 変数名 | 例 | 説明 |
|--------|-----|------|
| VITE_API_BASE_URL | https://api.example.com | 本番 API エンドポイント（ブラウザ側から参照） |
| VITE_WS_BASE_URL | wss://api.example.com | WebSocket エンドポイント |
| SERVER_URL | http://localhost:8080 | SSR 時のサーバーサイド API エンドポイント |
| API_BASE_URL | http://localhost:8080 | 開発時 Vite proxy の転送先（`.env.local` に設定） |
