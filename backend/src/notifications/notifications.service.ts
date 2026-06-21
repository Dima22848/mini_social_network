// Создание и выдача уведомлений. Socket-рассылку делаем отдельно, чтобы REST и realtime не мешали друг другу.
import { Injectable } from '@nestjs/common'
import { NotificationType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsGateway } from './notifications.gateway'

const notificationInclude = {
  actor: {
    select: {
      id: true,
      username: true,
      profile: { select: { avatarUrl: true } },
    },
  },
} satisfies Prisma.NotificationInclude

type NotificationGroup = 'posts' | 'chats' | 'friends'

const notificationGroups: Record<NotificationGroup, NotificationType[]> = {
  posts: [
    NotificationType.POST_LIKE,
    NotificationType.POST_DISLIKE,
    NotificationType.POST_COMMENT,
    NotificationType.COMMENT_LIKE,
    NotificationType.COMMENT_DISLIKE,
    NotificationType.COMMENT_REPLY,
  ],
  chats: [
    NotificationType.MESSAGE,
    NotificationType.MESSAGE_REACTION,
    NotificationType.MESSAGE_REPLY,
    NotificationType.CHAT_INVITE,
    NotificationType.CHAT_REMOVED,
    NotificationType.CHAT_ROLE_CHANGED,
  ],
  friends: [
    NotificationType.FRIEND_REQUEST,
    NotificationType.FRIEND_REQUEST_ACCEPTED,
    NotificationType.FRIEND_REQUEST_CANCELLED,
  ],
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async list(userId: string) {
    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        include: notificationInclude,
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ])

    return {
      items: items.map((item) => this.mapNotification(item)),
      unreadCount,
    }
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })

    return { success: true }
  }

  async deleteOne(userId: string, notificationId: string) {
    await this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    })

    return { success: true }
  }

  async deleteAll(userId: string) {
    await this.prisma.notification.deleteMany({ where: { userId } })

    return { success: true }
  }

  async getPreferences(userId: string) {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId },
    })

    return {
      posts: this.isGroupEnabled(preferences, 'posts'),
      chats: this.isGroupEnabled(preferences, 'chats'),
      friends: this.isGroupEnabled(preferences, 'friends'),
    }
  }

  async updatePreferences(userId: string, data: Partial<Record<NotificationGroup, boolean>>) {
    for (const [group, enabled] of Object.entries(data) as [NotificationGroup, boolean | undefined][]) {
      if (enabled === undefined || !notificationGroups[group]) {
        continue
      }

      for (const type of notificationGroups[group]) {
        await this.prisma.notificationPreference.upsert({
          where: { userId_type: { userId, type } },
          create: { userId, type, inAppEnabled: enabled, emailEnabled: false },
          update: { inAppEnabled: enabled },
        })
      }
    }

    return this.getPreferences(userId)
  }

  async create(data: {
    userId: string
    actorId?: string | null
    type: NotificationType
    title: string
    body?: string | null
    entityType?: string | null
    entityId?: string | null
  }) {
    if (!(await this.isNotificationEnabled(data.userId, data.type))) {
      return null
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        actorId: data.actorId ?? null,
        type: data.type,
        title: data.title,
        body: data.body ?? null,
        entityType: data.entityType ?? null,
        entityId: data.entityId ?? null,
      },
      include: notificationInclude,
    })

    const mapped = this.mapNotification(notification)
    this.notificationsGateway.emitToUser(data.userId, mapped)

    return notification
  }

  private async isNotificationEnabled(userId: string, type: NotificationType) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    })

    return preference?.inAppEnabled ?? true
  }

  private isGroupEnabled(preferences: { type: NotificationType; inAppEnabled: boolean }[], group: NotificationGroup) {
    const types = notificationGroups[group]
    const explicit = preferences.filter((item) => types.includes(item.type))

    if (explicit.length === 0) {
      return true
    }

    return explicit.some((item) => item.inAppEnabled)
  }

  private mapNotification(notification: Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>) {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      entityType: notification.entityType,
      entityId: notification.entityId,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
      actor: notification.actor
        ? {
            id: notification.actor.id,
            username: notification.actor.username,
            avatarUrl: notification.actor.profile?.avatarUrl ?? null,
          }
        : null,
    }
  }
}
