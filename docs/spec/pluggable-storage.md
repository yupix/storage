# プラガブルストレージドライバー仕様

## 概要

現在のストレージ実装は AWS S3 互換オブジェクトストレージ（RustFS）に直接依存している。
本仕様では、ストレージバックエンドを差し替え可能なドライバー方式に改め、以下を実現する。

- **ローカルファイルシステム**：S3 が設定されていない環境（開発・軽量デプロイ）でのフォールバック
- **S3 互換**：現行の RustFS / MinIO / AWS S3 などをそのまま継続利用
- **将来の拡張**：Google Cloud Storage、Azure Blob Storage など他バックエンドを追加しやすい構造

---

## 現状の問題

| 問題 | 詳細 |
|------|------|
| 環境依存 | S3 の接続情報がなければサーバーが起動しない |
| 具体型への直接依存 | `AppState.storage` が `StorageClient` 構造体を直接保持しており、差し替えに全ハンドラーの変更が必要 |
| URL 生成の不透明性 | `presigned_get_url` が S3 固有の署名処理を内包しており、他バックエンドと統一できない |

---

## 設計方針

1. **トレイトによる抽象化**：`StorageDriver` トレイトを定義し、バックエンドはそれを実装する
2. **列挙型ディスパッチ**：`dyn Trait` による動的ディスパッチではなく `enum Storage` でバックエンドを保持し、`Clone` を容易にする
3. **パスベース入力**：アップロード時はバイトストリームではなく一時ファイルのパスを受け取ることで、S3 固有型（`ByteStream`）をトレイトから排除する
4. **URL 生成の統一**：ダウンロード URL の生成をトレイトメソッドに集約し、バックエンドごとに実装を切り替える
5. **自動検出フォールバック**：`STORAGE_DRIVER` 未設定時は S3 接続情報の有無で自動選択

---

## トレイト定義

```rust
// apps/api/src/utils/storage/driver.rs

use std::{path::Path, time::Duration};
use anyhow::Result;

#[async_trait::async_trait]
pub trait StorageDriver: Send + Sync {
    /// 一時ファイルをストレージにアップロードする。
    /// `key` はストレージ内の一意なパス（例: `{user_id}/{file_id}`）。
    async fn upload(&self, key: &str, path: &Path, content_type: &str) -> Result<()>;

    /// ストレージからオブジェクトを削除する。
    async fn delete(&self, key: &str) -> Result<()>;

    /// ファイルをダウンロードできる URL を返す。
    /// - S3 バックエンド：署名付き URL（期限あり）
    /// - ローカルバックエンド：API 経由の署名付きエンドポイント URL（期限あり）
    async fn get_download_url(&self, key: &str, expires_in: Duration) -> Result<String>;
}
```

---

## バックエンド実装

### ディレクトリ構造

```
apps/api/src/utils/storage/
├── mod.rs          # Storage 列挙型 + 選択ロジック
├── driver.rs       # StorageDriver トレイト定義
├── s3.rs           # S3Driver（現 StorageClient を移植）
└── local.rs        # LocalDriver（新規）
```

### S3Driver（`s3.rs`）

現行の `StorageClient` をリネームして `StorageDriver` トレイトを実装する。
`upload` メソッドは受け取ったパスから `ByteStream::from_path` で変換してから送信する。

```rust
pub struct S3Driver { /* 現 StorageClient のフィールドをそのまま */ }

#[async_trait]
impl StorageDriver for S3Driver {
    async fn upload(&self, key: &str, path: &Path, content_type: &str) -> Result<()> {
        let stream = ByteStream::from_path(path).await?;
        // 現行実装と同じ put_object 呼び出し
    }

    async fn delete(&self, key: &str) -> Result<()> { /* 現行と同じ */ }

    async fn get_download_url(&self, key: &str, expires_in: Duration) -> Result<String> {
        // 現行 presigned_get_url をそのまま移植
    }
}
```

### LocalDriver（`local.rs`）

ファイルをサーバーローカルのディレクトリに保存する。

