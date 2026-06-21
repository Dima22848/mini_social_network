'use client'

// Страница новостной ленты: берём посты друзей/подписок и отдаём их в универсальную карточку поста.
import { useState } from 'react'
import { Loader2, Newspaper } from 'lucide-react'
import { Pagination } from '@/features/social/components/Pagination'
import { useFeedPostsQuery } from '@/features/social/api/social.queries'
import { PostCard } from './PostCard'

export function FeedPageContent() {
  const [page, setPage] = useState(1)
  const feedQuery = useFeedPostsQuery({ page, limit: 6 })
  const data = feedQuery.data
  const errorMessage = feedQuery.error instanceof Error ? feedQuery.error.message : null

  return (
    <section className="min-w-0 space-y-6">
      <div className="rounded-[2rem] border border-zinc-100 bg-white/80 p-7 shadow-sm max-md:p-4">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-950 max-md:text-3xl">
          Новостная лента
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
          Здесь показываются посты ваших друзей и пользователей, на которых вы подписаны.
        </p>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {errorMessage}
        </div>
      )}

      {feedQuery.isLoading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white">
          <Loader2 className="animate-spin text-violet-600" size={32} />
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="space-y-5">
            {data.items.map((post) => (
              <PostCard key={post.id} post={post} context="feed" />
            ))}
          </div>

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white px-6 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <Newspaper size={28} />
          </div>

          <h3 className="text-lg font-bold text-zinc-950">Лента пока пустая</h3>

          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
            Добавьте друзей или подпишитесь на пользователей, чтобы здесь появились их посты.
          </p>
        </div>
      )}
    </section>
  )
}
