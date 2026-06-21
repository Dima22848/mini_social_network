import { existsSync, unlinkSync } from 'fs'
import { join, normalize } from 'path'

export function deleteUploadedFileByUrl(url: string | null | undefined) {
  if (!url || !url.startsWith('/uploads/')) return

  const relativePath = normalize(url.replace(/^\/uploads\//, ''))

  if (relativePath.startsWith('..') || relativePath.includes('..')) return

  const absolutePath = join(process.cwd(), 'uploads', relativePath)

  try {
    if (existsSync(absolutePath)) {
      unlinkSync(absolutePath)
    }
  } catch {
    // best-effort cleanup: file can already be removed or locked by OS
  }
}
