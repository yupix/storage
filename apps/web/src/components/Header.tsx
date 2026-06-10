import { Link, useRouter } from '@tanstack/react-router'
import { LogOut, User } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { useUser } from '../lib/user-context'
import { apiClient } from '../api/client'

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
    <header className="px-4 py-2 bg-background border-b border-border">
      <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
        <h2 className="m-0 text-base font-semibold tracking-tight">
          <Link to="/" className="inline-flex items-center">
            HyperDrive
          </Link>
        </h2>

        <input
          type="text"
          placeholder="検索"
          name="topSearch"
          className="flex-1 min-w-0 max-w-md h-10 px-4 bg-muted rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
        />

        <div className="flex items-center gap-2 ml-auto">
          <a
            href=""
            className="hidden sm:inline-flex bg-blue-500 px-4 py-2 rounded-lg text-white text-sm font-semibold duration-300 hover:bg-blue-600"
          >
            合言葉受信
          </a>

          {user && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="size-4" />
                {user.username}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 bg-muted hover:bg-muted/80 px-3 py-2 rounded-lg text-sm font-medium duration-300"
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          )}

          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
