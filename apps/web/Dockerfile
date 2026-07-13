# ==== build ====
FROM node:22-slim AS builder

# nitro の /v1 プロキシ転送先（コンテナ内から見た API の URL）
ARG API_BASE_URL=http://api:3400

WORKDIR /build

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ENV API_BASE_URL=${API_BASE_URL}
RUN pnpm build

# ==== runtime ====
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /build/.output ./.output

# nitro は PORT を見る（既定 3000）
EXPOSE 3000

# Sentry instrumentation (instrument.server.mjs) は @sentry/* が external のため
# ランタイム node_modules を要求する。compose 構成では DSN 未設定 = Sentry 無効
# なので素の起動にする。Sentry を使う場合は依存の同梱が別途必要
CMD ["node", ".output/server/index.mjs"]
