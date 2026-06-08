# 作成

| 要件 | 値 |
|----|----|
| ログインの有無 | True |
| エンドポイント | /v1/folders |
| メソッド | POST |

## 概要

新しいフォルダーを作成する。`owner_id` はセッションの `user_id` をサーバー側で自動設定する（クライアント指定不可）。

親フォルダーが指定された場合、親の `owner_id` が自分と一致することを検証する。

## 必要なデータ

**Headers**

| ヘッダー | 必須 |
|---------|------|
| `Cookie` | はい |
| `Content-Type` | はい (`application/json`) |

**Body (JSON)**

| キー | 値の種類 | 必須 | 説明 |
|------|---------|------|------|
| `name` | string | はい | フォルダー名（1〜255文字、前後空白トリム） |
| `folder_id` | UUID \| null | いいえ | 親フォルダー ID。省略または `null` でルート直下に作成 |

**例（ルート直下）**

```json
{
  "name": "Projects"
}
```

**例（サブフォルダー）**

```json
{
  "name": "2026",
  "folder_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

## レスポンス

| ステータス | 条件 |
|-----------|------|
| `201 Created` | 作成成功 |

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "name": "Projects",
  "folder_id": null,
  "owner": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "username": "alice",
    "avatar_url": null
  },
  "created_at": "2026-06-01T10:05:00+09:00",
  "updated_at": "2026-06-01T10:05:00+09:00"
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
| 400 | `INVALID_INPUT` | `name` 空・長さ超過・`folder_id` 形式不正 |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FROZEN_ACCOUNT` | 凍結中 |
| 404 | `NOT_FOUND` | 親 `folder_id` が存在しない、または他ユーザー所有 |

## 実装要件

- `id`: サーバー側で UUID v4 生成
- `owner_id`: セッションの `user_id` を設定（DB 列。レスポンスでは `owner` オブジェクトとして返す）
- `users` テーブルを JOIN して `id` / `username` / `avatar_url` を取得し OwnerInfo を組み立てる（`email` / `is_suspended` / `password_hash` 等の内部情報は含めない）
- 実装時に `OwnerInfo` DTO（または同等の struct）を `models/` に定義すること
- 親指定時は親の `owner_id` が自分と一致することを検証
- エラー形式: [エラーレスポンス](../common/errors.md)に準拠
- 同一親配下に同名フォルダーを複数作成可能（Google Drive 型。重複チェックは行わない）
- 必要コンポーネント: PostgreSQL
