# DBスキーマ

## users テーブル

| 列名 | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NOT NULL PK DEFAULT gen_random_uuid() | |
| username | VARCHAR(255) | NOT NULL UNIQUE | ユーザーID（3-32文字英数字） |
| email | VARCHAR(255) | NOT NULL UNIQUE | |
| password_hash | VARCHAR(255) | NOT NULL | ★追加 ログイン用パスワードハッシュ(bcrypt等) |
| avatar | VARCHAR(255) | NULL | アバター画像URL |
| is_suspense | BOOLEAN | NULL DEFAULT FALSE | 凍結フラグ ※typo（is_suspended が正しい可能性あり） |
| freeze_reason | TEXT | NULL | ★追加 凍結理由（凍結API必須項目） |
| deleted_at | DATE | NULL | 論理削除日時 |
| created_at | DATE | NOT NULL DEFAULT NOW() | |
| updated_at | DATE | NULL | |

## files テーブル

| 列名 | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NOT NULL PK DEFAULT gen_random_uuid() | |
| filename | VARCHAR(255) | NOT NULL | ファイル名 |
| file_type | VARCHAR(255) | NOT NULL | MIMEタイプ |
| filesize | BIGINT | NOT NULL | バイト数 |
| filehash | VARCHAR(255) | NOT NULL | ファイルハッシュ（整合性確認・P2P重複排除用） |
| url | VARCHAR(255) | NOT NULL | RustFS上のストレージURL/キー |
| folder_id | UUID | NULL FK→folders.id | NULLはルート |
| author_id | UUID | NOT NULL FK→users.id | アップロード者 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | ★追加 論理削除フラグ |
| deleted_at | DATE | NULL | ★追加 ゴミ箱移動日時 |
| ocr_text | TEXT | NULL | ★追加 OCR抽出テキスト（画像ファイルのみ） |
| created_at | DATE | NULL | |
| updated_at | DATE | NULL | |

## folders テーブル

| 列名 | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NOT NULL PK DEFAULT gen_random_uuid() | |
| name | VARCHAR(255) | NOT NULL | フォルダー名 |
| folder_id | UUID | NULL FK→folders.id | 親フォルダー（NULLはルート）※自己参照 |
| owner_id | UUID | NOT NULL FK→users.id | ★追加 所有者 |
| is_deleted | BOOLEAN | NOT NULL DEFAULT FALSE | ★追加 論理削除フラグ |
| deleted_at | DATE | NULL | ★追加 |
| created_at | DATE | NULL | |
| updated_at | DATE | NULL | |

## file_permissions（★新規テーブル）

権限モデル（共通/権限モデル.md）から追加:

| 列名 | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NOT NULL PK DEFAULT gen_random_uuid() | |
| file_id | UUID | NOT NULL FK→files.id | |
| user_id | UUID | NOT NULL FK→users.id | |
| role | VARCHAR(20) | NOT NULL | 'owner' / 'editor' / 'viewer' |
| created_at | DATE | NOT NULL DEFAULT NOW() | |
| UNIQUE(file_id, user_id) | | | 同一ファイルに同一ユーザーの重複不可 |

## share_links（★新規テーブル）

リンク共有（ファイル系/共有系/リンク共有.md）から追加:

| 列名 | 型 | NULL | 説明 |
|---|---|---|---|
| id | UUID | NOT NULL PK DEFAULT gen_random_uuid() | |
| file_id | UUID | NOT NULL FK→files.id | |
| token | VARCHAR(255) | NOT NULL UNIQUE | URL埋め込みトークン |
| expires_at | DATE | NULL | NULLは無期限 |
| password_hash | VARCHAR(255) | NULL | NULLはパスワードなし |
| download_allowed | BOOLEAN | NOT NULL DEFAULT TRUE | |
| created_at | DATE | NOT NULL DEFAULT NOW() | |

## 推奨インデックス

- files(author_id), files(folder_id), files(is_deleted)
- folders(owner_id), folders(folder_id)
- file_permissions(file_id), file_permissions(user_id)
- share_links(token)
- users(username), users(email)

## Valkeyキー設計

| キー | 値 | TTL | 用途 |
|---|---|---|---|
| session:{session_id} | JSON { user_id, created_at } | 24h | 認証セッション |
| login_attempt:{user_id} | JSON { count, locked_until } | ペナルティ期間 | ログイン失敗カウント |
| p2p_room:{passphrase} | JSON { sender_ws_id, sdp_offer } | 10分 | 合言葉P2Pルーム |
