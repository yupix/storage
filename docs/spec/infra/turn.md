# TURNサーバー

## 役割
WebRTC P2P通信のNATトラバーサル

## プロトコル
- TURN（Traversal Using Relays around NAT）
- STUN（Session Traversal Utilities for NAT）

## 推奨実装
coturn（OSS）

## 必要なポート
- UDP 3478
- TCP 3478
- TLS 5349

## 設定項目
- realm
- 認証情報（ユーザー名/パスワード）
- リレーIPアドレス

## HyperDriveでの使用箇所
合言葉共有（P2P転送）
