# 合言葉 P2P 共有 — E2E シナリオテスト手順書

**対象機能**: HyperDrive 合言葉による P2P ファイル共有（cmd_023 / Batch3）  
**前提**: Batch1（REST + WebSocket シグナリング）および Batch2（フロント WebRTC UI）が `feat/p2p-sharing` ブランチに存在すること  
**関連仕様**: [p2p.md](../spec/infra/p2p.md)、[watchword API](../api/files/sharing/watchword.md)

---

## 1. テスト環境

### 1.1 構成（LAN / STUN のみ）

| 項目 | 値 |
|------|-----|
| ネットワーク | 同一ホストまたは同一 LAN（TURN 不要） |
| API | `http://localhost:3400`（開発既定） |
| Web | `http://localhost:5175`（Vite dev、`pnpm dev`） |
| STUN | 既定 `stun:stun.l.google.com:19302` |
| Valkey | `redis://localhost:6379` |
| PostgreSQL | マイグレーション適用済み |

> TURN 付き検証は [turn_verification_log.md](./turn_verification_log.md) を参照。

### 1.2 起動手順

**ターミナル A — API**

```bash
cd /home/coder/storage/apps/api
cargo run
```

**ターミナル B — Web**

```bash
cd /home/coder/storage/apps/web
pnpm dev
```

**前提確認**

```bash
curl -s http://localhost:3400/v1/config/ice-servers
pg_isready
redis-cli ping
```

> **重要（Preflight）**: Vite 起動時の `API_BASE_URL` / `SERVER_URL` と、実際に稼働中の API ポートを一致させること。`.env.local` が 3400 でも、シェルで `API_BASE_URL=3402` を付けて起動していると Playwright E2E が「接続中…」でハングする。検証前に `curl -s http://localhost:5175/v1/config/ice-servers` の STUN/TURN 設定が意図した API 由来か確認すること。

### 1.3 テストユーザー

```bash
curl -s -X POST http://localhost:3400/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e_a@test.local","password":"testpass123","name":"E2E Sender"}'

curl -s -X POST http://localhost:3400/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e_b@test.local","password":"testpass123","name":"E2E Receiver"}'
```

既存アカウント（TURN 検証で使用済み）も可:

| 役割 | Email | Password |
|------|-------|----------|
| 送信者 A | `turn_a@test.local` | `testpass123` |
| 受信者 B | `turn_b@test.local` | `testpass123` |

### 1.4 ブラウザ構成

| 方式 | 用途 |
|------|------|
| 2 ブラウザプロファイル | 手動 E2E（推奨） |
| 2 Playwright コンテキスト | 自動 E2E（`scripts/lan-e2e-test.mjs`） |

---

## 2. シナリオ 1: 小ファイル転送（LAN / 約 1MB）

**目的**: REST → WS シグナリング → DataChannel → filehash 照合の正常系確認。

### 2.1 テストデータ

```bash
mkdir -p /tmp/hyperdrive-e2e
dd if=/dev/urandom of=/tmp/hyperdrive-e2e/small-1mb.bin bs=1M count=1
sha256sum /tmp/hyperdrive-e2e/small-1mb.bin
```

### 2.2 手順

| # | 操作者 | 操作 | 期待結果 |
|---|--------|------|----------|
| 1 | A, B | 各ブラウザでログイン | セッション Cookie 取得 |
| 2 | A | `/share` で `small-1mb.bin` 選択 | ファイル名・約 1MB 表示 |
| 3 | A | 「送信を開始」 | 合言葉（8 文字）+ QR 表示 |
| 4 | A | 合言葉を B に伝達 | — |
| 5 | B | `/receive` で合言葉入力 → 「受信を開始」 | 接続中 → 受信中 |
| 6 | — | WS: join → offer → answer → ice | P2P 確立 |
| 7 | B | 進捗バー | `N / M` が増加 |
| 8 | B | 完了 | 「✅ 完了」、整合性一致（緑） |
| 9 | B | 「ファイルを保存」 | SHA-256 が送信前と一致 |

### 2.3 自動検証

```bash
cd /home/coder/storage
API_BASE_URL=http://localhost:3400 WEB_BASE_URL=http://localhost:5175 \
  node scripts/lan-e2e-test.mjs --scenario small
```

### 2.4 合格基準

- [ ] 合言葉が 8 文字英数字
- [ ] filehash 照合一致（✅ 緑）
- [ ] 保存ファイルが送信元と完全一致

---

## 3. シナリオ 2: 大容量ファイル転送（100MB+）

**目的**: チャンク分割・進捗表示・長時間接続の安定性確認。

### 3.1 テストデータ

```bash
dd if=/dev/urandom of=/tmp/hyperdrive-e2e/large-100mb.bin bs=1M count=100
```

### 3.2 観察ポイント

| 項目 | 期待 |
|------|------|
| 進捗バー | 送信・受信双方で更新 |
| メモリ | 異常スパイクなし |
| 完了 | filehash 一致、サイズ 104857600 bytes |
| タイムアウト | 受信 5 分以内に完了 |

