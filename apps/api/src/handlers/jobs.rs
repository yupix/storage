use axum::{Json, extract::State};
use redis::AsyncCommands;
use serde::Serialize;
use utoipa::ToSchema;

use crate::{AppState, utils::auth::AuthError};

#[derive(Serialize, ToSchema)]
pub struct QueueStats {
    pub name: String,
    pub pending: i64,
    pub done: i64,
    pub failed: i64,
    pub workers: i64,
}

#[derive(Serialize, ToSchema)]
pub struct JobsStatsResponse {
    pub queues: Vec<QueueStats>,
}

const QUEUES: &[(&str, &str)] = &[
    ("OCR", "api::jobs::ocr::OcrJob"),
    ("Embed", "api::jobs::embed::EmbedJob"),
    ("Caption", "api::jobs::caption::CaptionJob"),
];

#[axum::debug_handler]
#[utoipa::path(
    get,
    path = "/jobs/stats",
    responses(
        (status = 200, description = "Job queue stats", body = JobsStatsResponse),
    )
)]
pub async fn get_jobs_stats(
    State(state): State<AppState>,
) -> Result<Json<JobsStatsResponse>, AuthError> {
    let mut conn = state
        .redis_client
        .conn
        .acquire()
        .await
        .map_err(|e| AuthError::Internal(anyhow::anyhow!("redis: {e}")))?;

    let mut queues = Vec::new();

    for (name, ns) in QUEUES {
        let pending: i64 = redis::cmd("HLEN")
            .arg(format!("{ns}:data"))
            .query_async(&mut conn)
            .await
            .unwrap_or(0);

        // done/failed は list か set かバージョンで異なるため両方試す
        let done: i64 = {
            let as_list: i64 = redis::cmd("LLEN")
                .arg(format!("{ns}:done"))
                .query_async(&mut conn)
                .await
                .unwrap_or(0);
            if as_list > 0 {
                as_list
            } else {
                conn.scard::<_, i64>(format!("{ns}:done"))
                    .await
                    .unwrap_or(0)
            }
        };

        let failed: i64 = {
            let as_list: i64 = redis::cmd("LLEN")
                .arg(format!("{ns}:failed"))
                .query_async(&mut conn)
                .await
                .unwrap_or(0);
            if as_list > 0 {
                as_list
            } else {
                conn.scard::<_, i64>(format!("{ns}:failed"))
                    .await
                    .unwrap_or(0)
            }
        };

        let workers: i64 = conn
            .scard::<_, i64>(format!("{ns}:workers"))
            .await
            .unwrap_or(0);

        queues.push(QueueStats {
            name: name.to_string(),
            pending,
            done,
            failed,
            workers,
        });
    }

    Ok(Json(JobsStatsResponse { queues }))
}
