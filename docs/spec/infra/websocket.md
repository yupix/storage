# WebSocketシグナリング エンドポイント

## 役割
WebRTCのシグナリング（SDP・ICE候補交換）を WebSocket経由で中継する。

## エンドポイント

| 要件 | 値 |
|----|-----|
| プロトコル | WebSocket (ws/wss) |
| エンドポイント | /v1/ws/watchword |
| 認証 | セッション Cookie 必須（未認証は HTTP 401 で upgrade 拒否） |

## 認証失敗時（A7）

セッション Cookie が無効または未ログインの場合、WebSocket upgrade は行わず HTTP 401 を返す。

```json
{ "error": "unauthorized" }
```

## 接続フロー

1. 送信者: `POST /v1/files/watchword` でルーム作成・合言葉取得（Valkey に TTL 10 分で保存）
2. 送信者: ws 接続 → `{ "action": "create", "passphrase": "合言葉" }` 送信
3. 受信者: ws 接続 → `{ "action": "join", "passphrase": "合言葉" }` 送信
4. **送信者**が `{ "action": "offer", ... }` を送信（A3: offer の起点は送信者）
5. 受信者が offer を受信 → `{ "action": "answer", ... }` を送信
6. 双方が `{ "action": "ice", ... }` で ICE candidate を交換（サーバーが相手へ中継）
7. P2P 確立後、ws 接続は切断してよい（サーバーは切断を強制しない）

### シーケンス（A3）

```
送信者(A)          サーバー           受信者(B)
   |                  |                  |
   |-- create ------->|                  |
   |<-- ok -----------|                  |
   |                  |<----- join ------|
   |                  |------ ok ------->|
   |-- offer -------->|-- offer relay -->|
   |                  |<----- answer ----|
   |<-- answer relay -|                  |
   |-- ice ---------->|-- ice relay ---->|
   |<-- ice relay ----|<----- ice -------|
```

## ルーム満員時（A8）

ルームには creator（送信者）と joiner（受信者）の **最大 2 接続**まで。

3 人目が `join` した場合:

```json
{ "error": "room_full" }
```

エラー送信後、サーバーは当該 WebSocket 接続を閉じる。

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
| data | Object: SDP オファー/アンサー、または ICE candidate（create/join では省略可） |

## 成功応答

`create` / `join` 成功時:

```json
{ "action": "create|join", "status": "ok" }
```

## エラーコード一覧

| error | 説明 |
|-------|------|
| unauthorized | HTTP 401（upgrade 前） |
| room_not_found | Valkey にルームが存在しない |
| room_full | 3 人目の join |
| forbidden | create 時に creator_id とセッション不一致 |
| not_in_room | offer/answer/ice 前に create/join 未実施 |
| peer_unavailable | 中継先の相手が未接続 |
| invalid_action | 未知の action |
| invalid_message | JSON パース失敗 |
