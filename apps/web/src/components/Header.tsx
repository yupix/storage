import { Link, useRouter } from '@tanstack/react-router'
import { LogOut, User } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import { useUser } from '../lib/user-context'
import { apiClient } from '../api/client'

export default function Header() {
  const user = useUser()
  const router = useRouter()

  const handleLogout = async () => {
    await apiClient.POST('/v1/auth/logout')
    router.invalidate()
  }

  return (
    <header className="p-4 bg-[#ededed]">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 text-base font-semibold tracking-tight">
          <Link to="/" className="inline-flex items-center">
            HyperDrive
          </Link>
        </h2>

        <input
          type="text"
          placeholder="検索"
          name="topSearch"
          className="justify-center m-auto w-128 h-10 p-4 bg-white rounded-lg border border-gray-300"
        />

        <div className="header-buttons flex items-center gap-3">
          <a
            href=""
            className="bg-blue-500 mr-5 px-5 py-3 rounded-lg text-white font-semibold duration-300 hover:bg-blue-600"
          >
            合言葉受信
          </a>

          {user && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-sm text-gray-700">
                <User className="size-4" />
                {user.username}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 bg-gray-200 hover:bg-gray-300 px-3 py-2 rounded-lg text-sm font-medium duration-300"
              >
                <LogOut className="size-4" />
                ログアウト
              </button>
            </div>
          )}

          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
