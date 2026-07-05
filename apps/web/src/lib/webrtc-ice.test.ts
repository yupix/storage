import { afterEach, describe, expect, it, vi } from 'vitest'
import { addIceCandidateSafe, PendingIceCandidateQueue } from './webrtc-ice'

function createMockPc(remoteDescription: RTCSessionDescription | null = null) {
  return {
    remoteDescription,
    addIceCandidate: vi.fn().mockResolvedValue(undefined),
  } as unknown as RTCPeerConnection
}

describe('PendingIceCandidateQueue', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should enqueue candidate when remoteDescription is not set', () => {
    const pc = createMockPc(null)
    const queue = new PendingIceCandidateQueue()
    const init = { candidate: 'candidate:1', sdpMid: '0', sdpMLineIndex: 0 }

    queue.enqueue(pc, init)

    expect(pc.addIceCandidate).not.toHaveBeenCalled()
  })

  it('should flush all pending candidates when remoteDescription is set', async () => {
    const pc = createMockPc(null)
    const queue = new PendingIceCandidateQueue()
    const init1 = { candidate: 'c1' }
    const init2 = { candidate: 'c2' }

    queue.enqueue(pc, init1)
    queue.enqueue(pc, init2)

    Object.defineProperty(pc, 'remoteDescription', {
      value: { type: 'offer' },
      writable: true,
    })
    await queue.flush(pc)

    expect(pc.addIceCandidate).toHaveBeenCalledTimes(2)
    expect(pc.addIceCandidate).toHaveBeenNthCalledWith(1, init1)
    expect(pc.addIceCandidate).toHaveBeenNthCalledWith(2, init2)
  })

  it('should call addIceCandidate immediately if remoteDescription exists', () => {
    const pc = createMockPc({ type: 'offer' } as RTCSessionDescription)
    const queue = new PendingIceCandidateQueue()
    const init = { candidate: 'c1' }

    queue.enqueue(pc, init)

    expect(pc.addIceCandidate).toHaveBeenCalledWith(init)
  })

  it('addIceCandidateSafe should catch and warn on addIceCandidate error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const pc = createMockPc({ type: 'offer' } as RTCSessionDescription)
    vi.mocked(pc.addIceCandidate).mockRejectedValue(
      new Error('remote description was null'),
    )

    await addIceCandidateSafe(pc, { candidate: 'c1' })

    expect(warnSpy).toHaveBeenCalledWith(
      '[webrtc] addIceCandidate failed (ignored):',
      expect.any(Error),
    )
  })
})
