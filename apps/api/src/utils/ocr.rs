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

/// ndlocr-lite の ocr.py へのパス（コンパイル時に CARGO_MANIFEST_DIR から解決）
const OCR_SCRIPT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../extern/ndlocr-lite/src/ocr.py");

/// OCR タイムアウト（秒）
const TIMEOUT_SECS: u64 = 120;

pub fn is_ocr_supported(mime: &str) -> bool {
    SUPPORTED_MIMES.contains(&mime)
}

/// ndlocr-lite を使って画像からテキストを抽出する。
/// Python 3 サブプロセスを起動し、JSON 出力を解析して返す。
pub fn extract_text(image_path: &Path) -> Option<String> {
    eprintln!("[OCR] 開始: script={OCR_SCRIPT:?} image={image_path:?}");

    // スクリプトが存在するか確認
    if !std::path::Path::new(OCR_SCRIPT).exists() {
        eprintln!("[OCR] ERROR: スクリプトが見つかりません: {OCR_SCRIPT}");
        return None;
    }

    let out_dir = tempfile::TempDir::new().ok()?;
    let out_path = out_dir.path();

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
        .map_err(|e| { eprintln!("[OCR] spawn 失敗: {e}"); e })
        .ok()?;

    let status = match child.wait_timeout(Duration::from_secs(TIMEOUT_SECS)).ok()? {
        Some(s) => s,
        None => {
            let _ = child.kill();
            let _ = child.wait();
            eprintln!("[OCR] タイムアウト: {TIMEOUT_SECS}s を超えました");
            return None;
        }
    };

    if let Ok(msg) = std::fs::read_to_string(stderr_tmp.path()) {
        let trimmed = msg.trim();
        if !trimmed.is_empty() {
            eprintln!("[OCR] stderr:\n{trimmed}");
        }
    }

    if !status.success() {
        eprintln!("[OCR] 失敗 status={status}");
        return None;
    }

    // JSON ファイルを探して読み込む（stem.json の名前で出力される）
    let json_path = std::fs::read_dir(out_path)
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
