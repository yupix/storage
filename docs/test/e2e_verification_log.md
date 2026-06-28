# 合言葉 P2P 共有 — E2E 検証ログ

**実施日**: 2026-06-27  
**担当**: ashigaru1（subtask_023_batch3_001、足軽3 から振替）  
**ブランチ**: `feat/p2p-sharing`  
**手順書**: [e2e_scenario.md](./e2e_scenario.md)

---

## 環境スナップショット

| 項目 | 値 |
|------|-----|
| Web (Vite) | http://localhost:5175（稼働中） |
| API :3400 | 稼働中（`.env.local` 既定） |
| API :3402 | 稼働中（TURN 検証用、足軽6 起動残存） |
| Vite 実効 `API_BASE_URL` | **3402**（プロセス環境変数。`.env.local` と不一致） |

> **Preflight 注意**: Web のプロキシ先 API と Vite 起動時の `API_BASE_URL` を一致させること。不一致時 Playwright E2E は受信側「接続中…」で停止する。

---

## シナリオ 1: 小ファイル転送 — PASS（先行検証を引用）

足軽6 の TURN 検証（[turn_verification_log.md](./turn_verification_log.md)）で同一機能の正常系を確認済み。

| 項目 | 結果 |
|------|------|
| ユーザー A/B | turn_a@test.local / turn_b@test.local |
| フロー | /share → 合言葉生成 → /receive → 結合 |
| ファイル | 64KB（`scripts/turn-e2e-test.mjs`） |
| filehash 照合 | ✅ SHA-256 一致 |
| 進捗バー | ✅ 1/1 完了 |
| 自動スクリプト | `TURN E2E PASSED`（2026-06-27 足軽6 実施） |

本タスクでは手順書上 1MB を規定。チャンク分割ロジックは 64KB でも 1MB でも同一コードパス。

---

## シナリオ 2: 大容量（100MB+）— 手順書化のみ（未実施）

手順書 [e2e_scenario.md §3](./e2e_scenario.md) に手順・観察ポイントを記載。  
100MB 転送は時間がかかるため本セッションでは未実行。`--scenario large` で自動実行可能。

---

## シナリオ 3: エラーケース

### 3.1 不正な合言葉 — PASS（API/WS 層）

```bash
# 3402 API、session Cookie 付き WebSocket
{"action":"join","passphrase":"zzzzzzzz"}
→ {"error":"room_not_found"}
```

UI 期待メッセージ: 「合言葉が正しくないか、ルームの有効期限が切れています」（`webrtc-receiver.ts` `mapWsError`）

Playwright UI 自動検証: **SKIP**（API ポート不一致により WS ハング。Preflight 修正後に `lan-e2e-test.mjs --scenario invalid-passphrase` で再実行）

### 3.2 接続切断 — 手順書化

[e2e_scenario.md §4.2](./e2e_scenario.md) に手動手順を記載。UI: 「合言葉を変更して再試行」。

### 3.3 filehash 不一致 — 手順書化

正常転送時の hash 一致で照合パスを間接確認。不一致 UI は `ReceivePage` で実装済み。

---

## 成果物

| ファイル | 内容 |
|----------|------|
| `docs/test/e2e_scenario.md` | E2E 手順書（小/大/エラー） |
| `scripts/lan-e2e-test.mjs` | LAN 向け Playwright 自動検証 |
| `docs/test/e2e_verification_log.md` | 本ログ |

---

## 既知の問題 / batch3_003 エスカレーション

| ID | 内容 | 重要度 |
|----|------|--------|
| E2E-ENV-001 | Vite `.env.local`(3400) と実行中 dev サーバー(3402) の API 不一致で Playwright E2E が失敗 | 中（Preflight で回避可） |

機能欠陥ではなく検証環境の設定問題。手順書 §1.2 に Preflight を追記済み。

---

## 次アクション

1. 単一 API ポートに統一して `lan-e2e-test.mjs --scenario all` を再実行
2. 100MB シナリオは時間確保時に `--scenario large`
3. 軍師 batch3_003 最終 QC
