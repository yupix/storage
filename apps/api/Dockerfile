# ==== build ====
FROM rust:1-bookworm AS builder

WORKDIR /build

# 依存キャッシュを効かせるため manifest を先にコピー
COPY Cargo.toml Cargo.lock ./
COPY migration/Cargo.toml migration/Cargo.toml
RUN mkdir -p src/bin migration/src \
    && echo "fn main() {}" > src/main.rs \
    && echo "fn main() {}" > src/bin/generate_schema.rs \
    && touch src/lib.rs \
    && echo "fn main() {}" > migration/src/main.rs \
    && touch migration/src/lib.rs \
    && cargo build --release --workspace --bins \
    && rm -rf src migration/src

COPY . .
# ダミービルドの成果物を無効化して本体をビルド
RUN touch src/main.rs src/lib.rs src/bin/generate_schema.rs migration/src/main.rs migration/src/lib.rs \
    && cargo build --release --workspace --bins

# fastembed(ort) が動的リンクする onnxruntime をかき集める
RUN mkdir -p /out/lib \
    && find target/release -name "libonnxruntime*.so*" -exec cp -n {} /out/lib/ \; \
    && ls -la /out/lib/ || true

# ==== runtime ====
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/target/release/api /usr/local/bin/api
COPY --from=builder /build/target/release/migration /usr/local/bin/migration
COPY --from=builder /out/lib/ /usr/local/lib/
RUN ldconfig

# fastembed のモデルキャッシュ置き場（volume マウント推奨）
RUN mkdir -p /app/.fastembed_cache

ENV API_LISTEN_ADDR=0.0.0.0:3400
EXPOSE 3400 3401

CMD ["api"]
