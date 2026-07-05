# Vite / Nitro — dev 請求フローと WebSocket シグナリング

**関連**: [websocket.md](./websocket.md)、[p2p.md](./p2p.md)、[e2e_scenario.md](../../test/e2e_scenario.md)  
**対象**: 合言葉 P2P の REST `/v1/**` と WebSocket シグナリング（`/v1/ws/watchword`）  
**cmd**: cmd_026 / subtask_026_phase2

---

## §1 dev 請求フロー図（Nitro → routeRules → REST/WS 分岐）

TanStack Start + Nitro vite プラグインの **dev** では、請求は次の順で処理される。

```
Browser → Vite dev server (:5175)
       → Nitro Connect ミドルウェア（先）
       → routeRules `/v1/**` マッチ
            ├─ REST GET/POST 等 → API へ HTTP プロキシ → 200 JSON
            └─ WS upgrade `/v1/ws/**` → API へプロキシ（same-origin 経路）
       → （routeRules なし時のみ）TanStack app router / SSR
            → __root.tsx beforeLoad → 未認証 → 307 /login
```

**重要**: `Vite server.proxy` は通常の HTTP GET では **Nitro 層をバイパスできない**（コミット 698502d 参照）。  
dev で REST を通すには **Nitro `routeRules` が必須**。routeRules を dev で空にすると `/v1/config/ice-servers` 等が 307 `/login` になる。

### localhost dev — REST と WS の分岐

```
ブラウザ (http://localhost:5175)
  ├─ REST /v1/*  → Nitro routeRules → API (:3400)
  └─ WS シグナリング
       ├─ [既定] ws://localhost:3400/v1/ws/watchword（Phase1 API 直結）
       │    getWatchwordWsUrl() が localhost 判定時に使用（E2E-ENV-001 回避）
       └─ [検証用] ws://localhost:5175/v1/ws/watchword（routeRules / Vite proxy 経由）
```

### リモート dev — Coder 等 https

```
ブラウザ (https://{coder-host})
  ├─ REST /v1/*  → Nitro routeRules → API（サーバ内 localhost:3400）
  └─ WS wss://{coder-host}/v1/ws/watchword
       → Nitro routeRules（same-origin）
       → API
```

### production

```
ブラウザ
  ├─ REST /v1/*  → Nitro routeRules proxy → API
  └─ WS wss://{app-host}/v1/ws/watchword → routeRules → API
```

`getWatchwordWsUrl()` は production では常に same-origin を返す。

---

## §2 E2E-ENV-001 切り分け表

| 症状 | 典型原因 | 確認方法 | 対処 |
|------|----------|----------|------|
| `curl :5175/v1/...` が **307 /login** | dev で Nitro routeRules 削除 | `curl -sI http://localhost:5175/v1/config/ice-servers` | routeRules を dev/prod 共通で復元（f6fcf95 相当） |
| ice-servers が API 直叩きと不一致 | API ポート不一致（例: .env 3400 vs 実行 3402） | API 直・Web 経由で JSON 比較 | 単一 API ポートに統一 |
| localhost WS がタイムアウト（same-origin 経由） | dev 二重プロキシ競合（歴史的問題） | `lan-e2e-test.mjs` の `wsViaVite` | Phase1: localhost は API 直結で回避 |
| Coder https で即失敗 | mixed content（https → ws://） | DevTools Console | same-origin `wss://`（Phase1 ホスト判定） |
| 401 で即 close | 未ログイン / Cookie 無効 | `/v1/auth/me` | ログイン後に再試行 |

### Phase2 失敗の教訓

- **誤り**: dev 時 `routeRules: {}` にして Vite proxy に一本化 → REST 喪失（307）
- **正解**: dev でも `routeRules: { '/v1/**': { proxy: ... } }` を維持 + Phase1 watchword ハイブリッド

参考: `queue/reports/gunshi_report.yaml` — `root_cause` / `ws_rest_coexistence`

---

## §3 Phase1 ハイブリッド（localhost 直結 vs リモート same-origin）

`apps/web/src/lib/watchword.ts` の `getWatchwordWsUrl()`:

| 条件 | WS URL | 理由 |
|------|--------|------|
| production | `wss://{host}/v1/ws/watchword` | same-origin + Cookie |
| dev + localhost | `ws://localhost:3400/v1/ws/watchword` | Vite/Nitro WS プロキシの upgrade ハング回避（d19e271 以降の限定版） |
| dev + リモートホスト | `wss://{host}/v1/ws/watchword` | mixed content 回避、Cookie 同一オリジン |

**REST は常に Nitro routeRules**（dev/prod 共通）。  
**WS はホストに応じて直結または same-origin** — routeRules を dev で維持しても localhost WS は Phase1 が吸収する。

`vite.config.ts` の `server.proxy` に `ws: true` は upgrade 補助として残置（f6fcf95 構成）。

---

## §4 Preflight 手順（lan-e2e-test.mjs）

### 前提

| 項目 | 値 |
|------|-----|
| API | `http://localhost:3400` |
| Web | `http://localhost:5175`（`pnpm dev`） |
| テストユーザー | `turn_a@test.local` / `turn_b@test.local`（`testpass123`） |

### 手順

```bash
cd /home/coder/storage

# 1. REST プロキシ（routeRules）— 307 ではなく 200 JSON
curl -s http://localhost:5175/v1/config/ice-servers | jq .iceServers[0].urls

# 2. ice-servers 一致
curl -s http://localhost:3400/v1/config/ice-servers | jq -c .
curl -s http://localhost:5175/v1/config/ice-servers | jq -c .

# 3. Preflight + シナリオ
API_BASE_URL=http://localhost:3400 WEB_BASE_URL=http://localhost:5175 \
  node scripts/lan-e2e-test.mjs --scenario invalid-passphrase

# 4. ビルド
cd apps/web && pnpm build
```

### チェックリスト

- [ ] `curl :5175/v1/config/ice-servers` → 200 JSON（307 ではない）
- [ ] Preflight: WEB proxy ice-servers matches API direct
- [ ] Preflight: REST session via WEB proxy OK
- [ ] localhost WS: DevTools で `ws://localhost:3400/v1/ws/watchword`
- [ ] `pnpm build` 成功

> **注意**: `vite.config.ts` 変更後は Vite dev サーバーを再起動すること。

---

## 参照

- `apps/web/vite.config.ts` — `routeRules` / `server.proxy`
- `apps/web/src/lib/watchword.ts` — `getWatchwordWsUrl()`
- `queue/reports/gunshi_report.yaml` — corrective strategy（strategy_026_phase2_correction）
