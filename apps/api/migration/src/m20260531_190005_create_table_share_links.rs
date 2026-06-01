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
                    .table(ShareLinks::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(ShareLinks::Id).uuid().not_null().primary_key())
                    .col(ColumnDef::new(ShareLinks::FileId).uuid().not_null())
                    .col(string(ShareLinks::Token).not_null().unique_key())
                    .col(timestamp_with_time_zone(ShareLinks::ExpiresAt).null())
                    .col(ColumnDef::new(ShareLinks::PasswordHash).string_len(255).null())
                    .col(
                        boolean(ShareLinks::DownloadAllowed)
                            .not_null()
                            .default(true),
                    )
                    .col(
                        timestamp_with_time_zone(ShareLinks::CreatedAt)
                            .not_null()
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-share_links-file_id")
                            .from(ShareLinks::Table, ShareLinks::FileId)
                            .to(Files::Table, Files::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-share_links-token")
                    .table(ShareLinks::Table)
                    .col(ShareLinks::Token)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(ShareLinks::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum ShareLinks {
    Table,
    Id,
    FileId,
    Token,
    ExpiresAt,
    PasswordHash,
    DownloadAllowed,
    CreatedAt,
}

#[derive(Iden)]
enum Files {
    Table,
    Id,
}
