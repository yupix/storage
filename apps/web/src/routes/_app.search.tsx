import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { FileIcon, defaultStyles } from 'react-file-icon'
import type { FileIconProps } from 'react-file-icon'
import { searchFiles, formatFileSize } from '../lib/files'
import type { FileItem } from '../lib/files'

interface SearchSearch {
  q?: string
}

export const Route = createFileRoute('/_app/search')({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): SearchSearch => ({
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
  const navigate = Route.useNavigate()
  const [inputValue, setInputValue] = useState(q)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (trimmed) {
      navigate({ search: { q: trimmed } })
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <form onSubmit={handleSubmit} className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="ファイル名・画像内テキストで検索"
          className="w-full h-10 pl-9 pr-4 bg-muted rounded-lg border border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring/30 transition-colors"
          autoFocus
        />
      </form>

      {q && (
        <p className="text-sm text-muted-foreground">
          「{q}」の検索結果 {total} 件
        </p>
      )}

      {files.length > 0 ? (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <ul className="divide-y divide-border">
            {files.map((file) => (
              <SearchResultItem key={file.id} file={file} />
            ))}
          </ul>
        </div>
      ) : q ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <Search className="size-10 opacity-30" />
          <p className="text-sm">一致するファイルが見つかりませんでした</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <Search className="size-10 opacity-30" />
          <p className="text-sm">検索キーワードを入力してください</p>
        </div>
      )}
    </div>
  )
}

function FileTypeIcon({ name, size = 36 }: { name: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const style = (defaultStyles as Record<string, FileIconProps>)[ext] ?? {}
  return (
    <div style={{ width: size, height: size }}>
      <FileIcon extension={ext} {...style} />
    </div>
  )
}

function SearchResultItem({ file }: { file: FileItem }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="shrink-0">
        <FileTypeIcon name={file.name} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(file.size)} · {file.updated_at ? new Date(file.updated_at).toLocaleDateString('ja-JP') : ''}
        </p>
      </div>
    </li>
  )
}
