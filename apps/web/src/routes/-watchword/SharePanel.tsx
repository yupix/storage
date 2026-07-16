import { Link } from '@tanstack/react-router'
import { Check, Copy, FileUp, Loader2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import WatchwordQrCode from '../../components/WatchwordQrCode'
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
import { fetchFileAsFile, formatFileSize } from '../../lib/files'
import { useUser } from '../../lib/user-context'
import { WatchwordSender, type SenderProgress } from '../../lib/webrtc-sender'
import {
  computeFileHash,
  createWatchwordRoom,
  DEFAULT_CHUNK_SIZE,
  getIceServers,
  OPEN_RECEIVER_ID,
} from '../../lib/watchword'
import { cn } from '../../lib/utils'

type ShareStep = 'select' | 'compressing' | 'registering' | 'sharing' | 'done' | 'error'

interface SharePanelProps {
  // 共有メニューから引き継いだドライブファイル。指定時は実体を取得して初期選択にする。
  initialFileId?: string
  initialFileName?: string
}

export default function SharePanel({ initialFileId, initialFileName }: SharePanelProps) {
  const user = useUser()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const senderRef = useRef<WatchwordSender | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [receiverId, setReceiverId] = useState(OPEN_RECEIVER_ID)
  const [dragOver, setDragOver] = useState(false)
  const [step, setStep] = useState<ShareStep>('select')
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [progress, setProgress] = useState<SenderProgress | null>(null)
  const [compressPercent, setCompressPercent] = useState(0)
  const [loadingInitial, setLoadingInitial] = useState(false)

  useEffect(() => {
    return () => {
      senderRef.current?.stop()
      abortRef.current?.abort()
    }
  }, [])

  // 共有メニューから渡されたドライブファイルを取得して初期選択に加える。
  // 離脱時は転送を中断する（AbortController により大容量ファイルの取得も打ち切る）。
  useEffect(() => {
    if (!initialFileId) {
      // 取得対象が無くなった場合はローディング表示を確実に解除する
      // （直前の fetch が中断済みだと finally の解除がスキップされるため）
      setLoadingInitial(false)
      return
    }
    const controller = new AbortController()
    setLoadingInitial(true)
    setError(null)
    fetchFileAsFile(initialFileId, initialFileName || 'file', controller.signal)
      .then((file) => {
        if (!controller.signal.aborted) setSelectedFiles((prev) => [...prev, file])
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'ファイルの取得に失敗しました')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingInitial(false)
      })
    return () => controller.abort()
  }, [initialFileId, initialFileName])

  // 選択したファイルを（既存の選択に追記して）取り込む
  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return
    setSelectedFiles((prev) => [...prev, ...incoming])
    setError(null)
    setPassphrase(null)
    setProgress(null)
    if (step !== 'select') setStep('select')
  }, [step])

  const removeFile = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleFiles = useCallback((files: FileList | null) => {
    if (files) addFiles(Array.from(files))
  }, [addFiles])

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

  // 複数選択時は1つの zip にまとめて送る（転送プロトコルは単一ファイルのまま）
  const buildFileToSend = async (
    files: File[],
    onProgress?: (percent: number) => void,
  ): Promise<File> => {
    if (files.length === 1) return files[0]
    const zip = new JSZip()
    const usedNames = new Set<string>()
    for (const f of files) {
      // 同名ファイルは連番を付けて衝突を避ける
      let name = f.name
      let n = 1
      const dot = f.name.lastIndexOf('.')
      while (usedNames.has(name)) {
        name = dot > 0
          ? `${f.name.slice(0, dot)} (${n})${f.name.slice(dot)}`
          : `${f.name} (${n})`
        n += 1
      }
      usedNames.add(name)
      zip.file(name, f)
    }
    const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      onProgress?.(Math.round(metadata.percent))
    })
    return new File([blob], `共有ファイル_${files.length}点.zip`, { type: 'application/zip' })
  }

  const handleStartShare = async () => {
    if (selectedFiles.length === 0 || !user) return

    setError(null)
    setProgress(null)
    // 複数ファイルは zip 圧縮フェーズを挟むので、その間は専用の進捗表示に切り替える
    const needsZip = selectedFiles.length > 1
    setCompressPercent(0)
    setStep(needsZip ? 'compressing' : 'registering')
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    try {
      const fileToSend = await buildFileToSend(
        selectedFiles,
        needsZip ? setCompressPercent : undefined,
      )
      // zip 圧縮中にリセット/アンマウントでキャンセルされていたら後続へ進まない
      if (signal.aborted) return
      if (needsZip) setStep('registering')

      const [filehash, iceServers] = await Promise.all([
        computeFileHash(fileToSend),
        getIceServers(),
      ])

      const resolvedReceiverId =
        receiverId.trim() || OPEN_RECEIVER_ID

      const createdPassphrase = await createWatchwordRoom({
        filename: fileToSend.name,
        file_type: fileToSend.type || 'application/octet-stream',
        filesize: fileToSend.size,
        mime_type: fileToSend.type || 'application/octet-stream',
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
        file: fileToSend,
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
    setSelectedFiles([])
    setPassphrase(null)
    setProgress(null)
    setCompressPercent(0)
    setError(null)
    setStep('select')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const progressPercent =
    progress && progress.totalChunks > 0
      ? Math.round((progress.sentChunks / progress.totalChunks) * 100)
      : 0

  const isBusy = step === 'compressing' || step === 'registering' || step === 'sharing'

  return (
    <Card>
      <CardHeader>
        <CardTitle>送信ファイル</CardTitle>
        <CardDescription>
          ドラッグ＆ドロップ、またはファイル選択で指定してください。
          複数選択した場合は 1 つの zip にまとめて送信します。
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
            <p className="text-xs text-muted-foreground mt-1">またはクリックして選択（複数可）</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            disabled={isBusy}
            onChange={(event) => {
              handleFiles(event.target.files)
              event.currentTarget.value = ''
            }}
          />
        </div>

        {loadingInitial && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>ドライブからファイルを読み込み中…</span>
          </div>
        )}

        {selectedFiles.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{selectedFiles.length} 個のファイル{selectedFiles.length > 1 ? '（zip でまとめて送信）' : ''}</span>
              <span>{formatFileSize(selectedFiles.reduce((sum, f) => sum + f.size, 0))}</span>
            </div>
            <ul className="space-y-1">
              {selectedFiles.map((file, index) => (
                <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                  <FileUp className="size-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <span className="text-muted-foreground shrink-0">{formatFileSize(file.size)}</span>
                  {!isBusy && (
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                      title="このファイルを外す"
                      onClick={() => removeFile(index)}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
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

        {step === 'compressing' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>圧縮中…</span>
              <span className="text-muted-foreground tabular-nums">{compressPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${compressPercent}%` }}
              />
            </div>
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
            disabled={selectedFiles.length === 0 || !user}
            onClick={handleStartShare}
          >
            送信を開始
          </Button>
        ) : step === 'compressing' ? (
          <Button type="button" disabled>
            <Loader2 className="size-4 animate-spin" />
            圧縮中…
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
  )
}
