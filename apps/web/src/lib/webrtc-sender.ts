import { PendingIceCandidateQueue } from './webrtc-ice'
import {
  DEFAULT_CHUNK_SIZE,
  getWatchwordWsUrl,
  type IceServerConfig,
  toRtcIceServers,
} from './watchword'

export type SenderPhase =
  | 'connecting'
  | 'waiting_peer'
  | 'transferring'
  | 'complete'
  | 'error'

export interface SenderProgress {
  phase: SenderPhase
  sentChunks: number
  totalChunks: number
  message?: string
}

interface WsPayload {
  action?: string
  status?: string
  error?: string
  passphrase?: string
  data?: {
    sdp?: string
    type?: string
    candidate?: string
    sdpMid?: string | null
    sdpMLineIndex?: number | null
  }
}

export interface WatchwordSenderOptions {
  file: File
  passphrase: string
  filehash: string
  chunkSize?: number
  iceServers: IceServerConfig[]
  onProgress: (progress: SenderProgress) => void
  signal?: AbortSignal
}

export class WatchwordSender {
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private offerRetryTimer: ReturnType<typeof setTimeout> | null = null
  private aborted = false
  private iceQueue = new PendingIceCandidateQueue()

  async start(options: WatchwordSenderOptions): Promise<void> {
    const {
      file,
      passphrase,
      filehash,
      chunkSize = DEFAULT_CHUNK_SIZE,
      iceServers,
      onProgress,
      signal,
    } = options

    this.aborted = false
    signal?.addEventListener('abort', () => this.stop(), { once: true })

    onProgress({ phase: 'connecting', sentChunks: 0, totalChunks: 0 })

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(getWatchwordWsUrl())
      this.ws = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'create', passphrase }))
      }

      ws.onerror = () => {
        reject(new Error('シグナリング接続に失敗しました'))
      }

      ws.onclose = () => {
        if (!this.aborted && this.dc?.readyState !== 'open') {
          reject(new Error('シグナリング接続が切断されました'))
        }
      }

      ws.onmessage = async (event) => {
        let payload: WsPayload
        try {
          payload = JSON.parse(String(event.data)) as WsPayload
        } catch {
          return
        }

        if (payload.error) {
          if (payload.error === 'peer_unavailable' && this.pc) {
            this.scheduleOffer(passphrase)
            onProgress({
              phase: 'waiting_peer',
              sentChunks: 0,
              totalChunks: 0,
              message: '受信者の接続を待っています…',
            })
            return
          }
          reject(new Error(this.mapWsError(payload.error)))
          return
        }

        if (payload.action === 'create' && payload.status === 'ok') {
          try {
            await this.setupPeerConnection(passphrase, iceServers, ws, onProgress)
            onProgress({
              phase: 'waiting_peer',
              sentChunks: 0,
              totalChunks: 0,
              message: '受信者の接続を待っています…',
            })
            await this.sendOffer(passphrase)
            resolve()
          } catch (err) {
            reject(err instanceof Error ? err : new Error('WebRTC 接続の準備に失敗しました'))
          }
          return
        }

        if (payload.action === 'answer' && payload.data?.sdp && this.pc) {
          await this.pc.setRemoteDescription({
            type: 'answer',
            sdp: payload.data.sdp,
          })
          await this.iceQueue.flush(this.pc)
          return
        }

        if (payload.action === 'ice' && payload.data?.candidate && this.pc) {
          this.iceQueue.enqueue(this.pc, {
            candidate: payload.data.candidate,
            sdpMid: payload.data.sdpMid ?? undefined,
            sdpMLineIndex: payload.data.sdpMLineIndex ?? undefined,
          })
        }
      }
    })

    await this.sendFileOverDataChannel(file, filehash, chunkSize, onProgress)
  }

  stop(): void {
    this.aborted = true
    if (this.offerRetryTimer) clearTimeout(this.offerRetryTimer)
    this.dc?.close()
    this.pc?.close()
    this.ws?.close()
    this.dc = null
    this.pc = null
    this.ws = null
  }

  private mapWsError(code: string): string {
    switch (code) {
      case 'unauthorized':
        return 'ログインが必要です'
      case 'room_not_found':
        return '合言葉ルームが見つかりません'
      case 'room_full':
        return 'ルームが満員です'
      case 'forbidden':
        return 'このルームを作成したユーザーではありません'
      case 'peer_unavailable':
        return '受信者がまだ接続していません'
      case 'invalid_message':
        return 'シグナリングメッセージが不正です'
      default:
        return `シグナリングエラー: ${code}`
    }
  }

  private async setupPeerConnection(
    passphrase: string,
    iceServers: IceServerConfig[],
    ws: WebSocket,
    onProgress: (progress: SenderProgress) => void,
  ): Promise<void> {
    const pc = new RTCPeerConnection({ iceServers: toRtcIceServers(iceServers) })
    this.pc = pc

    const dc = pc.createDataChannel('file', { ordered: true })
    this.dc = dc

    dc.onopen = () => {
      onProgress({
        phase: 'transferring',
        sentChunks: 0,
        totalChunks: 0,
        message: 'ファイル送信中…',
      })
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      ws.send(
        JSON.stringify({
          action: 'ice',
          passphrase,
          data: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        }),
      )
    }
  }

  private async sendOffer(passphrase: string): Promise<void> {
    if (!this.pc || !this.ws) return
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.ws.send(
      JSON.stringify({
        action: 'offer',
        passphrase,
        data: { sdp: offer.sdp, type: offer.type },
      }),
    )
  }

  private scheduleOffer(passphrase: string): void {
    if (this.offerRetryTimer) return
    this.offerRetryTimer = setTimeout(() => {
      this.offerRetryTimer = null
      void this.sendOffer(passphrase)
    }, 1500)
  }

  private async sendFileOverDataChannel(
    file: File,
    filehash: string,
    chunkSize: number,
    onProgress: (progress: SenderProgress) => void,
  ): Promise<void> {
    const dc = this.dc
    if (!dc) throw new Error('DataChannel が初期化されていません')

    await this.waitForDataChannelOpen(dc)

    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize))
    dc.send(
      JSON.stringify({
        type: 'meta',
        filename: file.name,
        filesize: file.size,
        filehash,
        chunk_size: chunkSize,
        total_chunks: totalChunks,
        mime_type: file.type || 'application/octet-stream',
      }),
    )

    const buffer = await file.arrayBuffer()
    for (let index = 0; index < totalChunks; index += 1) {
      if (this.aborted) throw new Error('送信がキャンセルされました')

      const start = index * chunkSize
      const end = Math.min(start + chunkSize, buffer.byteLength)
      const chunk = buffer.slice(start, end)
      const packet = new Uint8Array(4 + chunk.byteLength)
      const view = new DataView(packet.buffer)
      view.setUint32(0, index, false)
      packet.set(new Uint8Array(chunk), 4)
      dc.send(packet)

      onProgress({
        phase: 'transferring',
        sentChunks: index + 1,
        totalChunks,
        message: `送信中 ${index + 1} / ${totalChunks}`,
      })

      await this.waitForBuffer(dc)
    }

    dc.send(JSON.stringify({ type: 'complete' }))
    onProgress({
      phase: 'complete',
      sentChunks: totalChunks,
      totalChunks,
      message: '送信が完了しました',
    })
  }

  private waitForDataChannelOpen(dc: RTCDataChannel): Promise<void> {
    if (dc.readyState === 'open') return Promise.resolve()
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('DataChannel の接続に失敗しました'))
      }
      const onClose = () => {
        cleanup()
        reject(new Error('DataChannel が切断されました'))
      }
      const cleanup = () => {
        dc.removeEventListener('open', onOpen)
        dc.removeEventListener('error', onError)
        dc.removeEventListener('close', onClose)
      }
      dc.addEventListener('open', onOpen)
      dc.addEventListener('error', onError)
      dc.addEventListener('close', onClose)
    })
  }

  private waitForBuffer(dc: RTCDataChannel): Promise<void> {
    if (dc.bufferedAmount < chunkBackpressureThreshold(dc)) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const check = () => {
        if (dc.bufferedAmount < chunkBackpressureThreshold(dc)) {
          cleanup()
          resolve()
        }
      }
      const onClose = () => {
        cleanup()
        reject(new Error('DataChannel closed'))
      }
      const onError = () => {
        cleanup()
        reject(new Error('DataChannel error'))
      }
      const cleanup = () => {
        dc.removeEventListener('bufferedamountlow', check)
        dc.removeEventListener('close', onClose)
        dc.removeEventListener('error', onError)
      }
      dc.bufferedAmountLowThreshold = chunkBackpressureThreshold(dc)
      dc.addEventListener('bufferedamountlow', check)
      dc.addEventListener('close', onClose)
      dc.addEventListener('error', onError)
      check()
    })
  }
}

function chunkBackpressureThreshold(dc: RTCDataChannel): number {
  return dc.bufferedAmountLowThreshold || 256 * 1024
}
