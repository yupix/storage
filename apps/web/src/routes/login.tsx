import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { apiClient } from '../api/client'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import logoLight from '../components/img/hyperdrivelogo.png';
import logoDark from '../components/img/hyperdrivelogo-dark.png';


export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const { error: apiError } = await apiClient.POST('/v1/auth/login', {
        body: { email, password },
      })

      if (apiError) {
        const msg = (apiError as { message?: string }).message
        setError(msg ?? 'メールアドレスまたはパスワードが正しくありません')
        return
      }

      await router.invalidate()
    } catch {
      setError('ログインに失敗しました。しばらく経ってから再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="bg-card text-card-foreground rounded-xl shadow-sm ring-1 ring-foreground/10 p-8">
          <div className="mb-8 text-center">
            <img 
              className="header-logo dark:hidden" 
              src={logoLight} 
              alt="HyperDrive Logo" 
            />
            <img 
                className="header-logo hidden dark:block" 
                src={logoDark} 
                alt="HyperDrive Logo" 
            />
            {/* <p className="mt-2 text-sm text-muted-foreground">
              アカウントにログイン
            </p> */}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                autoComplete="current-password"
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
              {loading ? 'ログイン中...' : 'ログイン'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            アカウントをお持ちでないですか？{' '}
            <Link to="/register" className="text-primary font-medium hover:underline">
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
