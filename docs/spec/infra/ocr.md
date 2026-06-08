# OCRエンジン
## 役割
画像内テキスト抽出とインデックス化
## エンジン
PaddleOCR または EasyOCR（OSS、多言語対応）
## 処理パイプライン
画像アップロード → PaddleOCR/EasyOCRで抽出 → Valkey タスクキュー で非同期処理 → PostgreSQL全文検索インデックス
## スケーリング
Valkey キューで複数ワーカーの並列処理対応
