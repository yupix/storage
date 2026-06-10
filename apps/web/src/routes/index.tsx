import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import ToolbarDefault from '../components/ToolbarDefault'
import MainContentsDefault from '#/components/MainContents'
import { Home, Folder, Star, Trash2, Clock, Menu } from 'lucide-react'
import { Button } from '../components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet'

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

  return (
    <main className="px-2 sm:px-4 pb-8 bg-background min-h-[calc(100vh-4rem)]">
      <div className="flex gap-2 pt-2">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-52 shrink-0">
          <nav className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 p-2">
            <SidebarNav />
          </nav>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col gap-0">
          {/* Mobile: menu button + toolbar in one row */}
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
              <ToolbarDefault />
            </div>
          </div>

          <div className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 mx-1.5 min-h-96">
            <MainContentsDefault />
          </div>
        </div>
      </div>
    </main>
  )
}
