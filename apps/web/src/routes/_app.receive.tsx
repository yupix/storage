import { createFileRoute, Link } from '@tanstack/react-router'
import { Download, Loader2, RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import WatchwordQrScanner from '../components/WatchwordQrScanner'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { Input } from '../components/ui/input'
import { formatFileSize } from '../lib/files'
import { useUser } from '../lib/user-context'
import {
  WatchwordReceiver,
  type ReceivedFile,
  type ReceiverProgress,
} from '../lib/webrtc-receiver'
import { getIceServers } from '../lib/watchword'

export const Route = createFileRoute('/_app/receive')({
  ssr: false,
  component: ReceivePage,
})

type ReceiveStep = 'input' | 'connecting' | 'receiving' | 'complete' | 'error' | 'disconnected'

function ReceivePage() {
  const user = useUser()
  const receiverRef = useRef<WatchwordReceiver | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const [passphrase, setPassphrase] = useState('')
  const [step, setStep] = useState<ReceiveStep>('input')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ReceiverProgress | null>(null)
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null)

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      receiverRef.current?.stop()
      abortRef.current?.abort()
      revokeObjectUrl()
    }
  }, [revokeObjectUrl])

  const handleProgress = useCallback((next: ReceiverProgress) => {
    setProgress(next)
    if (next.phase === 'connecting' || next.phase === 'waiting_offer' || next.phase === 'negotiating') {
      setStep('connecting')
    } else if (next.phase === 'receiving') {
      setStep('receiving')
    } else if (next.phase === 'complete') {
      setStep('complete')
    } else if (next.phase === 'disconnected') {
      setStep('disconnected')
    } else if (next.phase === 'error') {
      setStep('error')
      setError(next.message ?? '受信に失敗しました')
    }
  }, [])

  const startReceive = async (watchword: string) => {
    const trimmed = watchword.trim()
    if (!trimmed || !user) return

    setError(null)
    setReceivedFile(null)
    revokeObjectUrl()
    setProgress(null)
    setStep('connecting')

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    receiverRef.current?.stop()

    try {
      const iceServers = await getIceServers()
      const receiver = new WatchwordReceiver()
      receiverRef.current = receiver

      const file = await receiver.start({
        passphrase: trimmed,
        iceServers,
        signal: abortRef.current.signal,
        onProgress: handleProgress,
      })

      setReceivedFile(file)
      setStep('complete')
    } catch (err) {
      if (abortRef.current?.signal.aborted) return
      const message = err instanceof Error ? err.message : '受信に失敗しました'
      setError(message)
      setStep((current) => (current === 'disconnected' ? 'disconnected' : 'error'))
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    void startReceive(passphrase)
  }

  const handleSave = () => {
    if (!receivedFile) return
    revokeObjectUrl()
    const url = URL.createObjectURL(receivedFile.blob)
    objectUrlRef.current = url

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = receivedFile.meta.filename
    anchor.click()
  }

  const handleReset = () => {
    receiverRef.current?.stop()
    abortRef.current?.abort()
    receiverRef.current = null
    revokeObjectUrl()
    setReceivedFile(null)
    setProgress(null)
    setError(null)
    setStep('input')
  }

  const progressPercent =
    progress && progress.totalChunks > 0
      ? Math.round((progress.receivedChunks / progress.totalChunks) * 100)
      : 0

  const isBusy = step === 'connecting' || step === 'receiving'
  const displayMeta = receivedFile?.meta ?? progress?.meta

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Download className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">合言葉で受信</h1>
          <p className="text-sm text-muted-foreground">
            送信者から伝えられた合言葉を入力し、P2P でファイルを受け取ります。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>合言葉入力</CardTitle>
          <CardDescription>
            テキスト入力または QR コード読取で合言葉を指定してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <label htmlFor="passphrase" className="text-sm font-medium">
                合言葉
              </label>
              <Input
                id="passphrase"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="例: abc12xyz"
                disabled={isBusy}
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-widest"
              />
            </div>

            <WatchwordQrScanner
              disabled={isBusy}
              onScan={(value) => {
                setPassphrase(value)
                void startReceive(value)
              }}
            />
          </form>

          {(step === 'connecting' || step === 'receiving') && progress && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">
                {progress.message ?? '接続中…'}
              </p>
              {displayMeta && (
                <p className="text-muted-foreground mt-1 truncate">
                  {displayMeta.filename} · {formatFileSize(displayMeta.filesize)}
                </p>
              )}
            </div>
          )}

          {displayMeta && (step === 'receiving' || step === 'complete') && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p className="font-medium truncate">{displayMeta.filename}</p>
              <p className="text-muted-foreground">
                {formatFileSize(displayMeta.filesize)}
                {displayMeta.mime_type ? ` · ${displayMeta.mime_type}` : ''}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                期待ハッシュ: {displayMeta.filehash}
              </p>
            </div>
          )}

          {(step === 'receiving' || step === 'complete') && progress && progress.totalChunks > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{progress.message ?? '受信中'}</span>
                <span className="text-muted-foreground tabular-nums">
                  {progress.receivedChunks} / {progress.totalChunks}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {step === 'complete' && receivedFile && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              受信完了。ローカルに保存するか、次のステップで filehash 照合を行います。
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {step === 'input' || step === 'error' ? (
            <Button
              type="button"
              disabled={!passphrase.trim() || !user}
              onClick={() => void startReceive(passphrase)}
            >
              受信を開始
            </Button>
          ) : step === 'connecting' || step === 'receiving' ? (
            <Button type="button" disabled>
              <Loader2 className="size-4 animate-spin" />
              {step === 'connecting' ? '接続中…' : '受信中…'}
            </Button>
          ) : step === 'complete' ? (
            <>
              <Button type="button" onClick={handleSave}>
                <Save className="size-4" />
                ローカルに保存
              </Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                新しいファイルを受信
              </Button>
            </>
          ) : step === 'disconnected' ? (
            <>
              <Button type="button" onClick={() => void startReceive(passphrase)}>
                <RefreshCw className="size-4" />
                再接続
              </Button>
              <Button type="button" variant="outline" onClick={handleReset}>
                合言葉を変更
              </Button>
            </>
          ) : null}

          {(step === 'connecting' || step === 'receiving' || step === 'error') && (
            <Button type="button" variant="outline" onClick={handleReset}>
              キャンセル
            </Button>
          )}

          <Button type="button" variant="ghost" asChild>
            <Link to="/home">ホームへ戻る</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
