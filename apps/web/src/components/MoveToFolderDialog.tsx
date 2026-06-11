import { useState, useEffect } from 'react'
import { Folder } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { fetchFolders, moveFile } from '../lib/files'
import type { FolderItem } from '../lib/files'

interface Props {
  open: boolean
  fileId: string | null
  onClose: () => void
  onMoved: () => void
}

export default function MoveToFolderDialog({ open, fileId, onClose, onMoved }: Props) {
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let active = true
    setSelected(null)
    setError(null)
    setFetching(true)
    fetchFolders(null, 1, 100)
      .then((data) => { if (active) setFolders(data.folders) })
      .catch(() => { if (active) setError('フォルダー一覧の取得に失敗しました') })
      .finally(() => { if (active) setFetching(false) })
    return () => { active = false }
  }, [open])

  async function handleMove() {
    if (!fileId) return
    setMoving(true)
    setError(null)
    try {
      await moveFile(fileId, selected)
      onMoved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移動先を選択</DialogTitle>
        </DialogHeader>
        <div className="py-2 min-h-24 max-h-64 overflow-y-auto">
          {fetching ? (
            <div className="flex flex-col gap-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-9 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              <li>
                <button
                  type="button"
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selected === null ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}
                  onClick={() => setSelected(null)}
                >
                  <Folder className="size-4 shrink-0" />
                  マイドライブ（ルート）
                </button>
              </li>
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selected === folder.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}
                    onClick={() => setSelected(folder.id)}
                  >
                    <Folder className="size-4 shrink-0" />
                    {folder.name}
                  </button>
                </li>
              ))}
              {!fetching && folders.length === 0 && (
                <li className="text-sm text-muted-foreground text-center py-4">
                  フォルダーがありません
                </li>
              )}
            </ul>
          )}
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={moving}>キャンセル</Button>
          <Button onClick={handleMove} disabled={moving || fetching || !fileId}>
            {moving ? '移動中...' : '移動'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
