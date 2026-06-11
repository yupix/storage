export interface FileItem {
  id: string
  name: string
  size: number
  updated_at: string
  sender_id: string
}

export interface FileDetail extends FileItem {
  file_type: string
  url: string
  url_expires_in: number
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

// /v1/ パスの絶対 URL をフロントエンド経由の相対パスに変換する。
// Coder 等の環境では API ポートに直接アクセスできないため、
// TanStack Start のサーバーハンドラーを経由してプロキシする。
// S3 の署名付き URL（外部ドメイン）はそのまま返す。
function toProxiedUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.pathname.startsWith('/v1/')) return parsed.pathname + parsed.search
  } catch { /* ignore */ }
  return url
}

export async function fetchFileDetail(id: string): Promise<FileDetail> {
  const res = await fetch(`/v1/files/${id}`)
  if (!res.ok) throw new Error('ファイル情報の取得に失敗しました')
  const data = await res.json() as FileDetail
  return { ...data, url: toProxiedUrl(data.url) }
}

export async function deleteFile(id: string): Promise<void> {
  const res = await fetch(`/v1/files/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('ファイルの削除に失敗しました')
}

export function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number) => void,
  folderId?: string,
): Promise<FileItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    if (folderId) form.append('folder_id', folderId)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/v1/files')

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        try {
          resolve(JSON.parse(xhr.responseText) as FileItem)
        } catch {
          reject(new Error('レスポンスの解析に失敗しました'))
        }
      } else {
        let message = 'アップロードに失敗しました'
        try {
          const data = JSON.parse(xhr.responseText) as { message?: string }
          if (data.message) message = data.message
        } catch { /* ignore */ }
        reject(new Error(message))
      }
    })

    xhr.addEventListener('error', () => reject(new Error('ネットワークエラーが発生しました')))
    xhr.addEventListener('abort', () => reject(new Error('アップロードがキャンセルされました')))

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
