import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWatchwordPeerId,
  getWatchwordPeerId,
  joinWatchwordRoom,
  parseJoinWatchwordResponse,
  parseWatchwordProtocol,
  parseWatchwordRoomMeta,
  primaryWatchwordRoomFile,
  getWatchwordWsUrl,
} from './watchword'

function mockWindow(location: {
  protocol: string
  host: string
  hostname: string
}) {
  vi.stubGlobal('window', { location })
}

describe('getWatchwordWsUrl', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('DEV', 'true')
    vi.stubEnv('PROD', 'false')
    vi.stubEnv('VITE_API_WS_BASE_URL', 'http://localhost:3400')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('localhost (DEV) returns API direct WS URL', () => {
    mockWindow({
      protocol: 'http:',
      host: 'localhost:5175',
      hostname: 'localhost',
    })
    expect(getWatchwordWsUrl()).toBe('ws://localhost:3400/v1/ws/watchword')
  })

  it('127.0.0.1 (DEV) returns API direct WS URL', () => {
    mockWindow({
      protocol: 'http:',
      host: '127.0.0.1:5175',
      hostname: '127.0.0.1',
    })
    expect(getWatchwordWsUrl()).toBe('ws://localhost:3400/v1/ws/watchword')
  })

  it('remote https dev (Coder) returns same-origin wss URL', () => {
    mockWindow({
      protocol: 'https:',
      host: 'coder.example.com',
      hostname: 'coder.example.com',
    })
    expect(getWatchwordWsUrl()).toBe(
      'wss://coder.example.com/v1/ws/watchword',
    )
  })

  it('production build returns same-origin wss URL', () => {
    vi.stubEnv('MODE', 'production')
    vi.stubEnv('DEV', 'false')
    vi.stubEnv('PROD', 'true')

    mockWindow({
      protocol: 'https:',
      host: 'app.example.com',
      hostname: 'app.example.com',
    })
    expect(getWatchwordWsUrl()).toBe('wss://app.example.com/v1/ws/watchword')
  })
})

describe('parseWatchwordProtocol', () => {
  it('defaults to v1 when protocol is omitted', () => {
    expect(parseWatchwordProtocol({})).toBe(1)
  })

  it('detects v2 from top-level protocol', () => {
    expect(parseWatchwordProtocol({ protocol: 2 })).toBe(2)
  })

  it('detects v2 from room.protocol', () => {
    expect(parseWatchwordProtocol({ room: { protocol: 2 } })).toBe(2)
  })
})

describe('parseWatchwordRoomMeta', () => {
  it('parses v2 room metadata with files', () => {
    const room = parseWatchwordRoomMeta({
      action: 'join',
      status: 'ok',
      protocol: 2,
      peer_id: '660e8400-e29b-41d4-a716-446655440000',
      room: {
        status: 'open',
        max_joiners: 5,
        active_joiners: 2,
        creator_id: '550e8400-e29b-41d4-a716-446655440000',
        files: [
          {
            file_id: 'f1',
            filename: 'a.pdf',
            filesize: 1024,
            filehash: 'sha256:' + 'a'.repeat(64),
            mime_type: 'application/pdf',
            chunk_size: 16384,
          },
        ],
      },
    })

    expect(room).toEqual({
      protocol: 2,
      status: 'open',
      max_joiners: 5,
      active_joiners: 2,
      creator_id: '550e8400-e29b-41d4-a716-446655440000',
      files: [
        {
          file_id: 'f1',
          filename: 'a.pdf',
          filesize: 1024,
          filehash: 'sha256:' + 'a'.repeat(64),
          mime_type: 'application/pdf',
          chunk_size: 16384,
          downloadable: undefined,
          file_type: undefined,
        },
      ],
    })
  })

  it('returns null for v1 join without room payload', () => {
    expect(
      parseWatchwordRoomMeta({ action: 'join', status: 'ok' }),
    ).toBeNull()
  })
})

