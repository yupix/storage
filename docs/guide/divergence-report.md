# コード仕様乖離レポート

**作成日**: 2026-05-31  
**担当**: subtask_027 (cmd_009)  
**対象リポジトリ**: `/home/coder/storage`  
**参照仕様**: `docs/guide/database.md`, `docs/api/readme.md`

---

## 1. サマリー

| 区分 | 乖離件数 | 対応 |
|------|---------|------|
| DB migration vs スキーマ | 6 | 新規 migration 5 本で **仕様に寄せた** |
| API auth 実装 vs 仕様 | 3 | 2 件は仕様書追記、1 件は未実装（将来対応） |
| Migrator 登録漏れ | 1 | lib.rs 更新で **仕様に寄せた** |

既存 migration ファイル（`m20260424_*`, `m20260428_*`）は **immutable のため未変更**。プレースホルダ `post` テーブル用 `m20260428` は Migrator に登録せず、正式テーブルは新規 migration で追加。

---

## 2. DBスキーマ乖離

### 2.1 users テーブル

| 項目 | migration 現状（修正前） | DBスキーマ.md | 対応 | 方針 |
|------|-------------------------|---------------|------|------|
| email | なし | NOT NULL UNIQUE | `m20260531_190001` ADD COLUMN | **仕様に寄せた** |
| password_hash | なし | NOT NULL | 同上 | **仕様に寄せた** |
| freeze_reason | なし | NULL | 同上 | **仕様に寄せた** |
| username UNIQUE | なし | UNIQUE | 同上で index 追加 | **仕様に寄せた** |
| avatar 列名 | `avatar_url` (migration) | `avatar` | 未変更 | **コードに寄せた**（既存 migration 変更不可。SeaORM entity も `avatar_url`） |
| is_suspended 列名 | `is_suspended` | `is_suspense`（typo疑い） | 未変更 | **コードに寄せた**（仕様書 typo と判断） |
| id DEFAULT | なし（アプリで UUID 生成） | `gen_random_uuid()` | 未変更 | **コードに寄せた**（register が `Uuid::new_v4()` を使用） |
| 日時型 | `timestamptz` | `DATE` | 新規も timestamptz | **コードに寄せた**（既存 users と整合） |

### 2.2 files / folders テーブル

| 項目 | migration 現状（修正前） | DBスキーマ.md | 対応 | 方針 |
|------|-------------------------|---------------|------|------|
| files テーブル | なし（`post` プレースホルダのみ） | 全列定義あり | `m20260531_190003` 新規 CREATE | **仕様に寄せた** |
| folders テーブル | なし | 全列定義あり | `m20260531_190002` 新規 CREATE | **仕様に寄せた** |
| m20260428 登録 | lib.rs 未登録 | — | 登録しない | **仕様に寄せた**（post テーブル作成を避ける） |

**files 新規 migration 列**: id, filename, file_type, filesize, filehash, url, folder_id, author_id, is_deleted, deleted_at, ocr_text, created_at, updated_at + FK + 推奨 index

**folders 新規 migration 列**: id, name, folder_id, owner_id, is_deleted, deleted_at, created_at, updated_at + 自己参照 FK + owner FK + index

### 2.3 file_permissions / share_links

| テーブル | 修正前 | 対応 migration | 方針 |
|----------|--------|----------------|------|
| file_permissions | なし | `m20260531_190004` | **仕様に寄せた**（UNIQUE(file_id, user_id) 含む） |
| share_links | なし | `m20260531_190005` | **仕様に寄せた** |

### 2.4 Migrator (`lib.rs`)

| 項目 | 修正前 | 修正後 |
|------|--------|--------|
| 登録 migration | users のみ | users → auth columns → folders → files → permissions → share_links |
| m20260428 | mod のみ、未実行 | 意図的に未登録（immutable + プレースホルダ回避） |

---

## 3. API 実装チェック（auth）

| エンドポイント | 仕様 | 実装 | 状態 |
|----------------|------|------|------|
| POST /v1/auth/register | 仕様書.md | `routes/mod.rs` nest + `handlers/auth.rs` | ✅ 実装済み |
| POST /v1/auth/login | 同上 | 同上 | ✅ 実装済み |
| POST /v1/auth/logout | 同上 | 同上 | ✅ 実装済み |

### 3.1 仕様書への追記（実装済み・仕様未記載）

| 内容 | 追記先 |
|------|--------|
| ログイン識別子は **email**（username ではない） | `docs/api/auth/login.md` 実装メモ |
| GET `/v1/auth/me`（プロフィール取得の実装パス） | `docs/api/auth/profile.md` |

### 3.2 残存乖離（今回未修正）

| 項目 | 仕様 | 実装 | 方針 |
|------|------|------|------|
| ログイン入力 | ユーザーID | email | 仕様書に実装メモ追記済み。username ログインは別タスク |
| パスワード強度 | 英小文字+数字+記号各1以上 | `length(min=8)` のみ | **コードに寄せた**（バリデーション強化は別タスク） |
| ログイン失敗ペナルティ | Valkey カウント等 | 未実装 | 未対応（仕様のみ） |
| プロフィール取得パス | `/v1/accounts/me` | `/v1/auth/me` | 仕様早見表に実装パスを追記。**コードに寄せた** |

---

## 4. 追加した migration ファイル一覧

```
apps/api/migration/src/m20260531_190001_add_users_auth_columns.rs
apps/api/migration/src/m20260531_190002_create_table_folders.rs
apps/api/migration/src/m20260531_190003_create_table_files.rs
apps/api/migration/src/m20260531_190004_create_table_file_permissions.rs
apps/api/migration/src/m20260531_190005_create_table_share_links.rs
```

`cargo check`（`apps/api/migration`）: **成功** (2026-05-31)

---

## 5. 後続作業（推奨）

1. `cd apps/api && cargo run -- refresh` で DB へ適用
2. `sea-orm-cli generate entity` で `files`, `folders`, `file_permissions`, `share_links` エンティティ生成
3. `users` エンティティに `freeze_reason`, `deleted_at` を反映
4. ログインペナルティ（Valkey）・パスワード複雑性バリデーションの実装
