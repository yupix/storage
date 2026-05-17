use sea_orm_migration::prelude::Iden;
use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Replace the sample below with your own migration scripts
        manager
            .create_table(
                Table::create()
                    .table(Users::Table)
                    .if_not_exists()
                    .col(ColumnDef::new(Users::Id).uuid().not_null().primary_key())
                    .col(string(Users::Username).not_null())
                    .col(string(Users::AvatarUrl).null())
                    .col(timestamp_with_time_zone(Users::DeletedAt).null())
                    .col(boolean(Users::IsSuspended).not_null().default(false))
                    .col(timestamp_with_time_zone(Users::CreatedAt).not_null())
                    .col(timestamp_with_time_zone(Users::UpdatedAt).not_null())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Users::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Users {
    Table,
    Id,
    Username,
    AvatarUrl,
    DeletedAt,
    IsSuspended,
    CreatedAt,
    UpdatedAt,
}
