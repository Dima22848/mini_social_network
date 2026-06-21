// API-обёртка уведомлений. Все защищённые запросы идут через авто-refresh access token.
import { apiRequestWithAuth } from '@/features/auth/lib/auth-refresh-client'
import { getAssetUrl } from '@/shared/utils/assets'

export type NotificationItem = {
  id: string
  type: string
  title: string
  body: string | null
  entityType: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
  actor: { id: string; username: string; avatarUrl: string | null } | null
}

export type NotificationsResponse = { items: NotificationItem[]; unreadCount: number }
export type NotificationPreferences = { posts: boolean; chats: boolean; friends: boolean }

export const notificationsApi = {
  list(accessToken: string) {
    return apiRequestWithAuth<NotificationsResponse>('/notifications', accessToken)
  },
  markAllRead(accessToken: string) {
    return apiRequestWithAuth<{ success: true }>('/notifications/read-all', accessToken, { method: 'POST' })
  },
  deleteOne(accessToken: string, notificationId: string) {
    return apiRequestWithAuth<{ success: true }>(`/notifications/${notificationId}`, accessToken, { method: 'DELETE' })
  },
  deleteAll(accessToken: string) {
    return apiRequestWithAuth<{ success: true }>('/notifications', accessToken, { method: 'DELETE' })
  },
  getPreferences(accessToken: string) {
    return apiRequestWithAuth<NotificationPreferences>('/notifications/preferences', accessToken)
  },
  updatePreferences(accessToken: string, data: Partial<NotificationPreferences>) {
    return apiRequestWithAuth<NotificationPreferences>('/notifications/preferences', accessToken, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },
}

export function getNotificationActorAvatar(url: string | null | undefined) {
  return getAssetUrl(url)
}
