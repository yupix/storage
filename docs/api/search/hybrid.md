# ハイブリッド検索

| 要件 | 値 |
|----|----|
| ログインの有無 | True |
| エンドポイント | /v1/search |
| メソッド | GET |

## 概要

キーワード検索とベクトル検索を統合し、RRF（Reciprocal Rank Fusion）で順位付けして返す。

`type` を省略した場合のデフォルト検索モード。ファイル名・OCR テキストの一致と意味的類似性の両方を1回のリクエストで取得できる。

### 例

「走る人」で検索すると、ファイル名や OCR に「走る」が含まれるファイルと、画像内に走っている人が写っていると推定されるファイルが統合された順序で返る。

## クエリパラメーター

| キー | 値の種類 | 必須 | デフォルト | 説明 |
|------|---------|------|-----------|------|
| q | String | True | - | 検索キーワード（最大255文字）|
| type | String | False | hybrid | `hybrid` を指定、または省略でハイブリッド検索。`keyword` / `vector` は後方互換のため個別検索として利用可能 |
| page | Integer | False | 1 | ページ番号 |
| limit | Integer | False | 50 | 件数（最大: 100）|

## レスポンス

| キー | 値の種類 | 説明 |
|------|---------|------|
| files | Array | ファイルオブジェクトの配列（RRF スコア順） |
| total | Integer | 全件数 |
| page | Integer | 現在ページ番号 |
| limit | Integer | 1ページ件数 |
| degraded | Boolean | （任意）ベクトル検索が利用できずキーワード結果のみ返した場合 `true` |
| degradation_reason | String | （任意）`degraded: true` 時の理由。例: `vector_unavailable` |

### ファイルオブジェクト（files 配列の各要素）

| キー | 値の種類 | 説明 |
|------|---------|------|
| id | String | ファイル ID |
| name | String | ファイル名 |
| file_type | String | MIME タイプ |
| size | Integer | ファイルサイズ（バイト） |
| updated_at | String | 更新日時 |
| sender_id | String | 作成者 ID |
| is_favorite | Boolean | お気に入りフラグ |
| match_reason | String | （任意）マッチ理由: `keyword` / `vector` / `both` |

## レスポンス例

```json
{
  "files": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "running_photo.jpg",
      "file_type": "image/jpeg",
      "size": 2048576,
      "updated_at": "2026-07-01T12:00:00+00:00",
      "sender_id": "660e8400-e29b-41d4-a716-446655440001",
      "is_favorite": false,
      "match_reason": "both"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "marathon_notes.pdf",
      "file_type": "application/pdf",
      "size": 512000,
      "updated_at": "2026-06-28T09:30:00+00:00",
      "sender_id": "660e8400-e29b-41d4-a716-446655440001",
      "is_favorite": true,
      "match_reason": "keyword"
    }
  ],
  "total": 2,
  "page": 1,
  "limit": 50
}
```

ベクトル検索が一時的に利用できない場合:

```json
{
  "files": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "marathon_notes.pdf",
      "file_type": "application/pdf",
      "size": 512000,
      "updated_at": "2026-06-28T09:30:00+00:00",
      "sender_id": "660e8400-e29b-41d4-a716-446655440001",
      "is_favorite": true,
      "match_reason": "keyword"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50,
  "degraded": true,
  "degradation_reason": "vector_unavailable"
}
```

## 実装要件

- キーワード経路: PostgreSQL `filename ILIKE` / `ocr_text ILIKE`（`updated_at DESC` 順）
- ベクトル経路: multilingual-e5-small 埋め込み + Qdrant 近傍探索
- 両経路を `tokio::join!` で並行実行
- RRF（k=60）で統合: `RRF_score(d) = Σ 1/(60 + rank_i(d))`
- `fusion_depth = max(100, page * limit + limit)` 件を各経路から取得し、統合後にページスライス
- 重複排除: `file_id` ベース
- ベクトル経路エラー時: キーワード結果のみ返却（`degraded: true`）

## 関連仕様

- [ベクトル検索](vector.md) — `type=vector` の個別検索
- [ページネーション](../common/pagination.md) — hybrid モードのページネーション特性
