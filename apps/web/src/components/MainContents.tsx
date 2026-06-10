import { FileText, EllipsisVertical, Download, SquarePen, Trash2, Share2, Star, MoveRight, Lock, Info } from 'lucide-react'
import {
  Card,
  CardContent,
} from './ui/card'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from './ui/context-menu'
import { Button } from './ui/button'

interface FileCardProps {
  name: string
  updatedAt?: string
}

function FileCard({ name, updatedAt }: FileCardProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <Card size="sm" className="cursor-pointer hover:ring-primary/40 transition-shadow">
          <div className="flex items-center justify-center h-24 bg-muted/50 rounded-t-xl">
            <FileText className="size-12 text-muted-foreground" />
          </div>
          <CardContent className="pt-2 pb-3">
            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-medium truncate flex-1">{name}</p>
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisVertical />
              </Button>
            </div>
            {updatedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">{updatedAt}</p>
            )}
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem>
          <Download />
          ダウンロード
        </ContextMenuItem>
        <ContextMenuItem>
          <SquarePen />
          名前変更
        </ContextMenuItem>
        <ContextMenuItem>
          <Share2 />
          共有
        </ContextMenuItem>
        <ContextMenuItem>
          <MoveRight />
          移動
        </ContextMenuItem>
        <ContextMenuItem>
          <Star />
          お気に入り
        </ContextMenuItem>
        <ContextMenuItem>
          <Lock />
          ロック
        </ContextMenuItem>
        <ContextMenuItem>
          <Info />
          情報
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          <Trash2 />
          削除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export const SecondaryContents = () => {
  return <div />
}

export default function MainContentsDefault() {
  const mockFiles = [
    { name: 'ファイル名.txt', updatedAt: '2026/06/01' },
    { name: 'ドキュメント.pdf', updatedAt: '2026/05/28' },
    { name: 'レポート最終版.docx', updatedAt: '2026/05/20' },
    { name: 'プレゼン資料.pptx', updatedAt: '2026/05/15' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
      {mockFiles.map((file) => (
        <FileCard key={file.name} name={file.name} updatedAt={file.updatedAt} />
      ))}
    </div>
  )
}
