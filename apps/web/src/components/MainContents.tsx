import type React from 'react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import {
  EllipsisVertical, Download, SquarePen, Trash2, Share2,
  Star, MoveRight, Lock, Info, CloudUpload, Folder, RotateCcw,
  Circle, CircleCheck, FolderPlus, Link2, KeyRound,
} from 'lucide-react'
import { FileIcon, defaultStyles } from 'react-file-icon'
import type { FileIconProps } from 'react-file-icon'
import { Card, CardContent } from './ui/card'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger,
  ContextMenuSub, ContextMenuSubTrigger, ContextMenuSubContent,
} from './ui/context-menu'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from './ui/dropdown-menu'
import { Button } from './ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from './ui/empty'
import type { FileItem, FolderItem } from '../lib/files'
import { formatFileSize, downloadFile } from '../lib/files'

// ドラッグが有効かどうかを子コンポーネントへ伝播するコンテキスト
const DragEnabledContext = createContext(false)

// 複数選択の状態と操作を子コンポーネントへ伝播するコンテキスト。
// null のとき（ゴミ箱など）は選択 UI を表示しない。
interface SelectionCtx {
  active: boolean
  isFileSelected: (id: string) => boolean
  isFolderSelected: (id: string) => boolean
  // shiftKey が true のときは直前に選んだ項目からの範囲選択にする
  toggleFile: (id: string, shiftKey?: boolean) => void
  toggleFolder: (id: string, shiftKey?: boolean) => void
}
const SelectionContext = createContext<SelectionCtx | null>(null)

// カードやリスト行の左上に出す選択用の丸ボタン
function SelectCircle({
  selected,
  onToggle,
  className = '',
}: {
  selected: boolean
  onToggle: (shiftKey: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={selected ? '選択を解除' : '選択'}
      className={`flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground ${className}`}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e.shiftKey)
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {selected
        ? <CircleCheck className="size-5 fill-primary text-primary-foreground" />
        : <Circle className="size-5 bg-background/70 rounded-full" />
      }
    </button>
  )
}

