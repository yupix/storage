# 環境変数

実装で使用している環境変数を記載します。バックエンドの初期値は
[`apps/api/.env.example`](../../apps/api/.env.example)を参照してください。

## Rust API (`apps/api/.env`)

| 変数名 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL接続文字列 |
| `REDIS_URL` | Yes | RedisまたはValkeyの接続文字列 |
| `RUSTFS_ENDPOINT` | Yes | RustFSのS3互換エンドポイント |
| `RUSTFS_ACCESS_KEY` | Yes | RustFSアクセスキー |
| `RUSTFS_SECRET_KEY` | Yes | RustFSシークレットキー |
| `RUSTFS_BUCKET` | Yes | 使用するバケット名 |
| `RUSTFS_FORCE_PATH_STYLE` | No | path-styleアクセスを使う。既定値は`true` |
| `ALLOW_ORIGIN` | No | CORS許可オリジン。既定値は`http://localhost:3000` |
| `RUST_ENV` | No | `production`の場合に本番向けCookie設定を使用 |

## Web (`apps/web/.env.local`)

| 変数名 | 必須 | 説明 |
|---|---|---|
| `API_BASE_URL` | No | 開発時の`/v1`プロキシ転送先。既定値は`http://localhost:8080` |
| `SERVER_URL` | No | SSRから接続するAPI URL。既定値は`http://localhost:8080` |
| `VITE_API_BASE_URL` | No | ブラウザから直接接続する本番API URL |
| `VITE_APP_TITLE` | No | ブラウザに表示するアプリ名 |
| `VITE_SENTRY_DSN` | No | Sentry DSN。未設定の場合はSentryを無効化 |

秘密情報を含む`.env`や`.env.local`はコミットしないでください。
