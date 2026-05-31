# ページネーション

一覧系 API の共通クエリパラメータ。

| キー | 型 | デフォルト | 最大 | 説明 |
|------|-----|-----------|------|------|
| page | Integer | 1 | - | ページ番号（1始まり） |
| limit | Integer | 50 | 100 | 1ページあたりの件数 |

## レスポンス形式

| フィールド | 型 | 説明 |
|-----------|-----|------|
| data | Array | 結果一覧 |
| total | Integer | 総件数 |
| page | Integer | 現在ページ |
| limit | Integer | 1ページあたり件数 |
| has_next | Boolean | 次ページの有無 |

## 適用対象

- `GET /v1/files/mine`
- `GET /v1/files`
- `GET /v1/accounts`
- `GET /v1/files/trash`
- `GET /v1/search`
