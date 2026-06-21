import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { notificationsApi, type NotificationPreferences } from './notifications.api'

export const notificationQueryKeys = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  preferences: ['notifications', 'preferences'] as const,
}

function useAccessToken() {
  const { accessToken } = useAuth()
  if (!accessToken) throw new Error('Нет access token')
  return accessToken
}

export function useNotificationsQuery() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: notificationQueryKeys.list,
    queryFn: () => notificationsApi.list(accessToken!),
    enabled: Boolean(accessToken),
    refetchOnWindowFocus: true,
  })
}

export function useMarkNotificationsReadMutation() {
  const accessToken = useAccessToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list })
    },
  })
}

export function useNotificationPreferencesQuery() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: notificationQueryKeys.preferences,
    queryFn: () => notificationsApi.getPreferences(accessToken!),
    enabled: Boolean(accessToken),
  })
}

export function useUpdateNotificationPreferencesMutation() {
  const accessToken = useAccessToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<NotificationPreferences>) => notificationsApi.updatePreferences(accessToken, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.preferences })
    },
  })
}


export function useDeleteNotificationMutation() {
  const accessToken = useAccessToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.deleteOne(accessToken, notificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list })
    },
  })
}

export function useDeleteAllNotificationsMutation() {
  const accessToken = useAccessToken()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.deleteAll(accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: notificationQueryKeys.list })
    },
  })
}
