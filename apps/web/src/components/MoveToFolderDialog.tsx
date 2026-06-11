import { useState, useEffect, useCallback } from 'react'
import { Folder, FolderOpen, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { fetchFolders, moveFile, moveFolder } from '../lib/files'
import type { FolderItem } from '../lib/files'

interface TreeNode {
  folder: FolderItem
  depth: number
}

function flattenTree(
  folders: FolderItem[],
  expanded: Set<string>,
  childrenMap: Map<string, FolderItem[]>,
  excludeId: string | null,
  depth = 0,
): TreeNode[] {
  const result: TreeNode[] = []
  for (const folder of folders) {
    if (folder.id === excludeId) continue
    result.push({ folder, depth })
    if (expanded.has(folder.id)) {
      const subs = childrenMap.get(folder.id) ?? []
      result.push(...flattenTree(subs, expanded, childrenMap, excludeId, depth + 1))
    }
  }
  return result
}

interface Props {
  open: boolean
  fileId?: string | null
  folderId?: string | null
  onClose: () => void
  onMoved: () => void
}

export default function MoveToFolderDialog({ open, fileId, folderId, onClose, onMoved }: Props) {
  const [roots, setRoots] = useState<FolderItem[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [childrenMap, setChildrenMap] = useState<Map<string, FolderItem[]>>(new Map())
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set())
  const [rootLoading, setRootLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targetId = fileId ?? folderId ?? null

  useEffect(() => {
    if (!open) return
    let active = true
    setSelected(null)
    setExpanded(new Set())
    setChildrenMap(new Map())
    setError(null)
    setRootLoading(true)
    fetchFolders(null, 1, 100)
      .then((data) => { if (active) setRoots(data.folders) })
      .catch(() => { if (active) setError('フォルダー一覧の取得に失敗しました') })
      .finally(() => { if (active) setRootLoading(false) })
    return () => { active = false }
  }, [open])

  const toggle = useCallback((folder: FolderItem) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(folder.id)) {
        next.delete(folder.id)
        return next
      }
      next.add(folder.id)
      return next
    })

    setChildrenMap((prev) => {
      if (prev.has(folder.id)) return prev
      setLoadingSet((s) => new Set(s).add(folder.id))
      fetchFolders(folder.id, 1, 100)
        .then((data) => {
          setChildrenMap((m) => new Map(m).set(folder.id, data.folders))
        })
        .catch(() => {
          setChildrenMap((m) => new Map(m).set(folder.id, []))
        })
        .finally(() => {
          setLoadingSet((s) => { const n = new Set(s); n.delete(folder.id); return n })
        })
      return prev
    })
  }, [])

  const nodes = flattenTree(roots, expanded, childrenMap, folderId ?? null)

  const selectedName = selected === null
    ? 'マイドライブ'
    : (nodes.find((n) => n.folder.id === selected)?.folder.name ?? '選択したフォルダー')

  async function handleMove() {
    if (!targetId) return
    setMoving(true)
    setError(null)
    try {
      if (fileId) {
        await moveFile(fileId, selected)
      } else if (folderId) {
        await moveFolder(folderId, selected)
      }
      onMoved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setMoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移動先を選択</DialogTitle>
        </DialogHeader>

        <div className="min-h-32 max-h-72 overflow-y-auto rounded-md border border-border bg-muted/20 py-1 text-sm">
          {/* ルート */}
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded mx-1 cursor-pointer select-none ${
              selected === null ? 'bg-primary/15 text-primary' : 'hover:bg-muted'
            }`}
            onClick={() => setSelected(null)}
          >
            <span className="size-4 shrink-0" />
            {selected === null
              ? <FolderOpen className="size-4 shrink-0" />
              : <Folder className="size-4 shrink-0 text-muted-foreground" />
            }
            <span className="font-medium">マイドライブ</span>
          </div>

          {rootLoading && (
            <div className="flex items-center gap-2 px-4 py-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span className="text-xs">読み込み中...</span>
            </div>
          )}

          {nodes.map(({ folder, depth }) => {
            const isExpanded = expanded.has(folder.id)
            const isSelected = selected === folder.id
            const isLoading = loadingSet.has(folder.id)
            const loaded = childrenMap.has(folder.id)
            const hasChildren = !loaded || (childrenMap.get(folder.id)?.length ?? 0) > 0

            return (
              <div
                key={folder.id}
                style={{ paddingLeft: (depth + 1) * 16 + 4 }}
                className={`flex items-center gap-1 pr-2 py-0.5 rounded mx-1 cursor-pointer select-none ${
                  isSelected ? 'bg-primary/15 text-primary' : 'hover:bg-muted'
                }`}
                onClick={() => setSelected(folder.id)}
              >
                <button
                  type="button"
                  className="size-4 flex items-center justify-center shrink-0 rounded hover:bg-muted-foreground/20"
                  onClick={(e) => { e.stopPropagation(); toggle(folder) }}
                >
                  {isLoading
                    ? <Loader2 className="size-3 animate-spin" />
                    : hasChildren
                      ? isExpanded
                        ? <ChevronDown className="size-3.5" />
                        : <ChevronRight className="size-3.5" />
                      : null
                  }
                </button>
                {isSelected || isExpanded
                  ? <FolderOpen className="size-4 shrink-0" />
                  : <Folder className="size-4 shrink-0 text-muted-foreground" />
                }
                <span className="truncate">{folder.name}</span>
              </div>
            )
          })}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={moving}>キャンセル</Button>
          <Button onClick={handleMove} disabled={moving || !targetId}>
            {moving ? '移動中...' : `「${selectedName}」へ移動`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
