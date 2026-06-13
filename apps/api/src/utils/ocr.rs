use std::path::Path;
use std::time::Duration;
use tokio::process::Command;

const SUPPORTED_MIMES: &[&str] = &[
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/webp",
    // GIF は ocr.py の対応拡張子に含まれないため除外
];

/// ndlocr-lite の ocr.py へのパス（コンパイル時に CARGO_MANIFEST_DIR から解決）
const OCR_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../extern/ndlocr-lite/src/ocr.py");

/// OCR タイムアウト（秒）
const TIMEOUT_SECS: u64 = 120;

pub fn is_ocr_supported(mime: &str) -> bool {
    SUPPORTED_MIMES.contains(&mime)
}

pub fn mime_to_ext(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/png" => "png",
        "image/tiff" => "tiff",
        "image/bmp" => "bmp",
        "image/webp" => "webp",
        _ => "png",
    }
}

/// ndlocr-lite を使って画像からテキストを抽出する（async版）。
/// image_path には必ず正しい拡張子を付けること（ndlocr-lite が拡張子で形式を判定する）。
pub async fn extract_text(image_path: &Path) -> Option<String> {
    eprintln!("[OCR] 開始: image={image_path:?}");

    if !std::path::Path::new(OCR_SCRIPT).exists() {
        eprintln!("[OCR] ERROR: スクリプトが見つかりません: {OCR_SCRIPT}");
        return None;
    }

    let out_dir = tempfile::TempDir::new().ok()?;
    let out_path = out_dir.path().to_path_buf();

    // kill_on_drop(true) により、タイムアウトで Child が drop されると自動的に SIGKILL する
    let mut child = Command::new("python3")
        .arg(OCR_SCRIPT)
        .arg("--sourceimg")
        .arg(image_path)
        .arg("--output")
        .arg(&out_path)
        .arg("--json-only")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| eprintln!("[OCR] spawn 失敗: {e}"))
        .ok()?;

    let stderr_handle = child.stderr.take();

    let wait_result = tokio::time::timeout(
        Duration::from_secs(TIMEOUT_SECS),
        child.wait(),
    )
    .await;

    let status = match wait_result {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => {
            eprintln!("[OCR] wait 失敗: {e}");
            return None;
        }
        Err(_) => {
            // timeout: child は kill_on_drop により drop 時に kill される
            eprintln!("[OCR] タイムアウト: {TIMEOUT_SECS}s を超えました");
            return None;
        }
    };

    // stderr を読み込んでログ出力
    if let Some(mut stderr) = stderr_handle {
        use tokio::io::AsyncReadExt;
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf).await;
        let trimmed = buf.trim();
        if !trimmed.is_empty() {
            eprintln!("[OCR] stderr:\n{trimmed}");
        }
    }

    if !status.success() {
        eprintln!("[OCR] 失敗 status={status}");
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
