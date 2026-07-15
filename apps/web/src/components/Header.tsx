import { Link, useRouter } from '@tanstack/react-router'
import { LogOut, Search, Settings, Share2 } from 'lucide-react'
import { useRef } from 'react'
import ThemeToggle from './ThemeToggle'
import { useUser } from '../lib/user-context'
import { apiClient } from '../api/client'
import { Button } from './ui/button'
import logoLight from './img/hyperdrivelogo.png';
import logoDark from './img/hyperdrivelogo-dark.png';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from './ui/dropdown-menu'

function UserAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold select-none">
      {initial}
    </span>
  )
}

interface HeaderProps {
  navigationTrigger?: React.ReactNode
}

export default function Header({ navigationTrigger }: HeaderProps) {
  const user = useUser()
  const router = useRouter()
  const searchRef = useRef<HTMLInputElement>(null)

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchRef.current?.value.trim()
    if (q) {
      router.navigate({ to: '/search', search: { q } })
    }
  }

  const handleLogout = async () => {
    try {
      await apiClient.POST('/v1/auth/logout')
    } catch {
      // ネットワークエラーでもクライアント状態はリセットする
    } finally {
      router.invalidate()
    }
  }

  return (
    <header className="h-14 px-2 sm:px-4 bg-background border-b border-border flex items-center gap-2">
      {navigationTrigger}

      {/* ロゴ: デスクトップではサイドバー幅(w-52)に揃え、検索バーの左端が
          下のツールバー・メインコンテンツと一致するようにする */}
      <Link to="/drive" className="shrink-0 md:w-52 text-base font-bold tracking-tight hover:opacity-80 transition-opacity">
      <img
        className="header-logo dark:hidden h-13 ml-3"
        src={logoLight}
        alt="HyperDrive Logo"
      />
      <img
          className="header-logo hidden dark:block h-13 ml-3"
          src={logoDark}
          alt="HyperDrive Logo"
      />
      </Link>

      {/* 検索 */}
      <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          ref={searchRef}
          type="search"
          placeholder="ファイル名・画像内テキストで検索"
          className="w-full h-9 pl-9 pr-4 bg-muted rounded-lg border border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring/30 transition-colors"
        />
      </form>

      {/* 右側アクション */}
      <div className="flex items-center gap-1 ml-auto">
        <Button asChild variant="ghost" size="icon-sm" title="合言葉で共有・受信">
          <Link to="/watchword" search={{ tab: 'share' }}>
            <Share2 />
          </Link>
        </Button>
        <ThemeToggle />

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="rounded-full p-0 size-9">
                <UserAvatar name={user.username} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user.username}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email ?? ''}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="mr-2 size-4" />
                  設定
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
                <LogOut className="mr-2 size-4" />
                ログアウト
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm">
            <Link to="/login">ログイン</Link>
          </Button>
        )}
      </div>
    </header>
  )
}
