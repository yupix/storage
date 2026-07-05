import {
  delayOfferIfConfigured,
  PendingIceCandidateQueue,
} from './webrtc-ice'
import {
  clearWatchwordPeerId,
  joinWatchwordRoom,
  mapWatchwordWsError,
  primaryWatchwordRoomFile,
  type JoinWatchwordRoomResult,
  type WatchwordProtocol,
  type WatchwordRoomMeta,
  type IceServerConfig,
  toRtcIceServers,
} from './watchword'

export type ReceiverPhase =
  | 'connecting'
  | 'waiting_offer'
  | 'negotiating'
  | 'receiving'
  | 'complete'
  | 'error'
  | 'disconnected'

export interface FileTransferMeta {
  filename: string
  filesize: number
  filehash: string
  chunk_size: number
  total_chunks: number
  mime_type: string
}

export interface ReceiverProgress {
  phase: ReceiverPhase
  receivedChunks: number
  totalChunks: number
  message?: string
  meta?: FileTransferMeta
  protocol?: WatchwordProtocol
  room?: WatchwordRoomMeta
  peerId?: string | null
}

/** batch2_003（filehash 照合）への入力 */
export interface ReceivedFile {
  blob: Blob
  meta: FileTransferMeta
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

interface SignalingContext {
  passphrase: string
  protocol: WatchwordProtocol
  peerId: string | null
  targetPeerId: string | null
}

function buildSignalingPayload(
  base: Record<string, unknown>,
  context: SignalingContext,
): Record<string, unknown> {
  if (context.protocol !== 2 || !context.peerId) return base
  return {
    ...base,
    protocol: 2,
    peer_id: context.peerId,
    ...(context.targetPeerId ? { target_peer_id: context.targetPeerId } : {}),
  }
}

function roomFileToTransferMeta(
  file: NonNullable<ReturnType<typeof primaryWatchwordRoomFile>>,
): FileTransferMeta {
  const chunkSize = file.chunk_size ?? 16384
  return {
    filename: file.filename,
    filesize: file.filesize,
    filehash: file.filehash,
    chunk_size: chunkSize,
    total_chunks: Math.max(1, Math.ceil(file.filesize / chunkSize)),
    mime_type: file.mime_type || 'application/octet-stream',
  }
}

export interface WatchwordReceiverOptions {
  passphrase: string
  iceServers: IceServerConfig[]
  onProgress: (progress: ReceiverProgress) => void
  signal?: AbortSignal
}

export class WatchwordReceiver {
  private ws: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private aborted = false
  private meta: FileTransferMeta | null = null
  private chunks = new Map<number, Uint8Array>()
  private completeReceived = false
  private iceQueue = new PendingIceCandidateQueue()
  private promiseSettled = false
  private pendingLocalIce: RTCIceCandidateInit[] = []

