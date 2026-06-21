// Основная логика чатов. Здесь специально держим правила direct/group чатов, read-only истории и системных сообщений вместе.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatMemberRole,
  ChatType,
  FileAssetStatus,
  FileAssetType,
  MessageType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupChatDto } from './dto/create-group-chat.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatsQueryDto } from './dto/chats-query.dto';
import { InviteChatMembersDto } from './dto/invite-chat-members.dto';
import { UpdateChatTitleDto } from './dto/update-chat-title.dto';
import { UpdateChatAvatarDto } from './dto/update-chat-avatar.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { deleteUploadedFileByUrl } from '../common/files/file-cleanup.util';
import { MediaQueueService } from '../common/files/media-queue.service';
import { PresenceService } from '../presence/presence.service';

const userSelect = {
  id: true,
  username: true,
  email: true,
  lastLoginAt: true,
  profile: {
    select: {
      avatarUrl: true,
    },
  },
} satisfies Prisma.UserSelect;

const messageInclude = {
  sender: { select: userSelect },
  parent: {
    select: {
      id: true,
      content: true,
      sender: { select: userSelect },
    },
  },
  attachments: {
    include: {
      file: true,
    },
  },
  reactions: {
    include: {
      user: { select: userSelect },
    },
  },
  reads: {
    include: {
      user: { select: userSelect },
    },
  },
} satisfies Prisma.MessageInclude;

const chatInclude = {
  members: {
    include: {
      user: { select: userSelect },
    },
    orderBy: [{ role: 'asc' as const }, { joinedAt: 'asc' as const }],
  },
  messages: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: messageInclude,
  },
} satisfies Prisma.ChatInclude;

