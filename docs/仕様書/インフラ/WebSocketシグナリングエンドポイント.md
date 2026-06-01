# WebSocketシグナリング エンドポイント

## 役割
WebRTCのシグナリング（SDP・ICE候補交換）を WebSocket経由で中継する。

## エンドポイント

| 要件 | 値 |
|----|-----|
| プロトコル | WebSocket (ws/wss) |
| エンドポイント | /v1/ws/watchword |

## 接続フロー

1. 送信者: ws接続 → `{ "action": "create", "passphrase": "合言葉" }` 送信
2. サーバー: Valkeyにルーム作成（TTL: 10分）
3. 受信者: ws接続 → `{ "action": "join", "passphrase": "合言葉" }` 送信
4. 双方向でSDP/ICEメッセージを中継
5. P2P確立後、ws接続は切断してよい

## メッセージ フォーマット

```json
{
  "action": "create|join|offer|answer|ice",
  "passphrase": "合言葉",
  "data": {
    "sdp": "...",
    "candidate": "..."
  }
}
```

## メッセージ フィールド

| フィールド | 説明 |
|-----------|------|
| action | String: create / join / offer / answer / ice |
| passphrase | String: ルーム特定用の合言葉 |
| data | Object: SDP オファー/アンサー、またはICE candidate |
