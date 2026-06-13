import { useRouter } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import ToolbarDefault from '../../components/ToolbarDefault'
import MainContentsDefault from '#/components/MainContents'
import UploadProgress from '../../components/UploadProgress'
import FilePreviewDialog from '../../components/FilePreviewDialog'
import CreateFolderDialog from '../../components/CreateFolderDialog'
import MoveToFolderDialog from '../../components/MoveToFolderDialog'
import RenameDialog from '../../components/RenameDialog'
import DeleteFolderDialog from '../../components/DeleteFolderDialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { uploadFileWithProgress, createUploadItem, deleteFile, toggleFavorite, toggleFolderFavorite, renameFile, renameFolder, restoreFile, restoreFolder, emptyTrash, permanentDeleteFile, permanentDeleteFolder } from '../../lib/files'
import type { FileItem, FolderItem, UploadItem } from '../../lib/files'
import type { WorkspaceSort } from './route-utils'

interface BreadcrumbItem {
  id: string | null
  name: string
}

interface WorkspacePageProps {
  initialFiles: FileItem[]
  initialFolders?: FolderItem[]
  currentFolderId?: string | null
  breadcrumb?: BreadcrumbItem[]
  mode?: 'normal' | 'trash'
  favoritesOnly?: boolean
  view: 'grid' | 'list'
  onViewChange: (view: 'grid' | 'list') => void
  sort?: WorkspaceSort
  onSortChange?: (sort: WorkspaceSort) => void
}

const emptyFolders: FolderItem[] = []

