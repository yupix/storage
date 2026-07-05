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

## プロトコルバージョン

| protocol | 意味 | 備考 |
|----------|------|------|
| 省略 | v1（1:1） | 既存クライアント互換。`peer_id` / `target_peer_id` なし |
| `2` | v2（多重受信者） | スター型。`peer_id` 発行・`target_peer_id` によるルーティング |

v1 ルーム（Valkey に `version` フィールドなし、または `version: 1`）は従来どおり creator ↔ joiner の 1:1 relay のみ。v2 ルーム（`version: 2`）のみ複数 joiner を許可する。

## 接続フロー（v1 — 1:1）

1. 送信者: `POST /v1/files/watchword` でルーム作成・合言葉取得（Valkey に TTL 10 分で保存）
2. 送信者: ws 接続 → `{ "action": "create", "passphrase": "合言葉" }` 送信
3. 受信者: ws 接続 → `{ "action": "join", "passphrase": "合言葉" }` 送信
4. **送信者**が `{ "action": "offer", ... }` を送信（A3: offer の起点は送信者）
5. 受信者が offer を受信 → `{ "action": "answer", ... }` を送信
6. 双方が `{ "action": "ice", ... }` で ICE candidate を交換（サーバーが相手へ中継）
7. P2P 確立後、ws 接続は切断してよい（サーバーは切断を強制しない）

### シーケンス（v1 / A3）

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

## 接続フロー（v2 — 多重受信者・段階1）

1. 送信者: `POST /v1/files/watchword`（`protocol: 2`）で v2 ルーム作成
2. 送信者: ws 接続 → `{ "action": "create", "passphrase": "...", "protocol": 2 }`
3. 受信者 N: ws 接続 → `{ "action": "join", "passphrase": "...", "protocol": 2 }`
4. サーバが joiner に `peer_id`（UUID v4）を発行し、join 成功レスポンスで返却
5. サーバが creator に `peer_joined` を通知
6. creator が各 joiner へ独立した `{ "action": "offer", "target_peer_id": "...", ... }` を送信
7. offer / answer / ice は `target_peer_id` で該当 peer のみに中継（混線しない）

### シーケンス（v2 — 2 joiner 例）

```
Creator(C)         サーバー        Joiner1(J1)      Joiner2(J2)
   |                  |                |                |
   |-- create ------->|                |                |
   |<-- ok -----------|                |                |
   |                  |<-- join -------|                |
   |                  |-- ok + peer_id + room meta --->|
   |<-- peer_joined --|                |                |
   |-- offer(target=J1)--------------->|                |
   |                  |<-- answer -----|                |
   |<-- answer relay -|                |                |
   |                  |<-- join ------------------------|
   |                  |-- ok + peer_id + room meta --->|
   |<-- peer_joined --|                |                |
   |-- offer(target=J2)-------------------------------->|
   |                  |<-- answer ----------------------|
   |<-- answer relay -|                |                |
```

## ルーム満員時

### v1（従来）

ルームには creator（送信者）と joiner（受信者）の **最大 2 接続**まで。3 人目が `join` した場合:

```json
{ "error": "room_full" }
```

### v2（段階1以降）

`max_joiners`（既定 5、環境変数 `WATCHWORD_MAX_JOINERS` で変更可）を超える join は拒否:

```json
{ "error": "room_full" }
```

エラー送信後、サーバーは当該 WebSocket 接続を閉じる。

## メッセージ フォーマット

### 共通（v1 互換 + v2 拡張）

```json
{
  "action": "create|join|offer|answer|ice|close_room|peer_joined|peer_left",
  "passphrase": "合言葉",
  "peer_id": "550e8400-e29b-41d4-a716-446655440000",
  "target_peer_id": "660e8400-e29b-41d4-a716-446655440001",
  "protocol": 2,
  "data": {
    "sdp": "...",
    "candidate": "..."
  }
}
```

