import { createFileRoute, redirect } from '@tanstack/react-router'

// 合言葉の共有・受信は /watchword に統合した。互換のため /receive は
// /watchword?tab=receive へリダイレクトする。
export const Route = createFileRoute('/_app/receive')({
  beforeLoad: () => {
    throw redirect({ to: '/watchword', search: { tab: 'receive' } })
  },
})
