# エラーレスポンス

全 API のエラーは以下の JSON 形式で返す。

```json
{
  "code": "ERROR_CODE",
  "message": "説明文"
}
```

## エラーコード一覧

| HTTP | code | 説明 |
|------|------|------|
| 400 | INVALID_INPUT | パラメータ不正 |
| 401 | UNAUTHORIZED | 未認証 |
| 403 | FORBIDDEN | 権限なし |
| 403 | FROZEN_ACCOUNT | アカウント凍結中 |
| 403 | LOGIN_LOCKED | ログインロック中 |
| 404 | NOT_FOUND | リソースなし |
| 409 | DUPLICATE_USER_ID | ユーザーID重複 |
| 409 | DUPLICATE_EMAIL | メールアドレス重複 |
| 413 | FILE_TOO_LARGE | ファイルサイズ超過 |
| 429 | RATE_LIMITED | レート制限超過 |
| 500 | INTERNAL_ERROR | サーバー内部エラー |
