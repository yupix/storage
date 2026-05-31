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
                    .table(Files::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Files::Id).uuid().not_null().primary_key())
                    .col(string(Files::Filename).not_null())
                    .col(string(Files::FileType).not_null())
                    .col(big_integer(Files::Filesize).not_null())
                    .col(string(Files::Filehash).not_null())
                    .col(string(Files::Url).not_null())
                    .col(ColumnDef::new(Files::FolderId).uuid().null())
                    .col(ColumnDef::new(Files::AuthorId).uuid().not_null())
                    .col(boolean(Files::IsDeleted).not_null().default(false))
                    .col(timestamp_with_time_zone(Files::DeletedAt).null())
                    .col(ColumnDef::new(Files::OcrText).text().null())
                    .col(timestamp_with_time_zone(Files::CreatedAt).null())
                    .col(timestamp_with_time_zone(Files::UpdatedAt).null())
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-files-folder_id")
                            .from(Files::Table, Files::FolderId)
                            .to(Folders::Table, Folders::Id)
                            .on_delete(ForeignKeyAction::SetNull)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk-files-author_id")
                            .from(Files::Table, Files::AuthorId)
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
                    .name("idx-files-author_id")
                    .table(Files::Table)
                    .col(Files::AuthorId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-files-folder_id")
                    .table(Files::Table)
                    .col(Files::FolderId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-files-is_deleted")
                    .table(Files::Table)
                    .col(Files::IsDeleted)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Files::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Files {
    Table,
    Id,
    Filename,
    FileType,
    Filesize,
    Filehash,
    Url,
    FolderId,
    AuthorId,
    IsDeleted,
    DeletedAt,
    OcrText,
    CreatedAt,
    UpdatedAt,
}

#[derive(Iden)]
enum Folders {
    Table,
    Id,
}

#[derive(Iden)]
enum Users {
    Table,
    Id,
}
