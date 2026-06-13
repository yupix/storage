# OCRエンジン
## 役割
画像内テキスト抽出とインデックス化
## エンジン
[ndlocr-lite](https://github.com/ndl-lab/ndlocr-lite)（国立国会図書館製、日本語特化）
- レイアウト解析: DEIMv2
- 文字認識: PARSeq
- フォーマット検出: 拡張子ベース

> **選定理由**: PaddleOCR/EasyOCRと比較して日本語テキストの精度が大幅に高い。

## 処理パイプライン
画像アップロード → Apalis ジョブキューに OcrJob を積む → ワーカーがストレージからダウンロード → ndlocr-lite で抽出 → PostgreSQL `ocr_text` カラムに保存

## スケーリング
Apalis + Redis バックエンドでワーカーの並行数を制御（デフォルト: concurrency=2）。
Redis は Valkey 互換のため Valkey での運用も可。

## 対応 MIME タイプ
- image/jpeg, image/jpg
- image/png
- image/tiff
- image/bmp
- image/webp

（GIF は ndlocr-lite の対応外のため除外）

## タイムアウト
120 秒（超過時は Python プロセスを SIGKILL）
