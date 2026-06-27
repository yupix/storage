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
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hex = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `sha256:${hex}`
}

export function getWatchwordWsUrl(): string {
  if (typeof window === 'undefined') return ''
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
