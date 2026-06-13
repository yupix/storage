# ベクトル検索基盤

## 役割
ファイル内容の意味的類似検索

## アーキテクチャ
Qdrant（ベクトルDB）+ Rust（fastembed / multilingual-e5-small）

## ベクトル化
ファイルアップロード時に Apalis ジョブキュー（EmbedJob）で非同期処理。
OCR 完了後も再インデックスを実行し、OCR テキストを含む埋め込みに更新する。

## 埋め込みモデル
[multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small)（fastembed-rs 経由）
- 次元数: 384
- 距離関数: Cosine

## インデックス方式
Qdrant HNSW 近傍探索
- コレクション名: `files`
- ペイロード: `user_id`（フィルター用）、`file_id`

## 検索精度
multilingual-e5 の多言語対応で日本語含む複数言語対応

## 接続先
`http://qdrant.catarks.org:6333`（環境変数 `QDRANT_URL` で上書き可能）
