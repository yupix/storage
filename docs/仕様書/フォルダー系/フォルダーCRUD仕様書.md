# フォルダー CRUD API 仕様書

HyperDrive（storage）のフォルダー CRUD REST API の実装用仕様。  
既存の分割ドキュメント（[一覧.md](一覧.md)、[作成.md](作成.md)、[更新.md](更新.md)、[削除.md](削除.md)）を統合し、DB エンティティ（`folders.rs`）およびマイグレーションと整合させた正本とする。

**対象ブランチ:** `feat/folder-crud`  
**スコープ:** 仕様書のみ（Rust 実装は本ブランチでは行わない）

---

## 1. 共通事項

### 1.1 認証

| 項目 | 値 |
|------|-----|
| 認証方式 | セッション Cookie（`POST /v1/auth/login` で発行） |
| 必須ヘッダー | `Cookie: session_id=<uuid>` |
| 未認証時 | `401 UNAUTHORIZED` |
| 凍結アカウント | `403 FROZEN_ACCOUNT` |

### 1.2 共通レスポンスヘッダー

| ヘッダー | 値 |
|---------|-----|
| `Content-Type` | `application/json; charset=utf-8` |

### 1.3 エラー形式

[共通/エラーレスポンス.md](../共通/エラーレスポンス.md) に準拠。

```json
{
  "code": "ERROR_CODE",
  "message": "説明文"
}
```

フォルダー API で追加利用するコード（未定義の場合は実装時に `共通/エラーレスポンス.md` へ追記）:

| HTTP | code | 用途 |
|------|------|------|
| 409 | `DUPLICATE_FOLDER_NAME` | 同一親配下に同名フォルダーが既に存在 |

### 1.4 権限モデル（フォルダー）

| 操作 | 条件 |
|------|------|
| 一覧・単体取得・作成 | 認証済み。作成時の `owner_id` はセッションの `user_id` を自動設定 |
| 更新・削除 | `folders.owner_id` がセッションの `user_id` と一致すること |

ファイル権限（`file_permissions`）はフォルダー操作には適用しない。フォルダー内ファイルの操作はファイル系 API の権限に従う。

### 1.5 論理削除の原則

[仕様書.md](../仕様書.md) の方針どおり物理削除は行わない。`is_deleted = true` および `deleted_at` の設定で論理削除とする。一覧・単体取得では `is_deleted = false` のレコードのみ返す。

---

## 2. エンドポイント一覧

| メソッド | パス | 概要 | 認証 |
|---------|------|------|------|
| GET | `/v1/folders` | フォルダー一覧（ルート or 指定親配下） | 要 |
| POST | `/v1/folders` | フォルダー作成 | 要 |
| GET | `/v1/folders/:id` | フォルダー単体取得 | 要 |
| PATCH | `/v1/folders/:id` | フォルダー名変更（リネーム） | 要（所有者） |
| DELETE | `/v1/folders/:id` | フォルダー論理削除 | 要（所有者） |

> **既存ドキュメントとの差分:** 早見表・分割仕様の `/v1/forders` は typo。本仕様では **`/v1/folders`** に統一する。

---

## 3. リソース表現（Folder オブジェクト）

API レスポンスで返す JSON オブジェクトのフィールド定義。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | UUID (string) | フォルダー ID |
| `name` | string | フォルダー名（1〜255 文字、前後空白トリム） |
| `folder_id` | UUID \| null | 親フォルダー ID。`null` はルート直下 |
| `owner_id` | UUID (string) | 所有者ユーザー ID |
| `created_at` | string (ISO 8601) | 作成日時 |
| `updated_at` | string (ISO 8601) | 更新日時 |

論理削除済みレコードは一覧・単体取得の対象外のため、レスポンスに `is_deleted` / `deleted_at` は含めない（ゴミ箱 API は将来拡張とする）。

---

## 4. エンドポイント詳細

### 4.1 GET `/v1/folders` — 一覧取得

指定した親フォルダー直下の**サブフォルダー**を列挙する（ファイルは含めない）。ファイル・サブフォルダーの混在一覧が必要な場合は `GET /v1/files/mine?folder_id=` 等と組み合わせる。

#### リクエスト

**Headers**

| ヘッダー | 必須 | 説明 |
|---------|------|------|
| `Cookie` | はい | セッション ID |

**Query parameters**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `folder_id` | UUID | いいえ | （省略時ルート） | 親フォルダー ID。省略または空のとき `folder_id IS NULL` のフォルダーを返す |
| `page` | integer | いいえ | `1` | ページ番号（1 始まり） |
| `limit` | integer | いいえ | `50` | 1 ページ件数（最大 100） |

**Path params / Body** — なし

#### レスポンス（成功）

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
      "owner_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "created_at": "2026-06-01T10:00:00+09:00",
      "updated_at": "2026-06-01T10:00:00+09:00"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 50
}
```

#### エラーケース

| HTTP | code | 条件 |
|------|------|------|
| 400 | `INVALID_INPUT` | `folder_id` / `page` / `limit` の形式不正 |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FROZEN_ACCOUNT` | 凍結中 |
| 404 | `NOT_FOUND` | 指定 `folder_id` のフォルダーが存在しない、または他ユーザーの所有 |

