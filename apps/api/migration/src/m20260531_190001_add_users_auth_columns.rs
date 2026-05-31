use sea_orm_migration::prelude::Iden;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .add_column(
                        ColumnDef::new(Users::Email)
                            .string_len(255)
                            .not_null()
                            .unique_key(),
                    )
                    .add_column(
                        ColumnDef::new(Users::PasswordHash)
                            .string_len(255)
                            .not_null(),
                    )
                    .add_column(ColumnDef::new(Users::FreezeReason).text().null())
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx-users-username-unique")
                    .table(Users::Table)
                    .col(Users::Username)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx-users-username-unique")
                    .table(Users::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Users::Table)
                    .drop_column(Users::FreezeReason)
                    .drop_column(Users::PasswordHash)
                    .drop_column(Users::Email)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(Iden)]
enum Users {
    Table,
    Email,
    PasswordHash,
    FreezeReason,
    Username,
}