export default function WorkspacePage({
  initialFiles,
  initialFolders = emptyFolders,
  currentFolderId = null,
  breadcrumb = [],
  mode = 'normal',
  favoritesOnly = false,
  view,
  onViewChange,
  sort = 'name-asc',
  onSortChange,
}: WorkspacePageProps) {
  const router = useRouter()
  const [files, setFiles] = useState(initialFiles)
  const [folders, setFolders] = useState(initialFolders)
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [moveTargetFileId, setMoveTargetFileId] = useState<string | null>(null)

  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; kind: 'file' | 'folder' } | null>(null)
  const [deleteFolderTargetId, setDeleteFolderTargetId] = useState<string | null>(null)
  const [moveFolderTargetId, setMoveFolderTargetId] = useState<string | null>(null)
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)
  const [emptyingTrash, setEmptyingTrash] = useState(false)
  const [purgeTargetId, setPurgeTargetId] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)
  const [purgeFolderTargetId, setPurgeFolderTargetId] = useState<string | null>(null)
  const [purgingFolder, setPurgingFolder] = useState(false)
  const [favoriteError, setFavoriteError] = useState<string | null>(null)

  useEffect(() => {
    setFiles(initialFiles)
    setFolders(initialFolders)
  }, [initialFiles, initialFolders])

  useEffect(() => {
    if (!favoriteError) return

    const timer = window.setTimeout(() => setFavoriteError(null), 5000)
    return () => window.clearTimeout(timer)
  }, [favoriteError])

  const refreshFiles = useCallback(async () => {
    await router.invalidate()
  }, [router])

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

  const handleRestore = useCallback(async (id: string) => {
    try {
      await restoreFile(id)
      await refreshFiles()
    } catch {
      // エラー時は何もしない
    }
  }, [refreshFiles])

  const handleRestoreFolder = useCallback(async (id: string) => {
    try {
      await restoreFolder(id)
      await refreshFiles()
    } catch {
      // エラー時は何もしない
    }
  }, [refreshFiles])

  const handleConfirmPurgeFolder = useCallback(async () => {
    if (!purgeFolderTargetId) return
    setPurgingFolder(true)
    try {
      await permanentDeleteFolder(purgeFolderTargetId)
      await refreshFiles()
    } catch {
      // エラー時は何もしない
    } finally {
      setPurgingFolder(false)
      setPurgeFolderTargetId(null)
    }
  }, [purgeFolderTargetId, refreshFiles])

  const handleConfirmPurge = useCallback(async () => {
    if (!purgeTargetId) return
    setPurging(true)
    try {
      await permanentDeleteFile(purgeTargetId)
      await refreshFiles()
    } catch {
      // エラー時は何もしない
    } finally {
      setPurging(false)
      setPurgeTargetId(null)
    }
  }, [purgeTargetId, refreshFiles])

  const handleConfirmEmptyTrash = useCallback(async () => {
    setEmptyingTrash(true)
    try {
      await emptyTrash()
      await refreshFiles()
    } catch {
      // エラー時は何もしない
    } finally {
      setEmptyingTrash(false)
      setEmptyTrashOpen(false)
    }
  }, [refreshFiles])

  const handleToggleFavorite = useCallback(async (id: string, current: boolean) => {
    const next = !current
    setFavoriteError(null)
    setFiles((prev) => prev.map((f) => f.id === id ? { ...f, is_favorite: next } : f))
    try {
      await toggleFavorite(id, next)
      if (favoritesOnly && !next) {
        setFiles((prev) => prev.filter((f) => f.id !== id))
      }
    } catch {
      setFiles((prev) => prev.map((f) => f.id === id ? { ...f, is_favorite: current } : f))
      setFavoriteError('ファイルのお気に入りを更新できませんでした')
    }
  }, [favoritesOnly])

  const handleToggleFolderFavorite = useCallback(async (id: string, current: boolean) => {
    const next = !current
    setFavoriteError(null)
    setFolders((prev) => prev.map((folder) =>
      folder.id === id ? { ...folder, is_favorite: next } : folder,
    ))
    try {
      await toggleFolderFavorite(id, next)
      if (favoritesOnly && !next) {
        setFolders((prev) => prev.filter((folder) => folder.id !== id))
      }
    } catch {
      setFolders((prev) => prev.map((folder) =>
        folder.id === id ? { ...folder, is_favorite: current } : folder,
      ))
      setFavoriteError('フォルダーのお気に入りを更新できませんでした')
    }
  }, [favoritesOnly])

  const sortedFolders = useMemo(() => {
    const lastDash = sort.lastIndexOf('-')
    const key = sort.slice(0, lastDash)
    const order = sort.slice(lastDash + 1)
    return [...folders].sort((a, b) => {
      let cmp = 0
      if (key === 'name') cmp = a.name.localeCompare(b.name, 'ja')
      else if (key === 'updated_at') cmp = (a.updated_at ?? '').localeCompare(b.updated_at ?? '')
      else if (key === 'size') cmp = (a.total_size ?? 0) - (b.total_size ?? 0)
      return order === 'desc' ? -cmp : cmp
    })
  }, [folders, sort])

  const sortedFiles = useMemo(() => {
    const lastDash = sort.lastIndexOf('-')
    const key = sort.slice(0, lastDash)
    const order = sort.slice(lastDash + 1)
    return [...files].sort((a, b) => {
      let cmp = 0
      if (key === 'name') cmp = a.name.localeCompare(b.name, 'ja')
      else if (key === 'updated_at') cmp = (a.updated_at ?? '').localeCompare(b.updated_at ?? '')
      else if (key === 'size') cmp = a.size - b.size
      return order === 'desc' ? -cmp : cmp
    })
  }, [files, sort])

  const uploading = uploadItems.some((i) => i.status === 'uploading')

  return (
    <>
      <ToolbarDefault
        onFileSelect={handleFileSelect}
        uploading={uploading}
        view={view}
        onViewChange={onViewChange}
        onCreateFolder={() => setCreateFolderOpen(true)}
        breadcrumb={breadcrumb}
        onBreadcrumbNavigate={(id) => {
          if (id) {
            router.navigate({ to: '/drive/$folderId', params: { folderId: id } })
          } else {
            router.navigate({ to: '/drive' })
          }
        }}
        mode={mode}
        onEmptyTrash={() => setEmptyTrashOpen(true)}
        sort={sort}
        onSortChange={onSortChange}
      />

      {favoriteError && (
        <div
          role="alert"
          className="mx-1.5 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {favoriteError}
        </div>
      )}

      <div className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 mx-1.5 min-h-96">
            <MainContentsDefault
              files={sortedFiles}
              folders={sortedFolders}
              view={view}
              mode={mode}
              onFileSelect={mode === 'trash' ? undefined : handleFileSelect}
              onPreview={mode === 'trash' ? undefined : setPreviewFileId}
              onDelete={mode === 'trash' ? undefined : setDeleteTargetId}
              onMove={mode === 'trash' ? undefined : setMoveTargetFileId}
              onRename={mode === 'trash' ? undefined : (id, name) => setRenameTarget({ id, name, kind: 'file' })}
              onToggleFavorite={mode === 'trash' ? undefined : handleToggleFavorite}
              onRestore={mode === 'trash' ? handleRestore : undefined}
              onPurge={mode === 'trash' ? setPurgeTargetId : undefined}
              onFolderRestore={mode === 'trash' ? handleRestoreFolder : undefined}
              onFolderPurge={mode === 'trash' ? setPurgeFolderTargetId : undefined}
              onFolderOpen={mode === 'trash' ? undefined : (folder) => router.navigate({ to: '/drive/$folderId', params: { folderId: folder.id } })}
              onFolderDelete={mode === 'trash' ? undefined : setDeleteFolderTargetId}
              onFolderMove={mode === 'trash' ? undefined : setMoveFolderTargetId}
              onFolderRename={mode === 'trash' ? undefined : (id, name) => setRenameTarget({ id, name, kind: 'folder' })}
              onFolderToggleFavorite={mode === 'trash' ? undefined : handleToggleFolderFavorite}
            />
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

      <MoveToFolderDialog
        open={moveFolderTargetId !== null}
        folderId={moveFolderTargetId}
        onClose={() => setMoveFolderTargetId(null)}
        onMoved={() => refreshFiles()}
      />

      <RenameDialog
        open={renameTarget !== null}
        currentName={renameTarget?.name ?? ''}
        onClose={() => setRenameTarget(null)}
        onSubmit={async (name) => {
          if (!renameTarget) return
          if (renameTarget.kind === 'file') {
            await renameFile(renameTarget.id, name)
          } else {
            await renameFolder(renameTarget.id, name)
          }
          refreshFiles()
        }}
      />

      <DeleteFolderDialog
        folderId={deleteFolderTargetId}
        onClose={() => setDeleteFolderTargetId(null)}
        onDeleted={() => refreshFiles()}
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

      <AlertDialog open={purgeFolderTargetId !== null} onOpenChange={(open) => { if (!open) setPurgeFolderTargetId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>フォルダーを完全削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このフォルダーとその中のすべてのファイルを完全に削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgingFolder}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPurgeFolder} disabled={purgingFolder}>
              {purgingFolder ? '削除中...' : '完全削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purgeTargetId !== null} onOpenChange={(open) => { if (!open) setPurgeTargetId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ファイルを完全削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このファイルを完全に削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purging}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPurge} disabled={purging}>
              {purging ? '削除中...' : '完全削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={emptyTrashOpen} onOpenChange={(open) => { if (!open) setEmptyTrashOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ゴミ箱を空にしますか？</AlertDialogTitle>
            <AlertDialogDescription>
              ゴミ箱内のすべてのファイルを完全に削除します。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={emptyingTrash}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEmptyTrash} disabled={emptyingTrash}>
              {emptyingTrash ? '削除中...' : 'すべて削除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
