use sea_orm::prelude::{DateTimeWithTimeZone, Uuid};
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};

use crate::utils::auth::AuthError;

/// `start_folder_id` とその祖先フォルダー全ての `total_size` を `delta` だけ増減する。
/// `start_folder_id` が None（ルートレベル）の場合は何もしない。
pub async fn adjust_folder_chain<C: ConnectionTrait>(
    db: &C,
    start_folder_id: Option<Uuid>,
    delta: i64,
    now: DateTimeWithTimeZone,
) -> Result<(), AuthError> {
    let folder_id = match start_folder_id {
        Some(id) => id,
        None => return Ok(()),
    };
    if delta == 0 {
        return Ok(());
    }

    let sql = r#"
        WITH RECURSIVE chain AS (
            SELECT id, folder_id FROM folders WHERE id = $1
            UNION ALL
            SELECT f.id, f.folder_id
            FROM folders f
            INNER JOIN chain c ON f.id = c.folder_id
        )
        UPDATE folders
        SET total_size = total_size + $2, updated_at = $3
        WHERE id IN (SELECT id FROM chain)
    "#;

    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        sql,
        [folder_id.into(), delta.into(), now.into()],
    );
    db.query_all_raw(stmt).await?;
    Ok(())
}
