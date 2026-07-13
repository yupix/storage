import { createFileRoute, redirect } from '@tanstack/react-router'

// ホームとマイドライブは役割が同一だったため /drive に一本化した。
// 既存のブックマークや旧リンク互換のため /home は /drive へリダイレクトする。
export const Route = createFileRoute('/_app/home')({
  beforeLoad: () => {
    throw redirect({ to: '/drive' })
  },
})