// 何もない場所を右クリックしたときのメニュー（新しいフォルダー / アップロード）。
// カードは各自の ContextMenu を持つため、カード側で contextmenu を stopPropagation して
// このコンテナメニューが二重に開かないようにしている。
function EmptyAreaContextMenu({
  children,
  onCreateFolder,
  onFileSelect,
}: {
  children: React.ReactNode
  onCreateFolder?: () => void
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const uploadInputRef = useRef<HTMLInputElement>(null)
  if (!onCreateFolder && !onFileSelect) return <>{children}</>
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          {onCreateFolder && (
            <ContextMenuItem onSelect={onCreateFolder}>
              <FolderPlus className="mr-2 size-4" />
              新しいフォルダー
            </ContextMenuItem>
          )}
          {onFileSelect && (
            <ContextMenuItem onSelect={() => uploadInputRef.current?.click()}>
              <CloudUpload className="mr-2 size-4" />
              ファイルをアップロード
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {onFileSelect && (
        <input ref={uploadInputRef} type="file" multiple className="sr-only" onChange={onFileSelect} />
      )}
    </>
  )
}

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
  onShare: (file: FileItem) => void
}

function FileDropdownMenuContent({
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite, onShare,
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
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Share2 className="mr-2 size-4" />
          共有
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onSelect={() => onShare(file)}>
            <Link2 className="mr-2 size-4" />
            リンク共有
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/watchword" search={{ tab: 'share', fileId: file.id, fileName: file.name }}>
              <KeyRound className="mr-2 size-4" />
              合言葉共有
            </Link>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
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
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite, onShare,
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
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Share2 className="mr-2 size-4" />
          共有
        </ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem onSelect={() => onShare(file)}>
            <Link2 className="mr-2 size-4" />
            リンク共有
          </ContextMenuItem>
          <ContextMenuItem asChild>
            <Link to="/watchword" search={{ tab: 'share', fileId: file.id, fileName: file.name }}>
              <KeyRound className="mr-2 size-4" />
              合言葉共有
            </Link>
          </ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
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
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite, onShare,
}: FileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''
  const isImage = file.file_type.startsWith('image/')
  const dragEnabled = useContext(DragEnabledContext)
  const selection = useContext(SelectionContext)
  const selected = selection?.isFileSelected(file.id) ?? false

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: 'file' as const, id: file.id, name: file.name },
    disabled: !dragEnabled,
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger onContextMenu={(e) => e.stopPropagation()}>
        <div ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? 'opacity-40' : ''}>
        <Card
          size="sm"
          className={`group cursor-pointer transition-shadow ${selected ? 'ring-2 ring-primary' : 'hover:ring-primary/40'}`}
          onClick={(e) => {
            if (selection?.active) selection.toggleFile(file.id, e.shiftKey)
            else onPreview(file.id)
          }}
        >
          <div className="relative flex items-center justify-center h-24 bg-muted/50 rounded-t-xl overflow-hidden">
            {isImage
              ? <ImageThumbnail fileId={file.id} name={file.name} />
              : <FileTypeIcon name={file.name} size={48} />
            }
            {selection && (
              <div className={`absolute top-1 left-1 z-10 transition-opacity ${selected || selection.active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <SelectCircle selected={selected} onToggle={(shift) => selection.toggleFile(file.id, shift)} />
              </div>
            )}
            {file.is_favorite && (
              <div className="absolute top-1 right-1">
                <Star className="size-3.5 fill-yellow-400 text-yellow-400 drop-shadow" />
              </div>
            )}
          </div>
          <CardContent className="pt-2 pb-3">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium truncate flex-1" title={file.name}>{file.name}</p>
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
                  onShare={onShare}
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
        onShare={onShare}
      />
    </ContextMenu>
  )
}

function FileRow({
  file, onPreview, onDelete, onMove, onRename, onToggleFavorite, onShare,
}: FileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''
  const dragEnabled = useContext(DragEnabledContext)
  const selection = useContext(SelectionContext)
  const selected = selection?.isFileSelected(file.id) ?? false

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `file-${file.id}`,
    data: { type: 'file' as const, id: file.id, name: file.name },
    disabled: !dragEnabled,
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger onContextMenu={(e) => e.stopPropagation()}>
        {/* biome-ignore lint/a11y/useSemanticElements: The row contains a nested menu button. */}
        <div
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          className={`group flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors border-b border-border/50 last:border-0 ${selected ? 'bg-primary/10' : 'hover:bg-muted/50'} ${isDragging ? 'opacity-40' : ''}`}
          onClick={(e) => {
            if (selection?.active) selection.toggleFile(file.id, e.shiftKey)
            else onPreview(file.id)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (selection?.active) selection.toggleFile(file.id, event.shiftKey)
              else onPreview(file.id)
            }
          }}
        >
          {selection
            ? (
              <div className={`shrink-0 transition-opacity ${selected || selection.active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <SelectCircle selected={selected} onToggle={(shift) => selection.toggleFile(file.id, shift)} />
              </div>
            )
            : null}
          <FileTypeIcon name={file.name} size={20} />
          <p className="flex-1 text-sm truncate min-w-0" title={file.name}>{file.name}</p>
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
              onShare={onShare}
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
        onShare={onShare}
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
  const selection = useContext(SelectionContext)
  const selected = selection?.isFolderSelected(folder.id) ?? false

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
      <ContextMenuTrigger onContextMenu={(e) => e.stopPropagation()}>
        <div
          ref={setRef}
          {...attributes}
          {...listeners}
          className={isDragging ? 'opacity-40' : ''}
        >
          <Card
            size="sm"
            className={`group cursor-pointer transition-shadow ${
              isOver ? 'ring-2 ring-primary bg-primary/5'
              : selected ? 'ring-2 ring-primary'
              : 'hover:ring-primary/40'
            }`}
            onClick={(e) => {
              if (selection?.active) selection.toggleFolder(folder.id, e.shiftKey)
              else onOpen(folder)
            }}
          >
            <div className="relative flex items-center justify-center h-24 bg-muted/50 rounded-t-xl">
              <Folder className="size-12 text-muted-foreground" />
              {selection && (
                <div className={`absolute top-1 left-1 z-10 transition-opacity ${selected || selection.active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  <SelectCircle selected={selected} onToggle={(shift) => selection.toggleFolder(folder.id, shift)} />
                </div>
              )}
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
  const selection = useContext(SelectionContext)
  const selected = selection?.isFolderSelected(folder.id) ?? false

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
      <ContextMenuTrigger onContextMenu={(e) => e.stopPropagation()}>
        {/* biome-ignore lint/a11y/useSemanticElements: The row contains a nested menu button. */}
        <div
          ref={setRef}
          {...attributes}
          {...listeners}
          role="button"
          tabIndex={0}
          className={`group flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors border-b border-border/50 last:border-0 ${isOver ? 'bg-primary/5 ring-1 ring-inset ring-primary' : selected ? 'bg-primary/10' : 'hover:bg-muted/50'} ${isDragging ? 'opacity-40' : ''}`}
          onClick={(e) => {
            if (selection?.active) selection.toggleFolder(folder.id, e.shiftKey)
            else onOpen(folder)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (selection?.active) selection.toggleFolder(folder.id, event.shiftKey)
              else onOpen(folder)
            }
          }}
        >
          {selection
            ? (
              <div className={`shrink-0 transition-opacity ${selected || selection.active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                <SelectCircle selected={selected} onToggle={(shift) => selection.toggleFolder(folder.id, shift)} />
              </div>
            )
            : null}
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
  onShare?: (file: FileItem) => void
  onRestore?: (id: string) => void
  onPurge?: (id: string) => void
  onFolderRestore?: (id: string) => void
  onFolderPurge?: (id: string) => void
  onFolderOpen?: (folder: FolderItem) => void
  onFolderDelete?: (id: string) => void
  onFolderMove?: (id: string) => void
  onFolderRename?: (id: string, currentName: string) => void
  onFolderToggleFavorite?: (id: string, current: boolean) => void
  // 何もない場所を右クリックしたときのメニュー用（通常モードのみ）
  onCreateFolder?: () => void
  // 複数選択（通常モードのみ。未指定なら選択 UI を出さない）
  selectionActive?: boolean
  selectedFileIds?: Set<string>
  selectedFolderIds?: Set<string>
  onToggleFileSelect?: (id: string, shiftKey?: boolean) => void
  onToggleFolderSelect?: (id: string, shiftKey?: boolean) => void
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
  onShare,
  onRestore,
  onPurge,
  onFolderRestore,
  onFolderPurge,
  onFolderOpen,
  onFolderDelete,
  onFolderMove,
  onFolderRename,
  onFolderToggleFavorite,
  onCreateFolder,
  selectionActive = false,
  selectedFileIds,
  selectedFolderIds,
  onToggleFileSelect,
  onToggleFolderSelect,
}: MainContentsProps) {
  const noop = () => {}
  const handlePreview = onPreview ?? noop
  const handleDelete = onDelete ?? noop
  const handleMove = onMove ?? noop
  const handleRename = onRename ?? noop
  const handleToggleFavorite = onToggleFavorite ?? noop
  const handleShare = onShare ?? noop
  const handleRestore = onRestore ?? noop
  const handlePurge = onPurge ?? noop
  const handleFolderRestore = onFolderRestore ?? noop
  const handleFolderPurge = onFolderPurge ?? noop
  const handleFolderOpen = onFolderOpen ?? noop
  const handleFolderDelete = onFolderDelete ?? noop
  const handleFolderMove = onFolderMove ?? noop
  const handleFolderRename = onFolderRename ?? noop
  const handleFolderToggleFavorite = onFolderToggleFavorite ?? noop

  const selectionEnabled = Boolean(onToggleFileSelect && onToggleFolderSelect)
  const selectionCtx = useMemo<SelectionCtx | null>(() => {
    if (!selectionEnabled) return null
    return {
      active: selectionActive,
      isFileSelected: (id: string) => selectedFileIds?.has(id) ?? false,
      isFolderSelected: (id: string) => selectedFolderIds?.has(id) ?? false,
      toggleFile: (id: string, shiftKey?: boolean) => onToggleFileSelect?.(id, shiftKey),
      toggleFolder: (id: string, shiftKey?: boolean) => onToggleFolderSelect?.(id, shiftKey),
    }
  }, [selectionEnabled, selectionActive, selectedFileIds, selectedFolderIds, onToggleFileSelect, onToggleFolderSelect])

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
      <EmptyAreaContextMenu onCreateFolder={onCreateFolder} onFileSelect={onFileSelect}>
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
      </EmptyAreaContextMenu>
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
        <SelectionContext.Provider value={selectionCtx}>
        <EmptyAreaContextMenu onCreateFolder={onCreateFolder} onFileSelect={onFileSelect}>
        <div className="p-2 min-h-full">
          <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-xs text-muted-foreground font-medium">
            {selectionCtx && <span className="size-5 shrink-0" />}
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
              onShare={handleShare}
            />
          ))}
        </div>
        </EmptyAreaContextMenu>
        </SelectionContext.Provider>
      </DragEnabledContext.Provider>
    )
  }

  return (
    <DragEnabledContext.Provider value={mode === 'normal'}>
      <SelectionContext.Provider value={selectionCtx}>
      <EmptyAreaContextMenu onCreateFolder={onCreateFolder} onFileSelect={onFileSelect}>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3 min-h-full">
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
            onShare={handleShare}
          />
        ))}
      </div>
      </EmptyAreaContextMenu>
      </SelectionContext.Provider>
    </DragEnabledContext.Provider>
  )
}
