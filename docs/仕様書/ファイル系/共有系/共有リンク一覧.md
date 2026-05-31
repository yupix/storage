# 共有リンク一覧

## 概要
指定ファイルの発行済み共有リンク一覧を取得する。

## エンドポイント情報

| 要件 | 値 |
|----|-----|
| ログインの有無 | 要 |
| HTTPメソッド | GET |
| エンドポイント | /v1/files/:id/links |

## レスポンス

| キー | 値の種類 | 説明 |
|------|---------|------|
| links | Array | 共有リンク情報の配列 |

## 共有リンク情報

| キー | 説明 |
|------|------|
| link_id | String: リンクID |
| url | String: 共有URL |
| expires_at | datetime: 有効期限 |
| download_allowed | Boolean: ダウンロード可否 |
| created_at | datetime: 作成日時 |
