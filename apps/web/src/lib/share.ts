import { apiClient } from '../api/client'
import type { components } from '../api/schema'

export type ShareLink = components['schemas']['ShareLinkResponse']

export interface ShareLinkResult {
  token: string
  /** ブラウザで開くと対象ファイルを表示する共有 URL（絶対 URL） */
  url: string
  expires_at: string | null
  download_allowed: boolean
}

/**
 * 対象ファイルのリンク共有を発行し、コピー用の共有 URL を組み立てて返す。
 * 共有 URL は現在のオリジン配下の公開エンドポイントを指す（/v1 はサーバーが API へプロキシする）。
 */
export async function createShareLink(fileId: string): Promise<ShareLinkResult> {
  const { data, error } = await apiClient.POST('/v1/share', {
    body: { file_id: fileId },
  })
  if (error || !data) throw new Error('共有リンクの発行に失敗しました')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return {
    token: data.token,
    url: `${origin}/v1/share/${data.token}/view`,
    expires_at: data.expires_at ?? null,
    download_allowed: data.download_allowed,
  }
}
