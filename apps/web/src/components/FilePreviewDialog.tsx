import { useEffect, useState } from 'react'
import { Download, FileText, File, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { fetchFileDetail } from '../lib/files'
import type { FileDetail } from '../lib/files'
import { formatFileSize } from '../lib/files'

function PreviewContent({ detail }: { detail: FileDetail }) {
  const mime = detail.file_type

  if (mime.startsWith('image/')) {
    return (
      <img
        src={detail.url}
        alt={detail.name}
        className="max-h-[60vh] max-w-full object-contain rounded"
      />
    )
  }
  if (mime.startsWith('video/')) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: Uploaded files do not provide a separate caption track.
      <video src={detail.url} controls className="max-h-[60vh] max-w-full rounded" />
    )
  }
  if (mime.startsWith('audio/')) {
    // biome-ignore lint/a11y/useMediaCaption: Uploaded files do not provide a separate caption track.
    return <audio src={detail.url} controls className="w-full" />
  }
  if (mime === 'application/pdf') {
    return (
      <iframe src={detail.url} title={detail.name} className="w-full h-[60vh] rounded border-0" />
    )
  }
  if (mime.startsWith('text/')) {
    return <TextPreview url={detail.url} />
  }

  return (
    <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
      <File className="size-16" />
      <p className="text-sm">このファイル形式はプレビューできません</p>
    </div>
  )
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    fetch(url)
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText(null))
  }, [url])

  if (text === null) return <div className="text-sm text-muted-foreground py-4">読み込み中...</div>
  return (
    <pre className="w-full max-h-[60vh] overflow-auto rounded bg-muted p-4 text-xs whitespace-pre-wrap break-words">
      {text}
    </pre>
  )
}

interface FilePreviewDialogProps {
  fileId: string | null
  onClose: () => void
}

export default function FilePreviewDialog({ fileId, onClose }: FilePreviewDialogProps) {
  const [detail, setDetail] = useState<FileDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fileId) { setDetail(null); return }
    setLoading(true)
    setError(null)
    fetchFileDetail(fileId)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'エラー'))
      .finally(() => setLoading(false))
  }, [fileId])

  return (
    <Dialog open={fileId !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-3xl w-full">
        <div className="flex items-start justify-between gap-2 mb-4 pr-8">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <DialogTitle className="text-base font-medium truncate">
              {detail?.name ?? '読み込み中...'}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {detail && (
              <Button variant="ghost" size="icon-sm" asChild title="ダウンロード">
                <a href={detail.url} download={detail.name}>
                  <Download className="size-4" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive py-4 text-center">{error}</p>
        )}
        {detail && !loading && <PreviewContent detail={detail} />}

        {detail && (
          <p className="text-xs text-muted-foreground mt-3">
            {formatFileSize(detail.size)}
            {detail.updated_at ? ` · ${new Date(detail.updated_at).toLocaleDateString('ja-JP')}` : ''}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
