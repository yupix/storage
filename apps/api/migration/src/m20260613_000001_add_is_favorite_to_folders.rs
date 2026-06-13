use sea_orm_migration::prelude::Iden;
use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Folders::Table)
                    .add_column(boolean(Folders::IsFavorite).not_null().default(false))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-folders-owner_is_deleted_is_favorite")
                    .table(Folders::Table)
                    .col(Folders::OwnerId)
                    .col(Folders::IsDeleted)
                    .col(Folders::IsFavorite)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx-folders-owner_is_deleted_is_favorite")
                    .table(Folders::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Folders::Table)
                    .drop_column(Folders::IsFavorite)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Folders {
    Table,
    OwnerId,
    IsDeleted,
    IsFavorite,
}
