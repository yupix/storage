import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { renameFile } from '../lib/files'

interface RenameDialogProps {
  open: boolean
  fileId: string | null
  currentName: string
  onClose: () => void
  onRenamed: () => void
}

export default function RenameDialog({
  open,
  fileId,
  currentName,
  onClose,
  onRenamed,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(currentName)
      setError(null)
    }
  }, [open, currentName])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileId) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('ファイル名を入力してください')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await renameFile(fileId, trimmed)
      onRenamed()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '名前変更に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>名前変更</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="新しいファイル名"
              autoFocus
              disabled={submitting}
            />
            {error && <p className="text-sm text-destructive mt-1">{error}</p>}
          </div>
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              キャンセル
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? '変更中...' : '変更'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
