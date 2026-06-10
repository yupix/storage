# 開発環境

## 環境について

**[https://coder.akarinext.org/](https://coder.akarinext.org/)** で開発を行う。

Desktop 版クライアントは学内 LAN（Wi-Fi は可）では接続できないため、その場合は `code-server`（ブラウザ版）を使用すること。

---

## ディレクトリ構成

```
/
├── apps/
│   ├── api/        # Rust バックエンド (Axum)
│   └── web/        # フロントエンド (TanStack Start)
├── docs/           # 仕様書・ドキュメント
└── infrastructure/ # インフラ設定
```

---

## 前提条件

Coder 環境には以下がプリインストールされている。

| ツール | 用途 |
|--------|------|
| Rust (rustup) | バックエンドのビルド |
| cargo | Rust パッケージマネージャ |
| Node.js | フロントエンドのビルド |
| pnpm | フロントエンドのパッケージマネージャ |
| PostgreSQL | DB（ソケット経由でローカル接続） |
| Valkey | セッション管理（Redis 互換） |

S3互換ストレージ（MinIO / RustFS 等）・Qdrant は別途起動が必要（後述）。S3なしの場合はローカルストレージが自動使用される。

---

## 初回セットアップ

### 1. バックエンドの環境変数を設定

```bash
cp apps/api/.env.example apps/api/.env
```

`.env.example` からコピーした後、必要に応じて値を編集する。  
Coder 環境でのデフォルト値は以下の通り。

```env
DATABASE_URL=postgres://coder@localhost/coder?host=/var/run/postgresql
REDIS_URL=redis://localhost:6379

LOCAL_STORAGE_PATH=./data/uploads
LOCAL_BASE_URL=http://localhost:3400
LOCAL_SIGNED_URL_SECRET=local-dev-secret-change-this-in-production
```

S3互換ストレージ（MinIO / RustFS 等）を使う場合は代わりに以下を設定する。

```env
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=hyperdrive
S3_FORCE_PATH_STYLE=true
```

### 2. フロントエンドの環境変数を設定

```bash
cp apps/web/.env.example apps/web/.env.local
```

`.env.local` に開発用の API エンドポイントを追加する。

```env
SERVER_URL=http://localhost:8080
API_BASE_URL=http://localhost:8080
```

> `VITE_API_BASE_URL` は本番のみ設定する（開発時は Vite proxy が `/v1` を転送するため不要）。

### 3. フロントエンドの依存関係をインストール

```bash
cd apps/web
sudo corepack enable pnpm  # 初回のみ
pnpm install
```

### 4. DBマイグレーションを実行

```bash
cd apps/api
cargo run -p migration -- up
```

マイグレーションの状態確認や巻き戻しは以下のコマンドを使用する。

```bash
cargo run -p migration -- status   # 適用済みマイグレーションの一覧
cargo run -p migration -- down     # 最新1件を巻き戻す
cargo run -p migration -- fresh    # 全件リセット後に全件適用（データ消去）
```

### 5. OpenAPI スキーマを生成

フロントエンドの型定義を生成する。バックエンドのサーバー起動は不要。

```bash
cd apps/web
pnpm generate:api
```

---

## 起動手順（日常的な開発）

バックエンドとフロントエンドを別ターミナルで起動する。

### バックエンド

```bash
cd apps/api
cargo run
```

起動後、[http://localhost:8080](http://localhost:8080) でアクセスできる。  
API ドキュメント（Scalar UI）は [http://localhost:8080/scalar](http://localhost:8080/scalar) で確認できる。

> **注意**: Rust はホットリロード非対応。コードを変更したら `Ctrl+C` で停止し、再度 `cargo run` を実行すること。  
> ホットリロードが必要な場合は `cargo-watch` を使用する（`cargo watch -x run`）。

### フロントエンド

```bash
cd apps/web
pnpm dev
```

起動後、[http://localhost:3400](http://localhost:3400) でアクセスできる。  
ファイルを保存すると自動でリロードされる。

---

## API の型定義を再生成する

バックエンドのエンドポイントや型を変更したときに実行する。

```bash
cd apps/web
pnpm generate:api
```

生成される `src/api/schema.d.ts` は `.gitignore` に登録されており、コミットしない。  
詳細は [OpenAPIクライアント](./openapi-client.md) を参照。

---

## ポート一覧

| サービス | URL |
|----------|-----|
| フロントエンド | http://localhost:3400 |
| バックエンド API | http://localhost:8080 |
| API ドキュメント (Scalar) | http://localhost:8080/scalar |
| PostgreSQL | localhost:5432 |
| Valkey | localhost:6379 |
| S3互換ストレージ（MinIO等） | http://localhost:9000 |
| Qdrant | http://localhost:6333 |

---

## トラブルシューティング

### `pnpm dev` が起動しない

依存関係が古いか未インストールの可能性が高い。

```bash
cd apps/web
pnpm install
```

### `cargo run` でコンパイルエラーが出る

Rust のツールチェーンが古い場合は更新する。

```bash
rustup update
```

### DB 接続エラー

PostgreSQL が起動しているか確認する。

```bash
pg_isready
```

マイグレーションが未適用の場合は実行する。

```bash
cd apps/api
cargo run -p migration -- up
```

### `generate:api` でエラーが出る

Rust のビルドキャッシュが壊れている可能性がある。

```bash
cd apps/api
cargo clean
cd ../web
pnpm generate:api
```
