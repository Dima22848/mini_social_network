import { Bookmark, Heart, MessageCircle, MoreHorizontal, Share2 } from 'lucide-react'

type ProfilePostCardProps = {
  username: string
  text: string
}

export function ProfilePostCard({ username, text }: ProfilePostCardProps) {
  return (
    <article className="rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
            {username.slice(0, 1).toUpperCase()}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900">{username}</h3>
            <p className="text-xs text-zinc-400">только что</p>
          </div>
        </div>

        <button className="text-zinc-400 transition hover:text-violet-600">
          <MoreHorizontal size={20} />
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-zinc-700">{text}</p>

      <div className="mt-5 flex items-center gap-7 border-t border-zinc-100 pt-4 text-sm text-zinc-500">
        <button className="inline-flex items-center gap-2 transition hover:text-red-500">
          <Heart size={17} />
          0
        </button>

        <button className="inline-flex items-center gap-2 transition hover:text-violet-600">
          <MessageCircle size={17} />
          0
        </button>

        <button className="inline-flex items-center gap-2 transition hover:text-violet-600">
          <Share2 size={17} />
          Поделиться
        </button>

        <button className="ml-auto inline-flex items-center gap-2 transition hover:text-violet-600">
          <Bookmark size={17} />
          Сохранить
        </button>
      </div>
    </article>
  )
}