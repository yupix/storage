"""
Florence-2 キャプションサービス
POST /caption  multipart: file=<image>
Response: { "caption": "..." }

起動:
  pip install 'transformers==4.43.3' torch pillow fastapi uvicorn python-multipart einops timm
  python florence2_service.py [--host 0.0.0.0] [--port 8500] [--model microsoft/Florence-2-base]
"""
import argparse
import glob
import io
import logging
import os
import re
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from transformers import AutoModelForCausalLM, AutoProcessor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TASK = "<MORE_DETAILED_CAPTION>"

processor = None
florence_model = None
device = "cuda" if torch.cuda.is_available() else "cpu"


def _download_and_patch(model_id: str) -> str:
    """モデルをローカルにダウンロードして flash_attn インポートをパッチする。"""
    from huggingface_hub import snapshot_download

    safe_name = model_id.replace("/", "_")
    local_dir = os.path.join(
        os.path.expanduser("~/.cache/caption_service"), safe_name
    )

    log.info("モデルをダウンロード中: %s → %s", model_id, local_dir)
    snapshot_download(repo_id=model_id, local_dir=local_dir)

    # flash_attn の import を try/except で囲んで optional にする
    patched_count = 0
    for path in glob.glob(f"{local_dir}/**/*.py", recursive=True):
        text = open(path, encoding="utf-8").read()
        if "flash_attn" not in text:
            continue
        new_text = re.sub(
            r"^((?:from|import) flash_attn\b.*)$",
            "try:\n    \\1\nexcept ImportError:\n    pass",
            text,
            flags=re.MULTILINE,
        )
        if new_text != text:
            open(path, "w", encoding="utf-8").write(new_text)
            patched_count += 1

    if patched_count:
        log.info("flash_attn パッチを %d ファイルに適用しました", patched_count)

    return local_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    global processor, florence_model

    model_id = app.state.model_id
    local_dir = _download_and_patch(model_id)

    log.info("Florence-2 モデルを読み込み中 (device=%s)...", device)
    processor = AutoProcessor.from_pretrained(local_dir, trust_remote_code=True, local_files_only=True)
    florence_model = AutoModelForCausalLM.from_pretrained(
        local_dir,
        trust_remote_code=True,
        local_files_only=True,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        attn_implementation="eager",
    ).to(device)
    florence_model.eval()
    log.info("モデルの準備完了")
    yield
    processor = None
    florence_model = None


app = FastAPI(title="Florence-2 Caption Service", lifespan=lifespan)


@app.post("/caption")
async def caption(file: UploadFile = File(...)) -> JSONResponse:
    if florence_model is None or processor is None:
        raise HTTPException(status_code=503, detail="モデル未初期化")

    data = await file.read()
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"画像の読み込み失敗: {e}")

    inputs = processor(text=TASK, images=image, return_tensors="pt").to(device)

    with torch.inference_mode():
        generated_ids = florence_model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=256,
            num_beams=3,
        )

    generated_text = processor.batch_decode(generated_ids, skip_special_tokens=False)[0]
    parsed = processor.post_process_generation(
        generated_text,
        task=TASK,
        image_size=(image.width, image.height),
    )
    result = parsed.get(TASK, "").strip()
    log.info("キャプション生成: %d 文字", len(result))
    return JSONResponse({"caption": result})


@app.get("/health")
async def health():
    return {"status": "ok", "model": "florence-2", "device": device}


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8500)
    parser.add_argument("--model", default="microsoft/Florence-2-base")
    args = parser.parse_args()

    app.state.model_id = args.model
    uvicorn.run(app, host=args.host, port=args.port)
