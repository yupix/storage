use sea_orm::Database;

/// アプリケーション設定
#[derive(Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
}

impl Default for Config {
    fn default() -> Self {
        dotenv::dotenv().ok();
        Self {
            host: std::env::var("HOST").unwrap_or("0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .unwrap_or("3500".to_string())
                .parse()
                .unwrap_or(3500),
            database_url: std::env::var("DATABASE_URL")
                .unwrap_or("postgres://user:password@localhost/users_db".to_string()),
        }
    }
}

impl Config {
    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }

    pub async fn init_db(&self) -> Result<sea_orm::DbConn, sea_orm::DbErr> {
        Database::connect(&self.database_url).await
    }
}
