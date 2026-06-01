pub use sea_orm_migration::prelude::*;

mod m20260424_050952_create_table_users;
mod m20260428_103203_add_files_and_folders;
mod m20260531_190001_add_users_auth_columns;
mod m20260531_190002_create_table_folders;
mod m20260531_190003_create_table_files;
mod m20260531_190004_create_table_file_permissions;
mod m20260531_190005_create_table_share_links;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260424_050952_create_table_users::Migration),
            Box::new(m20260531_190001_add_users_auth_columns::Migration),
            Box::new(m20260531_190002_create_table_folders::Migration),
            Box::new(m20260531_190003_create_table_files::Migration),
            Box::new(m20260531_190004_create_table_file_permissions::Migration),
            Box::new(m20260531_190005_create_table_share_links::Migration),
        ]
    }
}
