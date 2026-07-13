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
| `S3_PUBLIC_ENDPOINT` | No | 署名付きURLの生成に使う公開エンドポイント。未設定時は`S3_ENDPOINT`と同じ。Docker等で内部エンドポイントがブラウザから到達できない場合に設定する |
| `S3_ACCESS_KEY` | No* | S3アクセスキー |
| `S3_SECRET_KEY` | No* | S3シークレットキー |
| `S3_BUCKET` | No* | 使用するバケット名 |
| `S3_FORCE_PATH_STYLE` | No | path-styleアクセスを使う。既定値は`true` |
| `LOCAL_STORAGE_PATH` | No | ローカルストレージの保存先。既定値は`./data/uploads` |
| `LOCAL_BASE_URL` | No | ローカルストレージのダウンロードURL生成に使うベースURL。既定値は`http://localhost:3400` |
| `LOCAL_SIGNED_URL_SECRET` | No* | ローカルストレージの署名付きURL生成用シークレット（32文字以上必須） |
| `QDRANT_URL` | No | Qdrant接続URL。既定値は`http://qdrant.catarks.org:6333` |
| `QDRANT_API_KEY` | No | Qdrant認証APIキー。未設定の場合は認証なし |
| `CAPTION_DRIVER` | No | 画像キャプション生成ドライバー。`gemini` または `local_http`。省略時は無効 |
| `GEMINI_API_KEY` | No† | Google Gemini APIキー。`CAPTION_DRIVER=gemini` 時に必須 |
| `CAPTION_LOCAL_URL` | No | ローカルキャプションサービスURL。`CAPTION_DRIVER=local_http` 時。既定値は`http://localhost:8500` |
| `ALLOW_ORIGIN` | No | CORS許可オリジン。既定値は`http://localhost:3000` |
| `RUST_ENV` | No | `production`の場合に本番向けCookie設定を使用 |

\* `S3_*` は4つすべて設定された場合にS3バックエンドが自動選択される。ローカルバックエンド使用時は `LOCAL_SIGNED_URL_SECRET` が必須。  
† `CAPTION_DRIVER=gemini` のときのみ必須。

## キャプションサービス (`apps/caption-service`)

ローカルモデルでキャプション生成を行う場合に使用する。
詳細は [`apps/caption-service/README.md`](../../apps/caption-service/README.md) を参照。

| 変数名 | 既定値 | 説明 |
|---|---|---|
| `HOST` | `0.0.0.0` | バインドするホスト |
| `PORT` | `8500` | バインドするポート |

## Web (`apps/web/.env.local`)

| 変数名 | 必須 | 説明 |
|---|---|---|
| `API_BASE_URL` | No | 開発時の`/v1`プロキシ転送先。既定値は`http://localhost:8080` |
| `SERVER_URL` | No | SSRから接続するAPI URL。既定値は`http://localhost:8080` |
| `VITE_API_BASE_URL` | No | ブラウザから直接接続する本番API URL |
| `VITE_APP_TITLE` | No | ブラウザに表示するアプリ名 |
| `VITE_SENTRY_DSN` | No | Sentry DSN。未設定の場合はSentryを無効化 |

秘密情報を含む`.env`や`.env.local`はコミットしないでください。
