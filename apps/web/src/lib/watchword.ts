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

  const sameOrigin = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/v1/ws/watchword`
  }

  if (!import.meta.env.DEV) return sameOrigin()

  const wsApiBase = import.meta.env.VITE_API_WS_BASE_URL as string | undefined
  const host = window.location.hostname
  const isLocalDev =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]'

  // localhost dev のみ: Vite WS プロキシ回避のため API 直結
  if (isLocalDev && wsApiBase) {
    return `${apiBaseToWsOrigin(wsApiBase)}/v1/ws/watchword`
  }

  // Coder 等リモート dev / LAN IP アクセス: same-origin（Vite/Nitro プロキシ経由）
  return sameOrigin()
}

export function toRtcIceServers(servers: IceServerConfig[]): RTCIceServer[] {
  return servers.map((server) => ({
    urls: server.urls,
    ...(server.username ? { username: server.username } : {}),
    ...(server.credential ? { credential: server.credential } : {}),
  }))
}

export type WatchwordProtocol = 1 | 2

export interface WatchwordRoomFile {
  file_id: string
  filename: string
  filesize: number
  filehash: string
  mime_type?: string
  file_type?: string
  chunk_size?: number
  downloadable?: boolean
}

export interface WatchwordRoomMeta {
  protocol: WatchwordProtocol
  status: 'open' | 'closed'
  files: WatchwordRoomFile[]
  max_joiners?: number
  active_joiners?: number
  creator_id?: string
}

export interface JoinWatchwordRoomResult {
  peerId: string | null
  protocol: WatchwordProtocol
  room: WatchwordRoomMeta | null
  ws: WebSocket
}

export interface WatchwordJoinWsPayload {
  action?: string
  status?: string
  error?: string
  peer_id?: string
  protocol?: number
  room?: {
    protocol?: number
    status?: string
    files?: WatchwordRoomFile[]
    max_joiners?: number
    active_joiners?: number
    creator_id?: string
  }
}

let lastWatchwordPeerId: string | null = null

export function getWatchwordPeerId(): string | null {
  return lastWatchwordPeerId
}

export function clearWatchwordPeerId(): void {
  lastWatchwordPeerId = null
}

export function mapWatchwordWsError(code: string): string {
  switch (code) {
    case 'unauthorized':
      return 'ログインが必要です'
    case 'room_not_found':
      return '合言葉が正しくないか、ルームの有効期限が切れています'
    case 'room_full':
      return 'ルームが満員です'
    case 'joiner_taken':
      return 'このルームには既に別の受信者が接続しています'
    case 'already_creator':
      return '送信者は受信者として参加できません'
    case 'peer_unavailable':
      return '送信者がまだ接続していません'
    case 'invalid_message':
      return 'シグナリングメッセージが不正です'
    default:
      return `シグナリングエラー: ${code}`
  }
}

export function parseWatchwordProtocol(
  payload: Pick<WatchwordJoinWsPayload, 'protocol' | 'room'>,
): WatchwordProtocol {
  const value = payload.protocol ?? payload.room?.protocol
  return value === 2 ? 2 : 1
}

function parseWatchwordRoomFile(raw: WatchwordRoomFile): WatchwordRoomFile | null {
  if (!raw.file_id || !raw.filename || raw.filesize == null || !raw.filehash) {
    return null
  }
  return {
    file_id: raw.file_id,
    filename: raw.filename,
    filesize: raw.filesize,
    filehash: raw.filehash,
    mime_type: raw.mime_type,
    file_type: raw.file_type,
    chunk_size: raw.chunk_size,
    downloadable: raw.downloadable,
  }
}

export function parseWatchwordRoomMeta(
  payload: WatchwordJoinWsPayload,
): WatchwordRoomMeta | null {
  if (!payload.room) return null

  const protocol = parseWatchwordProtocol(payload)
  const files = Array.isArray(payload.room.files)
    ? payload.room.files
        .map((file) => parseWatchwordRoomFile(file))
        .filter((file): file is WatchwordRoomFile => file != null)
    : []

  return {
    protocol,
    status: payload.room.status === 'closed' ? 'closed' : 'open',
    files,
    max_joiners: payload.room.max_joiners,
    active_joiners: payload.room.active_joiners,
    creator_id: payload.room.creator_id,
  }
}

export function parseJoinWatchwordResponse(
  payload: WatchwordJoinWsPayload,
): Omit<JoinWatchwordRoomResult, 'ws'> | null {
  if (payload.action !== 'join' || payload.status !== 'ok') return null

  const protocol = parseWatchwordProtocol(payload)
  const room = parseWatchwordRoomMeta(payload)

  return {
    peerId: payload.peer_id ?? null,
    protocol,
    room,
  }
}

export function primaryWatchwordRoomFile(
  room: WatchwordRoomMeta | null,
): WatchwordRoomFile | null {
  if (!room || room.files.length === 0) return null
  return room.files[0] ?? null
}

export function joinWatchwordRoom(passphrase: string): Promise<JoinWatchwordRoomResult> {
  return new Promise((resolve, reject) => {
    let settled = false
    const ws = new WebSocket(getWatchwordWsUrl())

    const fail = (message: string) => {
      if (settled) return
      settled = true
      ws.close()
      reject(new Error(message))
    }

    ws.onerror = () => fail('シグナリング接続に失敗しました')

    ws.onclose = () => {
      if (!settled) fail('シグナリング接続が切断されました')
    }

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: 'join', passphrase }))
    }

    ws.onmessage = (event) => {
      let payload: WatchwordJoinWsPayload
      try {
        payload = JSON.parse(String(event.data)) as WatchwordJoinWsPayload
      } catch {
        return
      }

      if (payload.error) {
        fail(mapWatchwordWsError(payload.error))
        return
      }

      const parsed = parseJoinWatchwordResponse(payload)
      if (!parsed) return

      settled = true
      lastWatchwordPeerId = parsed.peerId
      ws.onclose = null
      resolve({ ...parsed, ws })
    }
  })
}
