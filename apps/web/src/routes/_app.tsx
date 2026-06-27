import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { Clock, Download, Folder, Home, Menu, Share2, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { Button } from '../components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
})

const navigation = [
  { to: '/home', label: 'ホーム', icon: Home },
  { to: '/drive', label: 'マイドライブ', icon: Folder },
  { to: '/share', label: '合言葉共有', icon: Share2 },
  { to: '/receive', label: '合言葉受信', icon: Download },
  { to: '/favorites', label: 'お気に入り', icon: Star },
  { to: '/recent', label: '最近使用', icon: Clock },
  { to: '/trash', label: 'ゴミ箱', icon: Trash2 },
] as const

function SidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {navigation.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <Link
            to={to}
            onClick={onNavigate}
            activeOptions={{ exact: to !== '/drive' }}
            activeProps={{ className: 'bg-muted font-medium' }}
            inactiveProps={{ className: 'hover:bg-muted' }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            {label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <Header
          navigationTrigger={(
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden shrink-0">
                <Menu />
                <span className="sr-only">メニュー</span>
              </Button>
            </SheetTrigger>
          )}
        />
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>HyperDrive</SheetTitle>
          </SheetHeader>
          <div className="px-2">
            <SidebarNavigation onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <main className="px-2 sm:px-4 pb-8 bg-background min-h-[calc(100vh-4rem)]">
        <div className="flex gap-2 pt-2">
          <aside className="hidden md:block w-52 shrink-0">
            <nav className="bg-card text-card-foreground rounded-xl ring-1 ring-foreground/10 p-2">
              <SidebarNavigation />
            </nav>
          </aside>

          <div className="flex-1 min-w-0">
            <Outlet />
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