```rust
pub struct LocalDriver {
    pub base_path: PathBuf,   // 保存先ディレクトリ（例: ./data/uploads）
    pub base_url: String,     // API のベース URL（例: http://localhost:3400）
    pub secret: String,       // 署名付き URL 生成用 HMAC シークレット
}

#[async_trait]
impl StorageDriver for LocalDriver {
    async fn upload(&self, key: &str, path: &Path, _content_type: &str) -> Result<()> {
        let dest = self.base_path.join(key);
        // 親ディレクトリを作成してからコピー
        if let Some(parent) = dest.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        // 同一ファイルシステムなら rename（移動）で済ませてディスク I/O を最小化。
        // クロスデバイスなど rename が失敗した場合のみ copy + 元ファイル削除にフォールバック。
        if tokio::fs::rename(path, &dest).await.is_err() {
            tokio::fs::copy(path, &dest).await?;
            tokio::fs::remove_file(path).await.ok();
        }
        Ok(())
    }

    async fn delete(&self, key: &str) -> Result<()> {
        let target = self.base_path.join(key);
        match tokio::fs::remove_file(&target).await {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()), // 存在しない場合は正常
            Err(e) => {
                tracing::warn!("ローカルストレージの削除失敗 key={key}: {e}");
                Err(e.into())
            }
        }
    }

    async fn get_download_url(&self, key: &str, expires_in: Duration) -> Result<String> {
        // HMAC-SHA256 で key + 有効期限タイムスタンプに署名
        // 生成例: {base_url}/v1/internal/download?key={key}&exp={unix_ts}&sig={hmac}
        todo!()
    }
}
```

#### ローカルバックエンド用ダウンロードエンドポイント

`GET /v1/internal/download?key={key}&exp={unix_ts}&sig={hmac}`

- `exp` の UNIX タイムスタンプを確認し、期限切れなら 410 Gone を返す
- `sig` を `HMAC-SHA256(key + ":" + exp, secret)` で検証し、不一致なら 403 を返す
- `key` のパスコンポーネントを検証し、`..` や絶対パスを含まないことを確認する
- 結合後のパス（`base_path.join(key)`）を `canonicalize` し、`base_path` 配下に収まっていることを `starts_with` で確認する（パス・トラバーサル対策）
- 検証通過後、`base_path / key` を `Content-Disposition: attachment` でストリーミング配信

このエンドポイントは**セッション認証不要**（署名が認可を代替）。URL を知っていれば期限内は誰でもダウンロードできるため、S3 の署名付き URL と同等の挙動となる。

### Storage 列挙型（`mod.rs`）

```rust
#[derive(Clone)]
pub enum Storage {
    S3(S3Driver),
    Local(LocalDriver),
}

// マクロまたは手動で StorageDriver の各メソッドを列挙型にデリゲートする
#[async_trait]
impl StorageDriver for Storage {
    async fn upload(&self, key: &str, path: &Path, content_type: &str) -> Result<()> {
        match self {
            Self::S3(d) => d.upload(key, path, content_type).await,
            Self::Local(d) => d.upload(key, path, content_type).await,
        }
    }
    // delete, get_download_url も同様
}
```

---

## 設定

### 環境変数

```env
# バックエンドを明示指定（省略時は自動検出）
STORAGE_DRIVER=s3      # "s3" | "local"

# S3 バックエンド設定（現行の RUSTFS_* をそのまま維持し後方互換を保つ）
RUSTFS_ENDPOINT=http://localhost:9000
RUSTFS_ACCESS_KEY=minioadmin
RUSTFS_SECRET_KEY=minioadmin
RUSTFS_BUCKET=hyperdrive
RUSTFS_FORCE_PATH_STYLE=true

# ローカルバックエンド設定
LOCAL_STORAGE_PATH=./data/uploads
LOCAL_BASE_URL=http://localhost:3400
LOCAL_SIGNED_URL_SECRET=<32バイト以上のランダム文字列>
```

### 自動検出ロジック

