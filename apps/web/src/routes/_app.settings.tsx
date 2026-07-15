import { createFileRoute, useRouter } from '@tanstack/react-router'
import { KeyRound, LogOut, Pencil, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
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
import { Input } from '../components/ui/input'
import { useUser } from '../lib/user-context'

export const Route = createFileRoute('/_app/settings')({
  component: SettingsPage,
})

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  // SSR とクライアントでタイムゾーンが食い違うとハイドレーション不一致になるため固定する
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(date)
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-all sm:text-right">{value}</span>
    </div>
  )
}

const errorClass = 'text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2'

function SettingsPage() {
  const user = useUser()
  const router = useRouter()

  // プロフィール編集
  const [editingProfile, setEditingProfile] = useState(false)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  // パスワード変更
  const [changingPassword, setChangingPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordDone, setPasswordDone] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)

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

  const startEditProfile = () => {
    setUsername(user.username)
    setEmail(user.email)
    setProfileError(null)
    setEditingProfile(true)
  }

  const handleSaveProfile = async () => {
    setProfileError(null)
    const body: { username?: string; email?: string } = {}
    if (username !== user.username) body.username = username
    if (email !== user.email) body.email = email
    if (Object.keys(body).length === 0) {
      setEditingProfile(false)
      return
    }
    setProfileSaving(true)
    try {
      const { error } = await apiClient.PATCH('/v1/users/me', { body })
      if (error) {
        setProfileError((error as { message?: string }).message ?? 'プロフィールの更新に失敗しました')
        return
      }
      await router.invalidate()
      setEditingProfile(false)
    } catch {
      setProfileError('プロフィールの更新に失敗しました')
    } finally {
      setProfileSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordError(null)
    setPasswordSaving(true)
    try {
      const { error } = await apiClient.PUT('/v1/users/me/password', {
        body: { current_password: currentPassword, new_password: newPassword },
      })
      if (error) {
        setPasswordError((error as { message?: string }).message ?? 'パスワードの変更に失敗しました')
        return
      }
      setPasswordDone(true)
      setCurrentPassword('')
      setNewPassword('')
      setChangingPassword(false)
    } catch {
      setPasswordError('パスワードの変更に失敗しました')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-2 py-4 sm:px-4 sm:py-6">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">設定</h1>

      <div className="flex flex-col gap-4">
        {/* プロフィール */}
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <div className="space-y-1.5">
              <CardTitle>プロフィール</CardTitle>
              <CardDescription>アカウントの基本情報です。</CardDescription>
            </div>
            {!editingProfile && (
              <Button variant="outline" size="sm" onClick={startEditProfile}>
                <Pencil className="size-4" />
                編集
              </Button>
            )}
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

            {editingProfile ? (
              <div className="flex flex-col gap-3 border-t pt-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="edit-username" className="text-sm font-medium">
                    ユーザー名
                  </label>
                  <Input
                    id="edit-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                  <p className="text-xs text-muted-foreground">3文字以上</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="edit-email" className="text-sm font-medium">
                    メールアドレス
                  </label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                {profileError && <p className={errorClass}>{profileError}</p>}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingProfile(false)}
                    disabled={profileSaving}
                  >
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveProfile}
                    disabled={profileSaving || username.trim().length < 3}
                  >
                    {profileSaving ? '保存中...' : '保存'}
                  </Button>
                </div>
              </div>
            ) : (
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
            )}
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
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">パスワード</p>
                  <p className="text-sm text-muted-foreground">
                    {passwordDone ? 'パスワードを変更しました。' : 'パスワードを変更します。'}
                  </p>
                </div>
                {!changingPassword && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setChangingPassword(true)
                      setPasswordDone(false)
                      setPasswordError(null)
                    }}
                  >
                    <KeyRound className="size-4" />
                    変更
                  </Button>
                )}
              </div>

              {changingPassword && (
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="current-password" className="text-sm font-medium">
                      現在のパスワード
                    </label>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="new-password" className="text-sm font-medium">
                      新しいパスワード
                    </label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">8文字以上</p>
                  </div>
                  {passwordError && <p className={errorClass}>{passwordError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setChangingPassword(false)}
                      disabled={passwordSaving}
                    >
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleChangePassword}
                      disabled={
                        passwordSaving || currentPassword.length < 8 || newPassword.length < 8
                      }
                    >
                      {passwordSaving ? '変更中...' : '変更する'}
                    </Button>
                  </div>
                </div>
              )}
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
