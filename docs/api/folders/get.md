# 取得

| 要件 | 値 |
|----|----|
| ログインの有無 | True |
| エンドポイント | /v1/folders/:id |
| メソッド | GET |

## 概要

指定 ID のフォルダーを単体取得する。認証済みユーザーが所有者である未削除フォルダーのみ返す。

論理削除済みレコードは対象外のため、レスポンスに `is_deleted` / `deleted_at` は含めない。

## 必要なデータ

**Headers**

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `Cookie` | はい | セッション ID |

**Path parameters**

| キー | 値の種類 | 必須 | 説明 |
|------|---------|------|------|
| `id` | UUID | はい | フォルダー ID |

**Query / Body** — なし

## レスポンス

| ステータス | 条件 |
|-----------|------|
| `200 OK` | 正常 |

```json
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
```

**Folder オブジェクトのフィールド**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | UUID (string) | フォルダー ID |
| `name` | string | フォルダー名 |
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
| 400 | `INVALID_INPUT` | `id` が UUID 形式でない |
| 401 | `UNAUTHORIZED` | 未認証 |
| 404 | `NOT_FOUND` | 存在しない、論理削除済み、または他ユーザーのフォルダー |

## 実装要件

- フィルタ: `owner_id = セッション user_id` AND `is_deleted = false` AND `id = :id`（`owner_id` が一致しない場合も存在秘匿のため `404 NOT_FOUND` を返す）
- `users` テーブルを JOIN して `id` / `username` / `avatar_url` を取得し OwnerInfo を組み立てる（`email` / `is_suspended` / `password_hash` 等の内部情報は含めない）
- 実装時に `OwnerInfo` DTO（または同等の struct）を `models/` に定義すること
- エラー形式: [エラーレスポンス](../common/errors.md)に準拠
- 必要コンポーネント: PostgreSQL
