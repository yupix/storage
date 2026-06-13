use std::path::Path;
use std::time::Duration;
use wait_timeout::ChildExt;

const SUPPORTED_MIMES: &[&str] = &[
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/gif",
    "image/webp",
];

/// ndlocr-lite の ocr.py へのパス（リポジトリルートからの相対）
const OCR_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../extern/ndlocr-lite/src/ocr.py");

/// OCR タイムアウト（秒）
const TIMEOUT_SECS: u64 = 120;

pub fn is_ocr_supported(mime: &str) -> bool {
    SUPPORTED_MIMES.contains(&mime)
}

/// ndlocr-lite を使って画像からテキストを抽出する。
/// Python 3 サブプロセスを起動し、JSON 出力を解析して返す。
pub fn extract_text(image_path: &Path) -> Option<String> {
    let out_dir = tempfile::TempDir::new().ok()?;
    let out_path = out_dir.path();

    tracing::info!("OCR 開始: {:?}", image_path);

    // stderr を一時ファイルに向けることでパイプバッファ詰まりによる
    // デッドロックを避けながら、エラーメッセージを取得できる
    let stderr_tmp = tempfile::NamedTempFile::new().ok()?;
    let stderr_file = stderr_tmp.reopen().ok()?;

    let mut child = std::process::Command::new("python3")
        .arg(OCR_SCRIPT)
        .arg("--sourceimg")
        .arg(image_path)
        .arg("--output")
        .arg(out_path)
        .arg("--json-only")
        .stdout(std::process::Stdio::null())
        .stderr(stderr_file)
        .spawn()
        .ok()?;

    let status = match child.wait_timeout(Duration::from_secs(TIMEOUT_SECS)).ok()? {
        Some(s) => s,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            tracing::warn!("ndlocr-lite OCR タイムアウト: {}s を超えました", TIMEOUT_SECS);
            return None;
        }
    };

    if !status.success() {
        if let Ok(msg) = std::fs::read_to_string(stderr_tmp.path()) {
            if !msg.trim().is_empty() {
                tracing::warn!("ndlocr-lite stderr: {}", msg.trim());
            }
        }
        tracing::warn!("ndlocr-lite OCR 失敗 status={}", status);
        return None;
    }

    tracing::info!("OCR 完了");

    // JSON ファイルを探して読み込む（stem.json の名前で出力される）
    let json_path = std::fs::read_dir(out_path)
        .ok()?
        .flatten()
        .find(|e| e.path().extension().is_some_and(|x| x == "json"))?
        .path();

    let content = std::fs::read_to_string(&json_path).ok()?;
    parse_ndlocr_json(&content)
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
