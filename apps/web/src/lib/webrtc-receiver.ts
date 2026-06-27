import {
  getWatchwordWsUrl,
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
  data?: {
    sdp?: string
    type?: string
    candidate?: string
    sdpMid?: string | null
    sdpMLineIndex?: number | null
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

  async start(options: WatchwordReceiverOptions): Promise<ReceivedFile> {
    const { passphrase, iceServers, onProgress, signal } = options

    this.aborted = false
    this.meta = null
    this.chunks.clear()
    this.completeReceived = false
    signal?.addEventListener('abort', () => this.stop(), { once: true })

    onProgress({
      phase: 'connecting',
      receivedChunks: 0,
      totalChunks: 0,
      message: 'シグナリングサーバーに接続中…',
    })

    return new Promise<ReceivedFile>((resolve, reject) => {
      const fail = (err: unknown) => {
        if (this.aborted) return
        const message =
          err instanceof Error ? err.message : '受信に失敗しました'
        onProgress({
          phase: 'error',
          receivedChunks: this.chunks.size,
          totalChunks: this.meta?.total_chunks ?? 0,
          message,
          meta: this.meta ?? undefined,
        })
        reject(err instanceof Error ? err : new Error(message))
      }

      const ws = new WebSocket(getWatchwordWsUrl())
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
        })
        fail(new Error('シグナリング接続が切断されました'))
      }

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'join', passphrase }))
      }

      ws.onmessage = async (event) => {
        let payload: WsPayload
        try {
          payload = JSON.parse(String(event.data)) as WsPayload
        } catch {
          return
        }

        if (payload.error) {
          fail(new Error(this.mapWsError(payload.error)))
          return
        }

        if (payload.action === 'join' && payload.status === 'ok') {
          try {
            this.setupPeerConnection(passphrase, iceServers, ws, onProgress, resolve, fail)
            onProgress({
              phase: 'waiting_offer',
              receivedChunks: 0,
              totalChunks: 0,
              message: '送信者の接続を待っています…',
            })
          } catch (err) {
            fail(err)
          }
          return
        }

        if (payload.action === 'offer' && payload.data?.sdp && this.pc) {
          try {
            onProgress({
              phase: 'negotiating',
              receivedChunks: 0,
              totalChunks: 0,
              message: 'P2P 接続を確立中…',
            })
            await this.pc.setRemoteDescription({
              type: 'offer',
              sdp: payload.data.sdp,
            })
            const answer = await this.pc.createAnswer()
            await this.pc.setLocalDescription(answer)
            ws.send(
              JSON.stringify({
                action: 'answer',
                passphrase,
                data: { sdp: answer.sdp, type: answer.type },
              }),
            )
          } catch (err) {
            fail(err)
          }
          return
        }

        if (payload.action === 'ice' && payload.data?.candidate && this.pc) {
          try {
            await this.pc.addIceCandidate({
              candidate: payload.data.candidate,
              sdpMid: payload.data.sdpMid ?? undefined,
              sdpMLineIndex: payload.data.sdpMLineIndex ?? undefined,
            })
          } catch (err) {
            fail(err)
          }
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
  }

  private mapWsError(code: string): string {
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

  private setupPeerConnection(
    passphrase: string,
    iceServers: IceServerConfig[],
    ws: WebSocket,
    onProgress: (progress: ReceiverProgress) => void,
    resolve: (file: ReceivedFile) => void,
    fail: (err: unknown) => void,
  ): void {
    const pc = new RTCPeerConnection({ iceServers: toRtcIceServers(iceServers) })
    this.pc = pc

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
        })
      }

      dc.onmessage = (messageEvent) => {
        void this.handleDataChannelMessage(messageEvent, onProgress, resolve, fail)
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
          })
        }
      }
    }
  }

  private async handleDataChannelMessage(
    messageEvent: MessageEvent,
    onProgress: (progress: ReceiverProgress) => void,
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
          })
          return
        }

        if (control.type === 'complete') {
          this.completeReceived = true
          const file = this.assembleReceivedFile()
          onProgress({
            phase: 'complete',
            receivedChunks: file.meta.total_chunks,
            totalChunks: file.meta.total_chunks,
            message: 'ファイルの受信が完了しました',
            meta: file.meta,
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
