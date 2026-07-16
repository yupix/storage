import { useRouter } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { Folder, CloudUpload } from 'lucide-react'
import ToolbarDefault from '../../components/ToolbarDefault'
import SelectionToolbar from '../../components/SelectionToolbar'
import MainContentsDefault from '#/components/MainContents'
import UploadProgress from '../../components/UploadProgress'
import FilePreviewDialog from '../../components/FilePreviewDialog'
import CreateFolderDialog from '../../components/CreateFolderDialog'
import MoveToFolderDialog from '../../components/MoveToFolderDialog'
import RenameDialog from '../../components/RenameDialog'
import DeleteFolderDialog from '../../components/DeleteFolderDialog'
import ShareLinkDialog from '../../components/ShareLinkDialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog'
import { uploadFileWithProgress, createUploadItem, deleteFile, deleteFolder, toggleFavorite, toggleFolderFavorite, moveFile, moveFolder, renameFile, renameFolder, restoreFile, restoreFolder, emptyTrash, permanentDeleteFile, permanentDeleteFolder, downloadFile } from '../../lib/files'
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
  preserveOrder?: boolean
  sortLabelOverride?: string
}

const emptyFolders: FolderItem[] = []

// OS からのファイルドラッグかどうかを判定する（dnd-kit の内部ドラッグと区別する）
const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

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
  preserveOrder = false,
  sortLabelOverride,
}: WorkspacePageProps) {
  const router = useRouter()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )
  const [activeDragItem, setActiveDragItem] = useState<{ type: 'file' | 'folder'; name: string } | null>(null)
  const [files, setFiles] = useState(initialFiles)
  const [folders, setFolders] = useState(initialFolders)
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([])
  const [previewFileId, setPreviewFileId] = useState<string | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [moveTargetFileId, setMoveTargetFileId] = useState<string | null>(null)
  const [shareTarget, setShareTarget] = useState<FileItem | null>(null)

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

  // 複数選択
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set())
  const [batchMoveOpen, setBatchMoveOpen] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const selectionCount = selectedFileIds.size + selectedFolderIds.size
  const selectionActive = selectionCount > 0

  // 範囲選択(Shift+クリック)の起点。直前に選択操作した項目を覚えておく
  const selectionAnchorRef = useRef<{ type: 'file' | 'folder'; id: string } | null>(null)
  const clearSelection = useCallback(() => {
    setSelectedFileIds(new Set())
    setSelectedFolderIds(new Set())
    selectionAnchorRef.current = null
  }, [])

  useEffect(() => {
    setFiles(initialFiles)
    setFolders(initialFolders)
    // ナビゲーションやローダー再取得のたびに選択を解除する
    setSelectedFileIds(new Set())
    setSelectedFolderIds(new Set())
    selectionAnchorRef.current = null
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

    // お気に入りタブではアップロードしたファイルはお気に入りに含まれないため
    // router.invalidate() を呼ぶとローダーがフリーズしてナビゲーションがブロックされる
    if (!favoritesOnly) {
      refreshFiles()
    }

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
  }, [uploadItems, refreshFiles, favoritesOnly])

  const updateItem = useCallback(
    (id: string, patch: Partial<UploadItem>) => {
      setUploadItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      )
    },
    [],
  )

  const uploadFiles = useCallback((selected: File[]) => {
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
  }, [currentFolderId, updateItem])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    e.currentTarget.value = ''
    uploadFiles(selected)
  }

  // OS からのファイル D&D アップロード（内部のカードドラッグとは dataTransfer で区別する）
  const [fileDragOver, setFileDragOver] = useState(false)
  const fileDragDepth = useRef(0)
  // お気に入りビューはルート送りになるうえ即時反映されないため D&D を無効化する
  const fileDndActive = mode === 'normal' && !favoritesOnly
  const handleFileDragEnter = (e: React.DragEvent) => {
    if (!fileDndActive || !hasFiles(e)) return
    e.preventDefault()
    fileDragDepth.current += 1
    setFileDragOver(true)
  }
  const handleFileDragOver = (e: React.DragEvent) => {
    if (!fileDndActive || !hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const handleFileDragLeave = (e: React.DragEvent) => {
    if (!fileDndActive || !hasFiles(e)) return
    fileDragDepth.current -= 1
    if (fileDragDepth.current <= 0) {
      fileDragDepth.current = 0
      setFileDragOver(false)
    }
  }
  const handleFileDrop = (e: React.DragEvent) => {
    if (!fileDndActive || !hasFiles(e)) return
    e.preventDefault()
    fileDragDepth.current = 0
    setFileDragOver(false)
    uploadFiles(Array.from(e.dataTransfer.files))
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

  const handleBatchDelete = useCallback(async () => {
    setBatchDeleting(true)
    try {
      await Promise.all([
        ...[...selectedFolderIds].map((id) => deleteFolder(id)),
        ...[...selectedFileIds].map((id) => deleteFile(id)),
      ])
      clearSelection()
    } finally {
      // 一部だけ成功して失敗したケースでもサーバー状態に合わせて再取得する
      await refreshFiles()
      setBatchDeleting(false)
      setBatchDeleteOpen(false)
    }
  }, [selectedFileIds, selectedFolderIds, clearSelection, refreshFiles])

  const handleBatchFavorite = useCallback(async () => {
    const selFiles = files.filter((f) => selectedFileIds.has(f.id))
    const selFolders = folders.filter((f) => selectedFolderIds.has(f.id))
    // 選択内がすべてお気に入りなら解除、そうでなければお気に入りに追加する
    const allFavorite = [...selFiles, ...selFolders].every((item) => item.is_favorite)
    const next = !allFavorite
    setFavoriteError(null)
    try {
      await Promise.all([
        ...selFolders.map((folder) => toggleFolderFavorite(folder.id, next)),
        ...selFiles.map((file) => toggleFavorite(file.id, next)),
      ])
      clearSelection()
    } catch {
      setFavoriteError('お気に入りを更新できませんでした')
    } finally {
      // 一部だけ成功して失敗したケースでもサーバー状態に合わせて再取得する
      await refreshFiles()
    }
  }, [files, folders, selectedFileIds, selectedFolderIds, clearSelection, refreshFiles])

  const handleBatchDownload = useCallback(async () => {
    const selFiles = files.filter((f) => selectedFileIds.has(f.id))
    for (const file of selFiles) {
      try {
        await downloadFile(file.id, file.name)
      } catch {
        // 個別の失敗は無視して次へ
      }
    }
  }, [files, selectedFileIds])

  const sortedFolders = useMemo(() => {
    if (preserveOrder) return folders

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
  }, [folders, preserveOrder, sort])

  const sortedFiles = useMemo(() => {
    if (preserveOrder) return files

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
  }, [files, preserveOrder, sort])

  // 画面表示順（フォルダー → ファイル）に並べた選択可能項目。範囲選択で使う
  const orderedSelectable = useMemo(
    () => [
      ...sortedFolders.map((f) => ({ type: 'folder' as const, id: f.id })),
      ...sortedFiles.map((f) => ({ type: 'file' as const, id: f.id })),
    ],
    [sortedFolders, sortedFiles],
  )

  // Shift+クリック: アンカーからクリック項目までを範囲選択（表示順の連続範囲を追加）
  const selectRangeTo = useCallback(
    (type: 'file' | 'folder', id: string): boolean => {
      const anchor = selectionAnchorRef.current
      if (!anchor) return false
      const ai = orderedSelectable.findIndex((x) => x.type === anchor.type && x.id === anchor.id)
      const ti = orderedSelectable.findIndex((x) => x.type === type && x.id === id)
      if (ai < 0 || ti < 0) return false
      const [lo, hi] = ai <= ti ? [ai, ti] : [ti, ai]
      const range = orderedSelectable.slice(lo, hi + 1)
      const fileIds = range.filter((x) => x.type === 'file').map((x) => x.id)
      const folderIds = range.filter((x) => x.type === 'folder').map((x) => x.id)
      setSelectedFileIds((prev) => new Set([...prev, ...fileIds]))
      setSelectedFolderIds((prev) => new Set([...prev, ...folderIds]))
      return true
    },
    [orderedSelectable],
  )

  const toggleFileSelect = useCallback((id: string, shiftKey?: boolean) => {
    if (shiftKey && selectRangeTo('file', id)) {
      selectionAnchorRef.current = { type: 'file', id }
      return
    }
    const willSelect = !selectedFileIds.has(id)
    setSelectedFileIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    // 選択解除ではアンカーを動かさない（次の範囲選択で解除が巻き戻らないように）
    if (willSelect) selectionAnchorRef.current = { type: 'file', id }
  }, [selectRangeTo, selectedFileIds])

  const toggleFolderSelect = useCallback((id: string, shiftKey?: boolean) => {
    if (shiftKey && selectRangeTo('folder', id)) {
      selectionAnchorRef.current = { type: 'folder', id }
      return
    }
    const willSelect = !selectedFolderIds.has(id)
    setSelectedFolderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    // 選択解除ではアンカーを動かさない（次の範囲選択で解除が巻き戻らないように）
    if (willSelect) selectionAnchorRef.current = { type: 'folder', id }
  }, [selectRangeTo, selectedFolderIds])

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveDragItem({
      type: active.data.current?.type as 'file' | 'folder',
      name: active.data.current?.name as string,
    })
  }, [])

  const handleDragEnd = useCallback(async ({ active, over }: DragEndEvent) => {
    setActiveDragItem(null)
    if (!over || active.id === over.id) return
    if (over.data.current?.type !== 'folder') return

    const dragType = active.data.current?.type as 'file' | 'folder'
    const dragId = active.data.current?.id as string
    const targetId = over.data.current?.id as string | null
    if (dragId === targetId) return

    try {
      if (dragType === 'file') {
        await moveFile(dragId, targetId)
      } else {
        await moveFolder(dragId, targetId)
      }
      await refreshFiles()
    } catch {
      // エラー時は何もしない
    }
  }, [refreshFiles])

  const uploading = uploadItems.some((i) => i.status === 'uploading')

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragItem(null)}
    >
      {mode === 'normal' && selectionActive ? (
        <SelectionToolbar
          count={selectionCount}
          fileCount={selectedFileIds.size}
          onClear={clearSelection}
          onFavorite={handleBatchFavorite}
          onMove={() => setBatchMoveOpen(true)}
          onDownload={handleBatchDownload}
          onDelete={() => setBatchDeleteOpen(true)}
        />
      ) : (
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
          sortLabelOverride={sortLabelOverride}
        />
      )}

      {favoriteError && (
        <div
          role="alert"
          className="mx-1.5 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {favoriteError}
        </div>
      )}

      <section
        aria-label="ファイルをドロップしてアップロード"
        className="relative bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 mx-1.5 min-h-96"
        onDragEnter={handleFileDragEnter}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        onDrop={handleFileDrop}
      >
            {fileDragOver && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]">
                <div className="flex flex-col items-center gap-2 text-primary">
                  <CloudUpload className="size-10" />
                  <p className="text-sm font-medium">ここにドロップしてアップロード</p>
                </div>
              </div>
            )}
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
              onShare={mode === 'trash' ? undefined : setShareTarget}
              onRestore={mode === 'trash' ? handleRestore : undefined}
              onPurge={mode === 'trash' ? setPurgeTargetId : undefined}
              onFolderRestore={mode === 'trash' ? handleRestoreFolder : undefined}
              onFolderPurge={mode === 'trash' ? setPurgeFolderTargetId : undefined}
              onFolderOpen={mode === 'trash' ? undefined : (folder) => router.navigate({ to: '/drive/$folderId', params: { folderId: folder.id } })}
              onFolderDelete={mode === 'trash' ? undefined : setDeleteFolderTargetId}
              onFolderMove={mode === 'trash' ? undefined : setMoveFolderTargetId}
              onFolderRename={mode === 'trash' ? undefined : (id, name) => setRenameTarget({ id, name, kind: 'folder' })}
              onFolderToggleFavorite={mode === 'trash' ? undefined : handleToggleFolderFavorite}
              onCreateFolder={mode === 'trash' ? undefined : () => setCreateFolderOpen(true)}
              selectionActive={mode === 'trash' ? undefined : selectionActive}
              selectedFileIds={mode === 'trash' ? undefined : selectedFileIds}
              selectedFolderIds={mode === 'trash' ? undefined : selectedFolderIds}
              onToggleFileSelect={mode === 'trash' ? undefined : toggleFileSelect}
              onToggleFolderSelect={mode === 'trash' ? undefined : toggleFolderSelect}
            />
      </section>

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeDragItem ? (
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm font-medium opacity-90 cursor-grabbing select-none">
            {activeDragItem.type === 'folder' && <Folder className="size-4 text-muted-foreground shrink-0" />}
            <span className="truncate max-w-48">{activeDragItem.name}</span>
          </div>
        ) : null}
      </DragOverlay>

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

      <MoveToFolderDialog
        open={batchMoveOpen}
        fileIds={[...selectedFileIds]}
        folderIds={[...selectedFolderIds]}
        onClose={() => setBatchMoveOpen(false)}
        onMoved={() => { clearSelection(); refreshFiles() }}
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
        isEmpty={deleteFolderTargetId ? folders.find((f) => f.id === deleteFolderTargetId)?.total_size === 0 : false}
        onClose={() => setDeleteFolderTargetId(null)}
        onDeleted={() => refreshFiles()}
      />

      <ShareLinkDialog file={shareTarget} onClose={() => setShareTarget(null)} />

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

      <AlertDialog open={batchDeleteOpen} onOpenChange={(open) => { if (!open) setBatchDeleteOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selectionCount} 件を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              選択したファイル・フォルダーをゴミ箱に移動します。ゴミ箱から復元できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchDelete} disabled={batchDeleting}>
              {batchDeleting ? '削除中...' : '削除'}
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
    </DndContext>
  )
}
