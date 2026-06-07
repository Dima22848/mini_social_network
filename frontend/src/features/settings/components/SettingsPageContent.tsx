'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { ProfileHeader } from '@/features/profile/components/ProfileHeader'
import { ProfileSidebar } from '@/features/profile/components/ProfileSidebar'
import { ProfileSettingsForm } from './ProfileSettingsForm'
import { SessionsSettings } from './SessionsSettings'

type SettingsTab = 'profile' | 'sessions'

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === 'profile' || value === 'sessions'
}

export function SettingsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()

  if (!user) {
    return null
  }

  const tabFromUrl = searchParams.get('tab')

  const activeTab: SettingsTab = isSettingsTab(tabFromUrl)
    ? tabFromUrl
    : 'profile'

  function setActiveTab(tab: SettingsTab) {
    router.replace(`/settings?tab=${tab}`, {
      scroll: false,
    })
  }

  return (
    <main className="min-h-screen bg-[#fbf9ff] text-zinc-950">
      <ProfileHeader user={user} />

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_minmax(0,1fr)] gap-7 px-6 pb-10 pt-28">
        <ProfileSidebar user={user} />

        <section className="min-w-0 space-y-6">
          <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-semibold">Настройки</h1>
            <p className="mt-2 text-sm text-zinc-500">
              Управляйте профилем, сессиями и безопасностью аккаунта.
            </p>

            <div className="mt-6 flex gap-2 border-b border-zinc-100">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={
                  activeTab === 'profile'
                    ? 'border-b-2 border-violet-600 px-4 pb-3 text-sm font-semibold text-violet-700'
                    : 'px-4 pb-3 text-sm font-medium text-zinc-500 hover:text-violet-700'
                }
              >
                Личные данные
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sessions')}
                className={
                  activeTab === 'sessions'
                    ? 'border-b-2 border-violet-600 px-4 pb-3 text-sm font-semibold text-violet-700'
                    : 'px-4 pb-3 text-sm font-medium text-zinc-500 hover:text-violet-700'
                }
              >
                Сессии
              </button>
            </div>

            <div className="mt-6">
              {activeTab === 'profile' && <ProfileSettingsForm />}
              {activeTab === 'sessions' && <SessionsSettings />}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}