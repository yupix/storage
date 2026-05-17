pub use sea_orm_migration::prelude::*;

mod m20260424_050952_create_table_users;
mod m20260428_103203_add_files_and_folders;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(m20260424_050952_create_table_users::Migration)]
    }
}
