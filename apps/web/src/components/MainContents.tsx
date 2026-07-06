import type React from 'react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import {
  EllipsisVertical, Download, SquarePen, Trash2, Share2,
  Star, MoveRight, Lock, Info, CloudUpload, Folder, RotateCcw,
} from 'lucide-react'
import { FileIcon, defaultStyles } from 'react-file-icon'
import type { FileIconProps } from 'react-file-icon'
import { Card, CardContent } from './ui/card'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from './ui/context-menu'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Button } from './ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from './ui/empty'
import type { FileItem, FolderItem } from '../lib/files'
import { formatFileSize, downloadFile } from '../lib/files'
import MatchReasonBadge from './MatchReasonBadge'

// ドラッグが有効かどうかを子コンポーネントへ伝播するコンテキスト
const DragEnabledContext = createContext(false)

const skeletonItemIds = [
  'skeleton-1',
  'skeleton-2',
  'skeleton-3',
  'skeleton-4',
  'skeleton-5',
  'skeleton-6',
  'skeleton-7',
  'skeleton-8',
]

function FileTypeIcon({ name, size = 40 }: { name: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const style = (defaultStyles as Record<string, FileIconProps>)[ext] ?? {}
  return (
    <div style={{ width: size, height: size }}>
      <FileIcon extension={ext} {...style} />
    </div>
  )
}

function ImageThumbnail({ fileId, name }: { fileId: string; name: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const showIcon = !visible || !loaded || error

  return (
    <div ref={ref} className="h-full w-full">
      {visible && !error && (
        <img
          src={`/v1/files/${fileId}/view`}
          alt={name}
          className={`h-full w-full object-cover rounded-t-xl transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
      {showIcon && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FileTypeIcon name={name} size={48} />
        </div>
      )}
    </div>
  )
}

interface FileItemActionsProps {
  file: FileItem
  onPreview: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string) => void
  onRename: (id: string, currentName: string) => void
  onToggleFavorite: (id: string, current: boolean) => void
  showMatchReason?: boolean
}

function FileDropdownMenuContent({
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite,
}: FileItemActionsProps) {
  return (
    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => onPreview(file.id)}>
        <Info className="mr-2 size-4" />
        プレビュー
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => downloadFile(file.id, file.name)}>
        <Download className="mr-2 size-4" />
        ダウンロード
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onRename(file.id, file.name)}>
        <SquarePen className="mr-2 size-4" />
        名前変更
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Share2 className="mr-2 size-4" />
        共有
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onMove(file.id)}>
        <MoveRight className="mr-2 size-4" />
        移動
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onToggleFavorite(file.id, file.is_favorite)}>
        <Star className={`mr-2 size-4 ${file.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
        {file.is_favorite ? 'お気に入り解除' : 'お気に入り'}
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Lock className="mr-2 size-4" />
        ロック
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => onDelete(file.id)}>
        <Trash2 className="mr-2 size-4" />
        削除
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

function FileContextMenuContent({
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite,
}: FileItemActionsProps) {
  return (
    <ContextMenuContent onClick={(e) => e.stopPropagation()}>
      <ContextMenuItem onSelect={() => onPreview(file.id)}>
        <Info className="mr-2 size-4" />
        プレビュー
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => downloadFile(file.id, file.name)}>
        <Download className="mr-2 size-4" />
        ダウンロード
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onRename(file.id, file.name)}>
        <SquarePen className="mr-2 size-4" />
        名前変更
      </ContextMenuItem>
      <ContextMenuItem>
        <Share2 className="mr-2 size-4" />
        共有
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onMove(file.id)}>
        <MoveRight className="mr-2 size-4" />
        移動
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onToggleFavorite(file.id, file.is_favorite)}>
        <Star className={`mr-2 size-4 ${file.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
        {file.is_favorite ? 'お気に入り解除' : 'お気に入り'}
      </ContextMenuItem>
      <ContextMenuItem>
        <Lock className="mr-2 size-4" />
        ロック
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onDelete(file.id)}>
        <Trash2 className="mr-2 size-4" />
        削除
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function FileCard({
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite, showMatchReason,
}: FileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''
  const isImage = file.file_type.startsWith('image/')
  const dragEnabled = useContext(DragEnabledContext)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: 'file' as const, id: file.id, name: file.name },
    disabled: !dragEnabled,
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? 'opacity-40' : ''}>
        <Card
          size="sm"
          className="cursor-pointer hover:ring-primary/40 transition-shadow"
          onClick={() => onPreview(file.id)}
        >
          <div className="relative flex items-center justify-center h-24 bg-muted/50 rounded-t-xl overflow-hidden">
            {isImage
              ? <ImageThumbnail fileId={file.id} name={file.name} />
              : <FileTypeIcon name={file.name} size={48} />
            }
            {file.is_favorite && (
              <div className="absolute top-1 right-1">
                <Star className="size-3.5 fill-yellow-400 text-yellow-400 drop-shadow" />
              </div>
            )}
          </div>
          <CardContent className="pt-2 pb-3">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium truncate flex-1" title={file.name}>{file.name}</p>
              {showMatchReason && <MatchReasonBadge reason={file.match_reason} />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EllipsisVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <FileDropdownMenuContent
                  file={file}
                  onPreview={onPreview}
                  onDelete={onDelete}
                  onMove={onMove}
                  onRename={onRename}
                  onToggleFavorite={onToggleFavorite}
                />
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFileSize(file.size)}{date ? ` · ${date}` : ''}
            </p>
          </CardContent>
        </Card>
        </div>
      </ContextMenuTrigger>
      <FileContextMenuContent
        file={file}
        onPreview={onPreview}
        onDelete={onDelete}
        onMove={onMove}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
      />
    </ContextMenu>
  )
}

function FileRow({
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite, showMatchReason,
}: FileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''
  const dragEnabled = useContext(DragEnabledContext)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: 'file' as const, id: file.id, name: file.name },
    disabled: !dragEnabled,
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        {/* biome-ignore lint/a11y/useSemanticElements: The row contains a nested menu button. */}
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-0 ${isDragging ? 'opacity-40' : ''}`}
          onClick={() => onPreview(file.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onPreview(file.id)
            }
          }}
        >
          <FileTypeIcon name={file.name} size={20} />
          <p className="flex-1 text-sm truncate min-w-0" title={file.name}>{file.name}</p>
          {showMatchReason && <MatchReasonBadge reason={file.match_reason} />}
          {file.is_favorite && <Star className="size-3.5 fill-yellow-400 text-yellow-400 shrink-0" />}
          <p className="text-xs text-muted-foreground w-20 text-right shrink-0">{formatFileSize(file.size)}</p>
          <p className="text-xs text-muted-foreground w-24 text-right shrink-0 hidden sm:block">{date}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <FileDropdownMenuContent
              file={file}
              onPreview={onPreview}
              onDelete={onDelete}
              onMove={onMove}
              onRename={onRename}
              onToggleFavorite={onToggleFavorite}
            />
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <FileContextMenuContent
        file={file}
        onPreview={onPreview}
        onDelete={onDelete}
        onMove={onMove}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
      />
    </ContextMenu>
  )
}

interface TrashFileItemActionsProps {
  file: FileItem
  onRestore: (id: string) => void
  onPurge: (id: string) => void
}

function TrashFileDropdownMenuContent({ file, onRestore, onPurge }: TrashFileItemActionsProps) {
  return (
    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => onRestore(file.id)}>
        <RotateCcw className="mr-2 size-4" />
        復元
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => downloadFile(file.id, file.name)}>
        <Download className="mr-2 size-4" />
        ダウンロード
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => onPurge(file.id)}>
        <Trash2 className="mr-2 size-4" />
        完全削除
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

function TrashFileContextMenuContent({ file, onRestore, onPurge }: TrashFileItemActionsProps) {
  return (
    <ContextMenuContent onClick={(e) => e.stopPropagation()}>
      <ContextMenuItem onSelect={() => onRestore(file.id)}>
        <RotateCcw className="mr-2 size-4" />
        復元
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => downloadFile(file.id, file.name)}>
        <Download className="mr-2 size-4" />
        ダウンロード
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onPurge(file.id)}>
        <Trash2 className="mr-2 size-4" />
        完全削除
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function TrashFileCard({ file, onRestore, onPurge }: TrashFileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''
  const isImage = file.file_type.startsWith('image/')
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Card size="sm" className="opacity-75">
          <div className="relative flex items-center justify-center h-24 bg-muted/50 rounded-t-xl overflow-hidden">
            {isImage
              ? <ImageThumbnail fileId={file.id} name={file.name} />
              : <FileTypeIcon name={file.name} size={48} />
            }
          </div>
          <CardContent className="pt-2 pb-3">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium truncate flex-1" title={file.name}>{file.name}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <EllipsisVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <TrashFileDropdownMenuContent file={file} onRestore={onRestore} onPurge={onPurge} />
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFileSize(file.size)}{date ? ` · ${date}` : ''}
            </p>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <TrashFileContextMenuContent file={file} onRestore={onRestore} onPurge={onPurge} />
    </ContextMenu>
  )
}

