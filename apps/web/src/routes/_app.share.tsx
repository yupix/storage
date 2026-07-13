import { createFileRoute, redirect } from '@tanstack/react-router'

// 合言葉の共有・受信は /watchword に統合した。互換のため /share は
// /watchword?tab=share へリダイレクトする。
export const Route = createFileRoute('/_app/share')({
  beforeLoad: () => {
    throw redirect({ to: '/watchword', search: { tab: 'share' } })
  },
})
