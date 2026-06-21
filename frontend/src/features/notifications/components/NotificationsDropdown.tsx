'use client'

import { Bell, CheckCheck, Loader2, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  useDeleteAllNotificationsMutation,
  useDeleteNotificationMutation,
  useMarkNotificationsReadMutation,
  useNotificationsQuery,
} from '../api/notifications.queries'
import { useEffect } from 'react'
import { getNotificationActorAvatar } from '../api/notifications.api'

function formatNotificationDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getNotificationHref(entityType: string | null, entityId: string | null, type: string, actorUsername?: string | null) {
  if (entityType === 'ChatMessage' && entityId) {
    const [chatId, messageId] = entityId.split(':')
    return `/messages?chatId=${encodeURIComponent(chatId)}${messageId ? `&messageId=${encodeURIComponent(messageId)}` : ''}`
  }
  if (entityType === 'Chat' && entityId) return `/messages?chatId=${encodeURIComponent(entityId)}`
  if (entityType === 'Post' && entityId) return `/feed#post-${entityId}`
  if (entityType === 'User' && actorUsername) return `/profile/${encodeURIComponent(actorUsername)}`
  if (entityType === 'FriendRequest' || type.startsWith('FRIEND_')) return actorUsername ? `/profile/${encodeURIComponent(actorUsername)}` : '/friends?tab=requests&sort=name'
  return null
}

export function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const notificationsQuery = useNotificationsQuery()
  const markRead = useMarkNotificationsReadMutation()
  const deleteOne = useDeleteNotificationMutation()
  const deleteAll = useDeleteAllNotificationsMutation()
  const notifications = notificationsQuery.data?.items ?? []

  useEffect(() => {
    if ((notificationsQuery.data?.unreadCount ?? 0) > 0) {
      markRead.mutate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsQuery.data?.unreadCount])

  function openNotification(href: string | null) {
    if (!href) return
    onClose()
    router.push(href)
  }

  return (
    <div className="absolute right-0 mt-3 w-[380px] overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-[0_18px_60px_rgba(88,64,120,0.18)] max-sm:w-[calc(100vw-2rem)]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div>
          <h3 className="text-base font-bold text-zinc-950">Уведомления</h3>
          <p className="text-xs font-medium text-zinc-400">{notificationsQuery.data?.unreadCount ?? 0} непрочитанных</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => markRead.mutate()}
            disabled={markRead.isPending}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-violet-100 px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
          >
            {markRead.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            Прочитать все
          </button>
          <button
            type="button"
            onClick={() => deleteAll.mutate()}
            disabled={deleteAll.isPending || notifications.length === 0}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-red-100 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Удалить все
          </button>
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-2">
        {notificationsQuery.isLoading && (
          <p className="py-8 text-center text-sm font-medium text-zinc-500">Загружаем...</p>
        )}

        {!notificationsQuery.isLoading && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
              <Bell className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-zinc-900">Пока уведомлений нет</p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">Здесь появятся реакции, сообщения, заявки и приглашения.</p>
          </div>
        )}

        {notifications.map((notification) => {
          const href = getNotificationHref(notification.entityType, notification.entityId, notification.type, notification.actor?.username)
          const actorAvatar = getNotificationActorAvatar(notification.actor?.avatarUrl)

          return (
            <div
              key={notification.id}
              className={`group relative rounded-2xl transition ${notification.readAt ? 'hover:bg-zinc-50' : 'bg-violet-50/70 hover:bg-violet-50'}`}
            >
              <button
                type="button"
                onClick={() => openNotification(href)}
                className="flex w-full items-start gap-3 px-3 py-3 text-left"
              >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                {actorAvatar ? <img src={actorAvatar} alt={notification.actor?.username ?? 'user'} className="h-full w-full object-cover" /> : notification.actor?.username.slice(0, 1).toUpperCase() ?? <Bell className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-zinc-950">{notification.title}</span>
                  <span className="shrink-0 text-[11px] font-medium text-zinc-400">{formatNotificationDate(notification.createdAt)}</span>
                </span>
                {notification.body && <span className="mt-1 block text-xs leading-5 text-zinc-500">{notification.body}</span>}
              </span>
              </button>
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); deleteOne.mutate(notification.id) }}
                className="absolute right-2 top-2 rounded-full bg-white/80 p-1.5 text-zinc-400 opacity-0 shadow-sm transition hover:text-red-500 group-hover:opacity-100"
                aria-label="Удалить уведомление"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
