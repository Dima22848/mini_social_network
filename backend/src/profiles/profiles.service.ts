// Сбор публичного профиля и расчёт статуса отношений: друг, подписчик, заявка или обычный пользователь.
import { Injectable, NotFoundException } from '@nestjs/common';
import { FriendRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';

type ProfileRelationStatus =
  | 'self'
  | 'friend'
  | 'incoming_request'
  | 'outgoing_request'
  | 'follower'
  | 'following'
  | 'none';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
  ) {}

  async getPublicProfile(viewerId: string, identifier: string) {
    const targetUser = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: identifier }, { username: identifier }],
      },
      include: {
        profile: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const targetUserId = targetUser.id;

    const relation = await this.getRelation(viewerId, targetUserId);

    const [friendsCount, followersCount, followingCount, postsCount] =
      await Promise.all([
        this.getFriendsCount(targetUserId),
        this.getSubscriptionsCountWithoutFriends(targetUserId, 'followers'),
        this.getSubscriptionsCountWithoutFriends(targetUserId, 'following'),
        this.prisma.post.count({
          where: {
            authorId: targetUserId,
            deletedAt: null,
          },
        }),
      ]);

    const isOnline =
      viewerId === targetUser.id
        ? true
        : await this.presenceService.isOnline(targetUser.id);

    return {
      user: {
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        isEmailVerified: targetUser.isEmailVerified,
        createdAt: targetUser.createdAt,
        isOnline,
        profile: targetUser.profile,
      },
      relation,
      counters: {
        friends: friendsCount,
        followers: followersCount,
        following: followingCount,
        posts: postsCount,
      },
    };
  }

  private async getRelation(viewerId: string, targetUserId: string) {
    if (viewerId === targetUserId) {
      return {
        status: 'self' satisfies ProfileRelationStatus,
        isFriend: false,
        isFollowing: false,
        isFollower: false,
        incomingRequestId: null,
        outgoingRequestId: null,
      };
    }

    const [
      isFriend,
      incomingRequest,
      outgoingRequest,
      viewerFollowsTarget,
      targetFollowsViewer,
    ] = await Promise.all([
      this.isFriend(viewerId, targetUserId),

      this.prisma.friendRequest.findFirst({
        where: {
          fromUserId: targetUserId,
          toUserId: viewerId,
          status: FriendRequestStatus.PENDING,
        },
        select: {
          id: true,
        },
      }),

      this.prisma.friendRequest.findFirst({
        where: {
          fromUserId: viewerId,
          toUserId: targetUserId,
          status: FriendRequestStatus.PENDING,
        },
        select: {
          id: true,
        },
      }),

      this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: targetUserId,
          },
        },
        select: {
          id: true,
        },
      }),

      this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: targetUserId,
            followingId: viewerId,
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    let status: ProfileRelationStatus = 'none';

    if (isFriend) {
      status = 'friend';
    } else if (incomingRequest) {
      status = 'incoming_request';
    } else if (outgoingRequest) {
      status = 'outgoing_request';
    } else if (targetFollowsViewer) {
      status = 'follower';
    } else if (viewerFollowsTarget) {
      status = 'following';
    }

    return {
      status,
      isFriend,
      isFollowing: Boolean(viewerFollowsTarget),
      isFollower: Boolean(targetFollowsViewer),
      incomingRequestId: incomingRequest?.id ?? null,
      outgoingRequestId: outgoingRequest?.id ?? null,
    };
  }

  private async getFriendsCount(userId: string) {
    return this.prisma.friendship.count({
      where: {
        OR: [
          {
            userAId: userId,
          },
          {
            userBId: userId,
          },
        ],
      },
    });
  }

  private async getSubscriptionsCountWithoutFriends(
    userId: string,
    tab: 'followers' | 'following',
  ) {
    const relations = await this.prisma.follow.findMany({
      where:
        tab === 'followers'
          ? {
              followingId: userId,
            }
          : {
              followerId: userId,
            },
      select: {
        followerId: true,
        followingId: true,
      },
    });

    const targetUserIds = relations.map((relation) =>
      tab === 'followers' ? relation.followerId : relation.followingId,
    );

    if (targetUserIds.length === 0) {
      return 0;
    }

    const friendshipMap = await this.getFriendshipMap(userId, targetUserIds);

    return targetUserIds.filter(
      (targetUserId) => !(friendshipMap.get(targetUserId) ?? false),
    ).length;
  }

  private getFriendshipPair(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort() as [string, string];
  }

  private async isFriend(userId: string, targetUserId: string) {
    const [userAId, userBId] = this.getFriendshipPair(userId, targetUserId);

    const friendship = await this.prisma.friendship.findUnique({
      where: {
        userAId_userBId: {
          userAId,
          userBId,
        },
      },
      select: {
        id: true,
      },
    });

    return Boolean(friendship);
  }

  private async getFriendshipMap(userId: string, targetUserIds: string[]) {
    if (targetUserIds.length === 0) {
      return new Map<string, boolean>();
    }

    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: targetUserIds.map((targetUserId) => {
          const [userAId, userBId] = this.getFriendshipPair(
            userId,
            targetUserId,
          );

          return {
            userAId,
            userBId,
          };
        }),
      },
    });

    const map = new Map<string, boolean>();

    for (const targetUserId of targetUserIds) {
      const [userAId, userBId] = this.getFriendshipPair(userId, targetUserId);

      map.set(
        targetUserId,
        friendships.some(
          (friendship) =>
            friendship.userAId === userAId && friendship.userBId === userBId,
        ),
      );
    }

    return map;
  }
}