function TrashFileRow({ file, onRestore, onPurge }: TrashFileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-default transition-colors border-b border-border/50 last:border-0 opacity-75">
          <FileTypeIcon name={file.name} size={20} />
          <p className="flex-1 text-sm truncate min-w-0" title={file.name}>{file.name}</p>
          <p className="text-xs text-muted-foreground w-20 text-right shrink-0">{formatFileSize(file.size)}</p>
          <p className="text-xs text-muted-foreground w-24 text-right shrink-0 hidden sm:block">{date}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <TrashFileDropdownMenuContent file={file} onRestore={onRestore} onPurge={onPurge} />
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <TrashFileContextMenuContent file={file} onRestore={onRestore} onPurge={onPurge} />
    </ContextMenu>
  )
}

interface TrashFolderItemActionsProps {
  folder: FolderItem
  onRestore: (id: string) => void
  onPurge: (id: string) => void
}

function TrashFolderDropdownMenuContent({ folder, onRestore, onPurge }: TrashFolderItemActionsProps) {
  return (
    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => onRestore(folder.id)}>
        <RotateCcw className="mr-2 size-4" />
        復元
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => onPurge(folder.id)}>
        <Trash2 className="mr-2 size-4" />
        完全削除
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

function TrashFolderContextMenuContent({ folder, onRestore, onPurge }: TrashFolderItemActionsProps) {
  return (
    <ContextMenuContent onClick={(e) => e.stopPropagation()}>
      <ContextMenuItem onSelect={() => onRestore(folder.id)}>
        <RotateCcw className="mr-2 size-4" />
        復元
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onPurge(folder.id)}>
        <Trash2 className="mr-2 size-4" />
        完全削除
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function TrashFolderCard({ folder, onRestore, onPurge }: TrashFolderItemActionsProps) {
  const date = folder.updated_at ? new Date(folder.updated_at).toLocaleDateString('ja-JP') : ''
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Card size="sm" className="opacity-75">
          <div className="flex items-center justify-center h-24 bg-muted/50 rounded-t-xl">
            <Folder className="size-12 text-muted-foreground" />
          </div>
          <CardContent className="pt-2 pb-3">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium truncate flex-1" title={folder.name}>{folder.name}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <EllipsisVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <TrashFolderDropdownMenuContent folder={folder} onRestore={onRestore} onPurge={onPurge} />
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFileSize(folder.total_size ?? 0)}{date ? ` · ${date}` : ''}
            </p>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <TrashFolderContextMenuContent folder={folder} onRestore={onRestore} onPurge={onPurge} />
    </ContextMenu>
  )
}

