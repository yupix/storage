"""
Florence-2 キャプションサービス
POST /caption  multipart: file=<image>
Response: { "caption": "..." }

起動:
  pip install 'transformers==4.43.3' torch pillow fastapi uvicorn python-multipart einops timm deep-translator
  python florence2_service.py [--host 0.0.0.0] [--port 8500] [--model microsoft/Florence-2-base]
"""
import argparse
import io
import logging
import os
import site
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from transformers import AutoModelForCausalLM, AutoProcessor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

TASK = "<MORE_DETAILED_CAPTION>"

_translator = None


def _get_translator():
    global _translator
    if _translator is None:
        from deep_translator import GoogleTranslator
        _translator = GoogleTranslator(source="en", target="ja")
    return _translator


def _translate_to_japanese(text: str) -> str:
    try:
        translated = _get_translator().translate(text)
        return translated or text
    except Exception as e:
        log.warning("翻訳失敗、英語のまま返します: %s", e)
        return text

processor = None
florence_model = None
device = "cuda" if torch.cuda.is_available() else "cpu"


def _install_flash_attn_stub() -> None:
    """flash_attn のダミーパッケージを venv に配置する。

    transformers の check_imports はパッケージが importable かを確認するだけなので
    ダミーを置けばチェックを通過できる。実際の forward は attn_implementation='eager'
    で flash_attn を使わない経路に切り替えるため問題ない。
    """
    for site_dir in site.getsitepackages():
        stub_dir = os.path.join(site_dir, "flash_attn")
        if not os.path.isdir(site_dir):
            continue
        if os.path.exists(stub_dir):
            return  # already installed
        try:
            os.makedirs(stub_dir, exist_ok=True)
            with open(os.path.join(stub_dir, "__init__.py"), "w") as f:
                f.write("# stub: flash_attn not available; eager attention is used instead\n")
            log.info("flash_attn ダミーを配置しました: %s", stub_dir)
            return
        except OSError:
            continue
    log.warning("flash_attn ダミーの配置に失敗しました")


def _download_model(model_id: str) -> str:
    """モデルをローカルにダウンロードしてパスを返す。"""
    from huggingface_hub import snapshot_download

    safe_name = model_id.replace("/", "_")
    local_dir = os.path.join(
        os.path.expanduser("~/.cache/caption_service"), safe_name
    )
    log.info("モデルをダウンロード中: %s → %s", model_id, local_dir)
    snapshot_download(repo_id=model_id, local_dir=local_dir)
    return local_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    global processor, florence_model

    model_id = app.state.model_id
    _install_flash_attn_stub()
    local_dir = _download_model(model_id)

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
    if result:
        result = _translate_to_japanese(result)
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
