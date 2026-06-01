# ダウンロード

| 要件 | 値 |
|----|----|
| ログイン情報の有無 | True |
| エンドポイント | /v1/files/:id/download |
| メソッド | GET |


## 概要

アップロードされているファイルまたはフォルダーを選択して使用しているデバイスにダウンロードできます。

## 必要なデータ

| キー | 値の種類 |
|----|----|
| file | multipart |
| folder | multipart |


## 表示するデータ

| キー | 値の種類 |
|----|----|
| file | multipart |
| folder | multipart |
| 共有元ユーザー情報 | user |


## 実装要件
- RustFSからのストリーミング/一括ダウンロード
- フォルダーダウンロード時はzip圧縮
- 必要コンポーネント: RustFS、PostgreSQL