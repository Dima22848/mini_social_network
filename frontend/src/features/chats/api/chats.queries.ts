import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { chatsApi } from './chats.api'
import type { Chat, CreateMessagePayload, FileAssetType, SearchIn } from '../types/chat.types'

export const chatQueryKeys = {
  all: ['chats'] as const,
  lists: () => [...chatQueryKeys.all, 'list'] as const,
  list: (params: { search?: string; searchIn?: SearchIn; page?: number; limit?: number }) =>
    [...chatQueryKeys.lists(), params] as const,
  bySlug: (slug: string) => [...chatQueryKeys.all, 'by-slug', slug] as const,
  detail: (chatId: string) => [...chatQueryKeys.all, 'detail', chatId] as const,
  messages: (chatId: string) => [...chatQueryKeys.all, 'messages', chatId] as const,
  pinned: (chatId: string) => [...chatQueryKeys.all, 'pinned', chatId] as const,
  members: (chatId: string) => [...chatQueryKeys.all, 'members', chatId] as const,
  attachmentsRoot: (chatId: string) => [...chatQueryKeys.all, 'attachments', chatId] as const,
  attachments: (chatId: string, type?: FileAssetType) =>
    [...chatQueryKeys.attachmentsRoot(chatId), type ?? 'all'] as const,
}

function useAccessToken() {
  const { accessToken } = useAuth()

  if (!accessToken) {
    throw new Error('Нет access token')
  }

  return accessToken
}

export function useChatsQuery(params: { search?: string; searchIn?: SearchIn; page?: number; limit?: number }) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: chatQueryKeys.list(params),
    queryFn: () => chatsApi.getChats(accessToken!, params),
    enabled: Boolean(accessToken),
    placeholderData: keepPreviousData,
  })
}

export function useChatBySlugQuery(slug: string | null) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: chatQueryKeys.bySlug(slug ?? ''),
    queryFn: () => chatsApi.getChatBySlug(accessToken!, slug!),
    enabled: Boolean(accessToken && slug),
    retry: false,
  })
}



export function useChatQuery(chatId: string | null) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: chatQueryKeys.detail(chatId ?? ''),
    queryFn: () => chatsApi.getChat(accessToken!, chatId!),
    enabled: Boolean(accessToken && chatId),
    retry: false,
  })
}

export function useChatMessagesQuery(chatId: string | null) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: chatQueryKeys.messages(chatId ?? ''),
    queryFn: () => chatsApi.getMessages(accessToken!, chatId!),
    enabled: Boolean(accessToken && chatId),
  })
}

export function usePinnedMessagesQuery(chatId: string | null) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: chatQueryKeys.pinned(chatId ?? ''),
    queryFn: () => chatsApi.getPinnedMessages(accessToken!, chatId!),
    enabled: Boolean(accessToken && chatId),
  })
}

export function useChatMembersQuery(chatId: string | null) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: chatQueryKeys.members(chatId ?? ''),
    queryFn: () => chatsApi.getMembers(accessToken!, chatId!),
    enabled: Boolean(accessToken && chatId),
  })
}

export function useChatAttachmentsQuery(chatId: string | null, type?: FileAssetType) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: chatQueryKeys.attachments(chatId ?? '', type),
    queryFn: () => chatsApi.getAttachments(accessToken!, chatId!, type),
    enabled: Boolean(accessToken && chatId),
  })
}

export function useUploadFileMutation() {
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (payload: { file: File; type: FileAssetType }) =>
      chatsApi.uploadFile(accessToken, payload.file, payload.type),
  })
}

export function useCreateDirectChatMutation() {
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (targetUserIdOrUsername: string) => chatsApi.createDirectChat(accessToken, targetUserIdOrUsername),
  })
}

export function useCreateMessageMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (payload: CreateMessagePayload) => chatsApi.createMessage(accessToken, payload),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(variables.chatId) }),
        queryClient.invalidateQueries({ queryKey: chatQueryKeys.attachmentsRoot(variables.chatId) }),
      ])
    },
  })
}


