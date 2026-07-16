use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::ConnectionTrait;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        // UNIQUE インデックス作成前に、既存の重複（未削除・同一所有者・同一フォルダー・
        // 同名）を一意化する。#46 以前に作られた重複が残っていると作成が失敗するため。
        // 各グループの2件目以降に id の先頭8桁を付けて衝突を避ける（id は一意なので
        // 二次衝突しない）。PARTITION BY は folder_id の NULL を同一グループとして扱う。
        db.execute_unprepared(
            r#"
            WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY author_id, folder_id, filename
                           ORDER BY created_at NULLS FIRST, id
                       ) AS rn
                FROM files
                WHERE is_deleted = false
            )
            UPDATE files
            SET filename = filename || ' (' || substr(ranked.id::text, 1, 8) || ')'
            FROM ranked
            WHERE files.id = ranked.id AND ranked.rn > 1;
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY owner_id, folder_id, name
                           ORDER BY created_at NULLS FIRST, id
                       ) AS rn
                FROM folders
                WHERE is_deleted = false
            )
            UPDATE folders
            SET name = name || ' (' || substr(ranked.id::text, 1, 8) || ')'
            FROM ranked
            WHERE folders.id = ranked.id AND ranked.rn > 1;
            "#,
        )
        .await?;

        // 部分 UNIQUE インデックス。未削除の行だけを対象にし、NULLS NOT DISTINCT で
        // ホーム直下（folder_id = NULL）の同名も衝突として扱う（PostgreSQL 15+ が必要）。
        db.execute_unprepared(
            r#"CREATE UNIQUE INDEX "uq-files-active-owner_folder_name"
               ON files (author_id, folder_id, filename)
               NULLS NOT DISTINCT
               WHERE is_deleted = false;"#,
        )
        .await?;

        db.execute_unprepared(
            r#"CREATE UNIQUE INDEX "uq-folders-active-owner_folder_name"
               ON folders (owner_id, folder_id, name)
               NULLS NOT DISTINCT
               WHERE is_deleted = false;"#,
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        db.execute_unprepared(r#"DROP INDEX IF EXISTS "uq-folders-active-owner_folder_name";"#)
            .await?;
        db.execute_unprepared(r#"DROP INDEX IF EXISTS "uq-files-active-owner_folder_name";"#)
            .await?;
        Ok(())
    }
}
