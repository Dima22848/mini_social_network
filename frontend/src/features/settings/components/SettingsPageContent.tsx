'use client'

// Страница настроек: держит активную вкладку в URL и переключает личные данные, сессии, безопасность и уведомления.
import { useRouter, useSearchParams } from 'next/navigation'
import { ProfileSettingsForm } from './ProfileSettingsForm'
import { SessionsSettings } from './SessionsSettings'
import { SecuritySettings } from './SecuritySettings'
import { NotificationSettings } from './NotificationSettings'

type SettingsTab = 'profile' | 'sessions' | 'security' | 'notifications'

const tabs: { value: SettingsTab; label: string }[] = [
  { value: 'profile', label: 'Личные данные' },
  { value: 'sessions', label: 'Сессии' },
  { value: 'security', label: 'Безопасность' },
  { value: 'notifications', label: 'Уведомления' },
]

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === 'profile' || value === 'sessions' || value === 'security' || value === 'notifications'
}

export function SettingsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams.get('tab')
  const activeTab: SettingsTab = isSettingsTab(tabFromUrl) ? tabFromUrl : 'profile'

  function setActiveTab(tab: SettingsTab) {
    router.replace(`/settings?tab=${tab}`, { scroll: false })
  }

  return (
    <section className="min-w-0 space-y-6">
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Настройки</h1>
        <p className="mt-2 text-sm text-zinc-500">Управляйте профилем, сессиями, безопасностью и уведомлениями аккаунта.</p>

        <div className="mt-6 flex flex-wrap gap-2 border-b border-zinc-100">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={activeTab === tab.value
                ? 'border-b-2 border-violet-600 px-4 pb-3 text-sm font-semibold text-violet-700'
                : 'px-4 pb-3 text-sm font-medium text-zinc-500 hover:text-violet-700'}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'profile' && <ProfileSettingsForm />}
          {activeTab === 'sessions' && <SessionsSettings />}
          {activeTab === 'security' && <SecuritySettings />}
          {activeTab === 'notifications' && <NotificationSettings />}
        </div>
      </div>
    </section>
  )
}