export function useCreateGroupChatMutation() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  return useMutation({
    mutationFn: (payload: { title: string; memberIds: string[]; avatarUrl?: string | null }) =>
      chatsApi.createGroup(accessToken, payload),
    onSuccess: async (chat: Chat) => {
      queryClient.setQueriesData(
        { queryKey: chatQueryKeys.lists() },
        (oldData: unknown) => {
          if (!oldData || typeof oldData !== 'object' || !('items' in oldData)) {
            return oldData
          }

          const data = oldData as { items: Chat[] }

          return {
            ...data,
            items: [chat, ...data.items.filter((item) => item.id !== chat.id)],
          }
        },
      )

      await queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() })
    },
  })
}

export function useChatActionMutations() {
  const queryClient = useQueryClient()
  const accessToken = useAccessToken()

  async function invalidate(chatId: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.messages(chatId) }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.pinned(chatId) }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.members(chatId) }),
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.attachmentsRoot(chatId) }),
    ])
  }

  return {
    toggleReaction: useMutation({
      mutationFn: (payload: { chatId: string; messageId: string; emoji: '👍' | '👎' | '🔥' | '❤️' | '😡'}) =>
        chatsApi.toggleReaction(accessToken, payload.chatId, payload.messageId, payload.emoji),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    markAsRead: useMutation({
      mutationFn: (payload: { chatId: string; messageId?: string }) =>
        chatsApi.markAsRead(accessToken, payload.chatId, payload.messageId),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    toggleNotifications: useMutation({
      mutationFn: (payload: { chatId: string; enabled: boolean }) =>
        chatsApi.toggleNotifications(accessToken, payload.chatId, payload.enabled),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    leaveChat: useMutation({
      mutationFn: (chatId: string) => chatsApi.leaveChat(accessToken, chatId),
      onSuccess: async () => queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() }),
    }),
    leaveOrDeleteChat: useMutation({
      mutationFn: (chatId: string) => chatsApi.leaveOrDeleteChat(accessToken, chatId),
      onSuccess: async () => queryClient.invalidateQueries({ queryKey: chatQueryKeys.lists() }),
    }),
    updateMemberRole: useMutation({
      mutationFn: (payload: { chatId: string; userId: string; role: 'ADMIN' | 'MEMBER' }) =>
        chatsApi.updateMemberRole(accessToken, payload.chatId, payload.userId, payload.role),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    removeMember: useMutation({
      mutationFn: (payload: { chatId: string; userId: string }) =>
        chatsApi.removeMember(accessToken, payload.chatId, payload.userId),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    inviteMembers: useMutation({
      mutationFn: (payload: { chatId: string; memberIds: string[] }) =>
        chatsApi.inviteMembers(accessToken, payload.chatId, payload.memberIds),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    deleteMessage: useMutation({
      mutationFn: (payload: { chatId: string; messageId: string }) =>
        chatsApi.deleteMessage(accessToken, payload.chatId, payload.messageId),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    pinMessage: useMutation({
      mutationFn: (payload: { chatId: string; messageId: string }) =>
        chatsApi.pinMessage(accessToken, payload.chatId, payload.messageId),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    unpinMessage: useMutation({
      mutationFn: (payload: { chatId: string; messageId: string }) =>
        chatsApi.unpinMessage(accessToken, payload.chatId, payload.messageId),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    updateChatTitle: useMutation({
      mutationFn: (payload: { chatId: string; title: string }) =>
        chatsApi.updateChatTitle(accessToken, payload.chatId, payload.title),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
    updateChatAvatar: useMutation({
      mutationFn: (payload: { chatId: string; avatarUrl: string | null }) =>
        chatsApi.updateChatAvatar(accessToken, payload.chatId, payload.avatarUrl),
      onSuccess: async (_result, variables) => invalidate(variables.chatId),
    }),
  }
}
