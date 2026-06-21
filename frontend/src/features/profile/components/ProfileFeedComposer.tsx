'use client'

import { ChangeEvent, useRef, useState } from 'react'
import {
  Archive,
  FileText,
  ImageIcon,
  Loader2,
  Music,
  Trash2,
  Video,
} from 'lucide-react'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import {
  useCreatePostMutation,
  useUploadPostFileMutation,
} from '@/features/social/api/social.queries'
import type {
  CreatePostAttachmentPayload,
  FeedPost,
  PostFileType,
} from '@/features/social/types/social.types'
import { formatFileSize, getAssetUrl } from '@/shared/utils/assets'

type ProfileFeedComposerProps = {
  onPostCreated?: (post: FeedPost) => void
}

type LocalAttachment = CreatePostAttachmentPayload & {
  localId: string
}

function getFileType(file: File): PostFileType {
  if (file.type.startsWith('image/')) return 'IMAGE'
  if (file.type.startsWith('video/')) return 'VIDEO'
  if (file.type.startsWith('audio/')) return 'AUDIO'

  const lowerName = file.name.toLowerCase()

  if (/\.(zip|rar|7z|tar|gz)$/.test(lowerName)) {
    return 'ARCHIVE'
  }

  return 'FILE'
}

export function ProfileFeedComposer({ onPostCreated }: ProfileFeedComposerProps) {
  const { user } = useAuth()
  const createPostMutation = useCreatePostMutation()
  const uploadPostFileMutation = useUploadPostFileMutation()

  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const archiveInputRef = useRef<HTMLInputElement | null>(null)

  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState<LocalAttachment[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])

    event.target.value = ''

    if (files.length === 0) {
      return
    }

    try {
      setErrorMessage(null)

      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const type = getFileType(file)
          const uploaded = await uploadPostFileMutation.mutateAsync({ file, type })

          return {
            ...uploaded,
            localId: crypto.randomUUID(),
          } satisfies LocalAttachment
        }),
      )

      setAttachments((prev) => [...prev, ...uploadedFiles].slice(0, 10))
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Не удалось загрузить файл',
      )
    }
  }

  function removeAttachment(localId: string) {
    setAttachments((prev) => prev.filter((item) => item.localId !== localId))
  }

  async function publishPost() {
    const trimmedContent = content.trim()

    if (!trimmedContent && attachments.length === 0) {
      setErrorMessage('Добавьте текст или вложение.')
      return
    }

    try {
      setErrorMessage(null)

      const createdPost = await createPostMutation.mutateAsync({
        content: trimmedContent,
        attachments: attachments.map(({ localId: _localId, ...attachment }) => attachment),
      })

      setContent('')
      setAttachments([])
      onPostCreated?.(createdPost)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Не удалось создать пост',
      )
    }
  }

  const isUploading = uploadPostFileMutation.isPending
  const isPending = createPostMutation.isPending || isUploading
  const avatarUrl = getAssetUrl(user?.profile?.avatarUrl)

  return (
    <div className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="flex gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-700">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={user?.username ?? 'User'} className="h-full w-full object-cover" />
          ) : (
            user?.username?.slice(0, 1).toUpperCase() ?? 'U'
          )}
        </div>

        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Что у вас нового?"
          className="min-h-24 flex-1 resize-none rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-800 outline-none transition placeholder:text-zinc-400 focus:border-violet-200 focus:bg-white"
        />
      </div>

      {attachments.length > 0 && (
        <div className="mt-4 grid gap-3">
          {attachments.map((attachment) => (
            <div
              key={attachment.localId}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <AttachmentThumb attachment={attachment} />

                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-zinc-900">
                    {attachment.filename ?? 'Файл'}
                  </p>
                  <p className="text-xs font-medium text-zinc-400">
                    {attachment.type} · {formatFileSize(attachment.sizeBytes)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeAttachment(attachment.localId)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-red-50 hover:text-red-500"
                aria-label="Удалить вложение"
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}

      {errorMessage && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {errorMessage}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
        <div className="flex flex-wrap gap-2">
          <ComposerButton icon={ImageIcon} label="Фото" onClick={() => imageInputRef.current?.click()} />
          <ComposerButton icon={Video} label="Видео" onClick={() => videoInputRef.current?.click()} />
          <ComposerButton icon={Music} label="Аудио" onClick={() => audioInputRef.current?.click()} />
          <ComposerButton icon={FileText} label="Файл" onClick={() => fileInputRef.current?.click()} />
          <ComposerButton icon={Archive} label="Архив" onClick={() => archiveInputRef.current?.click()} />
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={publishPost}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? <Loader2 className="animate-spin" size={17} /> : null}
          {isUploading ? 'Загружаем...' : createPostMutation.isPending ? 'Публикуем...' : 'Опубликовать'}
        </button>
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={handleFilesChange} />
      <input ref={videoInputRef} type="file" accept="video/*" multiple hidden onChange={handleFilesChange} />
      <input ref={audioInputRef} type="file" accept="audio/*" multiple hidden onChange={handleFilesChange} />
      <input ref={fileInputRef} type="file" multiple hidden onChange={handleFilesChange} />
      <input ref={archiveInputRef} type="file" accept=".zip,.rar,.7z,.tar,.gz" multiple hidden onChange={handleFilesChange} />
    </div>
  )
}

function ComposerButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ImageIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 py-2.5 text-sm font-bold text-zinc-600 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
    >
      <Icon size={17} />
      {label}
    </button>
  )
}

function AttachmentThumb({ attachment }: { attachment: LocalAttachment }) {
  const url = getAssetUrl(attachment.url)

  if (attachment.type === 'IMAGE' && url) {
    return (
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-violet-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.filename ?? 'image'} className="h-full w-full object-cover" />
      </div>
    )
  }

  const Icon =
    attachment.type === 'VIDEO'
      ? Video
      : attachment.type === 'AUDIO'
        ? Music
        : attachment.type === 'ARCHIVE'
          ? Archive
          : FileText

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
      <Icon size={20} />
    </div>
  )
}
