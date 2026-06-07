import { File, ImageIcon, Music, Package, Video } from 'lucide-react'
import type { AuthUser } from '@/features/auth/types/auth.types'

type ProfileFeedComposerProps = {
  user: AuthUser
}

export function ProfileFeedComposer({ user }: ProfileFeedComposerProps) {
  const avatarUrl = user.profile?.avatarUrl

  return (
    <section className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={user.username} className="h-full w-full object-cover" />
          ) : (
            user.username.slice(0, 1).toUpperCase()
          )}
        </div>

        <textarea
          placeholder="Что у вас нового?"
          className="min-h-20 flex-1 resize-none rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-50"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-violet-200 hover:text-violet-700">
            <ImageIcon size={16} />
            Фото
          </button>

          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-violet-200 hover:text-violet-700">
            <Video size={16} />
            Видео
          </button>

          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-violet-200 hover:text-violet-700">
            <Music size={16} />
            Аудио
          </button>

          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-violet-200 hover:text-violet-700">
            <File size={16} />
            Файл
          </button>

          <button className="inline-flex items-center gap-2 rounded-xl border border-zinc-100 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-violet-200 hover:text-violet-700">
            <Package size={16} />
            Архив
          </button>
        </div>

        <button
          type="button"
          className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700"
        >
          Опубликовать
        </button>
      </div>
    </section>
  )
}