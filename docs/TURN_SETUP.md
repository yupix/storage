# TURN サーバー設定（NAT 越え検証）

HyperDrive の合言葉 P2P 共有では、同一 LAN では STUN のみで十分です。異なるネットワーク間や Symmetric NAT では TURN リレーが必要になります。

## 環境変数

| 変数 | 必須 | 説明 |
|------|------|------|
| `STUN_URLS` | 任意 | カンマ区切り STUN URL。未設定時は `stun:stun.l.google.com:19302` |
| `TURN_URLS` | TURN 利用時 | カンマ区切り TURN URL |
| `TURN_USERNAME` | TURN 利用時 | TURN 認証ユーザー名 |
| `TURN_CREDENTIAL` | TURN 利用時 | TURN 認証パスワード |

`TURN_URLS`・`TURN_USERNAME`・`TURN_CREDENTIAL` の **3 つすべて** が揃ったときのみ、`GET /v1/config/ice-servers` の `iceServers` に TURN が含まれます。

## 案 A: Metered Open Relay（開発・検証向け）

1. [Metered Open Relay](https://www.metered.ca/tools/openrelay/) で無料アカウント作成
2. ダッシュボードで TURN 認証情報を生成
3. `apps/api/.env` に設定:

```bash
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=turn:openrelay.metered.ca:443?transport=tcp
TURN_USERNAME=<your-metered-username>
TURN_CREDENTIAL=<your-metered-credential>
```

4. API を再起動:

```bash
cd apps/api
cargo run
```

5. 確認:

```bash
curl -s http://localhost:3400/v1/config/ice-servers | jq .
```

`iceServers` に STUN と TURN（username / credential 付き）が含まれることを確認してください。

## 案 B: 自己ホスト coturn（本番向け）

詳細は [spec/infra/turn.md](spec/infra/turn.md) を参照。`TURN_URLS` に自前 coturn の URL を指定します。

## テスト手順

### STUN のみ（LAN）

- デフォルト設定のまま `/share` → `/receive` でファイル転送
- batch3_001 E2E 手順書（`docs/test/e2e_scenario.md`）のシナリオ 1 を参照

### TURN 有効時

1. 上記の TURN 環境変数を設定して API 再起動
2. `GET /v1/config/ice-servers` で TURN が返ることを確認
3. 2 ユーザーでログインし `/share` → `/receive` で転送（複数回）
4. 進捗バー・filehash 照合（✅ 緑）が正常に動作することを確認

## 注意

- 第三者 TURN（Metered 等）を経由しても DTLS 暗号化は維持されますが、リレー運用者にメタデータが見える可能性があります
- 本番では自己ホスト coturn（案 B）を推奨します
- `TURN_*` の値は `.env` にのみ置き、リポジトリにはコミットしないでください（`.env.example` はプレースホルダーのみ）