function TrashFolderRow({ folder, onRestore, onPurge }: TrashFolderItemActionsProps) {
  const date = folder.updated_at ? new Date(folder.updated_at).toLocaleDateString('ja-JP') : ''
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-default transition-colors border-b border-border/50 last:border-0 opacity-75">
          <Folder className="size-5 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-sm truncate min-w-0 font-medium" title={folder.name}>{folder.name}</p>
          <p className="text-xs text-muted-foreground w-20 text-right shrink-0">{formatFileSize(folder.total_size ?? 0)}</p>
          <p className="text-xs text-muted-foreground w-24 text-right shrink-0 hidden sm:block">{date}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <TrashFolderDropdownMenuContent folder={folder} onRestore={onRestore} onPurge={onPurge} />
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <TrashFolderContextMenuContent folder={folder} onRestore={onRestore} onPurge={onPurge} />
    </ContextMenu>
  )
}

interface FolderItemActionsProps {
  folder: FolderItem
  onOpen: (folder: FolderItem) => void
  onDelete: (id: string) => void
  onMove: (id: string) => void
  onRename: (id: string, currentName: string) => void
  onToggleFavorite: (id: string, current: boolean) => void
}

function FolderDropdownMenuContent({
  folder, onOpen, onDelete, onMove, onRename, onToggleFavorite,
}: FolderItemActionsProps) {
  return (
    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuItem onSelect={() => onOpen(folder)}>
        <Folder className="mr-2 size-4" />
        開く
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onRename(folder.id, folder.name)}>
        <SquarePen className="mr-2 size-4" />
        名前変更
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onMove(folder.id)}>
        <MoveRight className="mr-2 size-4" />
        移動
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onToggleFavorite(folder.id, folder.is_favorite)}>
        <Star className={`mr-2 size-4 ${folder.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
        {folder.is_favorite ? 'お気に入り解除' : 'お気に入り'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => onDelete(folder.id)}>
        <Trash2 className="mr-2 size-4" />
        削除
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

function FolderContextMenuContent({
  folder, onOpen, onDelete, onMove, onRename, onToggleFavorite,
}: FolderItemActionsProps) {
  return (
    <ContextMenuContent onClick={(e) => e.stopPropagation()}>
      <ContextMenuItem onSelect={() => onOpen(folder)}>
        <Folder className="mr-2 size-4" />
        開く
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onRename(folder.id, folder.name)}>
        <SquarePen className="mr-2 size-4" />
        名前変更
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onMove(folder.id)}>
        <MoveRight className="mr-2 size-4" />
        移動
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onToggleFavorite(folder.id, folder.is_favorite)}>
        <Star className={`mr-2 size-4 ${folder.is_favorite ? 'fill-yellow-400 text-yellow-400' : ''}`} />
        {folder.is_favorite ? 'お気に入り解除' : 'お気に入り'}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => onDelete(folder.id)}>
        <Trash2 className="mr-2 size-4" />
        削除
      </ContextMenuItem>
    </ContextMenuContent>
  )
}

function FolderCard({ folder, onOpen, onDelete, onMove, onRename, onToggleFavorite }: FolderItemActionsProps) {
  const date = folder.updated_at ? new Date(folder.updated_at).toLocaleDateString('ja-JP') : ''
  const dragEnabled = useContext(DragEnabledContext)

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-${folder.id}`,
    data: { type: 'folder' as const, id: folder.id, name: folder.name },
    disabled: !dragEnabled,
  })
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder' as const, id: folder.id },
    disabled: !dragEnabled,
  })
  const setRef = (el: HTMLElement | null) => { setDragRef(el); setDropRef(el) }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          ref={setRef}
          {...attributes}
          {...listeners}
          className={isDragging ? 'opacity-40' : ''}
        >
          <Card
            size="sm"
            className={`cursor-pointer hover:ring-primary/40 transition-shadow ${isOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
            onClick={() => onOpen(folder)}
          >
            <div className="relative flex items-center justify-center h-24 bg-muted/50 rounded-t-xl">
              <Folder className="size-12 text-muted-foreground" />
              {folder.is_favorite && (
                <Star className="absolute top-1 right-1 size-3.5 fill-yellow-400 text-yellow-400 drop-shadow" />
              )}
            </div>
            <CardContent className="pt-2 pb-3">
              <div className="flex items-center justify-between gap-1">
                <p className="text-sm font-medium truncate flex-1" title={folder.name}>{folder.name}</p>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <EllipsisVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <FolderDropdownMenuContent
                    folder={folder}
                    onOpen={onOpen}
                    onDelete={onDelete}
                    onMove={onMove}
                    onRename={onRename}
                    onToggleFavorite={onToggleFavorite}
                  />
                </DropdownMenu>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatFileSize(folder.total_size ?? 0)}{date ? ` · ${date}` : ''}
              </p>
            </CardContent>
          </Card>
        </div>
      </ContextMenuTrigger>
      <FolderContextMenuContent
        folder={folder}
        onOpen={onOpen}
        onDelete={onDelete}
        onMove={onMove}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
      />
    </ContextMenu>
  )
}

function FolderRow({ folder, onOpen, onDelete, onMove, onRename, onToggleFavorite }: FolderItemActionsProps) {
  const date = folder.updated_at ? new Date(folder.updated_at).toLocaleDateString('ja-JP') : ''
  const dragEnabled = useContext(DragEnabledContext)

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `folder-${folder.id}`,
    data: { type: 'folder' as const, id: folder.id, name: folder.name },
    disabled: !dragEnabled,
  })
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `folder-${folder.id}`,
    data: { type: 'folder' as const, id: folder.id },
    disabled: !dragEnabled,
  })
  const setRef = (el: HTMLElement | null) => { setDragRef(el); setDropRef(el) }

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        {/* biome-ignore lint/a11y/useSemanticElements: The row contains a nested menu button. */}
        <div
          ref={setRef}
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-0 ${isOver ? 'bg-primary/5 ring-1 ring-inset ring-primary' : ''} ${isDragging ? 'opacity-40' : ''}`}
          onClick={() => onOpen(folder)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(folder)
            }
          }}
        >
          <Folder className="size-5 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-sm truncate min-w-0 font-medium" title={folder.name}>{folder.name}</p>
          {folder.is_favorite && <Star className="size-3.5 fill-yellow-400 text-yellow-400 shrink-0" />}
          <p className="text-xs text-muted-foreground w-20 text-right shrink-0">{formatFileSize(folder.total_size ?? 0)}</p>
          <p className="text-xs text-muted-foreground w-24 text-right shrink-0 hidden sm:block">{date}</p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <FolderDropdownMenuContent
              folder={folder}
              onOpen={onOpen}
              onDelete={onDelete}
              onMove={onMove}
              onRename={onRename}
              onToggleFavorite={onToggleFavorite}
            />
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <FolderContextMenuContent
        folder={folder}
        onOpen={onOpen}
        onDelete={onDelete}
        onMove={onMove}
        onRename={onRename}
        onToggleFavorite={onToggleFavorite}
      />
    </ContextMenu>
  )
}

