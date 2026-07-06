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

## ハイブリッド検索（`GET /v1/search?type=hybrid` または type 省略）の注記

ハイブリッド検索では、キーワード経路とベクトル経路を並行実行し RRF で統合した後にページスライスする。

| 特性 | 説明 |
|------|------|
| fusion_depth | 各経路から `max(100, page * limit + limit)` 件を取得してから統合する |
| total | 統合・重複排除後の件数（個別経路の total の単純合算ではない） |
| 深いページ | fusion_depth を超える順位の結果は取得されない。ページが深いほど片方の経路のみの結果になる可能性がある |

`type=keyword` または `type=vector` を明示指定した場合は、従来どおり各経路単体のページネーションが適用される。
