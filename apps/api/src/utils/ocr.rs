use std::path::Path;

const SUPPORTED_MIMES: &[&str] = &[
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/gif",
    "image/webp",
];

pub fn is_ocr_supported(mime: &str) -> bool {
    SUPPORTED_MIMES.contains(&mime)
}

/// 画像ファイルからテキストを抽出する。
/// 日本語・英語の混在文書に対応。テキストが空の場合は None を返す。
pub fn extract_text(path: &Path) -> Option<String> {
    let path_str = path.to_str()?;
    let api = tesseract::Tesseract::new(None, Some("jpn+eng")).ok()?;
    let mut api = api.set_image(path_str).ok()?;
    let text = api.get_text().ok()?;
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
}
