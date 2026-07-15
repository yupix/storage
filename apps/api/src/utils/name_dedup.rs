//! 同一フォルダー内での名前重複を避けるための自動採番ユーティリティ。
//!
//! 同一所有者・同一フォルダー・未削除の範囲で同名が存在する場合、
//! `名前 (N).拡張子`（ファイル）/ `名前 (N)`（フォルダー）の形で、
//! 使われていない最小の N を付与する。web 側 `SharePanel` の
//! `buildFileToSend` と同じ分割規則（最後の `.` が先頭以外にあるときのみ
//! 拡張子として分離する）に合わせている。

use std::collections::HashSet;

use sea_orm::prelude::Uuid;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, QuerySelect};

use crate::entities::{files, folders};
use crate::utils::auth::AuthError;

/// 既存の名前集合と衝突しない名前を返す。
///
/// `desired` が未使用ならそのまま返す。衝突する場合は `stem (N)ext` の形式で
/// 使われていない最小の N（1 以上）を付ける。拡張子は「最後の `.` が先頭より
/// 後ろにあるとき」だけ分離するため、`.bashrc` のようなドット始まりは
/// 拡張子なし扱いになる。
fn resolve_unique_name(desired: &str, existing: &HashSet<String>) -> String {
    if !existing.contains(desired) {
        return desired.to_string();
    }
    let (stem, ext) = match desired.rfind('.') {
        Some(idx) if idx > 0 => (&desired[..idx], &desired[idx..]),
        _ => (desired, ""),
    };
    let mut n: u32 = 1;
    loop {
        let candidate = format!("{stem} ({n}){ext}");
        if !existing.contains(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// 同一所有者・同一フォルダー・未削除の範囲でファイル名を採番する。
///
/// `exclude_id` はリネーム/移動時に自分自身を衝突対象から外すために指定する
/// （新規作成時は `None`）。
pub async fn dedup_filename<C: ConnectionTrait>(
    db: &C,
    author_id: Uuid,
    folder_id: Option<Uuid>,
    desired: &str,
    exclude_id: Option<Uuid>,
) -> Result<String, AuthError> {
    let mut query = files::Entity::find()
        .select_only()
        .column(files::Column::Filename)
        .filter(files::Column::AuthorId.eq(author_id))
        .filter(files::Column::IsDeleted.eq(false));
    query = match folder_id {
        Some(fid) => query.filter(files::Column::FolderId.eq(fid)),
        None => query.filter(files::Column::FolderId.is_null()),
    };
    if let Some(id) = exclude_id {
        query = query.filter(files::Column::Id.ne(id));
    }
    let existing: HashSet<String> = query
        .into_tuple::<String>()
        .all(db)
        .await?
        .into_iter()
        .collect();
    Ok(resolve_unique_name(desired, &existing))
}

/// 同一所有者・同一親フォルダー・未削除の範囲でフォルダー名を採番する。
///
/// `exclude_id` はリネーム/移動時に自分自身を衝突対象から外すために指定する
/// （新規作成時は `None`）。
pub async fn dedup_folder_name<C: ConnectionTrait>(
    db: &C,
    owner_id: Uuid,
    parent_id: Option<Uuid>,
    desired: &str,
    exclude_id: Option<Uuid>,
) -> Result<String, AuthError> {
    let mut query = folders::Entity::find()
        .select_only()
        .column(folders::Column::Name)
        .filter(folders::Column::OwnerId.eq(owner_id))
        .filter(folders::Column::IsDeleted.eq(false));
    query = match parent_id {
        Some(pid) => query.filter(folders::Column::FolderId.eq(pid)),
        None => query.filter(folders::Column::FolderId.is_null()),
    };
    if let Some(id) = exclude_id {
        query = query.filter(folders::Column::Id.ne(id));
    }
    let existing: HashSet<String> = query
        .into_tuple::<String>()
        .all(db)
        .await?
        .into_iter()
        .collect();
    Ok(resolve_unique_name(desired, &existing))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(names: &[&str]) -> HashSet<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn returns_desired_when_no_conflict() {
        assert_eq!(resolve_unique_name("Image.jpg", &set(&[])), "Image.jpg");
        assert_eq!(
            resolve_unique_name("Image.jpg", &set(&["Other.jpg"])),
            "Image.jpg"
        );
    }

    #[test]
    fn appends_number_keeping_extension() {
        assert_eq!(
            resolve_unique_name("Image.jpg", &set(&["Image.jpg"])),
            "Image (1).jpg"
        );
    }

    #[test]
    fn picks_smallest_unused_number() {
        assert_eq!(
            resolve_unique_name(
                "Image.jpg",
                &set(&["Image.jpg", "Image (1).jpg", "Image (3).jpg"])
            ),
            "Image (2).jpg"
        );
    }

    #[test]
    fn folder_without_extension() {
        assert_eq!(
            resolve_unique_name("Documents", &set(&["Documents"])),
            "Documents (1)"
        );
    }

    #[test]
    fn dotfile_treated_as_no_extension() {
        assert_eq!(
            resolve_unique_name(".bashrc", &set(&[".bashrc"])),
            ".bashrc (1)"
        );
    }

    #[test]
    fn multi_dot_splits_at_last_dot() {
        assert_eq!(
            resolve_unique_name("archive.tar.gz", &set(&["archive.tar.gz"])),
            "archive.tar (1).gz"
        );
    }

    #[test]
    fn trailing_dot_keeps_dot() {
        assert_eq!(
            resolve_unique_name("name.", &set(&["name."])),
            "name (1)."
        );
    }
}
