# 合言葉共有

| 要件 | 値 |
|----|----|
| ログインの有無 | True |
| 合言葉共有トグル | True |
| パスワード（合言葉） | string |
| エンドポイント | /v1/files/watchword |
| メソッド | POST |


## 概要

「合言葉」を介して、サーバーにファイルを保存せずブラウザ間で直接ファイルを転送する機能です。同一LAN内・インターネット越し（異なるネットワーク間）の双方に対応しています。

**解決する問題**: 共有リンクの発行や権限設定の手間を省き、口頭で「合言葉」を伝えるだけでセキュアな受け渡しを可能にします。

**プライバシー**: 機密ファイルはデバイス間（Peer-to-Peer）で完結するため、サーバーに実体やログが残りません。

cmd_028 以降、**v2 プロトコル**により複数受信者・複数ファイル・継続共有を段階的に拡張する。本ドキュメントは v1（現行）と v2（拡張）の両方を記載する。


## プロトコルバージョン

| protocol | ルーム | 受信者数 | ファイル数 |
|----------|--------|----------|------------|
| 省略 / v1 | Valkey `version` なし or `1` | 1（creator + joiner 1 名） | 1 |
| `2` | Valkey `version: 2` | 最大 `max_joiners`（既定 5） | 段階1: 1 / 段階3以降: 複数 |

後方互換: v1 形式の POST（単一ファイルフィールドのみ）は引き続き受け付け、内部で `version: 1` として保存する。


## フロント→バックに必要なデータ

### v1（現行・単一ファイル）

| キー | 値の情報 |
|----|----|
| ファイル名 | string |
| ファイル形式 | string |
| ファイルサイズ | integer |
| MIME形式 | string |
| 送信者ID | string |
| 受信者ID | string |
| ファイルハッシュ | string |
| チャンクサイズ | integer |
| 共有有効期限（任意） | datetime |
| ダウンロード可 | boolean |

### v2（段階1 — 単一ファイル・複数 joiner）

v1 フィールドに加え、または代替として:

| キー | 値の情報 |
|----|----|
| protocol | `2`（v2 ルーム作成） |
| max_joiners | integer（任意、省略時は `WATCHWORD_MAX_JOINERS` 環境変数、既定 5） |

段階3以降、`files` 配列で複数ファイルを指定（下記「v2 複数ファイル」参照）。


## バック→フロントに必要なデータ

### v1

| キー | 値の種類 |
|----|----|
| 合言葉 | String |

### v2

| キー | 値の種類 |
|----|----|
| 合言葉 | String |
| protocol | integer（`2`） |
| file_count | integer（段階3以降。段階1では `1`） |

合言葉は **サーバー側で自動生成**（8 文字英数字）。クライアントからの指定は不可（A2）。


## POST /v1/files/watchword

### v1 リクエスト例

```json
{
  "filename": "doc.pdf",
  "file_type": "pdf",
  "filesize": 1048576,
  "mime_type": "application/pdf",
  "sender_id": "550e8400-e29b-41d4-a716-446655440000",
  "receiver_id": "660e8400-e29b-41d4-a716-446655440001",
  "filehash": "sha256:abc...",
  "chunk_size": 16384,
  "downloadable": true,
  "expire_at": "2026-07-05T07:00:00Z"
}
```

### v2 リクエスト例（段階1 — 単一ファイル）

```json
{
  "protocol": 2,
  "filename": "doc.pdf",
  "file_type": "pdf",
  "filesize": 1048576,
  "mime_type": "application/pdf",
  "sender_id": "550e8400-e29b-41d4-a716-446655440000",
  "receiver_id": "660e8400-e29b-41d4-a716-446655440001",
  "filehash": "sha256:abc...",
  "chunk_size": 16384,
  "downloadable": true,
  "max_joiners": 5,
  "expire_at": "2026-07-05T07:00:00Z"
}
```

### v2 リクエスト例（段階3以降 — 複数ファイル）

```json
{
  "protocol": 2,
  "sender_id": "550e8400-e29b-41d4-a716-446655440000",
  "max_joiners": 5,
  "files": [
    {
      "filename": "doc.pdf",
      "file_type": "pdf",
      "filesize": 1048576,
      "mime_type": "application/pdf",
      "filehash": "sha256:abc...",
      "chunk_size": 16384,
      "downloadable": true
    },
    {
      "filename": "img.png",
      "file_type": "png",
      "filesize": 204800,
      "mime_type": "image/png",
      "filehash": "sha256:def...",
      "chunk_size": 16384,
      "downloadable": true
    }
  ],
  "expire_at": "2026-07-05T07:00:00Z"
}
```

### レスポンス（201 Created）

**v1:**

