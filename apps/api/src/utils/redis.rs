use redis_pool::SingleRedisPool;

#[derive(Clone)]
pub struct RedisConnection {
    pub conn: SingleRedisPool,
}

impl RedisConnection {
    pub fn new(url: &str) -> Self {
        let client = redis::Client::open(url).unwrap();
        let pool = SingleRedisPool::from(client);
        Self { conn: pool }
    }

    pub async fn ping(&self) -> Result<(), anyhow::Error> {
        let mut connection = self
            .conn
            .acquire()
            .await
            .map_err(|e| anyhow::anyhow!("redis acquire failed: {e}"))?;

        let _: String = redis::cmd("PING")
            .query_async(&mut connection)
            .await
            .map_err(|e| anyhow::anyhow!("redis ping failed: {e}"))?;

        Ok(())
    }

    /// SET key value EX ttl NX — returns true when the key was created.
    pub async fn set_nx_ex(
        &self,
        key: &str,
        value: &str,
        ttl_secs: u64,
    ) -> Result<bool, anyhow::Error> {
        let mut connection = self
            .conn
            .acquire()
            .await
            .map_err(|e| anyhow::anyhow!("redis acquire failed: {e}"))?;

        let result: Option<String> = redis::cmd("SET")
            .arg(key)
            .arg(value)
            .arg("EX")
            .arg(ttl_secs)
            .arg("NX")
            .query_async(&mut connection)
            .await
            .map_err(|e| anyhow::anyhow!("redis set nx ex failed: {e}"))?;

        Ok(result.is_some())
    }
}
