import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from './auth.api'
import { useAuth } from '../providers/AuthProvider'
import type { AuthUser } from '../types/auth.types'

export const authQueryKeys = {
  all: ['auth'] as const,
  sessions: ['auth', 'sessions'] as const,
}

function useAccessToken() {
  const { accessToken } = useAuth()

  if (!accessToken) {
    throw new Error('Нет access token')
  }

  return accessToken
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (data: { email: string; password: string; rememberMe: boolean }) =>
      authApi.login(data),
  })
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (data: { email: string; username: string; password: string }) =>
      authApi.register(data),
  })
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (data: { email: string }) => authApi.forgotPassword(data),
  })
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (data: { token: string; password: string }) =>
      authApi.resetPassword(data),
  })
}

export function useUpdateMeMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()
  const { setUser } = useAuth()

  return useMutation({
    mutationFn: (data: {
      username?: string
      bio?: string
      age?: number
      city?: string
      country?: string
      email?: string
      avatarUrl?: string | null
    }) => authApi.updateMe(accessToken, data),
    onSuccess: async (result) => {
      setUser(result.user as AuthUser)
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.all })
    },
  })
}

export function useSessionsQuery() {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: authQueryKeys.sessions,
    queryFn: () => authApi.getSessions(accessToken!),
    enabled: Boolean(accessToken),
  })
}


export function useLogoutMutation() {
  return useMutation({
    mutationFn: () => authApi.logout(),
  })
}

export function useLogoutSessionMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (sessionId: string) => authApi.logoutSession(accessToken, sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.sessions })
    },
  })
}

export function useLogoutAllExceptCurrentMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: () => authApi.logoutAllExceptCurrent(accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.sessions })
    },
  })
}

export function useLogoutAllMutation() {
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: () => authApi.logoutAll(accessToken),
  })
}




export function useChangePasswordMutation() {
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (data: { oldPassword: string; newPassword: string }) =>
      authApi.changePassword(accessToken, data),
  })
}

export function useRequestEmailVerificationMutation() {
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: () => authApi.requestEmailVerification(accessToken),
  })
}

export function useVerifyEmailMutation() {
  const { setUser } = useAuth()

  return useMutation({
    mutationFn: (data: { token: string }) => authApi.verifyEmail(data),
    onSuccess: (result) => {
      setUser(result.user as AuthUser)
    },
  })
}

export function useUploadAvatarMutation() {
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (file: File) => authApi.uploadAvatar(accessToken, file),
  })
}
