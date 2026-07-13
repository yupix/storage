import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { apiClient } from '../api/client'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import hyperdriveLogo from '../components/img/hyperdrivelogo.png';

export const Route = createFileRoute('/register')({ component: RegisterPage })

function RegisterPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: apiError } = await apiClient.POST('/v1/auth/register', {
        body: { username, email, password },
      })

      if (apiError) {
        const msg = (apiError as { message?: string }).message
        setError(msg ?? '登録に失敗しました')
        return
      }

      await navigate({ to: '/login' })
    } catch {
      setError('登録に失敗しました。しばらく経ってから再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="bg-card text-card-foreground rounded-xl shadow-sm ring-1 ring-foreground/10 p-8">
          <div className="mb-8 text-center">
            <img className="header-logo" src={hyperdriveLogo} alt="HyperDrive Logo" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-medium">
                ユーザー名
              </label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yamada_taro"
                className="h-10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                メールアドレス
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                パスワード
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-10"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="mt-2 h-10 w-full">
              {loading ? '登録中...' : 'アカウントを作成'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            すでにアカウントをお持ちですか？{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              ログイン
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
