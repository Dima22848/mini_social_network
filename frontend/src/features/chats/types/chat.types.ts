export type ChatType = 'DIRECT' | 'GROUP'
export type ChatMemberRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type FileAssetType = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'ARCHIVE'
export type SearchIn = 'all' | 'nicknames' | 'messages'

export type ChatUser = {
  id: string
  username: string
  email: string
  avatarUrl: string | null
  lastLoginAt: string | null
  isOnline: boolean
}

export type ChatMember = {
  id: string
  userId: string
  role: ChatMemberRole
  joinedAt: string
  lastReadAt: string | null
  notificationsEnabled: boolean
  user: ChatUser
}

export type ChatFile = {
  id: string
  type: FileAssetType
  status: string
  url: string
  thumbnailUrl: string | null
  filename: string | null
  mimeType: string | null
  sizeBytes: number | null
  width: number | null
  height: number | null
  duration: number | null
  createdAt: string
  updatedAt: string
}

export type ChatAttachment = {
  id: string
  file: ChatFile
}

export type MessageReaction = {
  id: string
  emoji: '👍' | '👎' | '🔥' | '❤️' | '😡' 
  userId: string
  user: ChatUser
}

export type MessageRead = {
  id: string
  userId: string
  readAt: string
  user: ChatUser
}

export type ChatMessage = {
  id: string
  chatId: string
  senderId: string | null
  sender: ChatUser | null
  type: 'TEXT' | 'MEDIA' | 'TEXT_WITH_MEDIA'
  content: string | null
  parentId: string | null
  parent: {
    id: string
    content: string | null
    sender: ChatUser | null
  } | null
  attachments: ChatAttachment[]
  reactions: MessageReaction[]
  reads: MessageRead[]
  pinnedAt: string | null
  pinnedById: string | null
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Chat = {
  id: string
  type: ChatType
  title: string
  avatarUrl: string | null
  currentUserRole: ChatMemberRole
  notificationsEnabled: boolean
  directUser: ChatUser | null
  members: ChatMember[]
  membersCount: number
  unreadCount: number
  isDraft: boolean
  isReadOnly: boolean
  lastMessage: ChatMessage | null
  matchedMessage: ChatMessage | null
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export type ChatsResponse = {
  items: Chat[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export type MessagesResponse = {
  items: ChatMessage[]
}

export type MembersResponse = {
  items: ChatMember[]
}

export type AttachmentsResponse = {
  items: {
    id: string
    messageId: string
    createdAt: string
    sender: ChatUser | null
    file: ChatFile
  }[]
}

export type CreateAttachmentPayload = {
  type: FileAssetType
  url: string
  thumbnailUrl?: string | null
  filename?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  width?: number | null
  height?: number | null
  duration?: number | null
}

export type UploadedChatFile = CreateAttachmentPayload

export type CreateMessagePayload = {
  chatId: string
  content?: string
  parentId?: string | null
  attachments?: CreateAttachmentPayload[]
}

export type TypingUser = {
  id: string
  username: string
}
