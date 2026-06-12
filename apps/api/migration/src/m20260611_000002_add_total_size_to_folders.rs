use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{DatabaseBackend, Statement, TransactionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Folders::Table)
                    .add_column(
                        ColumnDef::new(Folders::TotalSize)
                            .big_integer()
                            .not_null()
                            .default(0i64),
                    )
                    .to_owned(),
            )
            .await?;

        // 既存フォルダーに再帰 CTE で合計サイズを書き込む
        let db = manager.get_connection();
        let txn = db.begin().await?;
        let sql = r#"
            WITH RECURSIVE subtree AS (
                SELECT id AS ancestor_id, id AS folder_id
                FROM folders
                WHERE is_deleted = false
                UNION ALL
                SELECT s.ancestor_id, f.id AS folder_id
                FROM folders f
                INNER JOIN subtree s ON f.folder_id = s.folder_id
                WHERE f.is_deleted = false
            ),
            sizes AS (
                SELECT s.ancestor_id, COALESCE(SUM(fi.filesize), 0)::bigint AS total_size
                FROM subtree s
                LEFT JOIN files fi ON fi.folder_id = s.folder_id AND fi.is_deleted = false
                GROUP BY s.ancestor_id
            )
            UPDATE folders f
            SET total_size = s.total_size
            FROM sizes s
            WHERE f.id = s.ancestor_id
        "#;
        txn.execute(Statement::from_string(DatabaseBackend::Postgres, sql))
            .await?;
        txn.commit().await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Folders::Table)
                    .drop_column(Folders::TotalSize)
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}

#[derive(Iden)]
enum Folders {
    Table,
    TotalSize,
}
