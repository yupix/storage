import { X, Star, MoveRight, Download, Trash2 } from 'lucide-react'
import { Button } from './ui/button'

interface SelectionToolbarProps {
  count: number
  /** ダウンロード対象になるファイル数（0 のときダウンロードを無効化する） */
  fileCount: number
  onClear: () => void
  onFavorite: () => void
  onMove: () => void
  onDownload: () => void
  onDelete: () => void
}

export default function SelectionToolbar({
  count,
  fileCount,
  onClear,
  onFavorite,
  onMove,
  onDownload,
  onDelete,
}: SelectionToolbarProps) {
  return (
    <div className="bg-card text-card-foreground h-12 mx-1.5 my-2 px-3 rounded-lg flex items-center gap-1 ring-1 ring-primary/40 overflow-x-auto">
      <Button variant="ghost" size="icon-sm" aria-label="選択を解除" title="選択を解除" onClick={onClear}>
        <X className="size-4" />
      </Button>
      <span className="text-sm font-medium whitespace-nowrap px-1">
        {count} 件を選択中
      </span>

      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="sm" aria-label="お気に入り" onClick={onFavorite}>
          <Star className="size-4" />
          <span className="hidden sm:inline">お気に入り</span>
        </Button>
        <Button variant="ghost" size="sm" aria-label="移動" onClick={onMove}>
          <MoveRight className="size-4" />
          <span className="hidden sm:inline">移動</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="ダウンロード"
          onClick={onDownload}
          disabled={fileCount === 0}
          title={fileCount === 0 ? 'ダウンロードできるファイルがありません' : undefined}
        >
          <Download className="size-4" />
          <span className="hidden sm:inline">ダウンロード</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="削除"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" />
          <span className="hidden sm:inline">削除</span>
        </Button>
      </div>
    </div>
  )
}
