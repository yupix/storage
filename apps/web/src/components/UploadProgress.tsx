import { X, Check, AlertCircle, Loader2, File, CloudUpload } from 'lucide-react'
import { Button } from './ui/button'
import type { UploadItem } from '../lib/files'

interface UploadProgressProps {
  items: UploadItem[]
  onClose: () => void
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-200"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export default function UploadProgress({ items, onClose }: UploadProgressProps) {
  if (items.length === 0) return null

  const uploadingCount = items.filter((i) => i.status === 'uploading').length
  const doneCount = items.filter((i) => i.status === 'done').length
  const errorCount = items.filter((i) => i.status === 'error').length
  const overallProgress = Math.round(
    items.reduce((sum, i) => sum + i.progress, 0) / items.length,
  )
  const allSettled = uploadingCount === 0

  return (
    <>
      {/* ── Desktop: 右下固定パネル (sm以上) ── */}
      <div className="hidden sm:flex fixed bottom-4 right-4 z-50 w-80 flex-col rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 text-sm font-medium">
            {allSettled ? (
              errorCount > 0 ? (
                <AlertCircle className="size-4 text-destructive" />
              ) : (
                <Check className="size-4 text-green-500" />
              )
            ) : (
              <CloudUpload className="size-4 text-primary animate-bounce" />
            )}
            {allSettled
              ? errorCount > 0
                ? `${errorCount}件失敗`
                : 'アップロード完了'
              : `アップロード中 ${doneCount}/${items.length}`}
          </div>
          {allSettled && (
            <Button variant="ghost" size="icon-xs" onClick={onClose}>
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        {/* File list */}
        <ul className="max-h-72 overflow-y-auto divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              {/* Thumbnail or icon */}
              <div className="size-10 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                {item.preview ? (
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <File className="size-5 text-muted-foreground" />
                )}
              </div>

              {/* Name + progress */}
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <p className="text-xs font-medium truncate">{item.file.name}</p>
                {item.status === 'error' ? (
                  <p className="text-xs text-destructive truncate">{item.error}</p>
                ) : (
                  <ProgressBar value={item.progress} />
                )}
              </div>

              {/* Status icon */}
              <div className="shrink-0 size-5 flex items-center justify-center">
                {item.status === 'uploading' && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                )}
                {item.status === 'done' && (
                  <Check className="size-4 text-green-500" />
                )}
                {item.status === 'error' && (
                  <AlertCircle className="size-4 text-destructive" />
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Overall progress bar while uploading */}
        {!allSettled && (
          <div className="px-4 py-2 border-t border-border">
            <ProgressBar value={overallProgress} />
            <p className="text-xs text-muted-foreground mt-1 text-right">{overallProgress}%</p>
          </div>
        )}
      </div>

      {/* ── Mobile: 下部固定バー (sm未満) ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-popover border-t border-border px-4 py-3 flex items-center gap-3">
        {allSettled ? (
          errorCount > 0 ? (
            <AlertCircle className="size-5 text-destructive shrink-0" />
          ) : (
            <Check className="size-5 text-green-500 shrink-0" />
          )
        ) : (
          <Loader2 className="size-5 animate-spin text-primary shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {allSettled
              ? errorCount > 0
                ? `${errorCount}件失敗 / ${doneCount}件完了`
                : `${doneCount}件のアップロード完了`
              : `${items.length}件アップロード中...`}
          </p>
          {!allSettled && (
            <ProgressBar value={overallProgress} />
          )}
        </div>

        <span className="text-sm font-semibold tabular-nums text-muted-foreground shrink-0">
          {overallProgress}%
        </span>

        {allSettled && (
          <Button variant="ghost" size="icon-xs" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </>
  )
}