## メッセージ フィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| action | はい | create / join / offer / answer / ice / close_room / peer_joined / peer_left |
| passphrase | はい | ルーム特定用の合言葉 |
| peer_id | v2 時 | 送信者自身の ID。join 成功時はサーバ発行の UUID |
| target_peer_id | offer/answer/ice（v2） | スター型の宛先 peer。creator または特定 joiner |
| protocol | 任意 | `2` = v2 多重受信者。省略 = v1 |
| data | 条件付き | SDP オファー/アンサー、または ICE candidate（create/join では省略可） |

## 成功応答

### create 成功

```json
{ "action": "create", "status": "ok" }
```

### join 成功（v1）

```json
{ "action": "join", "status": "ok" }
```

### join 成功（v2）

```json
{
  "action": "join",
  "status": "ok",
  "peer_id": "660e8400-e29b-41d4-a716-446655440001",
  "protocol": 2,
  "room": {
    "status": "open",
    "files": [
      {
        "file_id": "f1",
        "filename": "doc.pdf",
        "filesize": 1048576,
        "filehash": "sha256:abc..."
      }
    ],
    "max_joiners": 5,
    "active_joiners": 2
  }
}
```

段階1では `files` は単一ファイル（`file_id: "f1"`）を想定。段階3以降で複数ファイルに拡張。

### close_room 成功（段階2以降・creator のみ）

リクエスト:

```json
{ "action": "close_room", "passphrase": "abcd1234" }
```

レスポンス:

```json
{ "action": "close_room", "status": "ok" }
```

## サーバ生成メッセージ

### peer_joined（creator へ通知）

新しい joiner が参加したとき、サーバが creator の WebSocket へ送信:

```json
{
  "action": "peer_joined",
  "peer_id": "660e8400-e29b-41d4-a716-446655440001",
  "data": {
    "display_name": "optional"
  }
}
```

creator はこの通知を受けて、該当 `peer_id` 向けに offer を発行する。

### peer_left（段階2以降）

joiner が切断したとき creator へ通知（任意フィールド `display_name` 同様）。

## relay ルール

| バージョン | ルール |
|-----------|--------|
| v1 | `other_tx(from)` — creator と joiner を相互中継。`peer_id` 省略時もこの経路 |
| v2 | `target_peer_id` で `joiners[peer_id].tx` または `creator.tx` へ配送。存在しない宛先は `peer_unavailable` |

offer / answer / ice の relay ペイロードには、受信側がルーティングに必要な `peer_id` / `target_peer_id` / `protocol` を含める。

## エラーコード一覧

| error | 説明 |
|-------|------|
| unauthorized | HTTP 401（upgrade 前） |
| room_not_found | Valkey にルームが存在しない、または TTL 切れ |
| room_full | v1: 3 人目の join / v2: `max_joiners` 超過 |
| forbidden | create 時に creator_id とセッション不一致、または close_room を非 creator が実行 |
| not_in_room | offer/answer/ice 前に create/join 未実施 |
| peer_unavailable | 中継先の相手が未接続、または `target_peer_id` が存在しない |
| invalid_action | 未知の action |
| invalid_message | JSON パース失敗 |
| already_creator | join しようとしたユーザーが既に creator |
| already_joiner | create しようとしたユーザーが既に joiner（v1） |
| joiner_taken | 同一ユーザーが別スロットで既に登録済み |

## 後方互換性

- **v1 クライアント**: `peer_id` / `target_peer_id` / `protocol` を省略すれば現行 1:1 relay が維持される
- **v1 ルーム**: Valkey に `version` なし、または `version: 1` のルームは TTL 満了まで従来動作
- **v2 ルームへの v1 クライアント接続**: join 応答の `protocol: 2` を検出し、未対応 UI は接続をブロックすること（DataChannel プロトコル不一致防止）

## 関連ドキュメント

- [合言葉共有 API](../../api/files/sharing/watchword.md)
- [P2Pファイル転送](p2p.md)
- [WebRTCシグナリング インフラ概要](webrtc.md)
