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

export function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  folderId?: string,
): Promise<FileItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const form = new FormData()
    form.append('file', file)
    if (folderId) form.append('folder_id', folderId)

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as FileItem)
        } catch {
          reject(new Error('レスポンスの解析に失敗しました'))
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText) as { message?: string }
          reject(new Error(data.message ?? 'アップロードに失敗しました'))
        } catch {
          reject(new Error('アップロードに失敗しました'))
        }
      }
    })

    xhr.addEventListener('error', () => reject(new Error('ネットワークエラーが発生しました')))
    xhr.addEventListener('abort', () => reject(new Error('キャンセルされました')))

    xhr.open('POST', '/v1/files')
    xhr.send(form)
  })
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
