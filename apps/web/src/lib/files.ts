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

export async function fetchFolders(
  folderId?: string | null,
  page = 1,
  limit = 100,
  isFavorite?: boolean,
): Promise<PaginatedFolders> {
  const { data, error } = await apiClient.GET('/v1/folders', {
    params: {
      query: {
        page,
        limit,
        ...(folderId ? { folder_id: folderId } : {}),
        ...(isFavorite === true ? { is_favorite: true } : {}),
      },
    },
  })
  if (error || !data) throw new Error('フォルダー一覧の取得に失敗しました')
  return data
}

export async function fetchFolder(id: string): Promise<FolderItem> {
  const { data, error } = await apiClient.GET('/v1/folders/{id}', {
    params: { path: { id } },
  })
  if (error || !data) throw new Error('フォルダー情報の取得に失敗しました')
  return data
}

export async function createFolder(name: string, folderId?: string | null): Promise<FolderItem> {
  const { data, error } = await apiClient.POST('/v1/folders', {
    body: { name, ...(folderId ? { folder_id: folderId } : {}) },
  })
  if (error || !data) throw new Error('フォルダーの作成に失敗しました')
  return data
}

export async function deleteFolder(id: string, toHome = false): Promise<void> {
  const { error } = await apiClient.DELETE('/v1/folders/{id}', {
    params: { path: { id }, query: { to_home: toHome } },
  })
  if (error) throw new Error('フォルダーの削除に失敗しました')
}

export async function renameFolder(id: string, name: string): Promise<FolderItem> {
  const { data, error } = await apiClient.PATCH('/v1/folders/{id}', {
    params: { path: { id } },
    body: { name },
  })
  if (error || !data) throw new Error('フォルダー名の変更に失敗しました')
  return data
}

export async function moveFolder(id: string, folderId: string | null): Promise<FolderItem> {
  const { data, error } = await apiClient.PATCH('/v1/folders/{id}', {
    params: { path: { id } },
    body: { folder_id: folderId },
  })
  if (error || !data) throw new Error('フォルダーの移動に失敗しました')
  return data
}

export async function toggleFolderFavorite(id: string, isFavorite: boolean): Promise<FolderItem> {
  const { data, error } = await apiClient.PATCH('/v1/folders/{id}', {
    params: { path: { id } },
    body: { is_favorite: isFavorite },
  })
  if (error || !data) throw new Error('フォルダーのお気に入り更新に失敗しました')
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

export async function fetchTrashFiles(page = 1, limit = 50): Promise<PaginatedFiles> {
  const { data, error } = await apiClient.GET('/v1/files/trash', {
    params: { query: { page, limit } },
  })
  if (error || !data) throw new Error('ゴミ箱ファイル一覧の取得に失敗しました')
  return data
}

export async function restoreFile(id: string): Promise<FileItem> {
  const { data, error } = await apiClient.POST('/v1/files/trash/{id}/restore', {
    params: { path: { id } },
  })
  if (error || !data) throw new Error('ファイルの復元に失敗しました')
  return data
}

export async function fetchTrashFolders(page = 1, limit = 50): Promise<PaginatedFolders> {
  const { data, error } = await apiClient.GET('/v1/folders/trash', {
    params: { query: { page, limit } },
  })
  if (error || !data) throw new Error('ゴミ箱フォルダー一覧の取得に失敗しました')
  return data
}

export async function restoreFolder(id: string): Promise<void> {
  const { error } = await apiClient.POST('/v1/folders/trash/{id}/restore', {
    params: { path: { id } },
  })
  if (error) throw new Error('フォルダーの復元に失敗しました')
}

export async function permanentDeleteFolder(id: string): Promise<void> {
  const { error } = await apiClient.DELETE('/v1/folders/trash/{id}', {
    params: { path: { id } },
  })
  if (error) throw new Error('フォルダーの完全削除に失敗しました')
}

export async function permanentDeleteFile(id: string): Promise<void> {
  const { error } = await apiClient.DELETE('/v1/files/trash/{id}', {
    params: { path: { id } },
  })
  if (error) throw new Error('ファイルの完全削除に失敗しました')
}

export async function searchFiles(
  q: string,
  page = 1,
  limit = 50,
): Promise<PaginatedFiles> {
  const res = await fetch(
    `/v1/files/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`,
  )
  if (!res.ok) throw new Error('検索に失敗しました')
  return res.json() as Promise<PaginatedFiles>
}

export async function emptyTrash(): Promise<void> {
  const [filesResult, foldersResult] = await Promise.allSettled([
    apiClient.DELETE('/v1/files/trash', {}),
    apiClient.DELETE('/v1/folders/trash', {}),
  ])
  if (
    (filesResult.status === 'fulfilled' && filesResult.value.error) ||
    (foldersResult.status === 'fulfilled' && foldersResult.value.error) ||
    filesResult.status === 'rejected' ||
    foldersResult.status === 'rejected'
  ) {
    throw new Error('ゴミ箱を空にするのに失敗しました')
  }
}

export async function downloadFile(id: string, name: string): Promise<void> {
  const res = await fetch(`/v1/files/${id}/view`)
  if (!res.ok) throw new Error('ダウンロードに失敗しました')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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
