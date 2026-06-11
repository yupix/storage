import { createFileRoute } from '@tanstack/react-router'

// ローカルストレージのファイルをサーバーサイドでプロキシする。
// ブラウザから直接 API ポートにアクセスできない Coder 等の環境でも動作する。
export const Route = createFileRoute('/v1/internal/download')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const apiBase = process.env.API_BASE_URL ?? 'http://localhost:3400'
        const backendUrl = `${apiBase}/v1/internal/download${url.search}`

        const res = await fetch(backendUrl)

        const headers = new Headers()
        const ct = res.headers.get('Content-Type')
        if (ct) headers.set('Content-Type', ct)
        const cd = res.headers.get('Content-Disposition')
        if (cd) headers.set('Content-Disposition', cd)

        return new Response(res.body, { status: res.status, headers })
      },
    },
  },
})
