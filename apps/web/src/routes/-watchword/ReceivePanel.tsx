import { Link } from '@tanstack/react-router'
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import WatchwordQrScanner from '../../components/WatchwordQrScanner'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { formatFileSize } from '../../lib/files'
import { useUser } from '../../lib/user-context'
import {
  WatchwordReceiver,
  type ReceivedFile,
  type ReceiverProgress,
} from '../../lib/webrtc-receiver'
import { getIceServers, verifyBlobHash } from '../../lib/watchword'

const RECEIVE_TIMEOUT_MS = 5 * 60 * 1000

type ReceiveStep =
  | 'input'
  | 'connecting'
  | 'receiving'
  | 'verifying'
  | 'complete'
  | 'error'
  | 'disconnected'

type HashVerification = 'pending' | 'verifying' | 'match' | 'mismatch'

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise
      .then((value) => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch((err) => {
        window.clearTimeout(timer)
        reject(err)
      })
  })
}

export default function ReceivePanel() {
  const user = useUser()
  const receiverRef = useRef<WatchwordReceiver | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const [passphrase, setPassphrase] = useState('')
  const [step, setStep] = useState<ReceiveStep>('input')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ReceiverProgress | null>(null)
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null)
  const [hashVerification, setHashVerification] = useState<HashVerification>('pending')
  const [actualHash, setActualHash] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

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
    if (
      next.phase === 'connecting' ||
      next.phase === 'waiting_offer' ||
      next.phase === 'negotiating'
    ) {
      setStep('connecting')
    } else if (next.phase === 'receiving') {
      setStep('receiving')
    } else if (next.phase === 'disconnected') {
      setStep('disconnected')
    } else if (next.phase === 'error') {
      setStep('error')
      setError(next.message ?? '受信に失敗しました')
    }
  }, [])

  const verifyReceivedFile = async (file: ReceivedFile) => {
    setStep('verifying')
    setHashVerification('verifying')
    setProgress((current) => ({
      phase: 'complete',
      receivedChunks: file.meta.total_chunks,
      totalChunks: file.meta.total_chunks,
      message: '照合中…',
      meta: file.meta,
      ...(current?.meta ? {} : {}),
    }))

    const { match, actualHash: computed } = await verifyBlobHash(
      file.blob,
      file.meta.filehash,
    )
    setActualHash(computed)

    if (match) {
      setHashVerification('match')
      setStep('complete')
      setProgress({
        phase: 'complete',
        receivedChunks: file.meta.total_chunks,
        totalChunks: file.meta.total_chunks,
        message: '✅ 完了',
        meta: file.meta,
      })
      return
    }

    setHashVerification('mismatch')
    setStep('error')
    setError(
      `ファイルの整合性チェックに失敗しました。受信データが破損しているか、転送中に改ざんされた可能性があります。\n期待: ${file.meta.filehash}\n実際: ${computed}`,
    )
  }

  const startReceive = async (watchword: string) => {
    const trimmed = watchword.trim()
    if (!trimmed || !user) return

    setError(null)
    setReceivedFile(null)
    setHashVerification('pending')
    setActualHash(null)
    setSaveSuccess(false)
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

      const file = await withTimeout(
        receiver.start({
          passphrase: trimmed,
          iceServers,
          signal: abortRef.current.signal,
          onProgress: handleProgress,
        }),
        RECEIVE_TIMEOUT_MS,
        '接続がタイムアウトしました。送信者がオンラインか、合言葉が有効か確認してください。',
      )

      setReceivedFile(file)
      await verifyReceivedFile(file)
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
    if (!receivedFile || hashVerification !== 'match') return
    revokeObjectUrl()
    const url = URL.createObjectURL(receivedFile.blob)
    objectUrlRef.current = url

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = receivedFile.meta.filename
    anchor.click()
    setSaveSuccess(true)
  }

  const handleReset = () => {
    receiverRef.current?.stop()
    abortRef.current?.abort()
    receiverRef.current = null
    revokeObjectUrl()
    setReceivedFile(null)
    setProgress(null)
    setError(null)
    setHashVerification('pending')
    setActualHash(null)
    setSaveSuccess(false)
    setStep('input')
  }

  const progressPercent =
    progress && progress.totalChunks > 0
      ? Math.round((progress.receivedChunks / progress.totalChunks) * 100)
      : step === 'verifying'
        ? 100
        : 0

  const isBusy =
    step === 'connecting' || step === 'receiving' || step === 'verifying'
  const displayMeta = receivedFile?.meta ?? progress?.meta
  const isTimeoutError = error?.includes('タイムアウト') ?? false
  const canSave = step === 'complete' && hashVerification === 'match' && receivedFile

  return (
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

        {(step === 'connecting' || step === 'receiving' || step === 'verifying') &&
          progress && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">{progress.message ?? '接続中…'}</p>
              {displayMeta && (
                <p className="text-muted-foreground mt-1 truncate">
                  {displayMeta.filename} · {formatFileSize(displayMeta.filesize)}
                </p>
              )}
            </div>
          )}

        {displayMeta &&
          (step === 'receiving' || step === 'verifying' || step === 'complete') && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p className="font-medium truncate">{displayMeta.filename}</p>
              <p className="text-muted-foreground">
                {formatFileSize(displayMeta.filesize)}
                {displayMeta.mime_type ? ` · ${displayMeta.mime_type}` : ''}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">
                期待ハッシュ: {displayMeta.filehash}
              </p>
              {actualHash && hashVerification === 'mismatch' && (
                <p className="text-xs text-destructive font-mono truncate">
                  実際のハッシュ: {actualHash}
                </p>
              )}
            </div>
          )}

        {(step === 'receiving' ||
          step === 'verifying' ||
          step === 'complete') &&
          progress &&
          progress.totalChunks > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {step === 'verifying'
                    ? '照合中…'
                    : step === 'complete' && hashVerification === 'match'
                      ? '✅ 完了'
                      : (progress.message ?? '受信中')}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {step === 'verifying' || step === 'complete'
                    ? `${progress.totalChunks} / ${progress.totalChunks}`
                    : `${progress.receivedChunks} / ${progress.totalChunks}`}
                  {step !== 'verifying' && step !== 'complete' && (
                    <span className="ml-2">({progressPercent}%)</span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    step === 'verifying'
                      ? 'bg-amber-500 animate-pulse'
                      : step === 'complete' && hashVerification === 'match'
                        ? 'bg-green-600'
                        : 'bg-primary'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

        {step === 'complete' && hashVerification === 'match' && receivedFile && (
          <div className="rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm flex items-start gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">整合性チェック成功</p>
              <p className="text-muted-foreground mt-0.5">
                SHA-256 ハッシュが一致しました。ファイルを安全に保存できます。
              </p>
            </div>
          </div>
        )}

        {hashVerification === 'mismatch' && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm flex items-start gap-2 text-destructive">
            <XCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">整合性チェック失敗</p>
              <p className="mt-0.5 whitespace-pre-line">{error}</p>
              <p className="mt-1 text-xs opacity-90">
                セキュリティのため保存は無効化されています。送信者に再送を依頼してください。
              </p>
            </div>
          </div>
        )}

        {saveSuccess && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            「{receivedFile?.meta.filename}」の保存を開始しました。
          </div>
        )}

        {error && hashVerification !== 'mismatch' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive whitespace-pre-line">
            {error}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        {step === 'input' || (step === 'error' && hashVerification !== 'mismatch') ? (
          <Button
            type="button"
            disabled={!passphrase.trim() || !user}
            onClick={() => void startReceive(passphrase)}
          >
            受信を開始
          </Button>
        ) : step === 'connecting' || step === 'receiving' || step === 'verifying' ? (
          <Button type="button" disabled>
            <Loader2 className="size-4 animate-spin" />
            {step === 'connecting'
              ? '接続中…'
              : step === 'verifying'
                ? '照合中…'
                : '受信中…'}
          </Button>
        ) : step === 'complete' && canSave ? (
          <>
            <Button type="button" onClick={handleSave}>
              <Save className="size-4" />
              ローカルに保存
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              新しいファイルを受信
            </Button>
          </>
        ) : step === 'complete' && hashVerification === 'mismatch' ? (
          <Button type="button" variant="outline" onClick={handleReset}>
            合言葉を変更して再試行
          </Button>
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
        ) : hashVerification === 'mismatch' ? (
          <Button type="button" variant="outline" onClick={handleReset}>
            合言葉を変更して再試行
          </Button>
        ) : null}

        {(step === 'connecting' ||
          step === 'receiving' ||
          step === 'verifying' ||
          (step === 'error' && hashVerification !== 'mismatch')) && (
          <Button type="button" variant="outline" onClick={handleReset}>
            キャンセル
          </Button>
        )}

        {isTimeoutError && (
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" />
            ページを再読み込み
          </Button>
        )}

        <Button type="button" variant="ghost" asChild>
          <Link to="/drive">マイドライブへ戻る</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
