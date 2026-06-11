import type React from 'react'
import {
  FileText, EllipsisVertical, Download, SquarePen, Trash2, Share2,
  Star, MoveRight, Lock, Info, CloudUpload, File, ImageIcon, Video, Music,
} from 'lucide-react'
import { Card, CardContent } from './ui/card'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuTrigger,
} from './ui/context-menu'
import { Button } from './ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from './ui/empty'
import type { FileItem } from '../lib/files'
import { formatFileSize } from '../lib/files'

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return ImageIcon
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Video
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return Music
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext)) return FileText
  return File
}

interface FileItemActionsProps {
  file: FileItem
  onPreview: (id: string) => void
  onDelete: (id: string) => void
}

function FileContextMenuContent({ file, onPreview, onDelete }: FileItemActionsProps) {
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
      <ContextMenuItem>
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

function FileCard({ file, onPreview, onDelete }: FileItemActionsProps) {
  const Icon = fileIcon(file.name)
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
            <Icon className="size-12 text-muted-foreground" />
          </div>
          <CardContent className="pt-2 pb-3">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium truncate flex-1" title={file.name}>{file.name}</p>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisVertical className="size-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatFileSize(file.size)}{date ? ` · ${date}` : ''}
            </p>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <FileContextMenuContent file={file} onPreview={onPreview} onDelete={onDelete} />
    </ContextMenu>
  )
}

function FileRow({ file, onPreview, onDelete }: FileItemActionsProps) {
  const Icon = fileIcon(file.name)
  const date = file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-0"
          onClick={() => onPreview(file.id)}
        >
          <Icon className="size-5 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-sm truncate min-w-0" title={file.name}>{file.name}</p>
          <p className="text-xs text-muted-foreground w-20 text-right shrink-0">{formatFileSize(file.size)}</p>
          <p className="text-xs text-muted-foreground w-24 text-right shrink-0 hidden sm:block">{date}</p>
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <EllipsisVertical className="size-4" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <FileContextMenuContent file={file} onPreview={onPreview} onDelete={onDelete} />
    </ContextMenu>
  )
}

interface MainContentsProps {
  files: FileItem[]
  loading?: boolean
  view?: 'grid' | 'list'
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onPreview?: (id: string) => void
  onDelete?: (id: string) => void
}

export const SecondaryContents = () => <div />

export default function MainContentsDefault({ files, loading, view = 'grid', onFileSelect, onPreview, onDelete }: MainContentsProps) {
  const noop = () => {}
  const handlePreview = onPreview ?? noop
  const handleDelete = onDelete ?? noop

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

  if (files.length === 0) {
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
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            onPreview={handlePreview}
            onDelete={handleDelete}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          onPreview={handlePreview}
          onDelete={handleDelete}
        />
      ))}
    </div>
  )
}
