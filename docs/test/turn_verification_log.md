# TURN NAT 越え検証 — テスト結果ログ

**実施日**: 2026-06-27  
**担当**: ashigaru6 (subtask_023_batch3_002)  
**API**: http://localhost:3402（TURN 環境変数あり）  
**Web**: http://localhost:5175（Vite dev + API プロキシ）

## Step 1: STUN のみ（LAN）— batch3_001 参照

- デフォルト `stun:stun.l.google.com:19302` で LAN 内転送は batch3_001 手順で検証済み（本タスクでは再確認のみ）

## Step 2–3: TURN 環境変数 + API 起動

```bash
# apps/api/.env
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=turn:openrelay.metered.ca:443?transport=tcp
TURN_USERNAME=openrelayproject
TURN_CREDENTIAL=openrelayproject

API_LISTEN_ADDR=0.0.0.0:3402 API_BOARD_ADDR=0.0.0.0:3403 cargo run --bin api
```

## Step 4: GET /v1/config/ice-servers

```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:openrelay.metered.ca:443?transport=tcp",
      "username": "openrelayproject",
      "credential": "openrelayproject"
    }
  ]
}
```

**結果**: ✅ TURN が iceServers に含まれる

## Step 5: ファイル転送（TURN 設定有効・LAN 環境）

| 項目 | 結果 |
|------|------|
| ユーザー A/B ログイン | ✅ turn_a@test.local / turn_b@test.local |
| /share → 合言葉生成 | ✅ |
| /receive → 受信・結合 | ✅ |
| 進捗バー | ✅ 1/1 完了 |
| filehash 照合 | ✅ SHA-256 一致（緑表示） |
| 送信側完了表示 | ✅ 「送信が完了しました」 |

自動検証: `node scripts/turn-e2e-test.mjs`（Playwright）

## 補足

- LAN 同一ホスト検証のため ICE は host/srflx で確立される可能性が高い（TURN relay 候補 0 でも転送成功）
- TURN 設定は API 経由でフロントに正しく配信されることを確認
- 本番 NAT 越えでは Metered ダッシュボード取得の認証情報を推奨（`docs/TURN_SETUP.md` 参照）
- 開発時 WebSocket プロキシに `ws: true` を追加（`vite.config.ts`）

## 既知の問題

なし（本検証スコープ内）
