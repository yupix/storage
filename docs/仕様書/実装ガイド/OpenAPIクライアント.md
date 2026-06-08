# OpenAPI クライアント

フロントエンドからバックエンドへの型安全なアクセスを実現する仕組み。
バックエンドの `#[utoipa::path]` アノテーションから OpenAPI スキーマを自動生成し、
フロントエンドは生成された TypeScript 型を通じて API を呼び出す。

## 全体の流れ

```
[Rust utoipa アノテーション]
        ↓ cargo run --bin generate_schema
[openapi.json (一時ファイル)]
        ↓ openapi-typescript
[src/api/schema.d.ts (gitignore済み)]
        ↓ import
[src/api/client.ts (openapi-fetch)]
        ↓
[各コンポーネント・ローダーで型安全に使用]
```

## 型の再生成

バックエンドの API を変更したら以下を実行する。**サーバーの起動は不要。**

```bash
cd apps/web
pnpm generate:api
```

内部では以下の処理が順に走る。

1. `cargo run --bin generate_schema` — Rust バイナリが OpenAPI JSON を stdout に出力
2. `openapi-typescript` — JSON から `src/api/schema.d.ts` を生成
3. 一時ファイルを削除

`schema.d.ts` は `.gitignore` に登録されており、コミットされない。
開発者それぞれが手元で生成する運用とする。

## APIクライアントの使い方

`src/api/client.ts` の `apiClient` を import して使う。

```typescript
import { apiClient } from '@/api/client'

// GET
const { data, error } = await apiClient.GET('/v1/auth/me')

// POST (リクエストボディも型補完される)
const { data, error } = await apiClient.POST('/v1/auth/login', {
  body: { email: 'user@example.com', password: 'password123' }
})

// パスパラメータあり
const { data, error } = await apiClient.GET('/v1/folders/{id}', {
  params: { path: { id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' } }
})
```

存在しないパスやリクエストボディの型ミスはコンパイル時にエラーになる。

## 環境別の baseUrl

| 環境 | 経路 | 設定 |
|------|------|------|
| 開発（ブラウザ） | Vite proxy `/v1` → `API_BASE_URL` | `vite.config.ts` の proxy 設定 |
| 開発（SSR） | `SERVER_URL` に直接アクセス | `.env.local` の `SERVER_URL` |
| 本番（ブラウザ） | `VITE_API_BASE_URL` に直接アクセス | `.env` の `VITE_API_BASE_URL` |
| 本番（SSR） | `SERVER_URL` に直接アクセス | サーバー環境変数の `SERVER_URL` |

### 開発環境のプロキシ

`vite.config.ts` で `/v1` 以下のリクエストをバックエンドに転送している。
転送先のデフォルトは `http://localhost:8080`。変更する場合は `.env.local` に設定する。

```
API_BASE_URL=http://localhost:8080
```

### 本番環境

フロントエンドとバックエンドが別ドメイン・別ポートで動作する場合は
`.env` に `VITE_API_BASE_URL` を設定する。

```
VITE_API_BASE_URL=https://api.example.com
```

## 関連ファイル

| ファイル | 役割 |
|----------|------|
| `apps/api/src/bin/generate_schema.rs` | OpenAPI JSON を stdout に出力するバイナリ |
| `apps/web/src/api/client.ts` | openapi-fetch クライアントの初期化 |
| `apps/web/src/api/schema.d.ts` | 生成された型定義（gitignore済み） |
| `apps/web/vite.config.ts` | 開発時プロキシ設定 |
| `apps/web/src/env.ts` | `VITE_API_BASE_URL` のバリデーション |