@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mediaQueueService: MediaQueueService,
    private readonly presenceService: PresenceService,
  ) {}

  prepareUploadedFile(
    _userId: string,
    file: any,
    requestedType?: FileAssetType,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    const type = this.resolveFileType(file, requestedType);

    const url = `/uploads/chat/${file.filename}`;
    void this.mediaQueueService.enqueueUploadedFile({
      url,
      kind: 'chat-attachment',
    });

    return {
      type,
      url,
      filename: file.originalname ?? file.filename,
      mimeType: file.mimetype ?? 'application/octet-stream',
      sizeBytes: file.size ?? null,
    };
  }

  async listChats(userId: string, query: ChatsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const search = query.search?.trim();
    const searchIn = query.searchIn ?? 'all';

    const searchWhere: Prisma.ChatWhereInput[] = [];

    if (search && searchIn !== 'messages') {
      searchWhere.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          {
            members: {
              some: {
                leftAt: null,
                user: { username: { contains: search, mode: 'insensitive' } },
              },
            },
          },
        ],
      });
    }

    if (search && searchIn !== 'nicknames') {
      searchWhere.push({
        messages: {
          some: {
            deletedAt: null,
            content: { contains: search, mode: 'insensitive' },
            NOT: { content: { startsWith: '__CHAT_EVENT__' } },
          },
        },
      });
    }

    const removedByAdminFilter: Prisma.ChatWhereInput = {
      type: ChatType.GROUP,
      members: {
        some: {
          userId,
          leftAt: { not: null },
          deletedForUserAt: null,
        },
      },
      messages: {
        some: {
          deletedAt: null,
          content: {
            startsWith: '__CHAT_EVENT__',
          },
          AND: [
            { content: { contains: '"type":"remove"' } },
            { content: { contains: userId } },
          ],
        },
      },
    };

    const activeMembershipFilter: Prisma.ChatWhereInput = {
      OR: [
        {
          type: ChatType.DIRECT,
          AND: [
            {
              members: {
                some: { userId, leftAt: null, deletedForUserAt: null },
              },
            },
            {
              members: {
                some: {
                  userId: { not: userId },
                  leftAt: null,
                  deletedForUserAt: null,
                },
              },
            },
          ],
        },
        {
          type: ChatType.GROUP,
          members: {
            some: { userId, leftAt: null, deletedForUserAt: null },
          },
        },
      ],
    };

    const where: Prisma.ChatWhereInput = {
      deletedAt: null,
      OR: [activeMembershipFilter, removedByAdminFilter],
      ...(search && searchWhere.length > 0
        ? { AND: [{ OR: searchWhere }] }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.chat.findMany({
        where,
        include: chatInclude,
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chat.count({ where }),
    ]);

    const visibleItems = await this.withVisibleLastMessages(userId, items);
    const memberByChatId = new Map(
      visibleItems.map((chat) => [
        chat.id,
        chat.members.find((member) => member.userId === userId),
      ]),
    );
    const matchedMessageMap = new Map<
      string,
      Prisma.MessageGetPayload<{ include: typeof messageInclude }>
    >();

    if (search && searchIn !== 'nicknames' && visibleItems.length > 0) {
      const matchedMessages = await this.prisma.message.findMany({
        where: {
          chatId: { in: visibleItems.map((chat) => chat.id) },
          deletedAt: null,
          content: { contains: search, mode: 'insensitive' },
          NOT: { content: { startsWith: '__CHAT_EVENT__' } },
        },
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
      });

      for (const message of matchedMessages) {
        const member = memberByChatId.get(message.chatId);
        if (member?.leftAt && message.createdAt > member.leftAt) {
          continue;
        }

        if (!matchedMessageMap.has(message.chatId)) {
          matchedMessageMap.set(message.chatId, message);
        }
      }
    }

    const onlineUserIds = await this.getOnlineUserIdsForChats(visibleItems);
    const unreadCountMap = await this.getUnreadCountMap(
      userId,
      visibleItems.map((chat) => chat.id),
    );

    return {
      items: visibleItems.map((chat) =>
        this.mapChat(
          chat,
          userId,
          matchedMessageMap.get(chat.id),
          unreadCountMap.get(chat.id) ?? 0,
          onlineUserIds,
        ),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getChat(userId: string, chatId: string) {
    await this.requireReadableMember(chatId, userId);

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: chatInclude,
    });

    if (!chat || chat.deletedAt) {
      throw new NotFoundException('Chat not found');
    }

    const [visibleChat] = await this.withVisibleLastMessages(userId, [chat]);
    const onlineUserIds = await this.getOnlineUserIdsForChats([visibleChat]);

    return this.mapChat(
      visibleChat,
      userId,
      undefined,
      undefined,
      onlineUserIds,
    );
  }

  async getMessages(userId: string, chatId: string) {
    const member = await this.requireReadableMember(chatId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        ...(member.leftAt ? { createdAt: { lte: member.leftAt } } : {}),
      },
      include: messageInclude,
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    if (messages.length > 0) {
      const lastVisibleMessage = messages[messages.length - 1];
      await this.prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: {
          lastReadAt: new Date(),
          lastReadMessageId: lastVisibleMessage.id,
        },
      });
    }

    const onlineUserIds = await this.getOnlineUserIdsForMessages(messages);

    return {
      items: messages.map((message) => this.mapMessage(message, onlineUserIds)),
    };
  }

  async getPinnedMessages(userId: string, chatId: string) {
    const member = await this.requireReadableMember(chatId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        pinnedAt: { not: null },
        ...(member.leftAt ? { createdAt: { lte: member.leftAt } } : {}),
      },
      include: messageInclude,
      orderBy: { pinnedAt: 'desc' },
      take: 20,
    });

    const onlineUserIds = await this.getOnlineUserIdsForMessages(messages);

    return {
      items: messages.map((message) => this.mapMessage(message, onlineUserIds)),
    };
  }

  async getMembers(userId: string, chatId: string) {
    await this.requireMember(chatId, userId);

    const members = await this.prisma.chatMember.findMany({
      where: { chatId, leftAt: null, deletedForUserAt: null },
      include: { user: { select: userSelect } },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });

    const onlineMap = await this.presenceService.getOnlineMap(
      members.map((member) => member.userId),
    );
    const onlineUserIds = new Set(
      [...onlineMap.entries()].filter(([, online]) => online).map(([id]) => id),
    );

    return {
      items: members.map((member) => this.mapMember(member, onlineUserIds)),
    };
  }

  async getAttachments(userId: string, chatId: string, type?: FileAssetType) {
    const member = await this.requireMember(chatId, userId);

    const attachments = await this.prisma.messageAttachment.findMany({
      where: {
        message: {
          chatId,
          deletedAt: null,
          ...(member.leftAt ? { createdAt: { lte: member.leftAt } } : {}),
        },
        ...(type ? { file: { is: { type } } } : {}),
      },
      include: {
        file: true,
        message: { include: { sender: { select: userSelect } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    return {
      items: attachments.map((attachment) => ({
        id: attachment.id,
        messageId: attachment.messageId,
        createdAt: attachment.createdAt,
        sender: attachment.message.sender
          ? this.mapUser(attachment.message.sender, new Set())
          : null,
        file: attachment.file,
      })),
    };
  }

  async getChatBySlug(userId: string, slug: string) {
    const normalizedSlug = this.slugify(decodeURIComponent(slug));

    const chats = await this.prisma.chat.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId, deletedForUserAt: null } },
      },
      include: chatInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 100,
    });

    const readableChats = [] as typeof chats;

    for (const candidate of chats) {
      const member = candidate.members.find((item) => item.userId === userId);
      if (!member || member.deletedForUserAt) continue;
      if (
        !member.leftAt ||
        (await this.hasRemovalEventForUserInChat(candidate.id, userId))
      ) {
        readableChats.push(candidate);
      }
    }

    const visibleChats = await this.withVisibleLastMessages(
      userId,
      readableChats,
    );

    const chat = visibleChats.find((candidate) => {
      const currentMember = candidate.members.find(
        (member) => member.userId === userId,
      );
      const otherMember = candidate.members.find(
        (member) => member.userId !== userId && !member.leftAt,
      );
      const value =
        candidate.type === ChatType.DIRECT
          ? otherMember?.user.username
          : currentMember?.leftAt
            ? (currentMember.leftChatTitle ?? candidate.title)
            : candidate.title;

      return this.slugify(value ?? 'chat') === normalizedSlug;
    });

    if (!chat) {
      const targetUser = await this.prisma.user.findFirst({
        where: {
          deletedAt: null,
          username: { equals: normalizedSlug.replace(/-/g, '_'), mode: 'insensitive' },
        },
        select: userSelect,
      });

      if (
        targetUser &&
        targetUser.id !== userId &&
        (await this.canDirectChat(userId, targetUser.id))
      ) {
        const onlineUserIds = await this.getOnlineUserIds([targetUser.id]);
        return this.mapDraftDirectChat(targetUser, onlineUserIds);
      }

      throw new NotFoundException('Chat not found');
    }

    const onlineUserIds = await this.getOnlineUserIdsForChats([chat]);

    return this.mapChat(chat, userId, undefined, undefined, onlineUserIds);
  }

  async createDirectChat(
    currentUserId: string,
    targetUserIdOrUsername: string,
  ) {
    const targetUser = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { id: targetUserIdOrUsername },
          { username: targetUserIdOrUsername },
        ],
      },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const targetUserId = targetUser.id;

    if (currentUserId === targetUserId) {
      throw new ForbiddenException('Cannot create direct chat with yourself');
    }

    if (!(await this.canDirectChat(currentUserId, targetUserId))) {
      throw new ForbiddenException(
        'Личный чат можно создать только с другом, подписчиком или пользователем из ваших подписок',
      );
    }

    const directKey = [currentUserId, targetUserId].sort().join(':');

    const chat = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.chat.findUnique({
        where: { directKey },
        include: {
          members: true,
        },
      });

      if (existing) {
        const currentMember = existing.members.find(
          (member) => member.userId === currentUserId,
        );
        const targetMember = existing.members.find(
          (member) => member.userId === targetUserId,
        );
        const isHealthyExisting =
          !existing.deletedAt &&
          currentMember &&
          targetMember &&
          !currentMember.leftAt &&
          !targetMember.leftAt &&
          !currentMember.deletedForUserAt &&
          !targetMember.deletedForUserAt;

        if (isHealthyExisting) {
          return tx.chat.findUniqueOrThrow({
            where: { id: existing.id },
            include: chatInclude,
          });
        }

        await tx.chat.delete({ where: { id: existing.id } });
      }

      return tx.chat.create({
        data: {
          type: ChatType.DIRECT,
          directKey,
          createdById: currentUserId,
          members: {
            create: [
              { userId: currentUserId, role: ChatMemberRole.OWNER },
              { userId: targetUserId, role: ChatMemberRole.MEMBER },
            ],
          },
        },
        include: chatInclude,
      });
    });

    const onlineUserIds = await this.getOnlineUserIdsForChats([chat]);

    return this.mapChat(
      chat,
      currentUserId,
      undefined,
      undefined,
      onlineUserIds,
    );
  }

  async createGroupChat(userId: string, dto: CreateGroupChatDto) {
    const title = dto.title.trim();
    const uniqueMemberIds = [
      ...new Set(dto.memberIds.filter((id) => id !== userId)),
    ];

    if (!title) {
      throw new BadRequestException('Укажи название группового чата');
    }

    if (uniqueMemberIds.length === 0) {
      throw new BadRequestException('Выбери хотя бы одного участника');
    }

    const existingMembers = await this.prisma.user.findMany({
      where: {
        id: { in: uniqueMemberIds },
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingMembers.length !== uniqueMemberIds.length) {
      throw new BadRequestException(
        'Один или несколько выбранных пользователей не найдены',
      );
    }

    const now = new Date();
    const chat = await this.prisma.$transaction(async (tx) => {
      const createdChat = await tx.chat.create({
        data: {
          type: ChatType.GROUP,
          title,
          avatarUrl: dto.avatarUrl ?? null,
          createdById: userId,
          members: {
            create: [
              { userId, role: ChatMemberRole.OWNER, lastReadAt: now },
              ...uniqueMemberIds.map((memberId) => ({
                userId: memberId,
                role: ChatMemberRole.MEMBER,
              })),
            ],
          },
        },
        include: chatInclude,
      });

      const eventMessage = await tx.message.create({
        data: {
          chatId: createdChat.id,
          senderId: null,
          content: `__CHAT_EVENT__${JSON.stringify({
            type: 'created',
            actor: { id: userId, username: 'Пользователь' },
            targets: [],
          })}`,
          type: MessageType.TEXT,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.messageRead.upsert({
        where: { messageId_userId: { messageId: eventMessage.id, userId } },
        update: { readAt: now },
        create: { messageId: eventMessage.id, userId, readAt: now },
      });

      await tx.chatMember.update({
        where: { chatId_userId: { chatId: createdChat.id, userId } },
        data: { lastReadAt: now, lastReadMessageId: eventMessage.id },
      });

      return tx.chat.update({
        where: { id: createdChat.id },
        data: {
          lastMessageId: eventMessage.id,
          lastMessageAt: eventMessage.createdAt,
          updatedAt: eventMessage.createdAt,
        },
        include: chatInclude,
      });
    });

    const creator = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const creationMessage = chat.messages[0];
    if (creationMessage?.content?.startsWith('__CHAT_EVENT__')) {
      creationMessage.content = `__CHAT_EVENT__${JSON.stringify({
        type: 'created',
        actor: { id: userId, username: creator?.username ?? 'Пользователь' },
        targets: [],
      })}`;
    }

    const onlineUserIds = await this.getOnlineUserIdsForChats([chat]);

    return this.mapChat(chat, userId, undefined, undefined, onlineUserIds);
  }

  async updateChatTitle(
    userId: string,
    chatId: string,
    dto: UpdateChatTitleDto,
  ) {
    await this.requireOwnerOrAdmin(chatId, userId);

    const title = dto.title.trim();

    if (!title) {
      throw new BadRequestException('Название чата не может быть пустым');
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, type: true, deletedAt: true, avatarUrl: true },
    });

    if (!chat || chat.deletedAt) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.type !== ChatType.GROUP) {
      throw new BadRequestException(
        'Изменять имя можно только у группового чата',
      );
    }

    const updated = await this.prisma.chat.update({
      where: { id: chatId },
      data: { title },
      include: chatInclude,
    });

    return this.mapChat(updated, userId);
  }

  async updateChatAvatar(
    userId: string,
    chatId: string,
    dto: UpdateChatAvatarDto,
  ) {
    await this.requireOwnerOrAdmin(chatId, userId);

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, type: true, deletedAt: true, avatarUrl: true },
    });

    if (!chat || chat.deletedAt) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.type !== ChatType.GROUP) {
      throw new BadRequestException(
        'Изменять аватар можно только у группового чата',
      );
    }

    const oldAvatarUrl = chat.avatarUrl;
    const updated = await this.prisma.chat.update({
      where: { id: chatId },
      data: { avatarUrl: dto.avatarUrl ?? null },
      include: chatInclude,
    });

    if (oldAvatarUrl && oldAvatarUrl !== dto.avatarUrl) {
      deleteUploadedFileByUrl(oldAvatarUrl);
    }

    return this.mapChat(updated, userId);
  }

  async inviteMembers(
    userId: string,
    chatId: string,
    dto: InviteChatMembersDto,
  ) {
    const currentMember = await this.requireOwnerOrAdmin(chatId, userId);
    const uniqueMemberIds = [
      ...new Set(dto.memberIds.filter((id) => id !== userId)),
    ];

    if (uniqueMemberIds.length === 0) {
      throw new BadRequestException('Выбери хотя бы одного участника');
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, type: true, deletedAt: true, avatarUrl: true },
    });

    if (!chat || chat.deletedAt) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.type !== ChatType.GROUP) {
      throw new BadRequestException(
        'Приглашать участников можно только в групповой чат',
      );
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueMemberIds }, deletedAt: null },
      select: { id: true },
    });

    if (users.length !== uniqueMemberIds.length) {
      throw new BadRequestException(
        'Один или несколько выбранных пользователей не найдены',
      );
    }

    const allowedIds = await this.getInvitableUserIds(userId, uniqueMemberIds);

    if (allowedIds.size !== uniqueMemberIds.length) {
      throw new BadRequestException(
        'Можно приглашать только друзей, подписчиков или пользователей из твоих подписок',
      );
    }

    const existingMembers = await this.prisma.chatMember.findMany({
      where: { chatId, userId: { in: uniqueMemberIds } },
    });
    const existingMemberByUserId = new Map(
      existingMembers.map((member) => [member.userId, member]),
    );
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const memberId of uniqueMemberIds) {
        const existingMember = existingMemberByUserId.get(memberId);

        if (existingMember && !existingMember.leftAt) {
          continue;
        }

        if (existingMember) {
          await tx.chatMember.update({
            where: { id: existingMember.id },
            data: {
              role: ChatMemberRole.MEMBER,
              leftAt: null,
              leftChatTitle: null,
              leftChatAvatarUrl: null,
              deletedForUserAt: null,
              joinedAt: now,
              notificationsEnabled: true,
            },
          });
        } else {
          await tx.chatMember.create({
            data: {
              chatId,
              userId: memberId,
              role: ChatMemberRole.MEMBER,
              joinedAt: now,
            },
          });
        }

        await tx.chatInvite.upsert({
          where: { chatId_invitedUserId: { chatId, invitedUserId: memberId } },
          create: {
            chatId,
            invitedById: currentMember.userId,
            invitedUserId: memberId,
          },
          update: {
            invitedById: currentMember.userId,
          },
        });
      }

      await tx.chat.update({
        where: { id: chatId },
        data: { updatedAt: now },
      });
    });

    const [actor, invitedUsers, fullChat] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: uniqueMemberIds } },
        select: { id: true, username: true },
      }),
      this.prisma.chat.findUnique({
        where: { id: chatId },
        select: { title: true },
      }),
    ]);

    if (invitedUsers.length > 0) {
      const eventMessage = await this.prisma.message.create({
        data: {
          chatId,
          senderId: null,
          content: `__CHAT_EVENT__${JSON.stringify({
            type: 'invite',
            actor: { id: userId, username: actor?.username ?? 'Пользователь' },
            targets: invitedUsers.map((target) => ({
              id: target.id,
              username: target.username,
            })),
          })}`,
          type: MessageType.TEXT,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.prisma.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: eventMessage.id,
          lastMessageAt: eventMessage.createdAt,
          updatedAt: eventMessage.createdAt,
        },
      });

      for (const invitedUser of invitedUsers) {
        await this.notificationsService.create({
          userId: invitedUser.id,
          actorId: userId,
          type: NotificationType.CHAT_INVITE,
          title: 'Приглашение в групповой чат',
          body: `${actor?.username ?? 'Пользователь'} пригласил(а) вас в ${fullChat?.title ?? 'групповой чат'}`,
          entityType: 'Chat',
          entityId: chatId,
        });
      }
    }

    return this.getMembers(userId, chatId);
  }

  async createMessage(userId: string, chatId: string, dto: CreateMessageDto) {
    await this.requireMember(chatId, userId);

    if (
      !dto.content?.trim() &&
      (!dto.attachments || dto.attachments.length === 0)
    ) {
      throw new ForbiddenException('Message cannot be empty');
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          chatId,
          senderId: userId,
          content: dto.content?.trim() || null,
          parentId: dto.parentId || null,
          type: dto.attachments?.length
            ? dto.content?.trim()
              ? MessageType.TEXT_WITH_MEDIA
              : MessageType.MEDIA
            : MessageType.TEXT,
        },
      });

      if (dto.attachments?.length) {
        for (const attachment of dto.attachments) {
          const file = await tx.fileAsset.create({
            data: {
              uploadedById: userId,
              type: attachment.type,
              status: FileAssetStatus.READY,
              url: attachment.url,
              thumbnailUrl: attachment.thumbnailUrl ?? null,
              filename: attachment.filename ?? 'attachment',
              mimeType: attachment.mimeType ?? 'application/octet-stream',
              sizeBytes: attachment.sizeBytes ?? null,
              width: attachment.width ?? null,
              height: attachment.height ?? null,
              duration: attachment.duration ?? null,
            },
          });

          await tx.messageAttachment.create({
            data: { messageId: created.id, fileId: file.id },
          });
        }
      }

      await tx.chat.update({
        where: { id: chatId },
        data: { lastMessageId: created.id, lastMessageAt: created.createdAt },
      });

      await tx.messageRead.upsert({
        where: { messageId_userId: { messageId: created.id, userId } },
        update: { readAt: new Date() },
        create: { messageId: created.id, userId },
      });

      return tx.message.findUniqueOrThrow({
        where: { id: created.id },
        include: messageInclude,
      });
    });

    const [chatForNotification, chatMembers, actor] =
      await this.prisma.$transaction([
        this.prisma.chat.findUnique({
          where: { id: chatId },
          include: {
            members: {
              where: { leftAt: null },
              include: { user: { select: { username: true } } },
            },
          },
        }),
        this.prisma.chatMember.findMany({
          where: {
            chatId,
            leftAt: null,
            userId: { not: userId },
            notificationsEnabled: true,
          },
          select: { userId: true },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { username: true },
        }),
      ]);

    const chatTitle =
      chatForNotification?.type === ChatType.GROUP
        ? `в чате «${chatForNotification.title ?? 'Группа'}»`
        : 'в личном чате';

    for (const member of chatMembers) {
      await this.notificationsService.create({
        userId: member.userId,
        actorId: userId,
        type: dto.parentId
          ? NotificationType.MESSAGE_REPLY
          : NotificationType.MESSAGE,
        title: dto.parentId
          ? `Ответ на сообщение ${chatTitle}`
          : `Новое сообщение ${chatTitle}`,
        body: `${actor?.username ?? 'Пользователь'}: ${dto.content?.trim() || 'Вложение'}`,
        entityType: 'ChatMessage',
        entityId: `${chatId}:${message.id}`,
      });
    }

    return this.mapMessage(message);
  }

  async toggleReaction(
    userId: string,
    messageId: string,
    emoji: '👍' | '👎' | '🔥' | '❤️' | '😡',
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true, deletedAt: true },
    });

    if (!message || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }

    await this.requireMember(message.chatId, userId);

    const existing = await this.prisma.messageReaction.findFirst({
      where: { messageId, userId },
    });

    if (existing?.emoji === emoji) {
      await this.prisma.messageReaction.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.messageReaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
    } else {
      await this.prisma.messageReaction.create({
        data: { messageId, userId, emoji },
      });
    }

    const updatedMessage = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: messageInclude,
    });

    if (updatedMessage.senderId && updatedMessage.senderId !== userId) {
      const [actor, chat, targetMember] = await this.prisma.$transaction([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { username: true },
        }),
        this.prisma.chat.findUnique({
          where: { id: updatedMessage.chatId },
          select: { type: true, title: true },
        }),
        this.prisma.chatMember.findUnique({
          where: {
            chatId_userId: {
              chatId: updatedMessage.chatId,
              userId: updatedMessage.senderId,
            },
          },
          select: { notificationsEnabled: true, leftAt: true },
        }),
      ]);

      if (targetMember?.notificationsEnabled && !targetMember.leftAt) {
        const chatTitle =
          chat?.type === ChatType.GROUP
            ? `в чате «${chat.title ?? 'Группа'}»`
            : 'в личном чате';

        await this.notificationsService.create({
          userId: updatedMessage.senderId,
          actorId: userId,
          type: NotificationType.MESSAGE_REACTION,
          title: `Реакция на сообщение ${chatTitle}`,
          body: `${actor?.username ?? 'Пользователь'} поставил(а) реакцию ${emoji}`,
          entityType: 'ChatMessage',
          entityId: `${updatedMessage.chatId}:${updatedMessage.id}`,
        });
      }
    }

    return this.mapMessage(updatedMessage);
  }

  async markAsRead(userId: string, chatId: string, messageId?: string) {
    const member = await this.requireReadableMember(chatId, userId);

    const messages = await this.prisma.message.findMany({
      where: {
        chatId,
        deletedAt: null,
        ...(messageId ? { id: messageId } : {}),
        ...(member.leftAt ? { createdAt: { lte: member.leftAt } } : {}),
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      return { success: true };
    }

    const now = new Date();

    await this.prisma.$transaction([
      ...messages.map((message) =>
        this.prisma.messageRead.upsert({
          where: { messageId_userId: { messageId: message.id, userId } },
          update: { readAt: now },
          create: { messageId: message.id, userId, readAt: now },
        }),
      ),
      this.prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: {
          lastReadAt: now,
          lastReadMessageId: messages[messages.length - 1]?.id,
        },
      }),
    ]);

    return { success: true };
  }

  async toggleNotifications(userId: string, chatId: string, enabled: boolean) {
    await this.requireMember(chatId, userId);

    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { notificationsEnabled: enabled },
    });

    return { success: true };
  }

  async leaveOrDeleteChat(userId: string, chatId: string) {
    const [member, chat] = await this.prisma.$transaction([
      this.prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      }),
      this.prisma.chat.findUnique({
        where: { id: chatId },
      }),
    ]);

    if (!member || !chat || chat.deletedAt || member.deletedForUserAt) {
      throw new ForbiddenException('No access to chat');
    }

    const now = new Date();

    if (member.leftAt) {
      await this.prisma.chatMember.update({
        where: { chatId_userId: { chatId, userId } },
        data: { deletedForUserAt: now },
      });
      return { success: true, action: 'left', affectedUserIds: [userId] };
    }

    if (chat.type === ChatType.DIRECT) {
      const members = await this.prisma.chatMember.findMany({
        where: { chatId },
        select: { userId: true },
      });

      await this.prisma.chat.delete({
        where: { id: chatId },
      });

      return {
        success: true,
        action: 'deleted',
        affectedUserIds: members.map((item) => item.userId),
      };
    }

    if (member.role === ChatMemberRole.OWNER) {
      const members = await this.prisma.chatMember.findMany({
        where: { chatId, leftAt: null, deletedForUserAt: null },
        select: { userId: true },
      });

      await this.prisma.chat.update({
        where: { id: chatId },
        data: { deletedAt: new Date() },
      });

      return {
        success: true,
        action: 'deleted',
        affectedUserIds: members.map((item) => item.userId),
      };
    }

    await this.prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: {
        leftAt: now,
        deletedForUserAt: now,
        leftChatTitle: chat.title,
        leftChatAvatarUrl: null,
      },
    });

    return { success: true, action: 'left', affectedUserIds: [userId] };
  }

  async deleteGroupChat(userId: string, chatId: string) {
    const member = await this.requireOwner(chatId, userId);
    const chat = await this.prisma.chat.findUniqueOrThrow({
      where: { id: chatId },
    });

    if (chat.type !== ChatType.GROUP || member.role !== ChatMemberRole.OWNER) {
      throw new ForbiddenException('Only group owner can delete group chat');
    }

    const members = await this.prisma.chatMember.findMany({
      where: { chatId, leftAt: null, deletedForUserAt: null },
      select: { userId: true },
    });

    await this.prisma.chat.update({
      where: { id: chatId },
      data: { deletedAt: new Date() },
    });

    return {
      success: true,
      action: 'deleted',
      affectedUserIds: members.map((item) => item.userId),
    };
  }

  async updateMemberRole(
    currentUserId: string,
    chatId: string,
    targetUserId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    await this.requireOwner(chatId, currentUserId);

    const target = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: targetUserId } },
    });

    if (!target || target.leftAt) {
      throw new NotFoundException('Member not found');
    }

    if (target.role === ChatMemberRole.OWNER) {
      throw new ForbiddenException('Cannot change owner role');
    }

    await this.prisma.chatMember.update({
      where: { id: target.id },
      data: { role },
    });

    return this.getMembers(currentUserId, chatId);
  }

  async removeMember(
    currentUserId: string,
    chatId: string,
    targetUserId: string,
  ) {
    await this.requireOwnerOrAdmin(chatId, currentUserId);

    const target = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: targetUserId } },
    });

    if (!target || target.leftAt) {
      throw new NotFoundException('Member not found');
    }

    if (target.role === ChatMemberRole.OWNER) {
      throw new ForbiddenException('Cannot remove owner');
    }

    const [actor, targetUser, chatSnapshot] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        where: { id: currentUserId },
        select: { id: true, username: true },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true },
      }),
      this.prisma.chat.findUnique({
        where: { id: chatId },
        select: { title: true, avatarUrl: true },
      }),
    ]);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.chatMember.update({
        where: { id: target.id },
        data: {
          leftAt: now,
          leftChatTitle: chatSnapshot?.title ?? 'Чат',
          leftChatAvatarUrl: null,
          deletedForUserAt: null,
        },
      });

      const eventMessage = await tx.message.create({
        data: {
          chatId,
          senderId: null,
          content: `__CHAT_EVENT__${JSON.stringify({
            type: 'remove',
            actor: {
              id: actor?.id ?? currentUserId,
              username: actor?.username ?? 'Пользователь',
            },
            targets: [
              {
                id: targetUser?.id ?? targetUserId,
                username: targetUser?.username ?? 'Пользователь',
              },
            ],
          })}`,
          type: MessageType.TEXT,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.chat.update({
        where: { id: chatId },
        data: {
          lastMessageId: eventMessage.id,
          lastMessageAt: eventMessage.createdAt,
          updatedAt: eventMessage.createdAt,
        },
      });
    });

    return this.getMembers(currentUserId, chatId);
  }

  async deleteMessage(
    currentUserId: string,
    chatId: string,
    messageId: string,
  ) {
    const member = await this.requireMember(chatId, currentUserId);
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message || message.chatId !== chatId || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }

    const canDelete =
      message.senderId === currentUserId ||
      member.role === ChatMemberRole.OWNER ||
      member.role === ChatMemberRole.ADMIN;

    if (!canDelete) {
      throw new ForbiddenException('Cannot delete this message');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: null },
      include: messageInclude,
    });

    return this.mapMessage(updated);
  }

  async pinMessage(currentUserId: string, chatId: string, messageId: string) {
    await this.requireOwnerOrAdmin(chatId, currentUserId);

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: new Date(), pinnedById: currentUserId },
      include: messageInclude,
    });

    if (updated.chatId !== chatId) {
      throw new NotFoundException('Message not found');
    }

    return this.mapMessage(updated);
  }

  async unpinMessage(currentUserId: string, chatId: string, messageId: string) {
    await this.requireOwnerOrAdmin(chatId, currentUserId);

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: null, pinnedById: null },
      include: messageInclude,
    });

    if (updated.chatId !== chatId) {
      throw new NotFoundException('Message not found');
    }

    return this.mapMessage(updated);
  }

  async getChatAudience(chatId: string, includeLeft = false) {
    const members = await this.prisma.chatMember.findMany({
      where: {
        chatId,
        deletedForUserAt: null,
        ...(includeLeft ? {} : { leftAt: null }),
      },
      select: { userId: true },
    });

    return members.map((member) => member.userId);
  }

  async getChatForUserById(userId: string, chatId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: chatInclude,
    });

    if (!chat || chat.deletedAt) return null;

    const member = chat.members.find((item) => item.userId === userId);

    if (
      !member ||
      member.deletedForUserAt ||
      (member.leftAt &&
        !(await this.hasRemovalEventForUserInChat(chat.id, userId)))
    ) {
      return null;
    }

    if (
      chat.type === ChatType.DIRECT &&
      !chat.members.some(
        (item) =>
          item.userId !== userId && !item.leftAt && !item.deletedForUserAt,
      )
    ) {
      return null;
    }

    const [visibleChat] = await this.withVisibleLastMessages(userId, [chat]);
    const onlineUserIds = await this.getOnlineUserIdsForChats([visibleChat]);

    return this.mapChat(
      visibleChat,
      userId,
      undefined,
      undefined,
      onlineUserIds,
    );
  }

  async getUserChatIds(userId: string) {
    const members = await this.prisma.chatMember.findMany({
      where: {
        userId,
        leftAt: null,
        deletedForUserAt: null,
        chat: {
          deletedAt: null,
          OR: [
            { type: ChatType.GROUP },
            {
              type: ChatType.DIRECT,
              members: {
                some: {
                  userId: { not: userId },
                  leftAt: null,
                  deletedForUserAt: null,
                },
              },
            },
          ],
        },
      },
      select: { chatId: true },
    });

    return members.map((member) => member.chatId);
  }

  async requireMember(chatId: string, userId: string) {
    const member = await this.prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      include: {
        chat: {
          select: {
            type: true,
            deletedAt: true,
            members: {
              select: {
                userId: true,
                leftAt: true,
                deletedForUserAt: true,
              },
            },
          },
        },
      },
    });

    if (!member || member.leftAt || member.deletedForUserAt || member.chat.deletedAt) {
      throw new ForbiddenException('No access to chat');
    }

    if (
      member.chat.type === ChatType.DIRECT &&
      !member.chat.members.some(
        (item) =>
          item.userId !== userId && !item.leftAt && !item.deletedForUserAt,
      )
    ) {
      throw new ForbiddenException('No access to chat');
    }

    return member;
  }

  private async requireReadableMember(chatId: string, userId: string) {
    const [member, chat] = await this.prisma.$transaction([
      this.prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
      }),
      this.prisma.chat.findUnique({
        where: { id: chatId },
        select: { id: true, deletedAt: true },
      }),
    ]);

    if (!member || !chat || chat.deletedAt || member.deletedForUserAt) {
      throw new ForbiddenException('No access to chat');
    }

    if (
      member.leftAt &&
      !(await this.hasRemovalEventForUserInChat(chatId, userId))
    ) {
      throw new ForbiddenException('No access to chat');
    }

    if (!member.leftAt) {
      const directChat = await this.prisma.chat.findUnique({
        where: { id: chatId },
        select: {
          type: true,
          members: {
            select: {
              userId: true,
              leftAt: true,
              deletedForUserAt: true,
            },
          },
        },
      });

      if (
        directChat?.type === ChatType.DIRECT &&
        !directChat.members.some(
          (item) =>
            item.userId !== userId && !item.leftAt && !item.deletedForUserAt,
        )
      ) {
        throw new ForbiddenException('No access to chat');
      }
    }

    return member;
  }

  private async requireOwner(chatId: string, userId: string) {
    const member = await this.requireMember(chatId, userId);

    if (member.role !== ChatMemberRole.OWNER) {
      throw new ForbiddenException('Only owner can do this');
    }

    return member;
  }

  private async requireOwnerOrAdmin(chatId: string, userId: string) {
    const member = await this.requireMember(chatId, userId);

    if (
      member.role !== ChatMemberRole.OWNER &&
      member.role !== ChatMemberRole.ADMIN
    ) {
      throw new ForbiddenException('Only owner or admin can do this');
    }

    return member;
  }

  private async getUnreadCountMap(userId: string, chatIds: string[]) {
    const result = new Map<string, number>();

    if (chatIds.length === 0) {
      return result;
    }

    const members = await this.prisma.chatMember.findMany({
      where: { userId, chatId: { in: chatIds }, deletedForUserAt: null },
      select: { chatId: true, lastReadAt: true, leftAt: true },
    });

    for (const member of members) {
      const count = await this.prisma.message.count({
        where: {
          chatId: member.chatId,
          deletedAt: null,
          OR: [{ senderId: { not: userId } }, { senderId: null }],
          ...(member.lastReadAt
            ? { createdAt: { gt: member.lastReadAt } }
            : {}),
          ...(member.leftAt ? { createdAt: { lte: member.leftAt } } : {}),
        },
      });
      result.set(member.chatId, count);
    }

    return result;
  }

  private async canDirectChat(userId: string, targetUserId: string) {
    const [userAId, userBId] = [userId, targetUserId].sort();

    const [friendship, follow] = await this.prisma.$transaction([
      this.prisma.friendship.findFirst({
        where: { userAId, userBId },
        select: { id: true },
      }),
      this.prisma.follow.findFirst({
        where: {
          OR: [
            { followerId: userId, followingId: targetUserId },
            { followerId: targetUserId, followingId: userId },
          ],
        },
        select: { id: true },
      }),
    ]);

    return Boolean(friendship || follow);
  }

  private async getInvitableUserIds(userId: string, targetUserIds: string[]) {
    if (targetUserIds.length === 0) {
      return new Set<string>();
    }

    const friendshipPairs = targetUserIds.map((targetUserId) => {
      const [userAId, userBId] = [userId, targetUserId].sort();

      return { userAId, userBId };
    });

    const [friendships, follows] = await this.prisma.$transaction([
      this.prisma.friendship.findMany({
        where: { OR: friendshipPairs },
        select: { userAId: true, userBId: true },
      }),
      this.prisma.follow.findMany({
        where: {
          OR: [
            { followerId: userId, followingId: { in: targetUserIds } },
            { followingId: userId, followerId: { in: targetUserIds } },
          ],
        },
        select: { followerId: true, followingId: true },
      }),
    ]);

    const allowedIds = new Set<string>();

    for (const friendship of friendships) {
      allowedIds.add(
        friendship.userAId === userId ? friendship.userBId : friendship.userAId,
      );
    }

    for (const follow of follows) {
      allowedIds.add(
        follow.followerId === userId ? follow.followingId : follow.followerId,
      );
    }

    return allowedIds;
  }

  private resolveFileType(file: any, requestedType?: FileAssetType) {
    if (requestedType && Object.values(FileAssetType).includes(requestedType)) {
      return requestedType;
    }

    const mimeType = String(file.mimetype ?? '');
    const originalName = String(file.originalname ?? '').toLowerCase();

    if (mimeType.startsWith('image/')) return FileAssetType.IMAGE;
    if (mimeType.startsWith('video/')) return FileAssetType.VIDEO;
    if (mimeType.startsWith('audio/')) return FileAssetType.AUDIO;
    if (/\.(zip|rar|7z|tar|gz)$/.test(originalName))
      return FileAssetType.ARCHIVE;

    return FileAssetType.FILE;
  }

  private slugify(value: string) {
    return (
      value
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\p{L}\p{N}_-]+/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'chat'
    );
  }

  private mapChat(
    chat: Prisma.ChatGetPayload<{ include: typeof chatInclude }>,
    currentUserId: string,
    matchedMessage?: Prisma.MessageGetPayload<{
      include: typeof messageInclude;
    }>,
    unreadCountOverride?: number,
    onlineUserIds: Set<string> = new Set(),
  ) {
    const activeMembers = chat.members.filter(
      (member) => !member.leftAt && !member.deletedForUserAt,
    );
    const currentMember = chat.members.find(
      (member) => member.userId === currentUserId,
    );
    const otherMember = activeMembers.find(
      (member) => member.userId !== currentUserId,
    );
    const isReadOnly = Boolean(currentMember?.leftAt);
    const title = isReadOnly
      ? (currentMember?.leftChatTitle ?? chat.title ?? 'Чат')
      : chat.type === ChatType.DIRECT
        ? otherMember?.user.username
        : chat.title;
    const avatarUrl = isReadOnly
      ? null
      : chat.type === ChatType.DIRECT
        ? (otherMember?.user.profile?.avatarUrl ?? null)
        : chat.avatarUrl;

    const lastMessage = chat.messages[0];
    const unreadCount =
      unreadCountOverride ??
      (currentMember?.lastReadAt
        ? chat.messages.filter(
            (message) =>
              message.createdAt > currentMember.lastReadAt! &&
              message.senderId !== currentUserId,
          ).length
        : lastMessage && lastMessage.senderId !== currentUserId
          ? 1
          : 0);

    return {
      id: chat.id,
      type: chat.type,
      title: title ?? 'Чат',
      avatarUrl,
      currentUserRole: currentMember?.role ?? 'MEMBER',
      notificationsEnabled: currentMember?.notificationsEnabled ?? true,
      directUser:
        chat.type === ChatType.DIRECT && otherMember
          ? this.mapUser(otherMember.user, onlineUserIds)
          : null,
      members: isReadOnly
        ? []
        : activeMembers.map((member) => this.mapMember(member, onlineUserIds)),
      membersCount: isReadOnly ? 0 : activeMembers.length,
      unreadCount,
      isDraft: false,
      isReadOnly,
      lastMessage: lastMessage
        ? this.mapMessage(lastMessage, onlineUserIds)
        : null,
      matchedMessage: matchedMessage
        ? this.mapMessage(matchedMessage, onlineUserIds)
        : null,
      lastMessageAt: isReadOnly
        ? (lastMessage?.createdAt ?? chat.lastMessageAt)
        : chat.lastMessageAt,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
  }


  private mapDraftDirectChat(
    targetUser: Prisma.UserGetPayload<{ select: typeof userSelect }>,
    onlineUserIds: Set<string> = new Set(),
  ) {
    const directUser = this.mapUser(targetUser, onlineUserIds);

    return {
      id: `draft:${targetUser.id}`,
      type: ChatType.DIRECT,
      title: targetUser.username,
      avatarUrl: targetUser.profile?.avatarUrl ?? null,
      currentUserRole: ChatMemberRole.MEMBER,
      notificationsEnabled: true,
      directUser,
      members: [],
      membersCount: 2,
      unreadCount: 0,
      isDraft: true,
      isReadOnly: false,
      lastMessage: null,
      matchedMessage: null,
      lastMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private mapMember(
    member: Prisma.ChatMemberGetPayload<{
      include: { user: { select: typeof userSelect } };
    }>,
    onlineUserIds: Set<string> = new Set(),
  ) {
    return {
      id: member.id,
      userId: member.userId,
      role: member.role,
      joinedAt: member.joinedAt,
      lastReadAt: member.lastReadAt,
      notificationsEnabled: member.notificationsEnabled,
      user: this.mapUser(member.user, onlineUserIds),
    };
  }

  private mapMessage(
    message: Prisma.MessageGetPayload<{ include: typeof messageInclude }>,
    onlineUserIds: Set<string> = new Set(),
  ) {
    return {
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sender: message.sender
        ? this.mapUser(message.sender, onlineUserIds)
        : null,
      type: message.type,
      content: message.content,
      parentId: message.parentId,
      parent: message.parent
        ? {
            id: message.parent.id,
            content: message.parent.content,
            sender: message.parent.sender
              ? this.mapUser(message.parent.sender, onlineUserIds)
              : null,
          }
        : null,
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        file: attachment.file,
      })),
      reactions: message.reactions.map((reaction) => ({
        id: reaction.id,
        emoji: reaction.emoji,
        userId: reaction.userId,
        user: this.mapUser(reaction.user, onlineUserIds),
      })),
      reads: message.reads.map((read) => ({
        id: read.id,
        userId: read.userId,
        readAt: read.readAt,
        user: this.mapUser(read.user, onlineUserIds),
      })),
      pinnedAt: message.pinnedAt,
      pinnedById: message.pinnedById,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  private mapUser(
    user: Prisma.UserGetPayload<{ select: typeof userSelect }>,
    onlineUserIds: Set<string> = new Set(),
  ) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.profile?.avatarUrl ?? null,
      lastLoginAt: user.lastLoginAt,
      isOnline: onlineUserIds.has(user.id),
    };
  }

  private async getOnlineUserIdsForChats(
    chats: Array<Prisma.ChatGetPayload<{ include: typeof chatInclude }>>,
  ) {
    const userIds = new Set<string>();

    for (const chat of chats) {
      for (const member of chat.members) {
        userIds.add(member.userId);
      }
      for (const message of chat.messages) {
        this.collectMessageUserIds(message, userIds);
      }
    }

    return this.getOnlineUserIds([...userIds]);
  }

  private async getOnlineUserIdsForMessages(
    messages: Array<
      Prisma.MessageGetPayload<{ include: typeof messageInclude }>
    >,
  ) {
    const userIds = new Set<string>();

    for (const message of messages) {
      this.collectMessageUserIds(message, userIds);
    }

    return this.getOnlineUserIds([...userIds]);
  }

  private collectMessageUserIds(
    message: Prisma.MessageGetPayload<{ include: typeof messageInclude }>,
    userIds: Set<string>,
  ) {
    if (message.senderId) userIds.add(message.senderId);
    if (message.parent?.sender?.id) userIds.add(message.parent.sender.id);
    for (const reaction of message.reactions) userIds.add(reaction.userId);
    for (const read of message.reads) userIds.add(read.userId);
  }

  private async getOnlineUserIds(userIds: string[]) {
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return new Set<string>();
    }

    const onlineMap = await this.presenceService.getOnlineMap(uniqueUserIds);

    return new Set(
      [...onlineMap.entries()]
        .filter(([, isOnline]) => isOnline)
        .map(([id]) => id),
    );
  }

  private async withVisibleLastMessages<
    T extends Prisma.ChatGetPayload<{ include: typeof chatInclude }>,
  >(userId: string, chats: T[]) {
    const result: T[] = [];

    for (const chat of chats) {
      const member = chat.members.find((item) => item.userId === userId);

      if (!member?.leftAt) {
        result.push(chat);
        continue;
      }

      const visibleLastMessage = await this.prisma.message.findFirst({
        where: {
          chatId: chat.id,
          deletedAt: null,
          createdAt: { lte: member.leftAt },
        },
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
      });

      result.push({
        ...chat,
        messages: visibleLastMessage ? [visibleLastMessage] : [],
      } as T);
    }

    return result;
  }

  private async hasRemovalEventForUserInChat(chatId: string, userId: string) {
    const message = await this.prisma.message.findFirst({
      where: {
        chatId,
        deletedAt: null,
        content: {
          startsWith: '__CHAT_EVENT__',
        },
        AND: [
          { content: { contains: '"type":"remove"' } },
          { content: { contains: userId } },
        ],
      },
      select: { id: true },
    });

    return Boolean(message);
  }
}
