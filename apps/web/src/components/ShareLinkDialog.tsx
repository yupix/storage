import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { createShareLink } from '../lib/share'
import type { FileItem } from '../lib/files'

interface ShareLinkDialogProps {
  file: FileItem | null
  onClose: () => void
}

export default function ShareLinkDialog({ file, onClose }: ShareLinkDialogProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // ダイアログを開いた（file が設定された）タイミングでリンクを発行する。
  useEffect(() => {
    if (!file) return
    let cancelled = false
    setUrl(null)
    setError(null)
    setCopied(false)
    setLoading(true)
    createShareLink(file.id)
      .then((link) => {
        if (!cancelled) setUrl(link.url)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '共有リンクの発行に失敗しました')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  const handleCopy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('クリップボードへのコピーに失敗しました')
    }
  }

  return (
    <Dialog open={file !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>リンク共有</DialogTitle>
          <DialogDescription>
            リンクを知っている人は誰でもこのファイルを閲覧できます。
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          {loading && <p className="text-sm text-muted-foreground">リンクを発行しています...</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {url && (
            <div className="flex items-center gap-2">
              <Input
                value={url}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1"
              />
              <Button type="button" onClick={handleCopy} className="shrink-0">
                {copied ? 'コピーしました' : 'コピー'}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
