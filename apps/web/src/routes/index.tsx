import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useRef } from 'react'
import ToolbarDefault from '../components/ToolbarDefault'
import MainContentsDefault from '#/components/MainContents'
import UploadProgress from '../components/UploadProgress'
import FilePreviewDialog from '../components/FilePreviewDialog'
import CreateFolderDialog from '../components/CreateFolderDialog'
import MoveToFolderDialog from '../components/MoveToFolderDialog'
import { Home, Folder, Star, Trash2, Clock, Menu } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { fetchMyFiles, fetchFolders, uploadFileWithProgress, createUploadItem, deleteFile } from '../lib/files'
import type { FileItem, FolderItem, UploadItem } from '../lib/files'

export const Route = createFileRoute('/')({ component: App })

type SidebarSection = 'home' | 'drive' | 'favorites' | 'recent' | 'trash'

const sidebarItems: { icon: typeof Home; label: string; section: SidebarSection }[] = [
  { icon: Home, label: 'ホーム', section: 'home' },
  { icon: Folder, label: 'マイドライブ', section: 'drive' },
  { icon: Star, label: 'お気に入り', section: 'favorites' },
  { icon: Clock, label: '最近使用', section: 'recent' },
  { icon: Trash2, label: 'ゴミ箱', section: 'trash' },
]

function SidebarNav({
  activeSection,
  onNavigate,
  onItemClick,
}: {
  activeSection?: SidebarSection
  onNavigate?: (section: SidebarSection) => void
  onItemClick?: () => void
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {sidebarItems.map(({ icon: Icon, label, section }) => (
        <li key={label}>
          <button
            type="button"
            onClick={() => { onNavigate?.(section); onItemClick?.() }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
              activeSection === section ? 'bg-muted font-medium' : 'hover:bg-muted'
            }`}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {label}
          </button>
        </li>
      ))}
    </ul>
  )
}

interface BreadcrumbItem {
  id: string | null
  name: string
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
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: null, name: 'マイドライブ' }])
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [moveTargetFileId, setMoveTargetFileId] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SidebarSection>('home')

  const refreshFiles = useCallback(async () => {
    try {
      const [fileData, folderData] = await Promise.all([
        fetchMyFiles(1, 50, currentFolderId),
        fetchFolders(currentFolderId, 1, 100),
      ])
      setFiles(fileData.files)
      setFolders(folderData.folders)
    } catch {
      // エラー時は一覧を空のままにする
    } finally {
      setLoading(false)
    }
  }, [currentFolderId])

  useEffect(() => {
    setLoading(true)
    refreshFiles()
  }, [refreshFiles])

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
      }, currentFolderId ?? undefined)
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
      // エラー時は何もしない
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

  const handleSidebarNavigate = useCallback((section: SidebarSection) => {
    setActiveSection(section)
    if (section === 'home' || section === 'drive') {
      setCurrentFolderId(null)
      setBreadcrumb([{ id: null, name: 'マイドライブ' }])
    }
  }, [])

  const handleFolderOpen = useCallback((folder: FolderItem) => {
    setCurrentFolderId(folder.id)
    setBreadcrumb((prev) => [...prev, { id: folder.id, name: folder.name }])
  }, [])

  const handleBreadcrumbNavigate = useCallback((id: string | null) => {
    setCurrentFolderId(id)
    setBreadcrumb((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      return idx >= 0 ? prev.slice(0, idx + 1) : prev
    })
  }, [])

  const uploading = uploadItems.some((i) => i.status === 'uploading')

  return (
    <main className="px-2 sm:px-4 pb-8 bg-background min-h-[calc(100vh-4rem)]">
      <div className="flex gap-2 pt-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <nav className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 p-2">
            <SidebarNav activeSection={activeSection} onNavigate={handleSidebarNavigate} />
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
                  <SidebarNav
                    activeSection={activeSection}
                    onNavigate={handleSidebarNavigate}
                    onItemClick={() => setSheetOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex-1 min-w-0">
              <ToolbarDefault
                onFileSelect={handleFileSelect}
                uploading={uploading}
                view={view}
                onViewChange={setView}
                onCreateFolder={() => setCreateFolderOpen(true)}
                breadcrumb={breadcrumb}
                onBreadcrumbNavigate={handleBreadcrumbNavigate}
              />
            </div>
          </div>

          <div className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 mx-1.5 min-h-96">
            <MainContentsDefault
              files={files}
              folders={folders}
              loading={loading}
              view={view}
              onFileSelect={handleFileSelect}
              onPreview={setPreviewFileId}
              onDelete={setDeleteTargetId}
              onMove={setMoveTargetFileId}
              onFolderOpen={handleFolderOpen}
            />
          </div>
        </div>
      </div>

      <UploadProgress items={uploadItems} onClose={handleCloseProgress} />

      <FilePreviewDialog fileId={previewFileId} onClose={() => setPreviewFileId(null)} />

      <CreateFolderDialog
        open={createFolderOpen}
        currentFolderId={currentFolderId}
        onClose={() => setCreateFolderOpen(false)}
        onCreated={() => refreshFiles()}
      />

      <MoveToFolderDialog
        open={moveTargetFileId !== null}
        fileId={moveTargetFileId}
        onClose={() => setMoveTargetFileId(null)}
        onMoved={() => refreshFiles()}
      />

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
