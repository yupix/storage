import { AlertCircle } from 'lucide-react'
import { Button } from '../../components/ui/button'
import {
  fetchFolder,
  fetchFolders,
  fetchMyFiles,
  fetchTrashFiles,
  fetchTrashFolders,
} from '../../lib/files'
import type { FileItem, FolderItem } from '../../lib/files'

export type WorkspaceView = 'grid' | 'list'
export type WorkspaceSort = 'name-asc' | 'name-desc' | 'updated_at-desc' | 'updated_at-asc' | 'size-desc' | 'size-asc'

export interface WorkspaceSearch {
  view?: WorkspaceView
  sort?: WorkspaceSort
}

export interface WorkspaceData {
  files: FileItem[]
  folders: FolderItem[]
  breadcrumb: { id: string | null; name: string }[]
}

const pendingItemIds = [
  'pending-1',
  'pending-2',
  'pending-3',
  'pending-4',
  'pending-5',
  'pending-6',
  'pending-7',
  'pending-8',
]

const VALID_SORTS: WorkspaceSort[] = ['name-asc', 'name-desc', 'updated_at-desc', 'updated_at-asc', 'size-desc', 'size-asc']

export function validateWorkspaceSearch(search: Record<string, unknown>): WorkspaceSearch {
  const result: WorkspaceSearch = {}
  if (search.view === 'list' || search.view === 'grid') result.view = search.view
  if (typeof search.sort === 'string' && (VALID_SORTS as string[]).includes(search.sort)) {
    result.sort = search.sort as WorkspaceSort
  }
  return result
}

export async function loadDrive(folderId: string | null = null): Promise<WorkspaceData> {
  const [fileData, folderData, breadcrumb] = await Promise.all([
    fetchMyFiles(1, 50, folderId),
    fetchFolders(folderId, 1, 100),
    loadBreadcrumb(folderId),
  ])

  return {
    files: fileData.files,
    folders: folderData.folders,
    breadcrumb,
  }
}

export async function loadFavorites(): Promise<WorkspaceData> {
  const [fileData, folderData] = await Promise.all([
    fetchMyFiles(1, 50, null, true),
    fetchFolders(null, 1, 100, true),
  ])
  return {
    files: fileData.files,
    folders: folderData.folders,
    breadcrumb: [{ id: null, name: 'お気に入り' }],
  }
}

export async function loadRecent(): Promise<WorkspaceData> {
  const fileData = await fetchMyFiles(1, 50)
  return {
    files: fileData.files,
    folders: [],
    breadcrumb: [{ id: null, name: '最近使用' }],
  }
}

export async function loadTrash(): Promise<WorkspaceData> {
  const [fileData, folderData] = await Promise.all([
    fetchTrashFiles(1, 50),
    fetchTrashFolders(1, 50),
  ])
  return {
    files: fileData.files,
    folders: folderData.folders,
    breadcrumb: [{ id: null, name: 'ゴミ箱' }],
  }
}

async function loadBreadcrumb(folderId: string | null) {
  const breadcrumb: WorkspaceData['breadcrumb'] = [{ id: null, name: 'マイドライブ' }]
  let currentId = folderId
  const ancestors: FolderItem[] = []

  while (currentId) {
    const folder = await fetchFolder(currentId)
    ancestors.push(folder)
    currentId = folder.folder_id ?? null
  }

  for (const folder of ancestors.reverse()) {
    breadcrumb.push({ id: folder.id, name: folder.name })
  }

  return breadcrumb
}

export function WorkspacePending() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-3">
      {pendingItemIds.map((id) => (
        <div key={id} className="rounded-xl bg-muted/50 animate-pulse h-36" />
      ))}
    </div>
  )
}

export function WorkspaceError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-64 flex flex-col items-center justify-center gap-3 text-center p-6">
      <AlertCircle className="size-8 text-destructive" />
      <div>
        <p className="font-medium">一覧を読み込めませんでした</p>
        <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
      </div>
      <Button variant="outline" onClick={reset}>再読み込み</Button>
    </div>
  )
}