### 3.3 自動検証（任意）

```bash
API_BASE_URL=http://localhost:3400 WEB_BASE_URL=http://localhost:5175 \
  node scripts/lan-e2e-test.mjs --scenario large
```

> 100MB 転送は 5〜15 分かかる場合あり。

---

## 4. シナリオ 3: エラーケース

### 4.1 不正な合言葉

| 手順 | 期待 |
|------|------|
| B が `zzzzzzzz` 等を入力 | 「合言葉が正しくないか、ルームの有効期限が切れています」 |
| WS | `room_not_found` |

```bash
node scripts/lan-e2e-test.mjs --scenario invalid-passphrase
```

### 4.2 接続中の切断

| 手順 | 期待 |
|------|------|
| 転送中に受信側「キャンセル」または送信タブを閉じる | 「P2P 接続が切断されました」等 |
| UI | 「合言葉を変更して再試行」表示 |

手動確認推奨。

### 4.3 送信者未接続

| 手順 | 期待 |
|------|------|
| REST のみでルーム作成、WS create 前に B が join | 「送信者がまだ接続していません」またはタイムアウト |

### 4.4 filehash 不一致

| 手順 | 期待 |
|------|------|
| 受信 Blob がメタデータ hash と不一致 | 「ファイルの整合性チェックに失敗しました…」 |
| UI | 保存ボタン非活性 |

正常 E2E では hash 一致を確認し、照合ロジックを間接検証。

### 4.5 二重 join

| 手順 | 期待 |
|------|------|
| B1 join 済みルームに B2 が join | 「このルームには既に別の受信者が接続しています」 |

---

## 5. 一括自動検証

```bash
cd /home/coder/storage
API_BASE_URL=http://localhost:3400 WEB_BASE_URL=http://localhost:5175 \
  node scripts/lan-e2e-test.mjs --scenario all
```

| シナリオ | 内容 |
|----------|------|
| `small` | 1MB 転送 + hash 一致 |
| `large` | 100MB 転送（`--scenario large` のみ） |
| `invalid-passphrase` | 不正合言葉エラー |
| `all` | small + invalid-passphrase（large は除外） |

---

## 6. 結果記録

検証実施後、`docs/test/e2e_verification_log.md` に以下を記録:

- 実施日・担当・使用ブランチ
- 各シナリオ PASS/FAIL
- スクリーンショットまたは Playwright ログ
- 不具合（batch3_003 軍師 QC へエスカレーション）

---

## 7. リモート dev 環境での WebSocket シグナリング

Coder 等の https リモート環境で合言葉 P2P 共有を利用する場合、
watchword WS は同一オリジン（same-origin）で接続する。
`apps/web/src/lib/watchword.ts` の `getWatchwordWsUrl()` がホスト判定を行い、
localhost 以外ではプロキシ経由（`wss://{host}/v1/ws/watchword`）で接続される。

| 環境 | WS URL 例 | 経路 |
|------|-----------|------|
| localhost dev | `ws://localhost:3400/v1/ws/watchword` | API 直結（Vite WS プロキシ迂回） |
| Coder https dev | `wss://{coder-host}/v1/ws/watchword` | Nitro `routeRules`（same-origin） |
| production | `wss://{app-host}/v1/ws/watchword` | Nitro `routeRules` proxy |

詳細・切り分け表: [vite-ws.md](../spec/infra/vite-ws.md)

---

## 8. 外部ネットワーク / TURN 検証

### 準備

- 2 ブラウザプロファイル（別アカウント）または 2 端末
- `turn_a@test.local`（送信側）、`turn_b@test.local`（受信側）登録済み
- `apps/api/.env` の `turn.akarinext.org` 設定確認

### 人工遅延による順序競合再現（dev 環境）

1. 受信側 DevTools Console: `localStorage.WEBRTC_OFFER_DELAY_MS='3000'`
2. 送信側から小ファイル（64KB）を転送開始
3. 修正前: remote description null エラー → 完了表示のみ → ダウンロード不可
4. 修正後: キュー → flush → 正常ダウンロード

### 2 ブラウザ転送確認

1. プロファイル A `/share` で 64KB ファイルを生成・合言葉取得
2. プロファイル B `/receive` で合言葉入力・接続確認
3. WebRTC DataChannel での転送成功・ファイルハッシュ一致・保存成功

### TURN 経由確認

`chrome://webrtc-internals` で relay candidate が使用されていることを確認

---

## 9. トラブルシューティング

| 症状 | 確認 |
|------|------|
| WS 接続失敗 | Vite proxy `ws: true`、`API_BASE_URL` 一致 |
| P2P failed | STUN 到達性、ファイアウォール |
| 401 | 両方ログイン済みか |
| タイムアウト | 送信側 `/share` で WS create 完了か |

---

## 10. 参照

- [turn_verification_log.md](./turn_verification_log.md)
- [TURN_SETUP.md](../TURN_SETUP.md)
- `scripts/lan-e2e-test.mjs`
- `scripts/turn-e2e-test.mjs`
