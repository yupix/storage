use axum::{Json, extract::State};

use crate::payloads::config::IceServersResponse;
use crate::AppState;

#[axum::debug_handler]
#[utoipa::path(
    get,
    path = "/ice-servers",
    responses(
        (status = 200, description = "WebRTC ICE servers (STUN/TURN)", body = IceServersResponse),
    )
)]
pub async fn get_ice_servers(State(state): State<AppState>) -> Json<IceServersResponse> {
    Json(IceServersResponse::from_settings(&state.settings))
}
