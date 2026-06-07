'use client'

import { useAuth } from '@/features/auth/providers/AuthProvider'
import { ProfileHeader } from './ProfileHeader'
import { ProfileSidebar } from './ProfileSidebar'
import { ProfileInfoCard } from './ProfileInfoCard'
import { ProfileFeedComposer } from './ProfileFeedComposer'
import { ProfilePostCard } from './ProfilePostCard'

export function ProfilePageContent() {
  const { user } = useAuth()

  if (!user) {
    return null
  }

  return (
    <main className="min-h-screen bg-[#fbf9ff] text-zinc-950">
      <ProfileHeader user={user} />

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_minmax(0,1fr)] gap-7 px-6 pb-10 pt-28">
        <ProfileSidebar user={user} />

        <section className="min-w-0 space-y-6">
          <ProfileInfoCard user={user} />

          <ProfileFeedComposer user={user} />

          <div className="space-y-5">
            <ProfilePostCard
              username={user.username}
              text="Добро пожаловать в профиль Social. Здесь позже будет ваша новостная лента, посты, комментарии и реакции."
            />

            <ProfilePostCard
              username={user.username}
              text="Auth уже подключён: login, register, refresh, logout и восстановление пароля работают."
            />
          </div>
        </section>
      </div>
    </main>
  )
}