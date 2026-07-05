import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWatchwordWsUrl } from './watchword'

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
