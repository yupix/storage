FROM python:3.12-slim

WORKDIR /app

# GPU は使わないため CPU 版 torch を先に入れ、CUDA ホイール（数 GB）の
# 巻き込みを防ぐ。その後で残りの依存（transformers 等）を入れる。
COPY requirements.txt ./
# torch と torchvision は必ず同じ CPU index から入れる（別々の index だと
# ABI 不一致で "operator torchvision::nms does not exist" になる）。
# timm が torchvision を要求するため torchvision も明示的に先入れする。
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install --no-cache-dir -r requirements.txt

COPY *.py ./

ENV HOST=0.0.0.0 \
    PORT=8500

# モデルキャッシュ（florence2_service は ~/.cache/caption_service に DL する）。
# compose 側で volume を /root/.cache にマウントして永続化する。
RUN mkdir -p /root/.cache

EXPOSE 8500

# 既定は Florence-2（公開モデル・APIキー不要・ローカル推論）。
# moondream を使う場合は moondream パッケージ + モデル or API キーが別途必要
# （moondream_service.py 参照）。
CMD ["python", "florence2_service.py"]
