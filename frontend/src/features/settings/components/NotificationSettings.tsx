'use client'

import { Loader2 } from 'lucide-react'
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '@/features/notifications/api/notifications.queries'
import type { NotificationPreferences } from '@/features/notifications/api/notifications.api'

type ToggleRowProps = {
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ title, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-5 rounded-3xl border border-zinc-100 bg-white px-5 py-4 max-md:flex-col max-md:items-start">
      <div>
        <h3 className="text-sm font-bold text-slate-950">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-violet-600' : 'bg-zinc-200'}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${checked ? 'left-7' : 'left-1'}`} />
      </button>
    </div>
  )
}

export function NotificationSettings() {
  const preferencesQuery = useNotificationPreferencesQuery()
  const updatePreferences = useUpdateNotificationPreferencesMutation()
  const prefs = preferencesQuery.data ?? { posts: true, chats: true, friends: true }

  function update(key: keyof NotificationPreferences, value: boolean) {
    updatePreferences.mutate({ [key]: value })
  }

  if (preferencesQuery.isLoading) {
    return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-violet-600" /></div>
  }

  return (
    <div className="max-w-4xl space-y-4">
      <ToggleRow
        title="Уведомления от постов"
        description="Лайки, дизлайки, комментарии, ответы на ваши комментарии и реакции под вашими или чужими постами."
        checked={prefs.posts}
        disabled={updatePreferences.isPending}
        onChange={(value) => update('posts', value)}
      />
      <ToggleRow
        title="Уведомления от чатов"
        description="Новые сообщения, ответы на ваши сообщения, реакции, приглашения в группы и изменения в групповых чатах."
        checked={prefs.chats}
        disabled={updatePreferences.isPending}
        onChange={(value) => update('chats', value)}
      />
      <ToggleRow
        title="Уведомления от заявок в друзья"
        description="Новые заявки в друзья, принятые заявки и другие события дружбы."
        checked={prefs.friends}
        disabled={updatePreferences.isPending}
        onChange={(value) => update('friends', value)}
      />
    </div>
  )
}
