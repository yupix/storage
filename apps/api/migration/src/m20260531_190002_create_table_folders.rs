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
                    .table(Folders::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Folders::Id).uuid().not_null().primary_key())
                    .col(string(Folders::Name).not_null())
                    .col(ColumnDef::new(Folders::FolderId).uuid().null())
                    .col(ColumnDef::new(Folders::OwnerId).uuid().not_null())
                    .col(boolean(Folders::IsDeleted).not_null().default(false))
                    .col(timestamp_with_time_zone(Folders::DeletedAt).null())
                    .col(timestamp_with_time_zone(Folders::CreatedAt).null())
                    .col(timestamp_with_time_zone(Folders::UpdatedAt).null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-folders-folder_id")
                            .from(Folders::Table, Folders::FolderId)
                            .to(Folders::Table, Folders::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-folders-owner_id")
                            .from(Folders::Table, Folders::OwnerId)
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
                    .name("idx-folders-owner_id")
                    .table(Folders::Table)
                    .col(Folders::OwnerId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-folders-folder_id")
                    .table(Folders::Table)
                    .col(Folders::FolderId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Folders::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Folders {
    Table,
    Id,
    Name,
    FolderId,
    OwnerId,
    IsDeleted,
    DeletedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Users {
    Table,
    Id,
}
