import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { Search, ChevronLeft, ChevronRight, Sparkles, Type } from 'lucide-react'
import { searchFiles } from '../lib/files'
import WorkspacePage from './-workspace/WorkspacePage'
import { validateWorkspaceSearch } from './-workspace/route-utils'
import type { WorkspaceSort } from './-workspace/route-utils'

const SEARCH_LIMIT = 50

type SearchType = 'keyword' | 'vector'

interface SearchSearch {
  q?: string
  type?: SearchType
  view?: 'grid' | 'list'
  sort?: WorkspaceSort
  page?: number
}

export const Route = createFileRoute('/_app/search')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchSearch => ({
    ...validateWorkspaceSearch(search),
    q: typeof search.q === 'string' ? search.q : undefined,
    type: search.type === 'vector' ? 'vector' : 'keyword',
    page: typeof search.page === 'number' && search.page >= 1 ? Math.floor(search.page) : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q, type: search.type, page: search.page }),
  loader: async ({ deps }) => {
    if (!deps.q || deps.q.trim() === '') return { files: [], total: 0, q: '', type: deps.type ?? 'keyword', page: 1, limit: SEARCH_LIMIT }
    const page = deps.page ?? 1
    const type = deps.type ?? 'keyword'
    const result = await searchFiles(deps.q.trim(), page, SEARCH_LIMIT, type === 'vector' ? 'vector' : undefined)
    return { files: result.files, total: result.total, q: deps.q.trim(), type, page, limit: SEARCH_LIMIT }
  },
  component: SearchPage,
})

function SearchPage() {
  const { files, total, q, type, page, limit } = Route.useLoaderData()
  const { view, sort } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [inputValue, setInputValue] = useState(q)

  const totalPages = Math.ceil(total / limit)
  const hasPrev = page > 1
  const hasNext = page < totalPages

  useEffect(() => {
    setInputValue(q)
  }, [q])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (trimmed) {
      navigate({ search: (prev) => ({ ...prev, q: trimmed, page: undefined }) })
    }
  }

  const handleTypeChange = (newType: SearchType) => {
    navigate({ search: (prev) => ({ ...prev, type: newType, page: undefined }) })
  }

  const placeholder = type === 'vector'
    ? '抽象的なキーワードで意味検索（例: 走る人）'
    : 'ファイル名・画像内テキストで検索'

  return (
    <div className="flex flex-col gap-2">
      <div className="mx-1.5 mt-2 px-3 flex flex-col gap-2">
        {/* 検索モード切り替え */}
        <div className="flex items-center gap-1 w-fit rounded-lg border border-border bg-muted p-0.5 text-sm">
          <button
            type="button"
            onClick={() => handleTypeChange('keyword')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
              type !== 'vector'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Type className="size-3.5" />
            キーワード
          </button>
          <button
            type="button"
            onClick={() => handleTypeChange('vector')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors ${
              type === 'vector'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="size-3.5" />
            意味検索
          </button>
        </div>

        {/* 検索フォーム */}
        <form onSubmit={handleSubmit} className="relative max-w-lg">
          {type === 'vector' ? (
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          )}
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            className="w-full h-9 pl-9 pr-4 bg-muted rounded-lg border border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring/30 transition-colors"
            autoFocus
          />
        </form>

        {q && (
          <p className="text-xs text-muted-foreground">
            「{q}」の{type === 'vector' ? '意味検索' : '検索'}結果 {total} 件
            {totalPages > 1 && ` （${page} / ${totalPages} ページ）`}
          </p>
        )}
      </div>

      {q ? (
        files.length > 0 ? (
          <>
            <WorkspacePage
              initialFiles={files}
              initialFolders={[]}
              view={view ?? 'grid'}
              onViewChange={(v) => navigate({ search: (prev) => ({ ...prev, view: v }) })}
              sort={sort}
              onSortChange={(s) => navigate({ search: (prev) => ({ ...prev, sort: s }) })}
            />
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-4">
                <button
                  onClick={() => navigate({ search: (prev) => ({ ...prev, page: page - 1 }) })}
                  disabled={!hasPrev}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="size-4" />
                  前へ
                </button>
                <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
                <button
                  onClick={() => navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })}
                  disabled={!hasNext}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
                >
                  次へ
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            {type === 'vector' ? <Sparkles className="size-10 opacity-30" /> : <Search className="size-10 opacity-30" />}
            <p className="text-sm">一致するファイルが見つかりませんでした</p>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          {type === 'vector' ? <Sparkles className="size-10 opacity-30" /> : <Search className="size-10 opacity-30" />}
          <p className="text-sm">
            {type === 'vector' ? '意味の近いファイルをAIで探します' : '検索キーワードを入力してください'}
          </p>
        </div>
      )}
    </div>
  )
}
