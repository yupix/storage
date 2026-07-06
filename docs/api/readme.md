# API 仕様

API仕様の索引です。プロジェクト概要、技術スタック、開発手順は
[ドキュメントトップ](../readme.md)を参照してください。

> API仕様には未実装または実装と異なる内容が含まれる可能性があります。
> 現在の差分は[コード仕様乖離レポート](../guide/divergence-report.md)に記録しています。

## アカウント

| 機能 | 仕様 |
|---|---|
| 登録 | [register.md](auth/register.md) |
| ログイン | [login.md](auth/login.md) |
| ログアウト | [logout.md](auth/logout.md) |
| プロフィール取得 | [profile.md](auth/profile.md) |
| 更新 | [update.md](auth/update.md) |
| 削除 | [delete.md](auth/delete.md) |
| 一覧 | [list.md](auth/list.md) |
| 凍結 | [suspend.md](auth/suspend.md) |
| 凍結解除 | [unsuspend.md](auth/unsuspend.md) |

## ファイル

| 機能 | 仕様 |
|---|---|
| アップロード | [upload.md](files/upload.md) |
| 一覧 | [list.md](files/list.md) |
| マイファイル一覧 | [mine.md](files/mine.md) |
| 閲覧 | [view.md](files/view.md) |
| 更新 | [update.md](files/update.md) |
| 削除 | [delete.md](files/delete.md) |
| ゴミ箱 | [trash.md](files/trash.md) |
| 復元 | [restore.md](files/restore.md) |
| ゴミ箱を空にする | [trash-empty.md](files/trash-empty.md) |

### 共有

| 機能 | 仕様 |
|---|---|
| 共有リンク作成 | [link.md](files/sharing/link.md) |
| 共有リンク一覧 | [link-list.md](files/sharing/link-list.md) |
| 共有リンク削除 | [link-delete.md](files/sharing/link-delete.md) |
| 合言葉共有 | [watchword.md](files/sharing/watchword.md) |
| ダウンロード | [download.md](files/sharing/download.md) |

## フォルダー

| 機能 | 仕様 |
|---|---|
| 作成 | [create.md](folders/create.md) |
| 取得 | [get.md](folders/get.md) |
| 一覧 | [list.md](folders/list.md) |
| 更新 | [update.md](folders/update.md) |
| 削除 | [delete.md](folders/delete.md) |

## 検索

| 機能 | 仕様 |
|---|---|
| アカウント名検索 | [account.md](search/account.md) |
| 内容検索 | [content.md](search/content.md) |
| ファイル名検索 | [filename.md](search/filename.md) |
| OCR検索 | [ocr.md](search/ocr.md) |
| ベクトル検索 | [vector.md](search/vector.md) |
| ハイブリッド検索 | [hybrid.md](search/hybrid.md) |

## 共通仕様

- [エラーレスポンス](common/errors.md)
- [ページネーション](common/pagination.md)
- [権限モデル](common/permissions.md)
