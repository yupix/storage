import type React from 'react'
import { ChevronRight, Folder, CloudUpload, Share2, Trash2, SquarePen, MoveRight, Star, Info, Lock, Download, LayoutGrid, List } from 'lucide-react'
import { Button } from './ui/button'

interface BreadcrumbItem {
  id: string | null
  name: string
}

interface ToolbarSearchResultProps {
  query?: string
}

export const ToolbarSearchResult = ({ query = '' }: ToolbarSearchResultProps) => {
  return (
    <div className="bg-card text-card-foreground h-12 mx-1.5 my-2 px-3 rounded-lg flex items-center gap-1 ring-1 ring-foreground/10 overflow-x-auto">
      <p className="font-semibold text-sm mr-2 shrink-0">「{query}」の検索結果</p>
      <Button variant="ghost" size="icon-sm" title="フォルダー作成">
        <Folder />
      </Button>
      <Button variant="ghost" size="icon-sm" title="アップロード">
        <CloudUpload />
      </Button>
      <Button variant="ghost" size="icon-sm" title="共有">
        <Share2 />
      </Button>
    </div>
  )
}

export const ToolbarSelected = () => {
  return (
    <div className="bg-card text-card-foreground h-12 mx-1.5 my-2 px-3 rounded-lg flex items-center gap-1 ring-1 ring-foreground/10 overflow-x-auto">
      <p className="font-semibold text-sm mr-2 shrink-0">○個選択中</p>
      <Button variant="ghost" size="icon-sm" title="削除">
        <Trash2 />
      </Button>
      <Button variant="ghost" size="icon-sm" title="名前変更">
        <SquarePen />
      </Button>
      <Button variant="ghost" size="icon-sm" title="アップロード">
        <CloudUpload />
      </Button>
      <Button variant="ghost" size="icon-sm" title="共有">
        <Share2 />
      </Button>
      <Button variant="ghost" size="icon-sm" title="移動">
        <MoveRight />
      </Button>
      <Button variant="ghost" size="icon-sm" title="お気に入り">
        <Star />
      </Button>
      <Button variant="ghost" size="icon-sm" title="情報">
        <Info />
      </Button>
      <Button variant="ghost" size="icon-sm" title="ロック">
        <Lock />
      </Button>
      <Button variant="ghost" size="icon-sm" title="ダウンロード">
        <Download />
      </Button>
    </div>
  )
}

interface ToolbarDefaultProps {
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
  uploading?: boolean
  view?: 'grid' | 'list'
  onViewChange?: (view: 'grid' | 'list') => void
  onCreateFolder?: () => void
  breadcrumb?: BreadcrumbItem[]
  onBreadcrumbNavigate?: (id: string | null) => void
}

export default function ToolbarDefault({
  onFileSelect,
  uploading,
  view = 'grid',
  onViewChange,
  onCreateFolder,
  breadcrumb = [],
  onBreadcrumbNavigate,
}: ToolbarDefaultProps) {
  return (
    <div className="bg-card text-card-foreground h-12 mx-1.5 my-2 px-3 rounded-lg flex items-center gap-1 ring-1 ring-foreground/10 overflow-x-auto">
      <Button variant="ghost" size="icon-sm" title="フォルダー作成" onClick={onCreateFolder}>
        <Folder />
      </Button>
      <Button asChild variant="ghost" size="icon-sm" title="アップロード" disabled={uploading}>
        <label className={uploading ? 'pointer-events-none' : 'cursor-pointer'}>
          <CloudUpload />
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={onFileSelect}
          />
        </label>
      </Button>
      <Button variant="ghost" size="icon-sm" title="共有">
        <Share2 />
      </Button>

      {breadcrumb.length > 1 && (
        <nav className="flex items-center gap-0.5 ml-2 overflow-x-auto shrink-0">
          {breadcrumb.map((item, index) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-0.5">
              {index > 0 && <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
              <button
                type="button"
                onClick={() => onBreadcrumbNavigate?.(item.id)}
                className={`text-sm px-1 py-0.5 rounded hover:bg-muted transition-colors whitespace-nowrap ${
                  index === breadcrumb.length - 1
                    ? 'font-medium text-foreground pointer-events-none'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        <Button
          variant={view === 'grid' ? 'secondary' : 'ghost'}
          size="icon-sm"
          title="グリッド表示"
          onClick={() => onViewChange?.('grid')}
        >
          <LayoutGrid />
        </Button>
        <Button
          variant={view === 'list' ? 'secondary' : 'ghost'}
          size="icon-sm"
          title="リスト表示"
          onClick={() => onViewChange?.('list')}
        >
          <List />
        </Button>
      </div>
    </div>
  )
}
