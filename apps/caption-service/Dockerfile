FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

ENV HOST=0.0.0.0 \
    PORT=8500 \
    HF_HOME=/app/.hf-cache

# モデルキャッシュ置き場（volume マウント推奨。初回起動時に自動DL ~1.7GB）
RUN mkdir -p /app/.hf-cache

EXPOSE 8500

# 既定は moondream2（CPU でも実用速度）。florence2 に切り替える場合は
# compose 側で command を florence2_service.py に上書きする
CMD ["python", "moondream_service.py"]
