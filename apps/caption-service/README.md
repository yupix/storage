# Caption Service

画像キャプション生成サービス。Rust API の `CAPTION_DRIVER=local_http` と組み合わせて使用する。

## API

```
POST /caption
Content-Type: multipart/form-data
  file: <画像ファイル>

Response:
  { "caption": "説明テキスト" }
```

## モデル選択

### moondream2（推奨: CPU でも比較的速い）

| 項目 | 値 |
|---|---|
| モデルサイズ | ~1.7GB (int8量子化) |
| CPU 速度 | ~10〜30秒/枚 |
| GPU 速度 | ~1〜2秒/枚 |

```bash
pip install moondream pillow fastapi uvicorn python-multipart
python moondream_service.py
```

初回起動時にモデルが自動ダウンロードされます（~1.7GB）。

### Florence-2-base（軽量・多機能）

| 項目 | 値 |
|---|---|
| モデルサイズ | ~270MB |
| CPU 速度 | ~5〜10秒/枚 |
| GPU 速度 | ~0.5秒/枚 |

```bash
pip install transformers torch pillow fastapi uvicorn python-multipart einops timm
python florence2_service.py
```

モデルを明示指定する場合:
```bash
python florence2_service.py --model microsoft/Florence-2-large
```

利用可能なモデル:
- `microsoft/Florence-2-base` (270MB, デフォルト)
- `microsoft/Florence-2-large` (770MB, 高精度)

## Rust API の設定

`.env` に追記:
```env
CAPTION_DRIVER=local_http
CAPTION_LOCAL_URL=http://localhost:8500
```

## ポート変更

```bash
python moondream_service.py --port 9000
python florence2_service.py --port 9000
```
