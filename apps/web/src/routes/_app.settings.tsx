import { createFileRoute, useRouter } from '@tanstack/react-router'
import { KeyRound, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react'
import { apiClient } from '../api/client'
import ThemeToggle from '../components/ThemeToggle'
import { Button } from '../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card'
import { useUser } from '../lib/user-context'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long' }).format(date)
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-all sm:text-right">{value}</span>
    </div>
  )
}

function SettingsPage() {
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

  if (!user) return null

  const initial = user.username.charAt(0).toUpperCase()

  return (
    <div className="mx-auto w-full max-w-2xl px-2 py-4 sm:px-4 sm:py-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">設定</h1>

      <div className="flex flex-col gap-4">
        {/* プロフィール */}
        <Card>
          <CardHeader>
            <CardTitle>プロフィール</CardTitle>
            <CardDescription>
              アカウントの基本情報です。編集機能は今後追加予定です。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground select-none">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{user.username}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t pt-4">
              <Field label="ユーザー名" value={user.username} />
              <Field label="メールアドレス" value={user.email} />
              <Field label="ユーザーID" value={<span className="font-mono text-xs">{user.id}</span>} />
              <Field label="登録日" value={formatDate(user.created_at)} />
              <Field
                label="アカウント状態"
                value={
                  user.is_suspended ? (
                    <span className="inline-flex items-center gap-1 text-destructive">
                      <ShieldAlert className="size-4" />
                      凍結中
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <ShieldCheck className="size-4" />
                      有効
                    </span>
                  )
                }
              />
              {user.is_suspended && user.freeze_reason ? (
                <Field label="凍結理由" value={user.freeze_reason} />
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* 外観 */}
        <Card>
          <CardHeader>
            <CardTitle>外観</CardTitle>
            <CardDescription>表示テーマを切り替えます。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">テーマ</p>
                <p className="text-sm text-muted-foreground">
                  ライトモードとダークモードを切り替えます。
                </p>
              </div>
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>

        {/* アカウント */}
        <Card>
          <CardHeader>
            <CardTitle>アカウント</CardTitle>
            <CardDescription>ログインとセキュリティに関する操作です。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">パスワード</p>
                <p className="text-sm text-muted-foreground">
                  パスワード変更は現在準備中です。
                </p>
              </div>
              {/* TODO(#48): パスワード変更 API 実装後に有効化する */}
              <Button variant="outline" size="sm" disabled>
                <KeyRound className="size-4" />
                変更
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div>
                <p className="text-sm font-medium">ログアウト</p>
                <p className="text-sm text-muted-foreground">
                  このデバイスからサインアウトします。
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleLogout}>
                <LogOut className="size-4" />
                ログアウト
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
