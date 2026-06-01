# ベクトル検索基盤
## 役割
ファイル内容の意味的類似検索
## アーキテクチャ
Qdrant（ベクトルDB）+ Python FastAPI（API層）+ multilingual-e5（埋め込みモデル）
## ベクトル化
ファイルアップロード時にPython FastAPIで非同期処理
## インデックス方式
Qdrantのハイブリッド検索（ベクトル+スカラー）
## 検索精度
multilingual-e5の多言語対応で日本語含む複数言語対応
