//! 同一フォルダー内での名前重複を避けるための自動採番ユーティリティ。
//!
//! 同一所有者・同一フォルダー・未削除の範囲で同名が存在する場合、
//! `名前 (N).拡張子`（ファイル）/ `名前 (N)`（フォルダー）の形で、
//! 使われていない最小の N を付与する。web 側 `SharePanel` の
//! `buildFileToSend` と同じ分割規則（最後の `.` が先頭以外にあるときのみ
//! 拡張子として分離する）に合わせている。

use std::collections::HashSet;

use sea_orm::prelude::Uuid;
use sea_orm::{ColumnTrait, ConnectionTrait, DbErr, EntityTrait, QueryFilter, QuerySelect, SqlErr};

use crate::entities::{files, folders};
use crate::utils::auth::AuthError;

/// DB のカラム上限（`VARCHAR(255)`）に合わせた名前の最大文字数。
const MAX_NAME_LEN: usize = 255;
/// 採番の試行回数の上限。無限ループと過剰なループ負荷（DoS）を防ぐバックストップ。
const MAX_DEDUP_ATTEMPTS: u32 = 100_000;

/// 既存の名前集合と衝突しない名前を返す。
///
/// `desired` が未使用ならそのまま返す。衝突する場合は `stem (N)ext` の形式で
/// 使われていない最小の N（1 以上）を付ける。拡張子は「最後の `.` が先頭より
/// 後ろにあるとき」だけ分離するため、`.bashrc` のようなドット始まりは
/// 拡張子なし扱いになる。
///
/// ` (N)` と拡張子を付けても全体が [`MAX_NAME_LEN`] 文字を超えないよう、stem を
/// 文字単位で切り詰める。試行が [`MAX_DEDUP_ATTEMPTS`] を超えた場合は
/// [`AuthError::Conflict`] を返す。
fn resolve_unique_name(desired: &str, existing: &HashSet<String>) -> Result<String, AuthError> {
    if !existing.contains(desired) {
        return Ok(desired.to_string());
    }
    let (stem, ext) = match desired.rfind('.') {
        Some(idx) if idx > 0 => (&desired[..idx], &desired[idx..]),
        _ => (desired, ""),
    };
    for n in 1..=MAX_DEDUP_ATTEMPTS {
        let suffix = format!(" ({n})");
        // 拡張子とサフィックスを付けても 255 文字に収まるよう stem を切り詰める。
        // バイトではなく文字単位で切るため UTF-8 の途中で割れない。
        let reserved = suffix.chars().count() + ext.chars().count();
        let stem_budget = MAX_NAME_LEN.saturating_sub(reserved);
        let stem_trunc: String = stem.chars().take(stem_budget).collect();
        let candidate = format!("{stem_trunc}{suffix}{ext}");
        if !existing.contains(&candidate) {
            return Ok(candidate);
        }
    }
    Err(AuthError::Conflict(
        "同名が多すぎて自動採番できませんでした".into(),
    ))
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
    resolve_unique_name(desired, &existing)
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
    resolve_unique_name(desired, &existing)
}

/// insert/update 実行時、事前採番と実行の間の競合（TOCTOU）で
/// 部分 UNIQUE インデックスに触れた場合を 409（Conflict）に整形する。
/// それ以外の DB エラーは内部エラー扱いのまま返す。
pub fn map_unique_conflict(e: DbErr) -> AuthError {
    match e.sql_err() {
        Some(SqlErr::UniqueConstraintViolation(_)) => {
            AuthError::Conflict("同じ名前のファイルまたはフォルダーが既に存在します".into())
        }
        _ => AuthError::Internal(anyhow::anyhow!("db error: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(names: &[&str]) -> HashSet<String> {
        names.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn returns_desired_when_no_conflict() {
        assert_eq!(resolve_unique_name("Image.jpg", &set(&[])).unwrap(), "Image.jpg");
        assert_eq!(
            resolve_unique_name("Image.jpg", &set(&["Other.jpg"])).unwrap(),
            "Image.jpg"
        );
    }

    #[test]
    fn appends_number_keeping_extension() {
        assert_eq!(
            resolve_unique_name("Image.jpg", &set(&["Image.jpg"])).unwrap(),
            "Image (1).jpg"
        );
    }

    #[test]
    fn picks_smallest_unused_number() {
        assert_eq!(
            resolve_unique_name(
                "Image.jpg",
                &set(&["Image.jpg", "Image (1).jpg", "Image (3).jpg"])
            )
            .unwrap(),
            "Image (2).jpg"
        );
    }

    #[test]
    fn folder_without_extension() {
        assert_eq!(
            resolve_unique_name("Documents", &set(&["Documents"])).unwrap(),
            "Documents (1)"
        );
    }

    #[test]
    fn dotfile_treated_as_no_extension() {
        assert_eq!(
            resolve_unique_name(".bashrc", &set(&[".bashrc"])).unwrap(),
            ".bashrc (1)"
        );
    }

    #[test]
    fn multi_dot_splits_at_last_dot() {
        assert_eq!(
            resolve_unique_name("archive.tar.gz", &set(&["archive.tar.gz"])).unwrap(),
            "archive.tar (1).gz"
        );
    }

    #[test]
    fn trailing_dot_keeps_dot() {
        assert_eq!(
            resolve_unique_name("name.", &set(&["name."])).unwrap(),
            "name (1)."
        );
    }

    #[test]
    fn truncates_to_stay_within_length_limit() {
        // 255 文字ちょうどの名前が衝突すると ` (1)` 付与で超過する。stem 側が
        // 切り詰められ、全体が 255 文字以内に収まること。
        let long = "あ".repeat(255);
        let result = resolve_unique_name(&long, &set(&[long.as_str()])).unwrap();
        assert!(result.chars().count() <= MAX_NAME_LEN);
        assert!(result.ends_with(" (1)"));
    }
}
