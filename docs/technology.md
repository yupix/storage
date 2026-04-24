# 技術スタック

## メイン
- バックエンド(メイン処理) Rust([Axum](https://docs.rs/axum/latest/axum/))
- テキストのベクトル化 / OCR処理用バックエンド Python([FastAPI](https://fastapi.tiangolo.com/ja/))
- フロントエンド [Tanstack Start](https://tanstack.com/start/latest)

## インフラ系
- ルーム管理: [Valkey](https://valkey.io/)
- Vector DB:  [Qdrant](https://qdrant.tech/)
- RDBMS: [PostgreSQL](https://www.postgresql.jp/)
- Object Storage: [RustFS](https://rustfs.com/)(Amazon S3互換)
