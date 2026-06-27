import { Camera, CameraOff, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from './ui/button'

interface WatchwordQrScannerProps {
  onScan: (value: string) => void
  disabled?: boolean
}

type ScannerState = 'idle' | 'starting' | 'scanning' | 'unsupported'

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
    }
  }
}

export default function WatchwordQrScanner({
  onScan,
  disabled = false,
}: WatchwordQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const detectorRef = useRef<InstanceType<NonNullable<typeof window.BarcodeDetector>> | null>(
    null,
  )

  const [state, setState] = useState<ScannerState>('idle')
  const [error, setError] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState('idle')
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const scanFrame = useCallback(async () => {
    const video = videoRef.current
    const detector = detectorRef.current
    if (!video || !detector || video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(() => {
        void scanFrame()
      })
      return
    }

    try {
      const codes = await detector.detect(video)
      const value = codes[0]?.rawValue?.trim()
      if (value) {
        onScan(value)
        stopCamera()
        return
      }
    } catch {
      // フレーム単位の検出失敗は無視して継続
    }

    rafRef.current = requestAnimationFrame(() => {
      void scanFrame()
    })
  }, [onScan, stopCamera])

  const startCamera = async () => {
    setError(null)

    if (!window.BarcodeDetector) {
      setState('unsupported')
      return
    }

    try {
      setState('starting')
      detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] })
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) throw new Error('カメラ要素の初期化に失敗しました')

      video.srcObject = stream
      await video.play()
      setState('scanning')
      void scanFrame()
    } catch (err) {
      stopCamera()
      const message =
        err instanceof Error ? err.message : 'カメラの起動に失敗しました'
      setError(message)
      setState('idle')
    }
  }

  return (
    <div className="space-y-2">
      {state === 'scanning' ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-black">
            <video ref={videoRef} className="w-full max-h-48 object-cover" muted playsInline />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={stopCamera}>
            <CameraOff className="size-4" />
            カメラを停止
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || state === 'starting'}
          onClick={() => void startCamera()}
        >
          {state === 'starting' ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Camera className="size-4" />
          )}
          QR コードを読み取る
        </Button>
      )}

      {state === 'unsupported' && (
        <p className="text-xs text-muted-foreground">
          このブラウザでは QR 読取に未対応です。合言葉を手入力してください。
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
