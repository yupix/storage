import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { searchFiles } from '../lib/files'
import WorkspacePage from './-workspace/WorkspacePage'
import { validateWorkspaceSearch } from './-workspace/route-utils'
import type { WorkspaceSort } from './-workspace/route-utils'

interface SearchSearch {
  q?: string
  view?: 'grid' | 'list'
  sort?: WorkspaceSort
}

export const Route = createFileRoute('/_app/search')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchSearch => ({
    ...validateWorkspaceSearch(search),
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ deps }) => {
    if (!deps.q || deps.q.trim() === '') return { files: [], total: 0, q: '' }
    const result = await searchFiles(deps.q.trim())
    return { files: result.files, total: result.total, q: deps.q.trim() }
  },
  component: SearchPage,
})

function SearchPage() {
  const { files, total, q } = Route.useLoaderData()
  const { view, sort } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [inputValue, setInputValue] = useState(q)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (trimmed) {
      navigate({ search: (prev) => ({ ...prev, q: trimmed }) })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="mx-1.5 mt-2 px-3">
        <form onSubmit={handleSubmit} className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="ファイル名・画像内テキストで検索"
            className="w-full h-9 pl-9 pr-4 bg-muted rounded-lg border border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring/30 transition-colors"
            autoFocus
          />
        </form>
        {q && (
          <p className="text-xs text-muted-foreground mt-1.5">
            「{q}」の検索結果 {total} 件
          </p>
        )}
      </div>

      {q ? (
        files.length > 0 ? (
          <WorkspacePage
            initialFiles={files}
            initialFolders={[]}
            view={view ?? 'grid'}
            onViewChange={(v) => navigate({ search: (prev) => ({ ...prev, view: v }) })}
            sort={sort}
            onSortChange={(s) => navigate({ search: (prev) => ({ ...prev, sort: s }) })}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <Search className="size-10 opacity-30" />
            <p className="text-sm">一致するファイルが見つかりませんでした</p>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <Search className="size-10 opacity-30" />
          <p className="text-sm">検索キーワードを入力してください</p>
        </div>
      )}
    </div>
  )
}
