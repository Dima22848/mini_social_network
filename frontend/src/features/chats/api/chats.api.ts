// Тонкая API-обёртка для чатов. Компоненты не знают URL backend и просто вызывают понятные методы.
import type {
  AttachmentsResponse,
  Chat,
  ChatMessage,
  ChatsResponse,
  CreateMessagePayload,
  FileAssetType,
  MembersResponse,
  MessagesResponse,
  SearchIn,
  UploadedChatFile,
} from '../types/chat.types'
import {
  apiRequestWithAuth,
  apiUploadRequestWithAuth,
} from '@/features/auth/lib/auth-refresh-client'

function buildQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      query.set(key, String(value))
    }
  }

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export const chatsApi = {
  getChats(
    accessToken: string,
    params: { search?: string; searchIn?: SearchIn; page?: number; limit?: number },
  ) {
    return apiRequestWithAuth<ChatsResponse>(`/chats${buildQuery(params)}`, accessToken)
  },

  getChatBySlug(accessToken: string, slug: string) {
    return apiRequestWithAuth<Chat>(`/chats/by-slug/${encodeURIComponent(slug)}`, accessToken)
  },

  getChat(accessToken: string, chatId: string) {
    return apiRequestWithAuth<Chat>(`/chats/${encodeURIComponent(chatId)}`, accessToken)
  },

  getMessages(accessToken: string, chatId: string) {
    return apiRequestWithAuth<MessagesResponse>(`/chats/${chatId}/messages`, accessToken)
  },

  getPinnedMessages(accessToken: string, chatId: string) {
    return apiRequestWithAuth<MessagesResponse>(`/chats/${chatId}/pinned`, accessToken)
  },

  getMembers(accessToken: string, chatId: string) {
    return apiRequestWithAuth<MembersResponse>(`/chats/${chatId}/members`, accessToken)
  },

  getAttachments(accessToken: string, chatId: string, type?: FileAssetType) {
    return apiRequestWithAuth<AttachmentsResponse>(
      `/chats/${chatId}/attachments${buildQuery({ type })}`,
      accessToken,
    )
  },

  uploadFile(accessToken: string, file: File, type: FileAssetType) {
    const formData = new FormData()
    formData.set('file', file)
    formData.set('type', type)

    return apiUploadRequestWithAuth<UploadedChatFile>('/chats/uploads', accessToken, formData)
  },

  createDirectChat(accessToken: string, targetUserIdOrUsername: string) {
    return apiRequestWithAuth<Chat>(`/chats/direct/${encodeURIComponent(targetUserIdOrUsername)}`, accessToken, {
      method: 'POST',
    })
  },

  createMessage(accessToken: string, payload: CreateMessagePayload) {
    const { chatId, ...body } = payload
    return apiRequestWithAuth<ChatMessage>(`/chats/${chatId}/messages`, accessToken, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  toggleReaction(accessToken: string, chatId: string, messageId: string, emoji: '👍' | '👎' | '🔥' | '❤️' | '😡') {
    return apiRequestWithAuth(`/chats/${chatId}/messages/${messageId}/reactions/toggle`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    })
  },

  markAsRead(accessToken: string, chatId: string, messageId?: string) {
    return apiRequestWithAuth<{ success: true }>(`/chats/${chatId}/read`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    })
  },

  toggleNotifications(accessToken: string, chatId: string, enabled: boolean) {
    return apiRequestWithAuth<{ success: true }>(`/chats/${chatId}/notifications`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    })
  },

  leaveChat(accessToken: string, chatId: string) {
    return apiRequestWithAuth<{ success: true }>(`/chats/${chatId}/leave`, accessToken, {
      method: 'POST',
    })
  },

  leaveOrDeleteChat(accessToken: string, chatId: string) {
    return apiRequestWithAuth<{ success: true }>(`/chats/${chatId}`, accessToken, {
      method: 'DELETE',
    })
  },

  updateMemberRole(accessToken: string, chatId: string, userId: string, role: 'ADMIN' | 'MEMBER') {
    return apiRequestWithAuth<MembersResponse>(`/chats/${chatId}/members/${userId}/role`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    })
  },

  removeMember(accessToken: string, chatId: string, userId: string) {
    return apiRequestWithAuth<MembersResponse>(`/chats/${chatId}/members/${userId}`, accessToken, {
      method: 'DELETE',
    })
  },

  inviteMembers(accessToken: string, chatId: string, memberIds: string[]) {
    return apiRequestWithAuth<MembersResponse>(`/chats/${chatId}/members/invite`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    })
  },

  deleteMessage(accessToken: string, chatId: string, messageId: string) {
    return apiRequestWithAuth(`/chats/${chatId}/messages/${messageId}`, accessToken, {
      method: 'DELETE',
    })
  },

  pinMessage(accessToken: string, chatId: string, messageId: string) {
    return apiRequestWithAuth(`/chats/${chatId}/messages/${messageId}/pin`, accessToken, {
      method: 'POST',
    })
  },

  unpinMessage(accessToken: string, chatId: string, messageId: string) {
    return apiRequestWithAuth(`/chats/${chatId}/messages/${messageId}/unpin`, accessToken, {
      method: 'POST',
    })
  },

  createGroup(accessToken: string, payload: { title: string; memberIds: string[]; avatarUrl?: string | null }) {
    return apiRequestWithAuth<Chat>('/chats/groups', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateChatTitle(accessToken: string, chatId: string, title: string) {
    return apiRequestWithAuth<Chat>(`/chats/${chatId}/title`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
  },

  updateChatAvatar(accessToken: string, chatId: string, avatarUrl: string | null) {
    return apiRequestWithAuth<Chat>(`/chats/${chatId}/avatar`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ avatarUrl }),
    })
  },
}
