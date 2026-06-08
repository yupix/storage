import createClient from 'openapi-fetch'
import type { paths } from './schema'

function getBaseUrl(): string {
  // SSR (サーバーサイド): 内部URLで直接アクセス
  if (typeof window === 'undefined') {
    return globalThis.process?.env.SERVER_URL ?? 'http://localhost:8080'
  }
  // クライアントサイド 本番: 環境変数のエンドポイント
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  // クライアントサイド 開発: Vite proxyに任せる（同一オリジン）
  return ''
}

export const apiClient = createClient<paths>({
  baseUrl: getBaseUrl(),
  credentials: 'include',
})
