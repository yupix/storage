export async function addIceCandidateSafe(
  pc: RTCPeerConnection,
  init: RTCIceCandidateInit,
): Promise<void> {
  try {
    await pc.addIceCandidate(init)
  } catch (err) {
    console.warn('[webrtc] addIceCandidate failed (ignored):', err)
  }
}

export class PendingIceCandidateQueue {
  private pending: RTCIceCandidateInit[] = []

  enqueue(pc: RTCPeerConnection, init: RTCIceCandidateInit): void {
    if (!pc.remoteDescription) {
      this.pending.push(init)
      return
    }
    void addIceCandidateSafe(pc, init)
  }

  async flush(pc: RTCPeerConnection): Promise<void> {
    const batch = this.pending.splice(0)
    for (const init of batch) {
      await addIceCandidateSafe(pc, init)
    }
  }
}

/** dev 用: localStorage.WEBRTC_OFFER_DELAY_MS で offer 処理を遅延（ICE 順序競合の再現） */
export async function delayOfferIfConfigured(): Promise<void> {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('WEBRTC_OFFER_DELAY_MS')
        : null
    if (!raw) return
    const ms = Number.parseInt(raw, 10)
    if (ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms))
    }
  } catch {
    // ignore
  }
}
