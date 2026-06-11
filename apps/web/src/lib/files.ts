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

export interface UploadItem {
  id: string
  file: File
  preview: string | null
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

export async function fetchMyFiles(page = 1, limit = 50): Promise<PaginatedFiles> {
  const res = await fetch(`/v1/files/mine?page=${page}&limit=${limit}`)
  if (!res.ok) throw new Error('ファイル一覧の取得に失敗しました')
  return res.json()
}

export async function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  folderId?: string,
): Promise<FileItem> {
  const form = new FormData()
  form.append('file', file)
  if (folderId) form.append('folder_id', folderId)

  onProgress(0)

  const res = await fetch('/v1/files', { method: 'POST', body: form })

  if (!res.ok) {
    let message = 'アップロードに失敗しました'
    try {
      const data = await res.json() as { message?: string }
      if (data.message) message = data.message
    } catch { /* ignore */ }
    throw new Error(message)
  }

  onProgress(100)
  return res.json() as Promise<FileItem>
}

export function createUploadItem(file: File): UploadItem {
  return {
    id: crypto.randomUUID(),
    file,
    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    progress: 0,
    status: 'uploading',
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
