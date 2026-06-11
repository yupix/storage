import { apiClient } from '../api/client'
import type { components } from '../api/schema'

export type FileItem = components['schemas']['FileResponse']
export type FileDetail = components['schemas']['FileDetailResponse']
export type FolderItem = components['schemas']['FolderResponse']

export interface PaginatedFiles {
  files: FileItem[]
  total: number
  page: number
  limit: number
}

export interface PaginatedFolders {
  folders: FolderItem[]
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

export async function fetchMyFiles(
  page = 1,
  limit = 50,
  folderId?: string | null,
  isFavorite?: boolean,
): Promise<PaginatedFiles> {
  const { data, error } = await apiClient.GET('/v1/files/mine', {
    params: {
      query: {
        page,
        limit,
        ...(folderId ? { folder_id: folderId } : {}),
        ...(isFavorite !== undefined ? { is_favorite: isFavorite } : {}),
      },
    },
  })
  if (error || !data) throw new Error('ファイル一覧の取得に失敗しました')
  return data
}

export async function fetchFolders(folderId?: string | null, page = 1, limit = 100): Promise<PaginatedFolders> {
  const { data, error } = await apiClient.GET('/v1/folders', {
    params: { query: { page, limit, ...(folderId ? { folder_id: folderId } : {}) } },
  })
  if (error || !data) throw new Error('フォルダー一覧の取得に失敗しました')
  return data
}

export async function createFolder(name: string, folderId?: string | null): Promise<FolderItem> {
  const { data, error } = await apiClient.POST('/v1/folders', {
    body: { name, ...(folderId ? { folder_id: folderId } : {}) },
  })
  if (error || !data) throw new Error('フォルダーの作成に失敗しました')
  return data
}

export async function moveFile(fileId: string, folderId: string | null): Promise<void> {
  const { error } = await apiClient.PATCH('/v1/files/{id}', {
    params: { path: { id: fileId } },
    body: { folder_id: folderId },
  })
  if (error) throw new Error('ファイルの移動に失敗しました')
}

export async function renameFile(id: string, name: string): Promise<FileItem> {
  const { data, error } = await apiClient.PATCH('/v1/files/{id}', {
    params: { path: { id } },
    body: { filename: name },
  })
  if (error || !data) throw new Error('ファイル名の変更に失敗しました')
  return data
}

export async function toggleFavorite(id: string, isFavorite: boolean): Promise<FileItem> {
  const { data, error } = await apiClient.PATCH('/v1/files/{id}', {
    params: { path: { id } },
    body: { is_favorite: isFavorite },
  })
  if (error || !data) throw new Error('お気に入りの更新に失敗しました')
  return data
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
  const { data, error } = await apiClient.GET('/v1/files/{id}', {
    params: { path: { id } },
  })
  if (error || !data) throw new Error('ファイル情報の取得に失敗しました')
  return { ...data, url: toProxiedUrl(data.url) }
}

export async function deleteFile(id: string): Promise<void> {
  const { error } = await apiClient.DELETE('/v1/files/{id}', {
    params: { path: { id } },
  })
  if (error) throw new Error('ファイルの削除に失敗しました')
}

export function downloadFile(id: string, name: string): void {
  const a = document.createElement('a')
  a.href = `/v1/files/${id}/view`
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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