#### 実装メモ

- フィルタ: `owner_id = セッション user_id` AND `is_deleted = false` AND `folder_id` = クエリ値（ルート時は `IS NULL`）
- ソート: `name ASC`（実装で変更可、仕様上は安定ソートを推奨）
- ページネーション: [共通/ページネーション.md](../共通/ページネーション.md) に準拠

---

### 4.2 POST `/v1/folders` — 作成

#### リクエスト

**Headers**

| ヘッダー | 必須 |
|---------|------|
| `Cookie` | はい |
| `Content-Type` | はい (`application/json`) |

**Body (JSON)**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `name` | string | はい | フォルダー名 |
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

#### レスポンス（成功）

| ステータス | 条件 |
|-----------|------|
| `201 Created` | 作成成功 |

```json
{
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "name": "Projects",
  "folder_id": null,
  "owner_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "created_at": "2026-06-01T10:05:00+09:00",
  "updated_at": "2026-06-01T10:05:00+09:00"
}
```

#### エラーケース

| HTTP | code | 条件 |
|------|------|------|
| 400 | `INVALID_INPUT` | `name` 空・長さ超過・`folder_id` 形式不正 |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FROZEN_ACCOUNT` | 凍結中 |
| 404 | `NOT_FOUND` | 親 `folder_id` が存在しない、または他ユーザー所有 |
| 409 | `DUPLICATE_FOLDER_NAME` | 同一親配下に同じ `name` の未削除フォルダーが既にある |

#### 実装メモ

- `id`: サーバー側で UUID v4 生成
- `owner_id`: セッションの `user_id` を設定（クライアント指定不可）
- 親が指定された場合、親の `owner_id` が自分と一致することを検証

---

### 4.3 GET `/v1/folders/:id` — 単体取得

#### リクエスト

**Headers** — `Cookie` 必須

**Path parameters**

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `id` | UUID | フォルダー ID |

#### レスポンス（成功）

| ステータス | 条件 |
|-----------|------|
| `200 OK` | 正常 |

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Documents",
  "folder_id": null,
  "owner_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "created_at": "2026-06-01T10:00:00+09:00",
  "updated_at": "2026-06-01T10:00:00+09:00"
}
```

#### エラーケース

| HTTP | code | 条件 |
|------|------|------|
| 400 | `INVALID_INPUT` | `id` が UUID 形式でない |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FORBIDDEN` | 他ユーザーのフォルダー |
| 404 | `NOT_FOUND` | 存在しない、または論理削除済み |

---

### 4.4 PATCH `/v1/folders/:id` — リネーム

本 API では**フォルダー名の変更のみ**をサポートする。親フォルダーの移動（`folder_id` の変更）は [更新.md](更新.md) に記載があるが、初版実装では別エンドポイントまたは将来バージョンとし、本 CRUD 仕様の PATCH では `name` のみ受け付ける。

#### リクエスト

**Headers** — `Cookie`, `Content-Type: application/json`

**Path parameters** — `id` (UUID)

**Body (JSON)**

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `name` | string | はい | 新しいフォルダー名 |

```json
{
  "name": "Archived Documents"
}
```

#### レスポンス（成功）

| ステータス | 条件 |
|-----------|------|
| `200 OK` | 更新成功 |

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Archived Documents",
  "folder_id": null,
  "owner_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "created_at": "2026-06-01T10:00:00+09:00",
  "updated_at": "2026-06-01T11:30:00+09:00"
}
```

#### エラーケース

| HTTP | code | 条件 |
|------|------|------|
| 400 | `INVALID_INPUT` | `name` 不正 |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FORBIDDEN` | 所有者でない |
| 404 | `NOT_FOUND` | 対象なし・削除済み |
| 409 | `DUPLICATE_FOLDER_NAME` | 同じ親配下に同名フォルダーあり |

---

### 4.5 DELETE `/v1/folders/:id` — 論理削除

#### リクエスト

**Headers** — `Cookie` 必須

**Path parameters** — `id` (UUID)

**Query parameters**

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `to_home` | boolean | いいえ | `false` | 子要素の扱い（後述） |

#### レスポンス（成功）

| ステータス | 条件 |
|-----------|------|
| `204 No Content` | 削除成功（ボディなし） |

#### 子要素の扱い（`to_home`）

| `to_home` | サブフォルダー | 配下ファイル（`files.folder_id`） |
|-----------|---------------|----------------------------------|
| `false`（既定） | **再帰論理削除** — 子孫フォルダーも `is_deleted=true` | **再帰論理削除** — 配下ファイルもゴミ箱扱い |
| `true` | 親への参照を解除 — 子フォルダーの `folder_id` を `NULL`（ルートへ移動） | ファイルの `folder_id` を `NULL`（ルートへ移動） |

> **再帰削除の方針:** 既定（`to_home=false`）ではフォルダー木ごと論理削除する。`to_home=true` のときのみ子をルートにばらまく（[削除.md](削除.md) の「ホームディレクトリにばらまく」に相当）。

物理削除・DB 行の DELETE は行わない。

#### エラーケース

| HTTP | code | 条件 |
|------|------|------|
| 400 | `INVALID_INPUT` | `id` / `to_home` 不正 |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FORBIDDEN` | 所有者でない |
| 404 | `NOT_FOUND` | 対象なし・既に削除済み |

