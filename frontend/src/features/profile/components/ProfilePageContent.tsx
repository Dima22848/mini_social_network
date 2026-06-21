'use client'

// Личный профиль: шапка, форма создания поста и список собственных постов пользователя.
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { PostCard } from '@/features/feed/components/PostCard'
import { useUserPostsQuery } from '@/features/social/api/social.queries'
import { Pagination } from '@/features/social/components/Pagination'
import { ProfileFeedComposer } from './ProfileFeedComposer'
import { ProfileInfoCard } from './ProfileInfoCard'

export function ProfilePageContent() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const postsQuery = useUserPostsQuery(user?.id, { page, limit: 6 })
  const posts = postsQuery.data
  const errorMessage = postsQuery.error instanceof Error ? postsQuery.error.message : null

  if (!user) {
    return null
  }

  return (
    <section className="min-w-0 space-y-6">
      <ProfileInfoCard user={user} />

      <ProfileFeedComposer onPostCreated={() => setPage(1)} />

      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          {errorMessage}
        </div>
      )}

      {postsQuery.isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white">
          <Loader2 className="animate-spin text-violet-600" size={32} />
        </div>
      ) : posts && posts.items.length > 0 ? (
        <>
          <div className="space-y-5">
            {posts.items.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          <Pagination
            page={posts.pagination.page}
            totalPages={posts.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      ) : (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-white px-6 text-center">
          <h3 className="text-lg font-bold text-zinc-950">Постов пока нет</h3>

          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
            Напишите первый пост, добавьте фото, видео, аудио, файл или архив.
          </p>
        </div>
      )}
    </section>
  )
}
