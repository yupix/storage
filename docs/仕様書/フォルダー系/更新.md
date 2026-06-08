# 更新

| 要件 | 値 |
|----|----|
| ログインの有無 | True |
| エンドポイント | /v1/folders/:id |
| メソッド | PATCH |

## 概要

フォルダー名の変更（リネーム）および親フォルダーへの移動を行う。`folders.owner_id` がセッションの `user_id` と一致する場合のみ許可する。

`name` と `folder_id` はいずれも任意。少なくとも一方を指定すること（両方省略はバリデーションエラー）。

## 必要なデータ

**Headers**

| ヘッダー | 必須 |
|---------|------|
| `Cookie` | はい |
| `Content-Type` | はい (`application/json`) |

**Path parameters**

| キー | 値の種類 | 必須 | 説明 |
|------|---------|------|------|
| `id` | UUID | はい | フォルダー ID |

**Body (JSON)**

| キー | 値の種類 | 必須 | 説明 |
|------|---------|------|------|
| `name` | string | いいえ | 新しいフォルダー名（1〜255文字、前後空白トリム）。省略時は変更しない。同一親配下に同名フォルダーが既にあっても許可（Google Drive 型） |
| `folder_id` | UUID \| null | いいえ | 移動先の親フォルダー ID。`null` でルート直下へ移動。省略時は変更しない |

**例（リネームのみ）**

```json
{
  "name": "Archived Documents"
}
```

**例（移動のみ）**

```json
{
  "folder_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
}
```

**例（リネーム + ルート直下へ移動）**

```json
{
  "name": "Archived Documents",
  "folder_id": null
}
```

## レスポンス

| ステータス | 条件 |
|-----------|------|
| `200 OK` | 更新成功 |

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Archived Documents",
  "folder_id": null,
  "owner": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "username": "alice",
    "avatar_url": null
  },
  "created_at": "2026-06-01T10:00:00+09:00",
  "updated_at": "2026-06-01T11:30:00+09:00"
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
| 400 | `INVALID_INPUT` | `name` と `folder_id` が両方省略、または `name` 不正、または循環参照 |
| 401 | `UNAUTHORIZED` | 未認証 |
| 404 | `NOT_FOUND` | 対象フォルダーなし・削除済み・他ユーザーのフォルダー（存在秘匿のため 403 は返さない）、または移動先 `folder_id` が存在しない・他ユーザー所有 |

## 実装要件

- `users` テーブルを JOIN して `id` / `username` / `avatar_url` を取得し OwnerInfo を組み立てる（`email` / `is_suspended` / `password_hash` 等の内部情報は含めない）
- 実装時に `OwnerInfo` DTO（または同等の struct）を `models/` に定義すること
- `folder_id` の `null` 明示（ルートへ移動）と省略（変更しない）を区別するため、Rust では `Option<Option<Uuid>>` または `#[serde(deserialize_with = ...)]` 等のパターンが必要
- `name` と `folder_id` が両方省略された場合は `400 INVALID_INPUT`
- `folder_id` を指定した場合、自分自身または子孫フォルダーを親にしていないか循環参照チェック → 違反時 `400 INVALID_INPUT`
- 移動先 `folder_id` が指定された場合、存在・未削除・同一 `owner_id` であることを検証（違反時 `404 NOT_FOUND`）
- `name` 変更時は同一親配下に同名フォルダーが既にあっても許可（重複チェックは行わない）
- エラー形式: [共通/エラーレスポンス.md](../共通/エラーレスポンス.md) に準拠
- 必要コンポーネント: PostgreSQL
