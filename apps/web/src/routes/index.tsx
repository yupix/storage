import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import ToolbarDefault from '../components/ToolbarDefault'
import MainContentsDefault from '#/components/MainContents'
import { Home, Folder, Star, Trash2, Clock, Menu } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../components/ui/sheet'
import { fetchMyFiles, uploadFile } from '../lib/files'
import type { FileItem } from '../lib/files'

export const Route = createFileRoute('/')({ component: App })

const sidebarItems = [
  { icon: Home, label: 'ホーム' },
  { icon: Folder, label: 'マイドライブ' },
  { icon: Star, label: 'お気に入り' },
  { icon: Clock, label: '最近使用' },
  { icon: Trash2, label: 'ゴミ箱' },
]

function SidebarNav({ onItemClick }: { onItemClick?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {sidebarItems.map(({ icon: Icon, label }) => (
        <li key={label}>
          <button
            type="button"
            onClick={onItemClick}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm hover:bg-muted transition-colors text-left"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {label}
          </button>
        </li>
      ))}
    </ul>
  )
}

function App() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshFiles = useCallback(async () => {
    try {
      const data = await fetchMyFiles()
      setFiles(data.files)
    } catch {
      // エラー時はファイル一覧を空のままにする
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshFiles()
  }, [refreshFiles])

  const handleUploadClick = () => {
    setUploadError(null)
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected || selected.length === 0) return
    e.target.value = ''

    setUploading(true)
    setUploadError(null)

    const errors: string[] = []
    for (const file of Array.from(selected)) {
      try {
        await uploadFile(file)
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'エラー'}`)
      }
    }

    if (errors.length > 0) {
      setUploadError(errors.join('\n'))
    }

    setUploading(false)
    await refreshFiles()
  }

  return (
    <main className="px-2 sm:px-4 pb-8 bg-background min-h-[calc(100vh-4rem)]">
      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex gap-2 pt-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <nav className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 p-2">
            <SidebarNav />
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-0">
          <div className="flex items-center gap-1">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="md:hidden ml-1 my-2 shrink-0">
                  <Menu />
                  <span className="sr-only">メニュー</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left">
                <SheetHeader>
                  <SheetTitle>HyperDrive</SheetTitle>
                </SheetHeader>
                <div className="px-2">
                  <SidebarNav onItemClick={() => setSheetOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="flex-1 min-w-0">
              <ToolbarDefault onUpload={handleUploadClick} uploading={uploading} />
            </div>
          </div>

          {uploadError && (
            <p className="mx-1.5 mb-2 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2 whitespace-pre-line">
              {uploadError}
            </p>
          )}

          {uploading && (
            <p className="mx-1.5 mb-2 text-sm text-muted-foreground px-3 animate-pulse">
              アップロード中...
            </p>
          )}

          <div className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 mx-1.5 min-h-96">
            <MainContentsDefault
              files={files}
              loading={loading}
              onUpload={handleUploadClick}
            />
          </div>
        </div>
      </div>
    </main>
  )
}
