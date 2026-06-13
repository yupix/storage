use std::path::Path;

use anyhow::Result;

#[allow(async_fn_in_trait)]
pub trait CaptionDriver {
    /// 画像ファイルを受け取り、内容の説明文を返す。
    /// キャプション不要・対応外の場合は `None` を返す。
    async fn caption(&self, path: &Path, mime: &str) -> Result<Option<String>>;
}
