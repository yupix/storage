# サービスアーキテクチャ

## サービス一覧表

| サービス | 言語/FW | デフォルトポート | 役割 |
|---|---|---|---|
| Web フロントエンド | TanStack Start | 3000 | UI |
| API サーバー | Rust (Axum) | 8080 | メインAPI・認証・ファイル管理 |
| AI サービス | Python (FastAPI) | 8000 | OCR処理・ベクトル化 |
| PostgreSQL | - | 5432 | 永続データ |
| Valkey | - | 6379 | セッション・キャッシュ・P2Pルーム |
| RustFS | - | 9000 | S3互換オブジェクトストレージ |
| Qdrant | - | 6333 | ベクトルDB |
| Grafana | - | 3001 | 監視ダッシュボード |
| Prometheus | - | 9090 | メトリクス収集 |
| Loki | - | 3100 | ログ集約 |

## 接続関係の図（ASCIIアート）

```
ブラウザ → TanStack Start → Rust API → PostgreSQL
                                ↓          ↓
                             Valkey      RustFS
                                ↓
                        Python FastAPI → Qdrant
                        （OCR/Vector）
```

WebSocket接続: ブラウザ ←→ Rust API（/v1/ws/watchword）
P2P接続: ブラウザ ←→ ブラウザ（WebRTC DataChannel、サーバー経由なし）

## サービス間通信方式

| 通信 | プロトコル |
|---|---|
| フロント → API | HTTPS REST |
| API → PostgreSQL | TCP (SeaORM) |
| API → Valkey | TCP (Redis protocol) |
| API → RustFS | HTTPS (S3 API) |
| API → Python FastAPI | HTTP REST |
| Python FastAPI → Qdrant | HTTP REST |
| ブラウザ ↔ API（P2P） | WSS |
| ブラウザ ↔ ブラウザ（P2P） | WebRTC DataChannel |
