# パスワード変更

| 要件 | 値 |
|----|----|
| ログインの有無 | 要 |
| エンドポイント | /v1/users/me/password |
| メソッド | PUT |


## 概要

ログイン中の自分のパスワードを変更する。現在のパスワードで本人確認してから、新しいパスワードに変更する。


## 必要なデータ

| キー | 値の種類 | 説明 |
|----|----|----|
| current_password | String（8文字以上） | 現在のパスワード（本人確認用） |
| new_password | String（8文字以上） | 新しいパスワード |


## レスポンス

| ステータス | 内容 |
|----|----|
| 200 | 変更成功 |
| 400 | 現在のパスワードが正しくない / バリデーションエラー |
| 401 | 未認証 |


## 実装メモ（2026-07-15）

- Rust API (`handlers/users.rs::change_password`) で実装。`verify_password` で現在のパスワードを検証し、argon2 で新しいハッシュを保存する。誤った現在パスワードは 400（メッセージ「現在のパスワードが正しくありません」）を返す。
- OpenAPI スキーマ（`apps/web/src/api/schema.d.ts`）に反映済み。フロントは設定ページ（`/settings`）から利用。


## 実装要件
- Valkey でセッション → ユーザーID取得
- 現在のパスワード検証（argon2）
- PostgreSQL で `password_hash` 更新（`updated_at` も更新）
- 必要コンポーネント: PostgreSQL、Valkey
