# 実装順序

## 推奨する実装フェーズ

依存関係の順で6つのフェーズに分割。各フェーズは前フェーズに依存。

### Phase 1: 基盤（他の全機能の前提）

1. DBマイグレーション（全テーブル作成）
2. Valkey・RustFS・Qdrant の起動確認
3. アカウント作成 POST /v1/auth/register
4. ログイン POST /v1/auth/login（セッション発行）
5. ログアウト POST /v1/auth/logout
6. プロフィール取得 GET /v1/accounts/me

### Phase 2: ファイル基本操作

1. フォルダー作成・一覧・更新・削除
2. ファイルアップロード POST /v1/files（RustFS保存・DBメタデータ登録）
3. マイファイル一覧 GET /v1/files/mine
4. ファイル閲覧 GET /v1/files/:id
5. ファイル更新・削除
6. ゴミ箱・復元・ゴミ箱を空にする

### Phase 3: 共有機能

1. リンク共有生成・一覧・削除
2. 共有ファイル閲覧（認証なし/open共有）
3. ダウンロード
4. 合言葉共有（WebSocket + WebRTC DataChannel）

### Phase 4: 検索

1. ファイル名検索（PostgreSQL ILIKE）
2. 内容検索（PostgreSQL FTS）
3. OCR検索（Python FastAPI + PaddleOCR/EasyOCR）
4. ベクトル検索（Python FastAPI + multilingual-e5 + Qdrant）

### Phase 5: 管理機能

1. アカウント一覧 GET /v1/accounts（管理者）
2. アカウント名検索
3. アカウント凍結・凍結解除（メール通知含む）
4. アカウント削除

### Phase 6: 監視・非機能

1. Prometheus メトリクス エンドポイント追加
2. Grafana ダッシュボード設定
3. Loki ログ収集設定
4. レート制限の実装
