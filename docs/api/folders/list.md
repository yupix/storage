# 一覧

| 要件 | 値 |
|----|----|
| ログインの有無 | True |
| エンドポイント | /v1/folders |
| メソッド | GET |

## 概要

指定した親フォルダー直下の**サブフォルダー**を列挙する（ファイルは含めない）。ファイル・サブフォルダーの混在一覧が必要な場合は `GET /v1/files/mine?folder_id=` 等と組み合わせる。

認証済みユーザーの所有フォルダーのみ対象。論理削除済み（`is_deleted = true`）は返さない。

## 必要なデータ

**Headers**

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `Cookie` | はい | セッション ID（`session_id=<uuid>`） |

**Query parameters**

| キー | 値の種類 | 必須 | デフォルト | 説明 |
|------|---------|------|-----------|------|
| `folder_id` | UUID | いいえ | （省略時ルート） | 親フォルダー ID。省略時は `folder_id IS NULL` のフォルダーを返す |
| `page` | integer | いいえ | `1` | ページ番号（1 始まり） |
| `limit` | integer | いいえ | `50` | 1 ページ件数（最大 100） |

**Path params / Body** — なし

## レスポンス

| ステータス | 条件 |
|-----------|------|
| `200 OK` | 正常 |

```json
{
  "folders": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "name": "Documents",
      "folder_id": null,
      "owner": {
        "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "username": "alice",
        "avatar_url": null
      },
      "created_at": "2026-06-01T10:00:00+09:00",
      "updated_at": "2026-06-01T10:00:00+09:00"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

**Folder オブジェクトのフィールド**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | UUID (string) | フォルダー ID |
| `name` | string | フォルダー名（1〜255 文字、前後空白トリム） |
| `folder_id` | UUID \| null | 親フォルダー ID。`null` はルート直下 |
| `owner` | OwnerInfo | 所有者の基本情報 |
| `created_at` | string (ISO 8601) | 作成日時 |
| `updated_at` | string (ISO 8601) | 更新日時 |

**OwnerInfo オブジェクト**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | UUID (string) | ユーザー ID |
| `username` | string | ユーザー名 |
| `avatar_url` | string \| null | アバター画像 URL |

## エラーケース

| HTTP | code | 条件 |
|------|------|------|
| 400 | `INVALID_INPUT` | `folder_id` / `page` / `limit` の形式不正 |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FROZEN_ACCOUNT` | 凍結中 |
| 404 | `NOT_FOUND` | 指定 `folder_id` のフォルダーが存在しない、または他ユーザーの所有 |

## 実装要件

- フィルタ: `owner_id = セッション user_id` AND `is_deleted = false` AND `folder_id` = クエリ値（ルート時は `IS NULL`）
- `users` テーブルを JOIN して `id` / `username` / `avatar_url` を取得し OwnerInfo を組み立てる（`email` / `is_suspended` / `password_hash` 等の内部情報は含めない）
- 実装時に `OwnerInfo` DTO（または同等の struct）を `models/` に定義すること
- ソート: `name ASC`（安定ソートを推奨）
- ページネーション: [ページネーション](../common/pagination.md)に準拠
- エラー形式: [エラーレスポンス](../common/errors.md)に準拠
- 必要コンポーネント: PostgreSQL