describe('parseJoinWatchwordResponse', () => {
  it('parses v1 join ok without peer_id', () => {
    expect(
      parseJoinWatchwordResponse({ action: 'join', status: 'ok' }),
    ).toEqual({
      peerId: null,
      protocol: 1,
      room: null,
    })
  })

  it('parses v2 join ok with peer_id and room', () => {
    const parsed = parseJoinWatchwordResponse({
      action: 'join',
      status: 'ok',
      protocol: 2,
      peer_id: '660e8400-e29b-41d4-a716-446655440000',
      room: {
        status: 'open',
        files: [
          {
            file_id: 'f1',
            filename: 'doc.pdf',
            filesize: 2048,
            filehash: 'sha256:' + 'b'.repeat(64),
          },
        ],
      },
    })

    expect(parsed?.peerId).toBe('660e8400-e29b-41d4-a716-446655440000')
    expect(parsed?.protocol).toBe(2)
    expect(primaryWatchwordRoomFile(parsed?.room ?? null)?.filename).toBe(
      'doc.pdf',
    )
  })
})

describe('joinWatchwordRoom', () => {
  beforeEach(() => {
    clearWatchwordPeerId()
    vi.stubEnv('MODE', 'development')
    vi.stubEnv('DEV', 'true')
    vi.stubEnv('PROD', 'false')
    vi.stubEnv('VITE_API_WS_BASE_URL', 'ws://localhost:3400')
    vi.stubGlobal('window', {
      location: {
        protocol: 'http:',
        host: 'localhost:5175',
        hostname: 'localhost',
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    clearWatchwordPeerId()
  })

  it('joins v1 room and stores peer id when provided', async () => {
    class MockWebSocket {
      static instances: MockWebSocket[] = []
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      sent: string[] = []

      constructor(public url: string) {
        MockWebSocket.instances.push(this)
        queueMicrotask(() => this.onopen?.())
      }

      send(data: string) {
        this.sent.push(data)
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({ action: 'join', status: 'ok' }),
          })
        })
      }

      close() {}
    }

    vi.stubGlobal('WebSocket', MockWebSocket)

    const result = await joinWatchwordRoom('abcd1234')

    expect(result.protocol).toBe(1)
    expect(result.peerId).toBeNull()
    expect(result.room).toBeNull()
    expect(getWatchwordPeerId()).toBeNull()
    expect(MockWebSocket.instances[0]?.sent[0]).toBe(
      JSON.stringify({ action: 'join', passphrase: 'abcd1234' }),
    )
  })

  it('joins v2 room and returns peer_id with room metadata', async () => {
    class MockWebSocket {
      onopen: (() => void) | null = null
      onmessage: ((event: { data: string }) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null

      constructor(_url: string) {
        queueMicrotask(() => this.onopen?.())
      }

      send() {
        queueMicrotask(() => {
          this.onmessage?.({
            data: JSON.stringify({
              action: 'join',
              status: 'ok',
              protocol: 2,
              peer_id: '660e8400-e29b-41d4-a716-446655440000',
              room: {
                status: 'open',
                max_joiners: 5,
                active_joiners: 1,
                creator_id: '550e8400-e29b-41d4-a716-446655440000',
                files: [
                  {
                    file_id: 'f1',
                    filename: 'share.bin',
                    filesize: 512,
                    filehash: 'sha256:' + 'c'.repeat(64),
                  },
                ],
              },
            }),
          })
        })
      }

      close() {}
    }

    vi.stubGlobal('WebSocket', MockWebSocket)

    const result = await joinWatchwordRoom('zzzzzzzz')

    expect(result.protocol).toBe(2)
    expect(result.peerId).toBe('660e8400-e29b-41d4-a716-446655440000')
    expect(getWatchwordPeerId()).toBe('660e8400-e29b-41d4-a716-446655440000')
    expect(result.room?.files[0]?.filename).toBe('share.bin')
  })
})