  async start(options: WatchwordReceiverOptions): Promise<ReceivedFile> {
    const { passphrase, iceServers, onProgress, signal } = options

    this.aborted = false
    this.meta = null
    this.chunks.clear()
    this.completeReceived = false
    this.promiseSettled = false
    this.pendingLocalIce = []
    clearWatchwordPeerId()
    signal?.addEventListener('abort', () => this.stop(), { once: true })

    onProgress({
      phase: 'connecting',
      receivedChunks: 0,
      totalChunks: 0,
      message: 'シグナリングサーバーに接続中…',
    })

    let joinResult: JoinWatchwordRoomResult
    try {
      joinResult = await joinWatchwordRoom(passphrase)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'シグナリング接続に失敗しました'
      onProgress({
        phase: 'error',
        receivedChunks: 0,
        totalChunks: 0,
        message,
      })
      throw err instanceof Error ? err : new Error(message)
    }

    const primaryRoomFile = primaryWatchwordRoomFile(joinResult.room)
    const previewMeta = primaryRoomFile
      ? roomFileToTransferMeta(primaryRoomFile)
      : undefined
    if (previewMeta) {
      this.meta = previewMeta
    }

    const signaling: SignalingContext = {
      passphrase,
      protocol: joinResult.protocol,
      peerId: joinResult.peerId,
      targetPeerId: joinResult.room?.creator_id ?? null,
    }

    return new Promise<ReceivedFile>((resolve, reject) => {
      const fail = (err: unknown) => {
        this.promiseSettled = true
        if (this.aborted) return
        const message =
          err instanceof Error ? err.message : '受信に失敗しました'
        onProgress({
          phase: 'error',
          receivedChunks: this.chunks.size,
          totalChunks: this.meta?.total_chunks ?? 0,
          message,
          meta: this.meta ?? undefined,
          protocol: joinResult.protocol,
          room: joinResult.room ?? undefined,
          peerId: joinResult.peerId,
        })
        reject(err instanceof Error ? err : new Error(message))
      }

      const ws = joinResult.ws
      this.ws = ws

      ws.onerror = () => fail(new Error('シグナリング接続に失敗しました'))

      ws.onclose = () => {
        if (this.aborted) return
        if (this.completeReceived) return
        onProgress({
          phase: 'disconnected',
          receivedChunks: this.chunks.size,
          totalChunks: this.meta?.total_chunks ?? 0,
          message: '接続が切断されました',
          meta: this.meta ?? undefined,
          protocol: joinResult.protocol,
          room: joinResult.room ?? undefined,
          peerId: joinResult.peerId,
        })
        fail(new Error('シグナリング接続が切断されました'))
      }

      try {
        this.setupPeerConnection(
          signaling,
          iceServers,
          ws,
          onProgress,
          joinResult,
          resolve,
          fail,
        )
        onProgress({
          phase: 'waiting_offer',
          receivedChunks: 0,
          totalChunks: previewMeta?.total_chunks ?? 0,
          message: '送信者の接続を待っています…',
          meta: previewMeta,
          protocol: joinResult.protocol,
          room: joinResult.room ?? undefined,
          peerId: joinResult.peerId,
        })
      } catch (err) {
        fail(err)
        return
      }

      ws.onmessage = async (event) => {
        let payload: WsPayload
        try {
          payload = JSON.parse(String(event.data)) as WsPayload
        } catch {
          return
        }

        if (payload.error) {
          fail(new Error(mapWatchwordWsError(payload.error)))
          return
        }

        if (payload.action === 'offer' && payload.data?.sdp && this.pc) {
          if (
            joinResult.protocol === 2 &&
            payload.target_peer_id &&
            joinResult.peerId &&
            payload.target_peer_id !== joinResult.peerId
          ) {
            return
          }
          if (payload.peer_id) {
            signaling.targetPeerId = payload.peer_id
          }
          try {
            onProgress({
              phase: 'negotiating',
              receivedChunks: 0,
              totalChunks: this.meta?.total_chunks ?? 0,
              message: 'P2P 接続を確立中…',
              meta: this.meta ?? undefined,
              protocol: joinResult.protocol,
              room: joinResult.room ?? undefined,
              peerId: joinResult.peerId,
            })
            await delayOfferIfConfigured()
            await this.pc.setRemoteDescription({
              type: 'offer',
              sdp: payload.data.sdp,
            })
            await this.iceQueue.flush(this.pc)
            const answer = await this.pc.createAnswer()
            await this.pc.setLocalDescription(answer)
            ws.send(
              JSON.stringify(
                buildSignalingPayload(
                  {
                    action: 'answer',
                    passphrase,
                    data: { sdp: answer.sdp, type: answer.type },
                  },
                  signaling,
                ),
              ),
            )
            this.flushPendingLocalIce(ws, signaling)
          } catch (err) {
            fail(err)
          }
          return
        }

        if (payload.action === 'ice' && payload.data?.candidate && this.pc) {
          if (
            joinResult.protocol === 2 &&
            payload.target_peer_id &&
            joinResult.peerId &&
            payload.target_peer_id !== joinResult.peerId
          ) {
            return
          }
          this.iceQueue.enqueue(this.pc, {
            candidate: payload.data.candidate,
            sdpMid: payload.data.sdpMid ?? undefined,
            sdpMLineIndex: payload.data.sdpMLineIndex ?? undefined,
          })
        }
      }
    })
  }

