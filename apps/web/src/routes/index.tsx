import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import ToolbarDefault from '../components/ToolbarDefault'
import MainContentsDefault from '#/components/MainContents'
import UploadProgress from '../components/UploadProgress'
import FilePreviewDialog from '../components/FilePreviewDialog'
import { Home, Folder, Star, Trash2, Clock, Menu } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { fetchMyFiles, uploadFileWithProgress, createUploadItem, deleteFile } from '../lib/files'
import type { FileItem, UploadItem } from '../lib/files'

export const Route = createFileRoute('/')({ component: App })

const sidebarItems = [
  { icon: Home, label: 'ホーム' },
  { icon: Folder, label: 'マイドライブ' },
  { icon: Star, label: 'お気に入り' },
  { icon: Clock, label: '最近使用' },
  { icon: Trash2, label: 'ゴミ箱' },
]

function SidebarNav({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {sidebarItems.map(({ icon: Icon, label }) => (
        <li key={label}>
          <button
            type="button"
            onClick={onItemClick}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {label}
          </button>
        </li>
      ))}
    </ul>
  )
}

function App() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const touchStartX = useRef(0)

  const touchStartY = useRef(0)

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      touchStartX.current = touch.clientX
      touchStartY.current = touch.clientY
    }
    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - touchStartX.current
      const dy = touch.clientY - touchStartY.current
      // 左端 30px 以内から始まり、横移動が縦移動より大きく 60px 以上右スワイプで開く
      if (touchStartX.current < 30 && dx > 60 && Math.abs(dx) > Math.abs(dy)) {
        setSheetOpen(true)
      }
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const refreshFiles = useCallback(async () => {
    try {
      const data = await fetchMyFiles()
      setFiles(data.files)
    } catch {
      // エラー時はファイル一覧を空のままにする
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshFiles()
  }, [refreshFiles])

  // 全件完了したらファイル一覧を更新し、エラーなければ3秒後に閉じる
  useEffect(() => {
    if (uploadItems.length === 0) return
    const allSettled = uploadItems.every((i) => i.status !== 'uploading')
    if (!allSettled) return

    refreshFiles()

    const hasError = uploadItems.some((i) => i.status === 'error')
    if (!hasError) {
      const timer = setTimeout(() => {
        setUploadItems((prev) => {
          prev.forEach((i) => { if (i.preview) URL.revokeObjectURL(i.preview) })
          return []
        })
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [uploadItems, refreshFiles])

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setUploadItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      )
    },
    [],
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    e.currentTarget.value = ''
    if (selected.length === 0) return

    const newItems = selected.map(createUploadItem)
    setUploadItems((prev) => [...prev, ...newItems])

    for (const item of newItems) {
      uploadFileWithProgress(item.file, (progress) => {
        updateItem(item.id, { progress })
      })
        .then(() => updateItem(item.id, { status: 'done', progress: 100 }))
        .catch((err: unknown) =>
          updateItem(item.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'エラー',
          }),
        )
    }
  }

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTargetId) return
    setDeleting(true)
    try {
      await deleteFile(deleteTargetId)
      await refreshFiles()
    } catch {
      // エラー時は何もしない（一覧は更新しない）
    } finally {
      setDeleting(false)
      setDeleteTargetId(null)
    }
  }, [deleteTargetId, refreshFiles])

  const handleCloseProgress = () => {
    setUploadItems((prev) => {
      prev.forEach((i) => { if (i.preview) URL.revokeObjectURL(i.preview) })
      return []
    })
  }

  const uploading = uploadItems.some((i) => i.status === 'uploading')

  return (
    <main className="px-2 sm:px-4 pb-8 bg-background min-h-[calc(100vh-4rem)]">
      <div className="flex gap-2 pt-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <nav className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 p-2">
            <SidebarNav />
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-0">
          <div className="flex items-center gap-1">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="md:hidden ml-1 my-2 shrink-0">
                  <Menu />
                  <span className="sr-only">メニュー</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>HyperDrive</SheetTitle>
                </SheetHeader>
                <div className="px-2">
                  <SidebarNav onItemClick={() => setSheetOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex-1 min-w-0">
              <ToolbarDefault onFileSelect={handleFileSelect} uploading={uploading} view={view} onViewChange={setView} />
            </div>
          </div>

          <div className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 mx-1.5 min-h-96">
            <MainContentsDefault
              files={files}
              loading={loading}
              view={view}
              onFileSelect={handleFileSelect}
              onPreview={setPreviewFileId}
              onDelete={setDeleteTargetId}
            />
          </div>
        </div>
      </div>

      <UploadProgress items={uploadItems} onClose={handleCloseProgress} />

      <FilePreviewDialog fileId={previewFileId} onClose={() => setPreviewFileId(null)} />

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ファイルを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              ゴミ箱に移動します。ゴミ箱から復元できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? '削除中...' : '削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
