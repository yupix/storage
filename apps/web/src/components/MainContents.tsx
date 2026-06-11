import type React from 'react'
import {
  EllipsisVertical, Download, SquarePen, Trash2, Share2,
  Star, MoveRight, Lock, Info, CloudUpload, Folder,
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
import { formatFileSize } from '../lib/files'

function FileTypeIcon({ name, size = 40 }: { name: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const style = (defaultStyles as Record<string, FileIconProps>)[ext] ?? {}
  return (
    <div style={{ width: size, height: size }}>
      <FileIcon extension={ext} {...style} />
    </div>
  )
}

interface FileItemActionsProps {
  file: FileItem
  onPreview: (id: string) => void
  onDelete: (id: string) => void
  onMove: (id: string) => void
}

function FileDropdownMenuContent({ file, onPreview, onDelete, onMove }: FileItemActionsProps) {
  return (
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => onPreview(file.id)}>
        <Info className="mr-2 size-4" />
        プレビュー
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Download className="mr-2 size-4" />
        ダウンロード
      </DropdownMenuItem>
      <DropdownMenuItem>
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
      <DropdownMenuItem>
        <Star className="mr-2 size-4" />
        お気に入り
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

function FileContextMenuContent({ file, onPreview, onDelete, onMove }: FileItemActionsProps) {
  return (
    <ContextMenuContent>
      <ContextMenuItem onSelect={() => onPreview(file.id)}>
        <Info className="mr-2 size-4" />
        プレビュー
      </ContextMenuItem>
      <ContextMenuItem>
        <Download className="mr-2 size-4" />
        ダウンロード
      </ContextMenuItem>
      <ContextMenuItem>
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
      <ContextMenuItem>
        <Star className="mr-2 size-4" />
        お気に入り
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

function FileCard({ file, onPreview, onDelete, onMove }: FileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Card
          size="sm"
          className="cursor-pointer hover:ring-primary/40 transition-shadow"
          onClick={() => onPreview(file.id)}
        >
          <div className="flex items-center justify-center h-24 bg-muted/50 rounded-t-xl">
            <FileTypeIcon name={file.name} size={48} />
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
                <FileDropdownMenuContent file={file} onPreview={onPreview} onDelete={onDelete} onMove={onMove} />
              </DropdownMenu>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFileSize(file.size)}{date ? ` · ${date}` : ''}
            </p>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <FileContextMenuContent file={file} onPreview={onPreview} onDelete={onDelete} onMove={onMove} />
    </ContextMenu>
  )
}

function FileRow({ file, onPreview, onDelete, onMove }: FileItemActionsProps) {
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-0"
          onClick={() => onPreview(file.id)}
        >
          <FileTypeIcon name={file.name} size={20} />
          <p className="flex-1 text-sm truncate min-w-0" title={file.name}>{file.name}</p>
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
            <FileDropdownMenuContent file={file} onPreview={onPreview} onDelete={onDelete} onMove={onMove} />
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <FileContextMenuContent file={file} onPreview={onPreview} onDelete={onDelete} onMove={onMove} />
    </ContextMenu>
  )
}

interface FolderCardProps {
  folder: FolderItem
  onOpen: (folder: FolderItem) => void
}

function FolderCard({ folder, onOpen }: FolderCardProps) {
  const date = folder.updated_at ? new Date(folder.updated_at).toLocaleDateString('ja-JP') : ''
  return (
    <Card
      size="sm"
      className="cursor-pointer hover:ring-primary/40 transition-shadow"
      onClick={() => onOpen(folder)}
    >
      <div className="flex items-center justify-center h-24 bg-muted/50 rounded-t-xl">
        <Folder className="size-12 text-muted-foreground" />
      </div>
      <CardContent className="pt-2 pb-3">
        <p className="text-sm font-medium truncate" title={folder.name}>{folder.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
      </CardContent>
    </Card>
  )
}

function FolderRow({ folder, onOpen }: FolderCardProps) {
  const date = folder.updated_at ? new Date(folder.updated_at).toLocaleDateString('ja-JP') : ''
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-0"
      onClick={() => onOpen(folder)}
    >
      <Folder className="size-5 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-sm truncate min-w-0 font-medium" title={folder.name}>{folder.name}</p>
      <p className="text-xs text-muted-foreground w-20 text-right shrink-0">—</p>
      <p className="text-xs text-muted-foreground w-24 text-right shrink-0 hidden sm:block">{date}</p>
      <span className="size-6 shrink-0" />
    </div>
  )
}

interface MainContentsProps {
  files: FileItem[]
  folders?: FolderItem[]
  loading?: boolean
  view?: 'grid' | 'list'
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPreview?: (id: string) => void
  onDelete?: (id: string) => void
  onMove?: (id: string) => void
  onFolderOpen?: (folder: FolderItem) => void
}

export const SecondaryContents = () => <div />

export default function MainContentsDefault({
  files,
  folders = [],
  loading,
  view = 'grid',
  onFileSelect,
  onPreview,
  onDelete,
  onMove,
  onFolderOpen,
}: MainContentsProps) {
  const noop = () => {}
  const handlePreview = onPreview ?? noop
  const handleDelete = onDelete ?? noop
  const handleMove = onMove ?? noop
  const handleFolderOpen = onFolderOpen ?? noop

  if (loading) {
    if (view === 'list') {
      return (
        <div className="flex flex-col gap-1 p-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-muted/50 animate-pulse h-9" />
          ))}
        </div>
      )
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-muted/50 animate-pulse h-36" />
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
              <CloudUpload className="size-10 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>ファイルがありません</EmptyTitle>
            <EmptyDescription>
              ファイルをアップロードして始めましょう
            </EmptyDescription>
          </EmptyHeader>
          {onFileSelect && (
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

  if (view === 'list') {
    return (
      <div className="p-2">
        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-border text-xs text-muted-foreground font-medium">
          <span className="size-5 shrink-0" />
          <span className="flex-1">名前</span>
          <span className="w-20 text-right shrink-0">サイズ</span>
          <span className="w-24 text-right shrink-0 hidden sm:block">更新日</span>
          <span className="size-6 shrink-0" />
        </div>
        {folders.map((folder) => (
          <FolderRow key={folder.id} folder={folder} onOpen={handleFolderOpen} />
        ))}
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            onPreview={handlePreview}
            onDelete={handleDelete}
            onMove={handleMove}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
      {folders.map((folder) => (
        <FolderCard key={folder.id} folder={folder} onOpen={handleFolderOpen} />
      ))}
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onPreview={handlePreview}
          onDelete={handleDelete}
          onMove={handleMove}
        />
      ))}
    </div>
  )
}