  stop(): void {
    this.aborted = true
    this.dc?.close()
    this.pc?.close()
    this.ws?.close()
    this.dc = null
    this.pc = null
    this.ws = null
    clearWatchwordPeerId()
  }

  private sendLocalIce(
    ws: WebSocket,
    signaling: SignalingContext,
    data: {
      candidate: string
      sdpMid: string | null
      sdpMLineIndex: number | null
    },
  ): void {
    ws.send(
      JSON.stringify(
        buildSignalingPayload(
          {
            action: 'ice',
            passphrase: signaling.passphrase,
            data,
          },
          signaling,
        ),
      ),
    )
  }

  private flushPendingLocalIce(ws: WebSocket, signaling: SignalingContext): void {
    if (signaling.protocol !== 2 || !signaling.targetPeerId) return
    for (const data of this.pendingLocalIce) {
      this.sendLocalIce(ws, signaling, data)
    }
    this.pendingLocalIce = []
  }

  private setupPeerConnection(
    signaling: SignalingContext,
    iceServers: IceServerConfig[],
    ws: WebSocket,
    onProgress: (progress: ReceiverProgress) => void,
    joinResult: JoinWatchwordRoomResult,
    resolve: (file: ReceivedFile) => void,
    fail: (err: unknown) => void,
  ): void {
    const pc = new RTCPeerConnection({ iceServers: toRtcIceServers(iceServers) })
    this.pc = pc

    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      const candidatePayload = {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      }
      if (signaling.protocol === 2 && !signaling.targetPeerId) {
        this.pendingLocalIce.push(candidatePayload)
        return
      }
      this.sendLocalIce(ws, signaling, candidatePayload)
    }

    pc.onconnectionstatechange = () => {
      if (this.aborted) return
      if (pc.connectionState === 'failed') {
        fail(new Error('P2P 接続に失敗しました'))
      }
      if (pc.connectionState === 'disconnected' && !this.completeReceived) {
        onProgress({
          phase: 'disconnected',
          receivedChunks: this.chunks.size,
          totalChunks: this.meta?.total_chunks ?? 0,
          message: 'P2P 接続が切断されました',
          meta: this.meta ?? undefined,
          protocol: joinResult.protocol,
          room: joinResult.room ?? undefined,
          peerId: joinResult.peerId,
        })
      }
    }

    pc.ondatachannel = (event) => {
      const dc = event.channel
      this.dc = dc

      dc.onopen = () => {
        onProgress({
          phase: 'receiving',
          receivedChunks: 0,
          totalChunks: this.meta?.total_chunks ?? 0,
          message: 'ファイル受信を待機中…',
          meta: this.meta ?? undefined,
          protocol: joinResult.protocol,
          room: joinResult.room ?? undefined,
          peerId: joinResult.peerId,
        })
      }

      dc.onmessage = (messageEvent) => {
        void this.handleDataChannelMessage(
          messageEvent,
          onProgress,
          joinResult,
          resolve,
          fail,
        )
      }

      dc.onerror = () => fail(new Error('DataChannel でエラーが発生しました'))
      dc.onclose = () => {
        if (!this.aborted && !this.completeReceived) {
          onProgress({
            phase: 'disconnected',
            receivedChunks: this.chunks.size,
            totalChunks: this.meta?.total_chunks ?? 0,
            message: '転送中に接続が切断されました',
            meta: this.meta ?? undefined,
            protocol: joinResult.protocol,
            room: joinResult.room ?? undefined,
            peerId: joinResult.peerId,
          })
        }
      }
    }
  }