---

## 5. DB スキーマとの対応

### 5.1 `folders` テーブル（マイグレーション・エンティティ）

出典: `apps/api/migration/src/m20260531_190002_create_table_folders.rs`, `apps/api/src/entities/folders.rs`

| DB 列 (`folders::*`) | SeaORM フィールド | API フィールド | 備考 |
|---------------------|------------------|---------------|------|
| `id` | `id` | `id` | PK, UUID, 非自動採番 |
| `name` | `name` | `name` | |
| `folder_id` | `folder_id` | `folder_id` | 親フォルダー。NULL = ルート。自己参照 FK |
| `owner_id` | `owner_id` | `owner_id` | `users.id` への FK |
| `is_deleted` | `is_deleted` | （レスポンス非公開） | 一覧・取得で `false` のみ |
| `deleted_at` | `deleted_at` | （レスポンス非公開） | 論理削除日時 |
| `created_at` | `created_at` | `created_at` | |
| `updated_at` | `updated_at` | `updated_at` | |

### 5.2 `files` テーブルとの関係

出典: `apps/api/src/entities/files.rs`

| DB 列 | 関連 | 削除時の挙動 |
|-------|------|-------------|
| `files.folder_id` | `folders.id` への FK, ON DELETE **SET NULL** | DB 物理削除時は親フォルダー削除で NULL 化。論理削除 API では `to_home` に従いアプリ層で更新 |

---

## 6. ネスト構造の方針

### 6.1 親子関係

```
ルート（folder_id = NULL）
 └── フォルダー A
      └── フォルダー B
           └── ファイル（files.folder_id = B.id）
```

- **ルート定義:** `folders.folder_id IS NULL` の行がユーザーのルート直下フォルダー。
- **深さ制限:** 初版では深さ上限なし（実装時にパフォーマンスを見て制限可能）。
- **循環参照:** PATCH で親を変更する機能を追加する場合、`id` が自分自身または子孫になる更新は `400 INVALID_INPUT` で拒否する。

### 6.2 外部キー（DB）と論理削除

| FK | ON DELETE | 意味 |
|----|-----------|------|
| `folders.folder_id` → `folders.id` | SET NULL | 親行の**物理**削除時、子の親参照が NULL になる |
| `folders.owner_id` → `users.id` | CASCADE | ユーザー物理削除時にフォルダーも削除（通常はユーザー論理削除のみ） |
| `files.folder_id` → `folders.id` | SET NULL | フォルダー物理削除時にファイルはルートへ |

論理削除 API では上記 DB 制約に頼らず、トランザクション内で `is_deleted` / `folder_id` / `files` を明示更新する。

### 6.3 再帰削除の有無

| 操作 | 再帰 | 説明 |
|------|------|------|
| DELETE `to_home=false` | **あり** | 子孫フォルダー・配下ファイルをまとめて論理削除 |
| DELETE `to_home=true` | **なし**（移動のみ） | 対象フォルダーのみ削除し、子はルートへ移動 |
| GET 一覧 | **なし** | 指定親の**直下**サブフォルダーのみ（再帰一覧は別 API 検討） |

---

## 7. 既存分割仕様との整合

| 項目 | 分割仕様 | 本仕様での扱い |
|------|---------|---------------|
| 作成エンドポイント | `/v1/forders` (typo) | `/v1/folders` に修正 |
| 削除エンドポイント | `/v1/forders/:id` (typo) | `/v1/folders/:id` に修正 |
| 一覧の内容 | ファイル混在の記述あり | フォルダーのみ。ファイルはファイル系 API |
| PATCH | `folder_id` 変更可の記載 | 初版は `name` のみ |
| 単体 GET | 分割仕様に未記載 | 本仕様で追加 |

実装完了後、[仕様書.md](../仕様書.md) 早見表のフォルダー行および [実装ガイド/コード仕様乖離レポート.md](../実装ガイド/コード仕様乖離レポート.md) を更新すること。

---

## 8. 参照コード（実装時）

| パス | 用途 |
|------|------|
| `apps/api/src/entities/folders.rs` | エンティティ定義 |
| `apps/api/migration/src/m20260531_190002_create_table_folders.rs` | テーブル定義 |
| `apps/api/src/entities/files.rs` | ファイルとフォルダーの関連 |
| `apps/api/src/routes/files.rs` | ルート登録の参考（フォルダー routes は未実装） |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-01 | 初版作成（feat/folder-crud） |
