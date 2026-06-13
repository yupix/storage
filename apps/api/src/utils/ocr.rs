use std::path::Path;
use std::time::Duration;

const SUPPORTED_MIMES: &[&str] = &[
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/gif",
    "image/webp",
];

/// ndlocr-lite の ocr.py へのパス（コンパイル時に CARGO_MANIFEST_DIR から解決）
const OCR_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../extern/ndlocr-lite/src/ocr.py");

/// OCR タイムアウト（秒）
const TIMEOUT_SECS: u64 = 120;

pub fn is_ocr_supported(mime: &str) -> bool {
    SUPPORTED_MIMES.contains(&mime)
}

fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/tiff" => "tiff",
        "image/bmp" => "bmp",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    }
}

/// ndlocr-lite を使って画像からテキストを抽出する（async版）。
/// tokio::process::Command を使い、SIGCHLD との競合を避ける。
/// mime: ndlocr-lite が拡張子で画像を判定するため必須。
pub async fn extract_text(image_path: &Path, mime: &str) -> Option<String> {
    eprintln!("[OCR] 開始: script={OCR_SCRIPT:?} image={image_path:?}");

    if !std::path::Path::new(OCR_SCRIPT).exists() {
        eprintln!("[OCR] ERROR: スクリプトが見つかりません: {OCR_SCRIPT}");
        return None;
    }

    // ndlocr-lite は拡張子でファイル形式を判定する。
    // API の一時ファイルには拡張子がないため、正しい拡張子を持つ一時ファイルにコピーする。
    let ext = mime_to_ext(mime);
    let named_tmp = tempfile::Builder::new()
        .suffix(&format!(".{ext}"))
        .tempfile()
        .ok()?;
    std::fs::copy(image_path, named_tmp.path())
        .map_err(|e| eprintln!("[OCR] ファイルコピー失敗: {e}"))
        .ok()?;

    let out_dir = tempfile::TempDir::new().ok()?;
    let out_path = out_dir.path().to_path_buf();
    let named_tmp_path = named_tmp.path().to_path_buf();

    let output = tokio::time::timeout(
        Duration::from_secs(TIMEOUT_SECS),
        tokio::process::Command::new("python3")
            .arg(OCR_SCRIPT)
            .arg("--sourceimg")
            .arg(&named_tmp_path)
            .arg("--output")
            .arg(&out_path)
            .arg("--json-only")
            .output(),
    )
    .await
    .map_err(|_| eprintln!("[OCR] タイムアウト: {TIMEOUT_SECS}s を超えました"))
    .ok()?
    .map_err(|e| eprintln!("[OCR] spawn/wait 失敗: {e}"))
    .ok()?;

    let stderr_msg = String::from_utf8_lossy(&output.stderr);
    let stderr_trimmed = stderr_msg.trim();
    if !stderr_trimmed.is_empty() {
        eprintln!("[OCR] stderr:\n{stderr_trimmed}");
    }

    if !output.status.success() {
        eprintln!("[OCR] 失敗 status={}", output.status);
        return None;
    }

    // JSON ファイルを探して読み込む（stem.json の名前で出力される）
    let json_path = std::fs::read_dir(&out_path)
        .ok()?
        .flatten()
        .find(|e| e.path().extension().is_some_and(|x| x == "json"))?
        .path();

    let content = std::fs::read_to_string(&json_path).ok()?;
    let result = parse_ndlocr_json(&content);
    eprintln!("[OCR] 完了: {} 文字", result.as_deref().map_or(0, |s| s.chars().count()));
    result
}

/// ndlocr-lite JSON から全テキストを連結して返す。
/// 構造: { "contents": [[{ "text": "...", ... }, ...]] }
fn parse_ndlocr_json(json: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let pages = v["contents"].as_array()?;
    let mut lines: Vec<String> = Vec::new();
    for page in pages {
        if let Some(items) = page.as_array() {
            for item in items {
                if let Some(text) = item["text"].as_str() {
                    let t = text.trim().to_string();
                    if !t.is_empty() {
                        lines.push(t);
                    }
                }
            }
        }
    }
    if lines.is_empty() { None } else { Some(lines.join("\n")) }
}
