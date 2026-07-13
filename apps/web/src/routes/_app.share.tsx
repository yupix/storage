import { createFileRoute, Link } from '@tanstack/react-router'
import { Check, Copy, FileUp, Loader2, Share2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import WatchwordQrCode from '../components/WatchwordQrCode'
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
import { WatchwordSender, type SenderProgress } from '../lib/webrtc-sender'
import {
  computeFileHash,
  createWatchwordRoom,
  DEFAULT_CHUNK_SIZE,
  getIceServers,
  OPEN_RECEIVER_ID,
} from '../lib/watchword'
import { cn } from '../lib/utils'

export const Route = createFileRoute('/_app/share')({
  ssr: false,
  component: SharePage,
})

type ShareStep = 'select' | 'registering' | 'sharing' | 'done' | 'error'

function SharePage() {
  const user = useUser()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const senderRef = useRef<WatchwordSender | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [receiverId, setReceiverId] = useState(OPEN_RECEIVER_ID)
  const [dragOver, setDragOver] = useState(false)
  const [step, setStep] = useState<ShareStep>('select')
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [progress, setProgress] = useState<SenderProgress | null>(null)

  useEffect(() => {
    return () => {
      senderRef.current?.stop()
      abortRef.current?.abort()
    }
  }, [])

  const applyFile = useCallback((file: File | null) => {
    setSelectedFile(file)
    setError(null)
    setPassphrase(null)
    setProgress(null)
    if (step !== 'select') setStep('select')
  }, [step])

  const handleFiles = useCallback((files: FileList | null) => {
    const file = files?.[0]
    if (file) applyFile(file)
  }, [applyFile])

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragOver(false)
    handleFiles(event.dataTransfer.files)
  }, [handleFiles])

  const handleCopyPassphrase = async () => {
    if (!passphrase) return
    try {
      await navigator.clipboard.writeText(passphrase)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('クリップボードへのコピーに失敗しました')
    }
  }

  const handleStartShare = async () => {
    if (!selectedFile || !user) return

    setError(null)
    setStep('registering')
    setProgress(null)
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const [filehash, iceServers] = await Promise.all([
        computeFileHash(selectedFile),
        getIceServers(),
      ])

      const resolvedReceiverId =
        receiverId.trim() || OPEN_RECEIVER_ID

      const createdPassphrase = await createWatchwordRoom({
        filename: selectedFile.name,
        file_type: selectedFile.type || 'application/octet-stream',
        filesize: selectedFile.size,
        mime_type: selectedFile.type || 'application/octet-stream',
        sender_id: user.id,
        receiver_id: resolvedReceiverId,
        filehash,
        chunk_size: DEFAULT_CHUNK_SIZE,
        downloadable: true,
      })

      setPassphrase(createdPassphrase)
      setStep('sharing')

      const sender = new WatchwordSender()
      senderRef.current = sender

      await sender.start({
        file: selectedFile,
        passphrase: createdPassphrase,
        filehash,
        iceServers,
        signal: abortRef.current.signal,
        onProgress: (next) => {
          setProgress(next)
          if (next.phase === 'complete') setStep('done')
          if (next.phase === 'error') {
            setError(next.message ?? '送信に失敗しました')
            setStep('error')
          }
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '共有の開始に失敗しました'
      setError(message)
      setStep('error')
    }
  }

  const handleReset = () => {
    senderRef.current?.stop()
    abortRef.current?.abort()
    senderRef.current = null
    setSelectedFile(null)
    setPassphrase(null)
    setProgress(null)
    setError(null)
    setStep('select')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const progressPercent =
    progress && progress.totalChunks > 0
      ? Math.round((progress.sentChunks / progress.totalChunks) * 100)
      : 0

  const isBusy = step === 'registering' || step === 'sharing'

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Share2 className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">合言葉で共有（送信）</h1>
          <p className="text-sm text-muted-foreground">
            ファイルを選び、合言葉を相手に伝えるだけで P2P 転送を開始できます。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>送信ファイル</CardTitle>
          <CardDescription>
            ドラッグ＆ドロップ、またはファイル選択で指定してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
            }}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center transition-colors cursor-pointer',
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
              isBusy && 'pointer-events-none opacity-60',
            )}
          >
            <Upload className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">ここにファイルをドロップ</p>
              <p className="text-xs text-muted-foreground mt-1">またはクリックして選択</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              disabled={isBusy}
              onChange={(event) => handleFiles(event.target.files)}
            />
          </div>

          {selectedFile && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex items-start gap-2">
                <FileUp className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{selectedFile.name}</p>
                  <p className="text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                    {selectedFile.type ? ` · ${selectedFile.type}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="receiver-id" className="text-sm font-medium">
              受信者 ID（任意）
            </label>
            <Input
              id="receiver-id"
              value={receiverId}
              onChange={(event) => setReceiverId(event.target.value)}
              placeholder={OPEN_RECEIVER_ID}
              disabled={isBusy}
            />
            <p className="text-xs text-muted-foreground">
              未指定の場合は誰でも合言葉で受信できます（監査用メタデータ）。
            </p>
          </div>

          {passphrase && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">合言葉</p>
                <Button type="button" variant="outline" size="sm" onClick={handleCopyPassphrase}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? 'コピー済み' : 'コピー'}
                </Button>
              </div>
              <p className="text-2xl font-mono tracking-widest text-center py-2">{passphrase}</p>
              <div className="flex justify-center">
                <WatchwordQrCode value={passphrase} />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                受信者に合言葉を伝えるか、QR コードを見せてください。
              </p>
            </div>
          )}

          {(step === 'sharing' || step === 'done') && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{progress.message ?? '送信中'}</span>
                {progress.totalChunks > 0 && (
                  <span className="text-muted-foreground tabular-nums">
                    {progress.sentChunks} / {progress.totalChunks}
                  </span>
                )}
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          {step === 'select' || step === 'error' ? (
            <Button
              type="button"
              disabled={!selectedFile || !user}
              onClick={handleStartShare}
            >
              送信を開始
            </Button>
          ) : step === 'registering' ? (
            <Button type="button" disabled>
              <Loader2 className="size-4 animate-spin" />
              準備中…
            </Button>
          ) : step === 'sharing' ? (
            <Button type="button" disabled>
              <Loader2 className="size-4 animate-spin" />
              共有中…
            </Button>
          ) : (
            <Button type="button" onClick={handleReset}>
              新しいファイルを共有
            </Button>
          )}

          {(step === 'sharing' || step === 'error') && (
            <Button type="button" variant="outline" onClick={handleReset}>
              キャンセル
            </Button>
          )}

          <Button type="button" variant="ghost" asChild>
            <Link to="/drive">マイドライブへ戻る</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
