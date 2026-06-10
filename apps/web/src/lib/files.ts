export interface FileItem {
  id: string
  name: string
  size: number
  updated_at: string
  sender_id: string
}

export interface PaginatedFiles {
  files: FileItem[]
  total: number
  page: number
  limit: number
}

export async function fetchMyFiles(page = 1, limit = 50): Promise<PaginatedFiles> {
  const res = await fetch(`/v1/files/mine?page=${page}&limit=${limit}`)
  if (!res.ok) throw new Error('ファイル一覧の取得に失敗しました')
  return res.json()
}

export async function uploadFile(file: File, folderId?: string): Promise<FileItem> {
  const form = new FormData()
  form.append('file', file)
  if (folderId) form.append('folder_id', folderId)
  const res = await fetch('/v1/files/', { method: 'POST', body: form })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { message?: string }).message ?? 'アップロードに失敗しました')
  }
  return res.json() as Promise<FileItem>
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
