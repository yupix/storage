# Web

TanStack StartによるHyperDriveのフロントエンドです。

セットアップ、起動、環境変数については
[開発環境](../../docs/guide/getting-started.md)を参照してください。

## コマンド

```bash
pnpm dev
pnpm build
pnpm test
pnpm check
pnpm generate:api
```

`generate:api`はRust APIからOpenAPIスキーマを生成し、
`src/api/schema.d.ts`を更新します。詳細は
[OpenAPIクライアント](../../docs/guide/openapi-client.md)を参照してください。
