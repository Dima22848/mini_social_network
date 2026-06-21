const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '')

export function getAssetUrl(url: string | null | undefined) {
  if (!url) {
    return undefined
  }

  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url
  }

  if (url.startsWith('/')) {
    return `${API_ORIGIN}${url}`
  }

  return url
}

export function getProfileHref(username: string | null | undefined, currentUsername?: string | null) {
  if (!username) {
    return '/profile'
  }

  if (currentUsername && username === currentUsername) {
    return '/profile'
  }

  return `/profile/${encodeURIComponent(username)}`
}

export function formatFileSize(sizeBytes: number | null | undefined) {
  if (!sizeBytes) {
    return 'Размер неизвестен'
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
}

export async function downloadAsset(url: string, filename: string) {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Не удалось скачать файл')
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename || 'download'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)
}