```
STORAGE_DRIVER が設定されている
  → 指定されたバックエンドを使用（不正値はエラー）

STORAGE_DRIVER が未設定
  → RUSTFS_ENDPOINT, RUSTFS_ACCESS_KEY, RUSTFS_SECRET_KEY, RUSTFS_BUCKET が
     すべて設定されている → S3 バックエンド
  → いずれか欠けている → ローカルバックエンド（警告ログを出力）
```

`LOCAL_SIGNED_URL_SECRET` 未設定でローカルバックエンドを選択した場合はサーバー起動時にエラーとする（セキュリティ上必須）。

### Settings 構造体の変更

```rust
#[derive(Clone, Debug, Deserialize)]
pub struct Settings {
    pub database_url: String,
    pub redis_url: String,
    pub allow_origin: String,

    // ストレージ共通
    #[serde(default)]
    pub storage_driver: Option<String>,   // "s3" | "local" | None（自動検出）

    // S3 設定（すべて Optional に）
    pub rustfs_endpoint: Option<String>,
    pub rustfs_access_key: Option<String>,
    pub rustfs_secret_key: Option<String>,
    pub rustfs_bucket: Option<String>,
    #[serde(default = "default_true")]
    pub rustfs_force_path_style: bool,

    // ローカル設定
    #[serde(default = "default_local_path")]
    pub local_storage_path: String,
    pub local_base_url: Option<String>,
    pub local_signed_url_secret: Option<String>,
}
```

---

## AppState の変更

```rust
// 変更前
pub struct AppState {
    pub storage: StorageClient,
    // ...
}

// 変更後
pub struct AppState {
    pub storage: Storage,   // Storage 列挙型（StorageDriver を実装）
    // ...
}
```

ハンドラー側は `state.storage.upload(...)` / `state.storage.delete(...)` / `state.storage.get_download_url(...)` を呼ぶだけで、バックエンドを意識しない。

---

## ハンドラーへの影響

### `upload_file`

```rust
// 変更前
let stream = ByteStream::from_path(ff.tmp.path()).await?;
state.storage.upload(&storage_key, stream, &mime).await?;

// 変更後
state.storage.upload(&storage_key, ff.tmp.path(), &mime).await?;
```

### `get_file`

```rust
// 変更前
let url = state.storage.presigned_get_url(&file.url, Duration::from_secs(3600)).await?;

// 変更後
let url = state.storage.get_download_url(&file.url, Duration::from_secs(3600)).await?;
```

その他のハンドラーへの変更は**なし**（`delete` のシグネチャは変わらない）。

---

## 将来のバックエンド追加手順

1. `apps/api/src/utils/storage/gcs.rs` 等を追加し `StorageDriver` を実装
2. `Storage` 列挙型にバリアントを追加
3. 自動検出ロジックに分岐を追加
4. 環境変数を `Settings` に追加

トレイト定義・ハンドラー・`AppState` には**変更不要**。

---

## S3 障害時の一時的なローカルフォールバック

S3 が設定されているが一時的に接続できない場合（ネットワーク障害・S3 サービス障害）に、
アップロードをローカルに退避し、S3 復帰後に自動で同期する仕組みを設ける。

> **前提**：`STORAGE_DRIVER=s3`（または S3 自動検出）かつ `LocalDriver` の設定も揃っている場合のみ有効。
> ローカルバックエンド専用構成では本機能は不要（フォールバック先がない）。

### DB スキーマ変更

`files` テーブルに以下のカラムを追加する。

```sql
ALTER TABLE files
  ADD COLUMN storage_backend VARCHAR(16) NOT NULL DEFAULT 's3',
  -- 's3' | 'local_pending_sync'
  ADD COLUMN sync_failed_at TIMESTAMPTZ;
  -- 最後に S3 同期を試みて失敗した時刻（NULL = 未失敗 or 同期済み）
```

### アップロード時のフォールバック

