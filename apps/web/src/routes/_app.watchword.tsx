import { createFileRoute } from '@tanstack/react-router'
import { Share2 } from 'lucide-react'
import SharePanel from './-watchword/SharePanel'
import ReceivePanel from './-watchword/ReceivePanel'

type WatchwordTab = 'share' | 'receive'

interface WatchwordSearch {
  tab: WatchwordTab
  // 共有メニューから引き継いだドライブファイル（SharePanel が実体を取得して初期選択にする）
  fileId?: string
  fileName?: string
}

export const Route = createFileRoute('/_app/watchword')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): WatchwordSearch => ({
    tab: search.tab === 'receive' ? 'receive' : 'share',
    fileId: typeof search.fileId === 'string' ? search.fileId : undefined,
    fileName: typeof search.fileName === 'string' ? search.fileName : undefined,
  }),
  component: WatchwordPage,
})

const tabs: { key: WatchwordTab; label: string }[] = [
  { key: 'share', label: '共有（送信）' },
  { key: 'receive', label: '受信' },
]

function WatchwordPage() {
  const { tab, fileId, fileName } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Share2 className="size-5 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">合言葉で共有・受信</h1>
          <p className="text-sm text-muted-foreground">
            合言葉を使って相手と直接（P2P）ファイルをやり取りします。
          </p>
        </div>
      </div>

      <div
        role="group"
        aria-label="合言葉の操作を切り替え"
        className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => navigate({ search: { tab: key } })}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
              tab === key
                ? 'bg-background font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 選んだタブのパネルだけをマウントする（切り替え時に前の転送は停止する） */}
      {tab === 'share' ? (
        <SharePanel initialFileId={fileId} initialFileName={fileName} />
      ) : (
        <ReceivePanel />
      )}
    </div>
  )
}
