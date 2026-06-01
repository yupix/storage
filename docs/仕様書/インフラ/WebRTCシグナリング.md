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
1. 送信者が合言葉でルーム作成 → Valkey に記録
2. 受信者が合言葉でルーム参加 → WebSocket で SDP オファー受信
3. SDP + ICE 交換完了 → WebRTC DataChannel で P2P 転送開始
