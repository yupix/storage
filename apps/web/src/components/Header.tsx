import { Link, useRouter } from '@tanstack/react-router'
import { LogOut, Search, Settings } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { useUser } from '../lib/user-context'
import { apiClient } from '../api/client'
import { Button } from './ui/button'
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

export default function Header() {
  const user = useUser()
  const router = useRouter()

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
    <header className="h-14 px-4 bg-background border-b border-border flex items-center gap-3">
      {/* ロゴ */}
      <Link to="/home" className="shrink-0 text-base font-bold tracking-tight hover:opacity-80 transition-opacity">
        HyperDrive
      </Link>

      {/* 検索 */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="検索"
          name="topSearch"
          className="w-full h-9 pl-9 pr-4 bg-muted rounded-lg border border-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring/30 transition-colors"
        />
      </div>

      {/* 右側アクション */}
      <div className="flex items-center gap-1 ml-auto">
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
              <DropdownMenuItem>
                <Settings className="mr-2 size-4" />
                設定
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
