import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PendingIceCandidateQueue } from './webrtc-ice'
import { WatchwordSender } from './webrtc-sender'

vi.mock('./watchword', () => ({
  DEFAULT_CHUNK_SIZE: 16384,
  getWatchwordWsUrl: () => 'ws://test/watchword',
  toRtcIceServers: (servers: unknown[]) => servers,
}))

type WsHandler = ((event: { data: string }) => void) | null

class MockDataChannel extends EventTarget {
  readyState: RTCDataChannelState = 'open'
  bufferedAmount = 0
  bufferedAmountLowThreshold = 0
  send = vi.fn()
  close = vi.fn()
}

class MockPeerConnection extends EventTarget {
  static nextId = 0
  readonly id: number
  connectionState: RTCPeerConnectionState = 'connected'
  remoteDescription: RTCSessionDescription | null = null
  readonly dataChannel: MockDataChannel
  createOffer = vi.fn(async () => ({ sdp: `offer-${this.id}`, type: 'offer' as const }))
  setLocalDescription = vi.fn(async () => {})
  setRemoteDescription = vi.fn(async (desc: RTCSessionDescriptionInit) => {
    this.remoteDescription = desc as RTCSessionDescription
  })
  createDataChannel = vi.fn(() => this.dataChannel)
  close = vi.fn()

  constructor() {
    super()
    this.id = MockPeerConnection.nextId++
    this.dataChannel = new MockDataChannel()
  }
}

class MockWebSocket {
  static latest: MockWebSocket | null = null
  onopen: (() => void) | null = null
  onmessage: WsHandler = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readonly sent: string[] = []

  constructor(_url: string) {
    MockWebSocket.latest = this
    queueMicrotask(() => this.onopen?.())
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.onclose?.()
  }

  receive(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
}

function makeFile(size = 32): File {
  return new File([new Uint8Array(size)], 'test.bin', {
    type: 'application/octet-stream',
  })
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('WatchwordSender multi-peer', () => {
  beforeEach(() => {
    MockPeerConnection.nextId = 0
    MockWebSocket.latest = null
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal(
      'RTCPeerConnection',
      vi.fn((...args: ConstructorParameters<typeof MockPeerConnection>) => {
        return new MockPeerConnection(...args)
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('creates independent SenderPeerState per peer_joined and sends targeted offers', async () => {
    const sender = new WatchwordSender()
    const file = makeFile()
    const startPromise = sender.start({
      file,
      passphrase: 'abcd1234',
      filehash: 'sha256:test',
      iceServers: [],
      onProgress: () => {},
    }).catch(() => undefined)

    await flushMicrotasks()
    const ws = MockWebSocket.latest
    expect(ws).not.toBeNull()
    expect(JSON.parse(ws!.sent[0]!)).toEqual({
      action: 'create',
      passphrase: 'abcd1234',
      protocol: 2,
    })

    ws!.receive({
      action: 'create',
      status: 'ok',
      protocol: 2,
      peer_id: 'creator-1',
    })
    await flushMicrotasks()

    ws!.receive({ action: 'peer_joined', peer_id: 'joiner-a' })
    await flushMicrotasks()
    ws!.receive({ action: 'peer_joined', peer_id: 'joiner-b' })
    await flushMicrotasks()

    expect(sender.getPeerIds()).toEqual(['joiner-a', 'joiner-b'])

    const offers = ws!.sent
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((msg) => msg.action === 'offer')

    expect(offers).toHaveLength(2)
    expect(offers[0]).toMatchObject({
      action: 'offer',
      peer_id: 'creator-1',
      target_peer_id: 'joiner-a',
      protocol: 2,
    })
    expect(offers[1]).toMatchObject({
      action: 'offer',
      peer_id: 'creator-1',
      target_peer_id: 'joiner-b',
      protocol: 2,
    })

    const peerA = sender.getPeerState('joiner-a')
    const peerB = sender.getPeerState('joiner-b')
    expect(peerA?.iceQueue).toBeInstanceOf(PendingIceCandidateQueue)
    expect(peerB?.iceQueue).toBeInstanceOf(PendingIceCandidateQueue)
    expect(peerA?.iceQueue).not.toBe(peerB?.iceQueue)

    sender.stop()
    await startPromise
  })

  it('routes answer and ice to the matching peer only', async () => {
    const sender = new WatchwordSender()
    const startPromise = sender.start({
      file: makeFile(),
      passphrase: 'room-1',
      filehash: 'sha256:test',
      iceServers: [],
      onProgress: () => {},
    }).catch(() => undefined)

    await flushMicrotasks()
    const ws = MockWebSocket.latest!
    ws.receive({
      action: 'create',
      status: 'ok',
      protocol: 2,
      peer_id: 'creator-1',
    })
    await flushMicrotasks()

    ws.receive({ action: 'peer_joined', peer_id: 'joiner-a' })
    ws.receive({ action: 'peer_joined', peer_id: 'joiner-b' })
    await flushMicrotasks()

    const peerA = sender.getPeerState('joiner-a')!
    const peerB = sender.getPeerState('joiner-b')!
    const flushA = vi.spyOn(peerA.iceQueue, 'flush')
    const flushB = vi.spyOn(peerB.iceQueue, 'flush')
    const enqueueA = vi.spyOn(peerA.iceQueue, 'enqueue')
    const enqueueB = vi.spyOn(peerB.iceQueue, 'enqueue')

    ws.receive({
      action: 'answer',
      peer_id: 'joiner-a',
      target_peer_id: 'creator-1',
      data: { sdp: 'answer-a', type: 'answer' },
    })
    await flushMicrotasks()

    ws.receive({
      action: 'ice',
      peer_id: 'joiner-b',
      data: { candidate: 'candidate:2', sdpMid: '0', sdpMLineIndex: 0 },
    })
    await flushMicrotasks()

    expect(flushA).toHaveBeenCalledTimes(1)
    expect(flushB).not.toHaveBeenCalled()
    expect(enqueueA).not.toHaveBeenCalled()
    expect(enqueueB).toHaveBeenCalledTimes(1)

    sender.stop()
    await startPromise
  })

  it('removes only the disconnected peer without affecting others', async () => {
    const sender = new WatchwordSender()
    const startPromise = sender.start({
      file: makeFile(),
      passphrase: 'room-1',
      filehash: 'sha256:test',
      iceServers: [],
      onProgress: () => {},
    }).catch(() => undefined)

    await flushMicrotasks()
    const ws = MockWebSocket.latest!
    ws.receive({
      action: 'create',
      status: 'ok',
      protocol: 2,
      peer_id: 'creator-1',
    })
    await flushMicrotasks()
    ws.receive({ action: 'peer_joined', peer_id: 'joiner-a' })
    ws.receive({ action: 'peer_joined', peer_id: 'joiner-b' })
    await flushMicrotasks()

    const peerB = sender.getPeerState('joiner-b')!
    ws.receive({ action: 'peer_left', peer_id: 'joiner-a' })

    expect(sender.getPeerIds()).toEqual(['joiner-b'])
    expect(peerB.pc.close).not.toHaveBeenCalled()

    sender.stop()
    await startPromise
  })

  it('does not use Promise.all for per-peer waitForBuffer in transfer loops', async () => {
    const source = await import('fs/promises').then((fs) =>
      fs.readFile(new URL('./webrtc-sender.ts', import.meta.url), 'utf8'),
    )
    expect(source).not.toMatch(/Promise\.all\([^)]*waitForBuffer/)
    expect(source).toContain('await this.waitForBuffer(dc)')
  })
})
