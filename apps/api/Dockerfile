# ビルドコンテキストはリポジトリルート（extern/ndlocr-lite を取り込むため）。
# compose 側で context: . / dockerfile: apps/api/Dockerfile を指定する。

# ==== build (Rust) ====
FROM rust:1-bookworm AS builder

WORKDIR /build

# 依存キャッシュを効かせるため manifest を先にコピー
COPY apps/api/Cargo.toml apps/api/Cargo.lock ./
COPY apps/api/migration/Cargo.toml migration/Cargo.toml
RUN mkdir -p src/bin migration/src \
    && echo "fn main() {}" > src/main.rs \
    && echo "fn main() {}" > src/bin/generate_schema.rs \
    && touch src/lib.rs \
    && echo "fn main() {}" > migration/src/main.rs \
    && touch migration/src/lib.rs \
    && cargo build --release --workspace --bins \
    && rm -rf src migration/src

COPY apps/api/ .
# ダミービルドの成果物を無効化して本体をビルド
RUN touch src/main.rs src/lib.rs src/bin/generate_schema.rs migration/src/main.rs migration/src/lib.rs \
    && cargo build --release --workspace --bins

# fastembed(ort) が動的リンクする onnxruntime をかき集める
RUN mkdir -p /out/lib \
    && find target/release -name "libonnxruntime*.so*" -exec cp -n {} /out/lib/ \; \
    && ls -la /out/lib/ || true

# ==== runtime ====
FROM debian:bookworm-slim

# OCR (ndlocr-lite) は api が python3 サブプロセスとして呼ぶため、
# python3 と実行時ライブラリ（opencv/onnxruntime が必要とする共有ライブラリ）を入れる
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates libssl3 curl \
        python3 python3-venv \
        libglib2.0-0 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ndlocr-lite 一式（src/model/*.onnx 計 ~150MB 込み）
COPY extern/ndlocr-lite /opt/ndlocr-lite

# OCR 用 Python 依存を venv に入れる（bookworm の system python は
# externally-managed のため venv を使う）。ocr.rs が呼ぶ `python3` が
# この venv を指すよう PATH を通す。
# flet は GUI 専用で CLI OCR では未使用のため除外し、コード側で実際に
# import される pandas / matplotlib / yaspin を追加する。
ENV VENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN python3 -m venv "$VENV" \
    && grep -v '^flet' /opt/ndlocr-lite/requirements.txt > /tmp/req.txt \
    && "$VENV/bin/pip" install --no-cache-dir --upgrade pip \
    && "$VENV/bin/pip" install --no-cache-dir -r /tmp/req.txt \
        pandas matplotlib yaspin

COPY --from=builder /build/target/release/api /usr/local/bin/api
COPY --from=builder /build/target/release/migration /usr/local/bin/migration
COPY --from=builder /out/lib/ /usr/local/lib/
RUN ldconfig

# fastembed のモデルキャッシュ置き場（volume マウント推奨）
RUN mkdir -p /app/.fastembed_cache

ENV API_LISTEN_ADDR=0.0.0.0:3400
# ソースツリー外に配置した ocr.py を参照させる
ENV OCR_SCRIPT_PATH=/opt/ndlocr-lite/src/ocr.py
EXPOSE 3400 3401

CMD ["api"]
