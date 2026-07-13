# HyperDrive

**セルフホスト型ファイル管理 — P2P 直接転送と AI 検索をひとつに。**

ファイルは自分のサーバーに保管し、機密の受け渡しはデバイス間直接転送（WebRTC）で完結。  
ファイル名を忘れてもベクトル検索・OCR 検索で見つけられる個人用ファイル基盤です。

---

## クイックスタート（Docker Compose・全部入り）

PostgreSQL / Valkey / Qdrant / RustFS / API / Web / ゲートウェイ / OCR / キャプションを
まとめて起動できます。

```bash
# OCR 用のサブモジュールを取得（api イメージに焼き込むため必須）
git submodule update --init extern/ndlocr-lite

docker compose up -d --build
# → http://localhost:8080 （UI・API・WebSocket すべて同一オリジン）
```

- 初回は API 起動時に埋め込みモデル（~100MB）のダウンロードが走ります
- OCR（ndlocr-lite）は api イメージに同梱され、対応画像のアップロードで自動実行されます
- キャプション生成（Florence-2）は既定で有効。caption サービスが初回に公開モデル
  （microsoft/Florence-2-base, ~0.5GB）を DL します。
  不要なら `CAPTION_DRIVER= docker compose up -d` で無効化できます
- apalis ジョブダッシュボード → http://localhost:3401

## クイックスタート（手動セットアップ）

```bash
# 1. バックエンドの環境変数を設定
cp apps/api/.env.example apps/api/.env

# 2. フロントエンドの依存関係をインストール
cd apps/web && sudo corepack enable pnpm && pnpm install

# 3. DBマイグレーションを実行
cd apps/api && cargo run -p migration -- up

# 4. OpenAPI 型定義を生成
cd apps/web && pnpm generate:api

# 5. 起動（ターミナルを2つ使う）
cd apps/api && cargo run          # バックエンド → http://localhost:8080
cd apps/web && pnpm dev           # フロントエンド → http://localhost:3400
```

詳細な手順・トラブルシューティングは [開発環境](guide/getting-started.md) を参照。

---

## 主な機能

| 機能 | 概要 |
|------|------|
| **ファイル管理** | フォルダ階層・アップロード・ゴミ箱・復元 |
| **合言葉 P2P 共有** | ウォッチワードで相手と接続し WebRTC でファイルを直接転送。バイナリはサーバーに残らない |
| **ベクトル検索** | ファイルの内容をベクトル化し、意味が近いものをランキング表示 |
| **OCR 検索** | 画像・スクリーンショット内のテキストを抽出してインデックス化 |
| **権限管理** | 一般ユーザーと管理者（凍結・一覧）を分離 |
| **セルフホスト** | 全コンポーネントを自分のサーバーに展開可能 |

---

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| フロントエンド | TanStack Start (React) |
| バックエンド | Rust / Axum |
| DB | PostgreSQL + SeaORM |
| セッション | Valkey（Redis 互換） |
| ファイル保存 | RustFS（S3 互換） |
| ベクトル DB | Qdrant |
| AI ワーカー | Python / FastAPI（OCR・ベクトル化） |
| 監視 | Grafana / Prometheus / Loki |

```
ブラウザ → TanStack Start → Rust API → PostgreSQL / Valkey / RustFS
                                ↓
                        Python FastAPI → Qdrant

P2P 時: ブラウザ ←── WebRTC ──→ ブラウザ（ファイル本体は API を通らない）
```

サービス一覧・ポート・通信経路の詳細 → [アーキテクチャ](guide/architecture.md)

---

## ドキュメント

### API 仕様

| カテゴリ | 内容 |
|----------|------|
| [概要](api/readme.md) | API仕様の索引 |
| [auth](api/readme.md#アカウント) | 登録・ログイン・凍結・プロフィール |
| [files](api/readme.md#ファイル) | アップロード・削除・共有・ゴミ箱 |
| [folders](api/readme.md#フォルダー) | 作成・一覧・更新・削除 |
| [search](api/readme.md#検索) | ファイル名・内容・ベクトル・OCR |
| [common](api/readme.md#共通仕様) | エラー形式・ページネーション・権限モデル |

### 開発ガイド

| ドキュメント | 内容 |
|--------------|------|
| [開発環境](guide/getting-started.md) | ローカル起動・マイグレーション・トラブルシューティング |
| [アーキテクチャ](guide/architecture.md) | サービス一覧・ポート・通信経路 |
| [データベース](guide/database.md) | テーブル定義・リレーション |
| [OpenAPI クライアント](guide/openapi-client.md) | 型安全 API クライアントの使い方 |
| [環境変数](guide/env.md) | 各サービスの設定値一覧 |
| [実装順序](guide/implementation-order.md) | フェーズ別の推奨実装順 |

### 設計・方針

| ドキュメント | 内容 |
|--------------|------|
| [コーディング規則](spec/coding-rules.md) | コードスタイル・方針 |
| [データベース](guide/database.md) | 設計方針・ER図・テーブル概要 |
| [インフラ](spec/infra/readme.md) | P2P・TURN・OCR・メール等 |
