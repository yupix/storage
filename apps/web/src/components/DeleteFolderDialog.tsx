import { useState } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from './ui/alert-dialog'
import { deleteFolder } from '../lib/files'

interface Props {
  folderId: string | null
  onClose: () => void
  onDeleted: () => void
}

export default function DeleteFolderDialog({ folderId, onClose, onDeleted }: Props) {
  const [toHome, setToHome] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(open: boolean) {
    if (!open) {
      setToHome(false)
      setError(null)
      onClose()
    }
  }

  async function handleConfirm() {
    if (!folderId) return
    setDeleting(true)
    setError(null)
    try {
      await deleteFolder(folderId, toHome)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={folderId !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>フォルダーを削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            フォルダーの削除方法を選択してください。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              !toHome ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
            onClick={() => setToHome(false)}
          >
            <span className="text-sm font-medium">フォルダーごと削除</span>
            <span className="text-xs text-muted-foreground">
              フォルダー内のファイル・サブフォルダーをすべてゴミ箱へ移動します
            </span>
          </button>
          <button
            type="button"
            className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              toHome ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
            }`}
            onClick={() => setToHome(true)}
          >
            <span className="text-sm font-medium">中身をマイドライブへ移動して削除</span>
            <span className="text-xs text-muted-foreground">
              直下のファイル・サブフォルダーをマイドライブのルートへ移動してからフォルダーを削除します
            </span>
          </button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={deleting}>
            {deleting ? '削除中...' : '削除'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