```json
{ "passphrase": "x7k9m2pq" }
```

**v2:**

```json
{
  "passphrase": "x7k9m2pq",
  "protocol": 2,
  "file_count": 1
}
```

## Valkey ルーム構造

Key: `watchword:room:{passphrase}`

### v1（現行）

```json
{
  "passphrase": "x7k9m2pq",
  "creator_id": "uuid",
  "joiner_id": null,
  "metadata": {
    "filename": "...",
    "filesize": 1,
    "filehash": "sha256:...",
    "chunk_size": 16384,
    "downloadable": true,
    "receiver_id": "uuid",
    "sender_id": "uuid"
  },
  "created_at": "2026-07-05T06:00:00Z"
}
```

### v2（段階1）

```json
{
  "version": 2,
  "passphrase": "x7k9m2pq",
  "creator_id": "uuid",
  "status": "open",
  "max_joiners": 5,
  "files": [
    {
      "file_id": "f1",
      "filename": "doc.pdf",
      "file_type": "pdf",
      "filesize": 1048576,
      "mime_type": "application/pdf",
      "filehash": "sha256:...",
      "chunk_size": 16384,
      "downloadable": true
    }
  ],
  "joiner_ids": [],
  "created_at": "2026-07-05T06:00:00Z",
  "expire_at": "2026-07-05T06:10:00Z"
}
```

`version` フィールド欠落時は v1 として deserialize する（後方互換）。

## WebSocket join 応答（v2）

join 成功時、REST とは別に WS でも room メタを返す。詳細は [WebSocketシグナリング](../../../spec/infra/websocket.md) を参照。

```json
{
  "action": "join",
  "status": "ok",
  "peer_id": "660e8400-...",
  "protocol": 2,
  "room": {
    "status": "open",
    "files": [{ "file_id": "f1", "filename": "doc.pdf", "filesize": 1048576, "filehash": "sha256:..." }],
    "max_joiners": 5,
    "active_joiners": 2
  }
}
```

## POST /v1/files/watchword/{passphrase}/close（段階2以降）

creator のみ実行可能。ルームを `status: closed` にし、進行中の WS 接続へ `room_closed` を通知する。

| 項目 | 値 |
|------|-----|
| メソッド | POST |
| 認証 | セッション Cookie 必須 |
| 権限 | creator_id とセッション一致時のみ |

成功: `204 No Content` または JSON `{ "status": "closed" }`（実装で統一）。

WS 経由の `close_room` アクションも同等（[websocket.md](../../../spec/infra/websocket.md) 参照）。

## 実装メモ

| 項目 | 方針 |
|------|------|
| receiver_id | メタデータとして保存・監査用。WS join 時の ID 照合は MVP では行わない（A1） |
| filehash | `sha256:<64hex>` 形式（A6） |
| chunk_size | 既定 16384、最大 65536（A5） |
| expire_at | `min(expire_at, now+10min)` で Valkey TTL を設定（A4） |
| max_joiners | 環境変数 `WATCHWORD_MAX_JOINERS`（既定 5）。リクエストの `max_joiners` はこれ以下に clamp |
| TTL 延長 | 段階1では join/complete 時に TTL を延長しない（abuse 防止） |

WebSocket シグナリングの詳細は [WebSocketシグナリング](../../../spec/infra/websocket.md) を参照。

P2P アーキテクチャ（スター型・複数受信者）は [p2p.md](../../../spec/infra/p2p.md) を参照。

E2E 手順（複数 joiner）は [e2e_scenario.md §11](../../../test/e2e_scenario.md) を参照。

## 実装要件

### 必要なコンポーネント

| コンポーネント | 技術 | 備考 |
|---|---|---|
| シグナリング | Rust (Axum) + WebSocket | SDPオファー/ICE候補の中継。v2 は `target_peer_id` ルーティング |
| ルーム管理 | Valkey | 合言葉をキーにルーム状態管理・TTL付き。v1/v2 共存 |
| P2P転送 | WebRTC DataChannel | バイナリ直接転送（サーバー経由なし）。v2 は peer ごとに独立 PC |

詳細: [WebRTCシグナリング](../../../spec/infra/webrtc.md)

## 後方互換性

| 層 | 影響 | 対策 |
|----|------|------|
| Valkey | v1/v2 共存 | `version` フィールドで deserialize 分岐 |
| REST | 単一ファイル POST | 現行フィールド維持。`protocol: 2` は optional |
| WS | v1 クライアント | `peer_id` 省略時は現行 1:1 relay |
| Frontend | share/receive | `room.protocol` 検出で v1/v2 UI 分岐 |

v1 ルームは TTL 満了まで現行動作を維持する。破壊的変更は行わない。
