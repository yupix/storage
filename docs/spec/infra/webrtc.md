# WebRTCシグナリング
## 役割
WebRTCのSDPオファー/アンサー・ICE候補交換
## 実装言語
Rust（Axum フレームワーク）
## シグナリング
WebSocket経由でSDP・ICE候補を交換
## ルーム管理
Valkey でセッションを一時保存（TTL付き）
## DataChannel
WebRTC DataChannelでP2P ファイル直接転送
## フロー
1. 送信者が合言葉でルーム作成 → Valkey に記録（`POST /v1/files/watchword`）
2. 送信者が WebSocket で `create`、受信者が `join`
3. **送信者**が SDP offer を作成・送信 → サーバーが受信者へ中継（A3）
4. 受信者が SDP answer を返送 → サーバーが送信者へ中継
5. 双方が ICE candidate を交換 → サーバーが中継
6. SDP + ICE 交換完了 → WebRTC DataChannel で P2P 転送開始
