import { Button } from './ui/button'
import {
  Folder,
  CloudUpload,
  Share2,
  Trash2,
  SquarePen,
  MoveRight,
  Star,
  Info,
  Lock,
  Download,
} from 'lucide-react'

export const ToolbarSearchResult = () => {
  return (
    <div className="bg-card text-card-foreground h-12 mx-1.5 my-2 px-3 rounded-lg flex items-center gap-1 ring-1 ring-foreground/10 overflow-x-auto">
      <p className="font-semibold text-sm mr-2 shrink-0">「」の検索結果</p>
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

export default function ToolbarDefault() {
  return (
    <div className="bg-card text-card-foreground h-12 mx-1.5 my-2 px-3 rounded-lg flex items-center gap-1 ring-1 ring-foreground/10 overflow-x-auto">
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
