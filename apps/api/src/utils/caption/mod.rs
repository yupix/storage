pub mod driver;
pub mod gemini;
pub mod local_http;

pub use driver::CaptionDriver;
pub use gemini::GeminiCaptioner;
pub use local_http::LocalHttpCaptioner;

use std::path::Path;

use anyhow::Result;

use crate::settings::Settings;

#[derive(Clone)]
pub enum Captioner {
    Gemini(GeminiCaptioner),
    LocalHttp(LocalHttpCaptioner),
    None,
}

impl CaptionDriver for Captioner {
    async fn caption(&self, path: &Path, mime: &str) -> Result<Option<String>> {
        match self {
            Self::Gemini(c) => c.caption(path, mime).await,
            Self::LocalHttp(c) => c.caption(path, mime).await,
            Self::None => Ok(None),
        }
    }
}

pub fn build_captioner(settings: &Settings) -> Result<Captioner> {
    match settings.caption_driver.as_deref() {
        Some("gemini") => {
            let key = settings
                .gemini_api_key
                .as_deref()
                .ok_or_else(|| anyhow::anyhow!("GEMINI_API_KEY が未設定です"))?;
            Ok(Captioner::Gemini(GeminiCaptioner::new(key)))
        }
        Some("local_http") => {
            let url = settings
                .caption_local_url
                .as_deref()
                .unwrap_or("http://localhost:8500");
            Ok(Captioner::LocalHttp(LocalHttpCaptioner::new(url)))
        }
        Some(other) => Err(anyhow::anyhow!("不明なキャプションドライバー: {other}")),
        None => Ok(Captioner::None),
    }
}
