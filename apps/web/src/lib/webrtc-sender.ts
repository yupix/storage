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

export type SenderPeerTransferState =
  | 'negotiating'
  | 'transferring'
  | 'complete'
  | 'failed'

export interface SenderPeerState {
  pc: RTCPeerConnection
  dc: RTCDataChannel | null
  iceQueue: PendingIceCandidateQueue
  settled: boolean
  transferState: SenderPeerTransferState
}

export interface SenderProgress {
  phase: SenderPhase
  sentChunks: number
  totalChunks: number
  message?: string
  activePeers?: number
  completedPeers?: number
}

interface WsPayload {
  action?: string
  status?: string
  error?: string
  passphrase?: string
  peer_id?: string
  target_peer_id?: string
  protocol?: number
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

const V1_LEGACY_PEER_KEY = '__legacy__'

export class WatchwordSender {
  private ws: WebSocket | null = null
  private senderPeers = new Map<string, SenderPeerState>()
  private offerRetryTimer: ReturnType<typeof setTimeout> | null = null
  private peerTransferInterval: ReturnType<typeof setInterval> | null = null
  private peerTransferReject: ((error: Error) => void) | null = null
  private aborted = false
  private multiMode = false
  private creatorPeerId: string | null = null
  private passphrase = ''
  private pendingTransfer:
    | {
        file: File
        filehash: string
        chunkSize: number
        onProgress: (progress: SenderProgress) => void
      }
    | null = null

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
    this.passphrase = passphrase
    this.pendingTransfer = { file, filehash, chunkSize, onProgress }
    signal?.addEventListener('abort', () => this.stop(), { once: true })

