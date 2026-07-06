type MatchReason = 'keyword' | 'vector' | 'both'

const BADGE_STYLES: Record<MatchReason, { label: string; className: string }> = {
  keyword: {
    label: 'キーワード一致',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  },
  vector: {
    label: '意味一致',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  },
  both: {
    label: 'キーワード＋意味',
    className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  },
}

function isMatchReason(value: string): value is MatchReason {
  return value === 'keyword' || value === 'vector' || value === 'both'
}

export default function MatchReasonBadge({ reason }: { reason?: string | null }) {
  if (!reason || !isMatchReason(reason)) return null

  const { label, className } = BADGE_STYLES[reason]

  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${className}`}>
      {label}
    </span>
  )
}