  private async handleDataChannelMessage(
    messageEvent: MessageEvent,
    onProgress: (progress: ReceiverProgress) => void,
    joinResult: JoinWatchwordRoomResult,
    resolve: (file: ReceivedFile) => void,
    fail: (err: unknown) => void,
  ): Promise<void> {
    try {
      if (typeof messageEvent.data === 'string') {
        const control = JSON.parse(messageEvent.data) as {
          type?: string
          filename?: string
          filesize?: number
          filehash?: string
          chunk_size?: number
          total_chunks?: number
          mime_type?: string
        }

        if (control.type === 'meta') {
          if (
            !control.filename ||
            control.filesize == null ||
            !control.filehash ||
            !control.chunk_size ||
            !control.total_chunks
          ) {
            throw new Error('ファイルメタデータが不正です')
          }

          this.meta = {
            filename: control.filename,
            filesize: control.filesize,
            filehash: control.filehash,
            chunk_size: control.chunk_size,
            total_chunks: control.total_chunks,
            mime_type: control.mime_type || 'application/octet-stream',
          }

          onProgress({
            phase: 'receiving',
            receivedChunks: 0,
            totalChunks: this.meta.total_chunks,
            message: `${this.meta.filename} を受信中…`,
            meta: this.meta,
            protocol: joinResult.protocol,
            room: joinResult.room ?? undefined,
            peerId: joinResult.peerId,
          })
          return
        }

        if (control.type === 'complete') {
          if (this.promiseSettled) return
          this.promiseSettled = true
          this.completeReceived = true
          const file = this.assembleReceivedFile()
          onProgress({
            phase: 'complete',
            receivedChunks: file.meta.total_chunks,
            totalChunks: file.meta.total_chunks,
            message: 'ファイルの受信が完了しました',
            meta: file.meta,
            protocol: joinResult.protocol,
            room: joinResult.room ?? undefined,
            peerId: joinResult.peerId,
          })
          resolve(file)
        }
        return
      }

      const buffer = await this.toArrayBuffer(messageEvent.data)
      if (buffer.byteLength < 5) return

      const view = new DataView(buffer)
      const index = view.getUint32(0, false)
      const chunk = new Uint8Array(buffer, 4)
      this.chunks.set(index, chunk)

      const totalChunks = this.meta?.total_chunks ?? 0
      onProgress({
        phase: 'receiving',
        receivedChunks: this.chunks.size,
        totalChunks,
        message:
          totalChunks > 0
            ? `受信中 ${this.chunks.size} / ${totalChunks}`
            : 'チャンクを受信中…',
        meta: this.meta ?? undefined,
        protocol: joinResult.protocol,
        room: joinResult.room ?? undefined,
        peerId: joinResult.peerId,
      })
    } catch (err) {
      fail(err)
    }
  }

  private assembleReceivedFile(): ReceivedFile {
    if (!this.meta) throw new Error('ファイルメタデータがありません')

    const { total_chunks, filename, mime_type, filesize, filehash, chunk_size } =
      this.meta

    if (this.chunks.size < total_chunks) {
      throw new Error(
        `チャンクが不足しています（${this.chunks.size} / ${total_chunks}）`,
      )
    }

    const parts: BlobPart[] = []
    for (let index = 0; index < total_chunks; index += 1) {
      const chunk = this.chunks.get(index)
      if (!chunk) {
        throw new Error(`チャンク ${index} が欠落しています`)
      }
      parts.push(chunk)
    }

    const blob = new Blob(parts, { type: mime_type })
    if (blob.size !== filesize) {
      throw new Error(
        `ファイルサイズが一致しません（期待: ${filesize}, 実際: ${blob.size}）`,
      )
    }

    return {
      blob,
      meta: {
        filename,
        filesize,
        filehash,
        chunk_size,
        total_chunks,
        mime_type,
      },
    }
  }

  private async toArrayBuffer(data: Blob | ArrayBuffer): Promise<ArrayBuffer> {
    if (data instanceof ArrayBuffer) return data
    return data.arrayBuffer()
  }
}
