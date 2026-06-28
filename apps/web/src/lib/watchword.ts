import { apiClient } from '../api/client'
import type { components } from '../api/schema'

export const DEFAULT_CHUNK_SIZE = 16384
export const OPEN_RECEIVER_ID = '00000000-0000-0000-0000-000000000000'

export type IceServerConfig = components['schemas']['IceServer']
export type CreateWatchwordRequest = components['schemas']['CreateWatchwordRequest']

export async function getIceServers(): Promise<IceServerConfig[]> {
  const { data, error } = await apiClient.GET('/v1/config/ice-servers')
  if (error || !data) throw new Error('ICE サーバー設定の取得に失敗しました')
  return data.iceServers
}

export async function createWatchwordRoom(
  body: CreateWatchwordRequest,
): Promise<string> {
  const { data, error, response } = await apiClient.POST('/v1/files/watchword', {
    body,
  })
  if (error || !data) {
    const status = response?.status
    if (status === 403) throw new Error('送信者 ID がログインユーザーと一致しません')
    if (status === 400) throw new Error('ファイル情報が不正です')
    throw new Error('合言葉ルームの作成に失敗しました')
  }
  return data.passphrase
}

export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return hashArrayBuffer(buffer)
}

export async function computeBlobHash(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return hashArrayBuffer(buffer)
}

async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hex}`
}

/** 受信 Blob の SHA-256 が metadata filehash（sha256:hex）と一致するか照合 */
export async function verifyBlobHash(
  blob: Blob,
  expectedFilehash: string,
): Promise<{ match: boolean; actualHash: string }> {
  const actualHash = await computeBlobHash(blob)
  return { match: actualHash === expectedFilehash, actualHash }
}

function apiBaseToWsOrigin(apiBaseUrl: string): string {
  const parsed = new URL(apiBaseUrl)
  const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${parsed.host}`
}

export function getWatchwordWsUrl(): string {
  if (typeof window === 'undefined') return ''

  // Dev: Vite の /v1 WebSocket プロキシは upgrade でハングするため API へ直接接続
  const wsApiBase = import.meta.env.VITE_API_WS_BASE_URL as string | undefined
  if (import.meta.env.DEV && wsApiBase) {
    return `${apiBaseToWsOrigin(wsApiBase)}/v1/ws/watchword`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/v1/ws/watchword`
}

export function toRtcIceServers(servers: IceServerConfig[]): RTCIceServer[] {
  return servers.map((server) => ({
    urls: server.urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
  }))
}
