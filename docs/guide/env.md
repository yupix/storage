# 環境変数

実装で使用している環境変数を記載します。バックエンドの初期値は
[`apps/api/.env.example`](../../apps/api/.env.example)を参照してください。

## Rust API (`apps/api/.env`)

| 変数名 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL接続文字列 |
| `REDIS_URL` | Yes | RedisまたはValkeyの接続文字列 |
| `STORAGE_DRIVER` | No | ストレージバックエンドを明示指定。`s3` または `local`。省略時は自動検出 |
| `S3_ENDPOINT` | No* | S3互換エンドポイントURL |
| `S3_ACCESS_KEY` | No* | S3アクセスキー |
| `S3_SECRET_KEY` | No* | S3シークレットキー |
| `S3_BUCKET` | No* | 使用するバケット名 |
| `S3_FORCE_PATH_STYLE` | No | path-styleアクセスを使う。既定値は`true` |
| `LOCAL_STORAGE_PATH` | No | ローカルストレージの保存先。既定値は`./data/uploads` |
| `LOCAL_BASE_URL` | No | ローカルストレージのダウンロードURL生成に使うベースURL。既定値は`http://localhost:3400` |
| `LOCAL_SIGNED_URL_SECRET` | No* | ローカルストレージの署名付きURL生成用シークレット（32文字以上必須） |
| `QDRANT_URL` | No | Qdrant接続URL。既定値は`http://qdrant.catarks.org:6333` |
| `QDRANT_API_KEY` | No | Qdrant認証APIキー。未設定の場合は認証なし |
| `ALLOW_ORIGIN` | No | CORS許可オリジン。既定値は`http://localhost:3000` |
| `RUST_ENV` | No | `production`の場合に本番向けCookie設定を使用 |

\* `S3_*` は4つすべて設定された場合にS3バックエンドが自動選択される。ローカルバックエンド使用時は `LOCAL_SIGNED_URL_SECRET` が必須。

## Web (`apps/web/.env.local`)

| 変数名 | 必須 | 説明 |
|---|---|---|
| `API_BASE_URL` | No | 開発時の`/v1`プロキシ転送先。既定値は`http://localhost:8080` |
| `SERVER_URL` | No | SSRから接続するAPI URL。既定値は`http://localhost:8080` |
| `VITE_API_BASE_URL` | No | ブラウザから直接接続する本番API URL |
| `VITE_APP_TITLE` | No | ブラウザに表示するアプリ名 |
| `VITE_SENTRY_DSN` | No | Sentry DSN。未設定の場合はSentryを無効化 |

秘密情報を含む`.env`や`.env.local`はコミットしないでください。