```
S3 へのアップロードを試みる（リトライ: 最大 3 回、指数バックオフ）
  ↓ 成功
  storage_backend = 's3' でファイルを DB に登録

  ↓ 全リトライ失敗
  LocalDriver でローカルに保存
  storage_backend = 'local_pending_sync' でファイルを DB に登録
  警告ログを出力
```

ユーザーへのレスポンスはどちらの場合も 201 Created を返す（フォールバックを透過的に扱う）。

### ダウンロード時の切り替え

`get_file` ハンドラーで `storage_backend` を参照し、URL 生成先を切り替える。

```rust
let url = match file.storage_backend.as_str() {
    "local_pending_sync" => {
        state.local_storage.get_download_url(&file.url, Duration::from_secs(3600)).await?
    }
    _ => {
        state.storage.get_download_url(&file.url, Duration::from_secs(3600)).await?
    }
};
```

そのため `AppState` はフォールバック有効時に `local_storage: LocalDriver` を追加で保持する。

### S3 への同期ジョブ

サーバー起動時にバックグラウンドタスク（`tokio::spawn`）として起動し、定期的に未同期ファイルを S3 へ転送する。

```
ループ（インターバル: 60 秒）:
  storage_backend = 'local_pending_sync' のファイルを最大 20 件取得
  件数が 0 なら次のインターバルまでスキップ

  各ファイルについて:
    1. ローカルパスからファイルを読み込み S3 にアップロード
    2. 成功 → storage_backend = 's3' に更新、ローカルファイルを削除
    3. 失敗 → sync_failed_at を更新、次のループで再試行
```

長期間同期できないファイル（`sync_failed_at` が N 時間以上前）はアラートログを出力し、
運用者が手動対応できるようにする。自動削除は行わない。

### 設定追加

```env
# S3 フォールバック有効化（STORAGE_DRIVER=s3 時のみ有効）
S3_FALLBACK_TO_LOCAL=true

# フォールバック先のローカル設定（LocalDriver と共通）
LOCAL_STORAGE_PATH=./data/uploads
LOCAL_BASE_URL=http://localhost:3400
LOCAL_SIGNED_URL_SECRET=<32バイト以上のランダム文字列>

# 同期ジョブの設定
SYNC_INTERVAL_SECS=60        # デフォルト: 60
SYNC_BATCH_SIZE=20            # デフォルト: 20
SYNC_ALERT_THRESHOLD_HOURS=6  # デフォルト: 6（これ以上経過したらアラート）
```

### 注意事項

- ローカルに退避したファイルはサーバー再起動後も同期ジョブが引き続き処理するため、再起動によるデータ欠損は発生しない
- `S3_FALLBACK_TO_LOCAL=true` でも `LOCAL_SIGNED_URL_SECRET` が未設定の場合は起動時エラーとする
- 複数インスタンス構成では、各インスタンスが別々のローカルストレージを持つため、同期前にダウンロードリクエストが別インスタンスに届くとファイルが見つからない可能性がある。複数インスタンス構成では本機能の有効化を非推奨とし、警告ログを出力する

---

## 移行計画

| フェーズ | 内容 |
|----------|------|
| 1 | `StorageDriver` トレイトを定義し `S3Driver` を実装（機能変更なし、リファクタリングのみ） |
| 2 | `LocalDriver` を実装・ローカルダウンロードエンドポイントを追加 |
| 3 | 自動検出ロジックを実装・`Settings` を更新 |
| 4 | `upload_file` / `get_file` ハンドラーの呼び出し箇所を新 API に変更 |
| 5 | S3 フォールバック機能を実装（DB マイグレーション・同期ジョブ） |
| 6 | 既存のテストが通ることを確認・E2E テストを追加 |

フェーズ 1 完了時点でリグレッションなし（S3 のみを使う既存環境は影響ゼロ）。

---

## 未決事項

- `LOCAL_SIGNED_URL_SECRET` のローテーション戦略（複数シークレット対応）
- ローカルバックエンドでの大容量ファイルストリーミング時のメモリ効率
- ローカルバックエンドの保存ディレクトリのパーミッション管理（Docker 環境での UID 問題）