    onProgress({ phase: 'connecting', sentChunks: 0, totalChunks: 0 })

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(getWatchwordWsUrl())
      this.ws = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'create', passphrase, protocol: 2 }))
      }

      ws.onerror = () => {
        reject(new Error('シグナリング接続に失敗しました'))
      }

      ws.onclose = () => {
        if (this.aborted) return
        if (this.multiMode) {
          if (this.senderPeers.size === 0) {
            reject(new Error('シグナリング接続が切断されました'))
          }
          return
        }
        const legacy = this.senderPeers.get(V1_LEGACY_PEER_KEY)
        if (legacy?.dc?.readyState !== 'open') {
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
          if (payload.error === 'peer_unavailable' && !this.multiMode) {
            const legacy = this.senderPeers.get(V1_LEGACY_PEER_KEY)
            if (legacy) {
              this.scheduleOffer(passphrase, V1_LEGACY_PEER_KEY)
              onProgress({
                phase: 'waiting_peer',
                sentChunks: 0,
                totalChunks: 0,
                message: '受信者の接続を待っています…',
              })
              return
            }
          }
          reject(new Error(this.mapWsError(payload.error)))
          return
        }

        if (payload.action === 'create' && payload.status === 'ok') {
          try {
            this.multiMode = payload.protocol === 2
            this.creatorPeerId = payload.peer_id ?? null

            if (this.multiMode) {
              onProgress({
                phase: 'waiting_peer',
                sentChunks: 0,
                totalChunks: 0,
                message: '受信者の接続を待っています…',
                activePeers: 0,
                completedPeers: 0,
              })
              resolve()
              return
            }

            await this.setupPeerConnection(
              V1_LEGACY_PEER_KEY,
              passphrase,
              iceServers,
              ws,
              onProgress,
            )
            onProgress({
              phase: 'waiting_peer',
              sentChunks: 0,
              totalChunks: 0,
              message: '受信者の接続を待っています…',
            })
            await this.sendOffer(passphrase, V1_LEGACY_PEER_KEY)
            resolve()
          } catch (err) {
            reject(err instanceof Error ? err : new Error('WebRTC 接続の準備に失敗しました'))
          }
          return
        }

        if (payload.action === 'peer_joined' && payload.peer_id && this.multiMode) {
          try {
            await this.offerToPeer(
              payload.peer_id,
              passphrase,
              iceServers,
              ws,
              onProgress,
            )
          } catch (err) {
            reject(err instanceof Error ? err : new Error('peer への offer 送信に失敗しました'))
          }
          return
        }

        if (payload.action === 'peer_left' && payload.peer_id) {
          this.removePeer(payload.peer_id)
          return
        }

        const peerId = this.resolvePeerIdFromPayload(payload)
        const peer = peerId ? this.senderPeers.get(peerId) : undefined

        if (payload.action === 'answer' && payload.data?.sdp && peer) {
          await peer.pc.setRemoteDescription({
            type: 'answer',
            sdp: payload.data.sdp,
          })
          await peer.iceQueue.flush(peer.pc)
          return
        }

        if (payload.action === 'ice' && payload.data?.candidate && peer) {
          peer.iceQueue.enqueue(peer.pc, {
            candidate: payload.data.candidate,
            sdpMid: payload.data.sdpMid ?? undefined,
            sdpMLineIndex: payload.data.sdpMLineIndex ?? undefined,
          })
        }
      }
    })

    if (!this.multiMode) {
      const legacy = this.senderPeers.get(V1_LEGACY_PEER_KEY)
      const dc = legacy?.dc
      if (!dc) throw new Error('DataChannel が初期化されていません')
      await this.sendFileOverDataChannel(
        dc,
        file,
        filehash,
        chunkSize,
        onProgress,
        () => this.aborted,
      )
      return
    }

    await this.waitForAllPeerTransfers()
  }

  stop(): void {
    this.aborted = true
    if (this.offerRetryTimer) clearTimeout(this.offerRetryTimer)
    if (this.peerTransferInterval) {
      clearInterval(this.peerTransferInterval)
      this.peerTransferInterval = null
    }
    this.peerTransferReject?.(new Error('送信がキャンセルされました'))
    this.peerTransferReject = null
    for (const peer of this.senderPeers.values()) {
      peer.dc?.close()
      peer.pc.close()
    }
    this.senderPeers.clear()
    this.ws?.close()
    this.ws = null
    this.pendingTransfer = null
  }

  /** @internal test helper */
  getPeerState(peerId: string): SenderPeerState | undefined {
    return this.senderPeers.get(peerId)
  }

  /** @internal test helper */
  getPeerIds(): string[] {
    return [...this.senderPeers.keys()]
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

  private resolvePeerIdFromPayload(payload: WsPayload): string | undefined {
    if (!this.multiMode) {
      return payload.action === 'answer' || payload.action === 'ice'
        ? V1_LEGACY_PEER_KEY
        : undefined
    }
    if (payload.peer_id && this.senderPeers.has(payload.peer_id)) {
      return payload.peer_id
    }
    if (payload.target_peer_id && this.senderPeers.has(payload.target_peer_id)) {
      return payload.target_peer_id
    }
    return undefined
  }

  private async offerToPeer(
    peerId: string,
    passphrase: string,
    iceServers: IceServerConfig[],
    ws: WebSocket,
    onProgress: (progress: SenderProgress) => void,
  ): Promise<void> {
    if (this.senderPeers.has(peerId)) return

    await this.setupPeerConnection(peerId, passphrase, iceServers, ws, onProgress)
    await this.sendOffer(passphrase, peerId)

    onProgress({
      phase: 'waiting_peer',
      sentChunks: 0,
      totalChunks: 0,
      message: `受信者 ${peerId.slice(0, 8)}… との接続を確立中…`,
      activePeers: this.senderPeers.size,
      completedPeers: this.countCompletedPeers(),
    })
  }

  private async setupPeerConnection(
    peerId: string,
    passphrase: string,
    iceServers: IceServerConfig[],
    ws: WebSocket,
    onProgress: (progress: SenderProgress) => void,
  ): Promise<SenderPeerState> {
    const pc = new RTCPeerConnection({ iceServers: toRtcIceServers(iceServers) })
    const iceQueue = new PendingIceCandidateQueue()
    const state: SenderPeerState = {
      pc,
      dc: null,
      iceQueue,
      settled: false,
      transferState: 'negotiating',
    }
    this.senderPeers.set(peerId, state)

    const dc = pc.createDataChannel('file', { ordered: true })
    state.dc = dc

    dc.onopen = () => {
      state.transferState = 'transferring'
      onProgress({
        phase: 'transferring',
        sentChunks: 0,
        totalChunks: 0,
        message: 'ファイル送信中…',
        activePeers: this.senderPeers.size,
        completedPeers: this.countCompletedPeers(),
      })
      void this.startPeerTransfer(peerId, onProgress)
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      const payload: Record<string, unknown> = {
        action: 'ice',
        passphrase,
        data: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        },
      }
      if (this.multiMode) {
        payload.peer_id = this.creatorPeerId ?? undefined
        payload.target_peer_id = peerId
        payload.protocol = 2
      }
      ws.send(JSON.stringify(payload))
    }

    pc.onconnectionstatechange = () => {
      if (this.aborted) return
      if (pc.connectionState === 'failed') {
        state.transferState = 'failed'
        state.settled = true
        this.removePeer(peerId)
      }
      if (
        (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') &&
        state.transferState !== 'complete'
      ) {
        state.transferState = 'failed'
        state.settled = true
        this.removePeer(peerId)
      }
    }

    return state
  }

  private async startPeerTransfer(
    peerId: string,
    onProgress: (progress: SenderProgress) => void,
  ): Promise<void> {
    const transfer = this.pendingTransfer
    const peer = this.senderPeers.get(peerId)
    const dc = peer?.dc
    if (!transfer || !peer || !dc || peer.settled) return

    try {
      await this.sendFileOverDataChannel(
        dc,
        transfer.file,
        transfer.filehash,
        transfer.chunkSize,
        (progress) => {
          onProgress({
            ...progress,
            activePeers: this.senderPeers.size,
            completedPeers: this.countCompletedPeers(),
          })
        },
        () => this.aborted,
        false,
      )
      peer.transferState = 'complete'
      peer.settled = true
      onProgress({
        phase: 'transferring',
        sentChunks: 0,
        totalChunks: 0,
        message: `peer ${peerId.slice(0, 8)}… への送信完了`,
        activePeers: this.senderPeers.size,
        completedPeers: this.countCompletedPeers(),
      })
      if (this.allPeersSettled()) {
        onProgress({
          phase: 'complete',
          sentChunks: 0,
          totalChunks: 0,
          message: '全受信者への送信が完了しました',
          activePeers: this.senderPeers.size,
          completedPeers: this.countCompletedPeers(),
        })
      }
    } catch (err) {
      peer.transferState = 'failed'
      peer.settled = true
      if (!this.aborted) {
        onProgress({
          phase: 'error',
          sentChunks: 0,
          totalChunks: 0,
          message: err instanceof Error ? err.message : '送信に失敗しました',
          activePeers: this.senderPeers.size,
          completedPeers: this.countCompletedPeers(),
        })
      }
    }
  }

  private async sendOffer(passphrase: string, peerId: string): Promise<void> {
    const peer = this.senderPeers.get(peerId)
    if (!peer || !this.ws) return
    const offer = await peer.pc.createOffer()
    await peer.pc.setLocalDescription(offer)
    const payload: Record<string, unknown> = {
      action: 'offer',
      passphrase,
      data: { sdp: offer.sdp, type: offer.type },
    }
    if (this.multiMode) {
      payload.peer_id = this.creatorPeerId ?? undefined
      payload.target_peer_id = peerId
      payload.protocol = 2
    }
    this.ws.send(JSON.stringify(payload))
  }

  private scheduleOffer(passphrase: string, peerId: string): void {
    if (this.offerRetryTimer) return
    this.offerRetryTimer = setTimeout(() => {
      this.offerRetryTimer = null
      void this.sendOffer(passphrase, peerId)
    }, 1500)
  }

  private removePeer(peerId: string): void {
    const peer = this.senderPeers.get(peerId)
    if (!peer) return
    peer.dc?.close()
    peer.pc.close()
    this.senderPeers.delete(peerId)
  }

  private countCompletedPeers(): number {
    let count = 0
    for (const peer of this.senderPeers.values()) {
      if (peer.transferState === 'complete') count += 1
    }
    return count
  }

  private allPeersSettled(): boolean {
    if (this.senderPeers.size === 0) return false
    for (const peer of this.senderPeers.values()) {
      if (!peer.settled) return false
    }
    return true
  }

  private waitForAllPeerTransfers(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peerTransferReject = reject

      const finish = (handler: () => void) => {
        if (this.peerTransferInterval) {
          clearInterval(this.peerTransferInterval)
          this.peerTransferInterval = null
        }
        this.peerTransferReject = null
        handler()
      }

      const tick = (): boolean => {
        if (this.aborted) {
          finish(() => reject(new Error('送信がキャンセルされました')))
          return true
        }
        if (this.senderPeers.size === 0) return false
        if (!this.allPeersSettled()) return false

        const failed = [...this.senderPeers.values()].some(
          (peer) => peer.transferState === 'failed',
        )
        if (failed) {
          finish(() => reject(new Error('一部の受信者への送信に失敗しました')))
        } else {
          finish(resolve)
        }
        return true
      }

      const interval = setInterval(() => {
        if (tick()) {
          clearInterval(interval)
          if (this.peerTransferInterval === interval) {
            this.peerTransferInterval = null
          }
        }
      }, 100)
      this.peerTransferInterval = interval

      if (tick()) {
        clearInterval(interval)
        this.peerTransferInterval = null
      }
    })
  }

  private async sendFileOverDataChannel(
    dc: RTCDataChannel,
    file: File,
    filehash: string,
    chunkSize: number,
    onProgress: (progress: SenderProgress) => void,
    isAborted: () => boolean,
    emitCompletePhase = true,
  ): Promise<void> {
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
      if (isAborted()) throw new Error('送信がキャンセルされました')

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
    if (emitCompletePhase) {
      onProgress({
        phase: 'complete',
        sentChunks: totalChunks,
        totalChunks,
        message: '送信が完了しました',
      })
    }
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
