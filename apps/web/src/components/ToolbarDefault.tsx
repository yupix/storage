import type React from 'react'
import { ChevronRight, FolderPlus, CloudUpload, Share2, Trash2, LayoutGrid, List, ArrowUpDown, Check } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu'
import { useDroppable } from '@dnd-kit/core'
import type { WorkspaceSort } from '../routes/-workspace/route-utils'

interface BreadcrumbItem {
  id: string | null
  name: string
}

function DroppableBreadcrumb({ item, isLast, onClick }: {
  item: { id: string | null; name: string }
  isLast: boolean
  onClick: () => void
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `breadcrumb-${item.id ?? 'root'}`,
    data: { type: 'folder' as const, id: item.id },
    disabled: isLast,
  })
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`text-sm px-1 py-0.5 rounded whitespace-nowrap transition-colors ${
        isLast
          ? 'font-medium text-foreground pointer-events-none'
          : `text-muted-foreground hover:text-foreground hover:bg-muted ${isOver ? 'bg-primary/10 text-primary ring-1 ring-primary' : ''}`
      }`}
    >
      {item.name}
    </button>
  )
}

const SORT_LABELS: Record<WorkspaceSort, string> = {
  'name-asc': '名前 (A → Z)',
  'name-desc': '名前 (Z → A)',
  'updated_at-desc': '更新日時 (新しい順)',
  'updated_at-asc': '更新日時 (古い順)',
  'size-desc': 'サイズ (大きい順)',
  'size-asc': 'サイズ (小さい順)',
}

interface ToolbarDefaultProps {
  onFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void
  uploading?: boolean
  view?: 'grid' | 'list'
  onViewChange?: (view: 'grid' | 'list') => void
  onCreateFolder?: () => void
  breadcrumb?: BreadcrumbItem[]
  onBreadcrumbNavigate?: (id: string | null) => void
  mode?: 'normal' | 'trash'
  onEmptyTrash?: () => void
  sort?: WorkspaceSort
  onSortChange?: (sort: WorkspaceSort) => void
  sortLabelOverride?: string
}

export default function ToolbarDefault({
  onFileSelect,
  uploading,
  view = 'grid',
  onViewChange,
  onCreateFolder,
  breadcrumb = [],
  onBreadcrumbNavigate,
  mode = 'normal',
  onEmptyTrash,
  sort = 'name-asc',
  onSortChange,
  sortLabelOverride,
}: ToolbarDefaultProps) {
  return (
    <div className="bg-card text-card-foreground h-12 mx-1.5 my-2 px-3 rounded-lg flex items-center gap-1 ring-1 ring-foreground/10 overflow-x-auto">
      {mode === 'trash' ? (
        <Button variant="ghost" size="sm" title="ゴミ箱を空にする" onClick={onEmptyTrash} className="text-destructive hover:text-destructive">
          <Trash2 className="mr-1.5 size-4" />
          ゴミ箱を空にする
        </Button>
      ) : (
        <>
          <Button variant="ghost" size="icon-sm" title="新しいフォルダー" onClick={onCreateFolder}>
            <FolderPlus className="size-4" />
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
                  <DroppableBreadcrumb
                    item={item}
                    isLast={index === breadcrumb.length - 1}
                    onClick={() => onBreadcrumbNavigate?.(item.id)}
                  />
                </span>
              ))}
            </nav>
          )}
        </>
      )}

      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" title="並び替え" className="gap-1.5">
              <ArrowUpDown className="size-4" />
              <span className="hidden sm:inline text-xs">
                {sortLabelOverride ?? SORT_LABELS[sort]}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {(['name-asc', 'name-desc'] as WorkspaceSort[]).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onSortChange?.(s)}>
                {sort === s && <Check className="mr-2 size-4" />}
                {sort !== s && <span className="mr-2 size-4 inline-block" />}
                {SORT_LABELS[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {(['updated_at-desc', 'updated_at-asc'] as WorkspaceSort[]).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onSortChange?.(s)}>
                {sort === s && <Check className="mr-2 size-4" />}
                {sort !== s && <span className="mr-2 size-4 inline-block" />}
                {SORT_LABELS[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {(['size-desc', 'size-asc'] as WorkspaceSort[]).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onSortChange?.(s)}>
                {sort === s && <Check className="mr-2 size-4" />}
                {sort !== s && <span className="mr-2 size-4 inline-block" />}
                {SORT_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