interface MainContentsProps {
  files: FileItem[]
  folders?: FolderItem[]
  loading?: boolean
  view?: 'grid' | 'list'
  mode?: 'normal' | 'trash'
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPreview?: (id: string) => void
  onDelete?: (id: string) => void
  onMove?: (id: string) => void
  onRename?: (id: string, currentName: string) => void
  onToggleFavorite?: (id: string, current: boolean) => void
  onRestore?: (id: string) => void
  onPurge?: (id: string) => void
  onFolderRestore?: (id: string) => void
  onFolderPurge?: (id: string) => void
  onFolderOpen?: (folder: FolderItem) => void
  onFolderDelete?: (id: string) => void
  onFolderMove?: (id: string) => void
  onFolderRename?: (id: string, currentName: string) => void
  onFolderToggleFavorite?: (id: string, current: boolean) => void
  showMatchReason?: boolean
}

export default function MainContentsDefault({
  files,
  folders = [],
  loading,
  view = 'grid',
  mode = 'normal',
  onFileSelect,
  onPreview,
  onDelete,
  onMove,
  onRename,
  onToggleFavorite,
  onRestore,
  onPurge,
  onFolderRestore,
  onFolderPurge,
  onFolderOpen,
  onFolderDelete,
  onFolderMove,
  onFolderRename,
  onFolderToggleFavorite,
  showMatchReason = false,
}: MainContentsProps) {
  const noop = () => {}
  const handlePreview = onPreview ?? noop
  const handleDelete = onDelete ?? noop
  const handleMove = onMove ?? noop
  const handleRename = onRename ?? noop
  const handleToggleFavorite = onToggleFavorite ?? noop
  const handleRestore = onRestore ?? noop
  const handlePurge = onPurge ?? noop
  const handleFolderRestore = onFolderRestore ?? noop
  const handleFolderPurge = onFolderPurge ?? noop
  const handleFolderOpen = onFolderOpen ?? noop
  const handleFolderDelete = onFolderDelete ?? noop
  const handleFolderMove = onFolderMove ?? noop
  const handleFolderRename = onFolderRename ?? noop
  const handleFolderToggleFavorite = onFolderToggleFavorite ?? noop

  if (loading) {
    if (view === 'list') {
      return (
        <div className="flex flex-col gap-1 p-3">
          {skeletonItemIds.map((id) => (
            <div key={id} className="rounded-lg bg-muted/50 animate-pulse h-9" />
          ))}
        </div>
      )
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
        {skeletonItemIds.map((id) => (
          <div key={id} className="rounded-xl bg-muted/50 animate-pulse h-36" />
        ))}
      </div>
    )
  }

  if (files.length === 0 && folders.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-64 p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              {mode === 'trash'
                ? <Trash2 className="size-10 text-muted-foreground" />
                : <CloudUpload className="size-10 text-muted-foreground" />
              }
            </EmptyMedia>
            <EmptyTitle>{mode === 'trash' ? 'ゴミ箱は空です' : 'ファイルがありません'}</EmptyTitle>
            <EmptyDescription>
              {mode === 'trash'
                ? '削除したファイルはここに表示されます'
                : 'ファイルをアップロードして始めましょう'
              }
            </EmptyDescription>
          </EmptyHeader>
          {mode === 'normal' && onFileSelect && (
            <EmptyContent>
              <Button asChild>
                <label className="cursor-pointer">
                  <CloudUpload className="mr-2 size-4" />
                  ファイルをアップロード
                  <input type="file" multiple className="sr-only" onChange={onFileSelect} />
                </label>
              </Button>
            </EmptyContent>
          )}
        </Empty>
      </div>
    )
  }

  if (mode === 'trash') {
    if (view === 'list') {
      return (
        <div className="p-2">
          <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-xs text-muted-foreground font-medium">
            <span className="size-5 shrink-0" />
            <span className="flex-1">名前</span>
            <span className="w-20 text-right shrink-0">サイズ</span>
            <span className="w-24 text-right shrink-0 hidden sm:block">削除日</span>
            <span className="size-6 shrink-0" />
          </div>
          {folders.map((folder) => (
            <TrashFolderRow key={folder.id} folder={folder} onRestore={handleFolderRestore} onPurge={handleFolderPurge} />
          ))}
          {files.map((file) => (
            <TrashFileRow key={file.id} file={file} onRestore={handleRestore} onPurge={handlePurge} />
          ))}
        </div>
      )
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
        {folders.map((folder) => (
          <TrashFolderCard key={folder.id} folder={folder} onRestore={handleFolderRestore} onPurge={handleFolderPurge} />
        ))}
        {files.map((file) => (
          <TrashFileCard key={file.id} file={file} onRestore={handleRestore} onPurge={handlePurge} />
        ))}
      </div>
    )
  }

  if (view === 'list') {
    return (
      <DragEnabledContext.Provider value={mode === 'normal'}>
        <div className="p-2">
          <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-xs text-muted-foreground font-medium">
            <span className="size-5 shrink-0" />
            <span className="flex-1">名前</span>
            <span className="w-20 text-right shrink-0">サイズ</span>
            <span className="w-24 text-right shrink-0 hidden sm:block">更新日</span>
            <span className="size-6 shrink-0" />
          </div>
          {folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              onOpen={handleFolderOpen}
              onDelete={handleFolderDelete}
              onMove={handleFolderMove}
              onRename={handleFolderRename}
              onToggleFavorite={handleFolderToggleFavorite}
            />
          ))}
          {files.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              onPreview={handlePreview}
              onDelete={handleDelete}
              onMove={handleMove}
              onRename={handleRename}
              onToggleFavorite={handleToggleFavorite}
              showMatchReason={showMatchReason}
            />
          ))}
        </div>
      </DragEnabledContext.Provider>
    )
  }

  return (
    <DragEnabledContext.Provider value={mode === 'normal'}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
        {folders.map((folder) => (
          <FolderCard
            key={folder.id}
            folder={folder}
            onOpen={handleFolderOpen}
            onDelete={handleFolderDelete}
            onMove={handleFolderMove}
            onRename={handleFolderRename}
            onToggleFavorite={handleFolderToggleFavorite}
          />
        ))}
        {files.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            onPreview={handlePreview}
            onDelete={handleDelete}
            onMove={handleMove}
            onRename={handleRename}
            onToggleFavorite={handleToggleFavorite}
            showMatchReason={showMatchReason}
          />
        ))}
      </div>
    </DragEnabledContext.Provider>
  )
}
