use sea_orm_migration::prelude::Iden;
use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(FilePermissions::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(FilePermissions::Id)
                            .uuid()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(FilePermissions::FileId).uuid().not_null())
                    .col(ColumnDef::new(FilePermissions::UserId).uuid().not_null())
                    .col(string(FilePermissions::Role).not_null())
                    .col(
                        timestamp_with_time_zone(FilePermissions::CreatedAt)
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-file_permissions-file_id")
                            .from(FilePermissions::Table, FilePermissions::FileId)
                            .to(Files::Table, Files::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-file_permissions-user_id")
                            .from(FilePermissions::Table, FilePermissions::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-file_permissions-file_id")
                    .table(FilePermissions::Table)
                    .col(FilePermissions::FileId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-file_permissions-user_id")
                    .table(FilePermissions::Table)
                    .col(FilePermissions::UserId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .unique()
                    .name("idx-file_permissions-file_id-user_id-unique")
                    .table(FilePermissions::Table)
                    .col(FilePermissions::FileId)
                    .col(FilePermissions::UserId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(FilePermissions::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum FilePermissions {
    Table,
    Id,
    FileId,
    UserId,
    Role,
    CreatedAt,
}

#[derive(Iden)]
enum Files {
    Table,
    Id,
}

#[derive(Iden)]
enum Users {
    Table,
    Id,
}
