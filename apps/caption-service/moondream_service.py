"""
moondream2 キャプションサービス
POST /caption  multipart: file=<image>
Response: { "caption": "..." }

起動:
  pip install moondream pillow fastapi uvicorn python-multipart
  python moondream_service.py [--host 0.0.0.0] [--port 8500]
"""
import argparse
import io
import logging
from contextlib import asynccontextmanager

import moondream as md
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

PROMPT = "この画像に写っているものを日本語で簡潔に説明してください。人物・物体・場所・テキスト・状況など重要な要素を含めてください。"

model: md.vl | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    log.info("moondream2 モデルを読み込み中...")
    model = md.vl(model="moondream-2B-int8.mf")
    log.info("モデルの準備完了")
    yield
    model = None


app = FastAPI(title="moondream2 Caption Service", lifespan=lifespan)


@app.post("/caption")
async def caption(file: UploadFile = File(...)) -> JSONResponse:
    if model is None:
        raise HTTPException(status_code=503, detail="モデル未初期化")

    data = await file.read()
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"画像の読み込み失敗: {e}")

    encoded = model.encode_image(image)
    result = model.query(encoded, PROMPT)["answer"].strip()
    log.info("キャプション生成: %d 文字", len(result))
    return JSONResponse({"caption": result})


@app.get("/health")
async def health():
    return {"status": "ok", "model": "moondream2"}


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8500)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
