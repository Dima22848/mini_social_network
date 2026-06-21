// Логика друзей/подписок. Тут важно не смешивать дружбу, подписку и pending-заявки.
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FriendRequestStatus,
  FollowSource,
  NotificationType,
  Prisma,
  User,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PresenceService } from '../presence/presence.service';
import { FriendsQueryDto, SubscriptionsQueryDto } from './dto/users-query.dto';
import { NotificationsService } from '../notifications/notifications.service';

type PublicUserWithProfile = Pick<User, 'id' | 'username' | 'email'> & {
  profile: {
    avatarUrl: string | null;
    bio: string | null;
  } | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenceService: PresenceService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getFriendsPage(userId: string, query: FriendsQueryDto) {
    const tab = query.tab ?? 'all';
    const page = query.page ?? 1;
    const limit = query.limit ?? 6;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const friends = await this.getFriendUsers(userId, search);

    const onlineMap = await this.presenceService.getOnlineMap(
      friends.map((friend) => friend.id),
    );

    const allFriends = this.sortUsers(
      friends.map((friend) =>
        this.toUserCard(friend, onlineMap.get(friend.id) ?? false),
      ),
      query.sort ?? 'name',
    );

    if (tab === 'requests') {
      const where: Prisma.FriendRequestWhereInput = {
        toUserId: userId,
        status: FriendRequestStatus.PENDING,
        ...(search
          ? {
              fromUser: this.getUserSearchFilter(search),
            }
          : {}),
      };

      const [requests, total] = await this.prisma.$transaction([
        this.prisma.friendRequest.findMany({
          where,
          include: {
            fromUser: {
              include: {
                profile: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.friendRequest.count({ where }),
      ]);

      const requestUserIds = requests.map((request) => request.fromUserId);
      const [mutualMap, requestOnlineMap] = await Promise.all([
        this.getMutualFriendsCountMap(userId, requestUserIds),
        this.presenceService.getOnlineMap(requestUserIds),
      ]);

      return {
        tab,
        items: requests.map((request) => ({
          requestId: request.id,
          user: this.toUserCard(
            request.fromUser,
            requestOnlineMap.get(request.fromUserId) ?? false,
          ),
          mutualFriendsCount: mutualMap.get(request.fromUserId) ?? 0,
        })),
        counters: {
          all: allFriends.length,
          online: allFriends.filter((friend) => friend.isOnline).length,
          requests: total,
        },
        pagination: this.getPagination(total, page, limit),
      };
    }

    const filteredFriends =
      tab === 'online'
        ? allFriends.filter((friend) => friend.isOnline)
        : allFriends;

    const total = filteredFriends.length;

    return {
      tab,
      items: filteredFriends.slice(skip, skip + limit),
      counters: {
        all: allFriends.length,
        online: allFriends.filter((friend) => friend.isOnline).length,
        requests: await this.prisma.friendRequest.count({
          where: {
            toUserId: userId,
            status: FriendRequestStatus.PENDING,
          },
        }),
      },
      pagination: this.getPagination(total, page, limit),
    };
  }

  async getSubscriptionsPage(userId: string, query: SubscriptionsQueryDto) {
    const tab = query.tab ?? 'followers';
    const page = query.page ?? 1;
    const limit = query.limit ?? 5;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.FollowWhereInput =
      tab === 'followers'
        ? {
            followingId: userId,
            ...(search ? { follower: this.getUserSearchFilter(search) } : {}),
          }
        : {
            followerId: userId,
            ...(search ? { following: this.getUserSearchFilter(search) } : {}),
          };

    const relations = await this.prisma.follow.findMany({
      where,
      include: {
        follower: {
          include: {
            profile: true,
          },
        },
        following: {
          include: {
            profile: true,
          },
        },
      },
      orderBy:
        query.sort === 'active'
          ? {
              createdAt: 'asc',
            }
          : {
              createdAt: 'desc',
            },
    });

    const users = relations.map((relation) =>
      tab === 'followers' ? relation.follower : relation.following,
    );

    const relationUserIds = users.map((user) => user.id);
    const friendshipMap = await this.getFriendshipMap(userId, relationUserIds);

    const onlyNotFriends = users.filter(
      (targetUser) => !(friendshipMap.get(targetUser.id) ?? false),
    );

    const total = onlyNotFriends.length;
    const paginatedUsers = onlyNotFriends.slice(skip, skip + limit);
    const paginatedUserIds = paginatedUsers.map((user) => user.id);

    const [followingMap, onlineMap] = await Promise.all([
      this.getFollowingMap(userId, paginatedUserIds),
      this.presenceService.getOnlineMap(paginatedUserIds),
    ]);

    const incomingRequestMap = await this.getIncomingPendingRequestMap(
      userId,
      paginatedUserIds,
    );

    const followersCount = await this.getSubscriptionsCountWithoutFriends(
      userId,
      'followers',
    );

    const followingCount = await this.getSubscriptionsCountWithoutFriends(
      userId,
      'following',
    );

    return {
      tab,
      items: paginatedUsers.map((targetUser) => ({
        user: this.toUserCard(
          targetUser,
          onlineMap.get(targetUser.id) ?? false,
        ),
        isFriend: false,
        isFollowing: followingMap.get(targetUser.id) ?? false,
        incomingRequestId: incomingRequestMap.get(targetUser.id) ?? null,
      })),
      counters: {
        followers: followersCount,
        following: followingCount,
      },
      pagination: this.getPagination(total, page, limit),
    };
  }

  async discoverUsers(
    userId: string,
    query: { search?: string; limit?: number },
  ) {
    const search = query.search?.trim();
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 80);

    const [
      friendIds,
      followers,
      following,
      outgoingRequests,
      incomingRequests,
    ] = await Promise.all([
      this.getFriendUsers(userId),
      this.prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
      }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
      this.prisma.friendRequest.findMany({
        where: { fromUserId: userId, status: FriendRequestStatus.PENDING },
        select: { toUserId: true },
      }),
      this.prisma.friendRequest.findMany({
        where: { toUserId: userId, status: FriendRequestStatus.PENDING },
        select: { fromUserId: true },
      }),
    ]);

    const excludedIds = new Set<string>([
      userId,
      ...friendIds.map((friend) => friend.id),
      ...followers.map((follow) => follow.followerId),
      ...following.map((follow) => follow.followingId),
      ...outgoingRequests.map((request) => request.toUserId),
      ...incomingRequests.map((request) => request.fromUserId),
    ]);

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { notIn: [...excludedIds] },
        ...(search ? this.getUserSearchFilter(search) : {}),
      },
      include: { profile: true },
      take: limit,
      orderBy: { username: 'asc' },
    });

    const userIds = users.map((user) => user.id);
    const [mutualMap, onlineMap] = await Promise.all([
      this.getMutualFriendsCountMap(userId, userIds),
      this.presenceService.getOnlineMap(userIds),
    ]);

    return {
      items: users
        .map((candidate) => ({
          ...this.toUserCard(candidate, onlineMap.get(candidate.id) ?? false),
          mutualFriendsCount: mutualMap.get(candidate.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.mutualFriendsCount - a.mutualFriendsCount ||
            a.username.localeCompare(b.username, 'ru'),
        ),
    };
  }

  async searchUsers(
    userId: string,
    query: { search?: string; limit?: number },
  ) {
    const search = query.search?.trim();
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 80);

    const [friends, followers, following] = await Promise.all([
      this.getFriendUsers(userId),
      this.prisma.follow.findMany({
        where: { followingId: userId },
        select: { followerId: true },
      }),
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      }),
    ]);

    const allowedIds = new Set<string>([
      ...friends.map((friend) => friend.id),
      ...followers.map((follow) => follow.followerId),
      ...following.map((follow) => follow.followingId),
    ]);

    allowedIds.delete(userId);

    if (allowedIds.size === 0) {
      return { items: [] };
    }

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { in: [...allowedIds] },
        ...(search ? this.getUserSearchFilter(search) : {}),
      },
      include: { profile: true },
      take: limit,
      orderBy: { username: 'asc' },
    });

    const userIds = users.map((user) => user.id);
    const [mutualMap, onlineMap] = await Promise.all([
      this.getMutualFriendsCountMap(userId, userIds),
      this.presenceService.getOnlineMap(userIds),
    ]);

    return {
      items: users.map((candidate) => ({
        ...this.toUserCard(candidate, onlineMap.get(candidate.id) ?? false),
        mutualFriendsCount: mutualMap.get(candidate.id) ?? 0,
      })),
    };
  }

  async sendFriendRequest(userId: string, targetUserId: string) {
    this.ensureNotSelf(userId, targetUserId);

    await this.ensureUserExists(targetUserId);

    const isFriend = await this.isFriend(userId, targetUserId);

    if (isFriend) {
      return {
        success: true,
        alreadyFriends: true,
      };
    }

    const incomingRequest = await this.prisma.friendRequest.findUnique({
      where: {
        fromUserId_toUserId: {
          fromUserId: targetUserId,
          toUserId: userId,
        },
      },
    });

    if (incomingRequest?.status === FriendRequestStatus.PENDING) {
      await this.makeUsersFriends(userId, targetUserId, incomingRequest.id);

      return {
        success: true,
        becameFriends: true,
      };
    }

    const incomingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: targetUserId,
          followingId: userId,
        },
      },
    });

    if (incomingFollow) {
      await this.makeUsersFriends(userId, targetUserId);

      return {
        success: true,
        becameFriends: true,
      };
    }

    const request = await this.prisma.friendRequest.upsert({
      where: {
        fromUserId_toUserId: {
          fromUserId: userId,
          toUserId: targetUserId,
        },
      },
      create: {
        fromUserId: userId,
        toUserId: targetUserId,
        status: FriendRequestStatus.PENDING,
      },
      update: {
        status: FriendRequestStatus.PENDING,
        respondedAt: null,
      },
    });

    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: targetUserId,
        },
      },
      create: {
        followerId: userId,
        followingId: targetUserId,
        source: FollowSource.FRIEND_REQUEST_IGNORING,
      },
      update: {
        source: FollowSource.FRIEND_REQUEST_IGNORING,
      },
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    await this.notificationsService.create({
      userId: targetUserId,
      actorId: userId,
      type: NotificationType.FRIEND_REQUEST,
      title: 'Новая заявка в друзья',
      body: `${actor?.username ?? 'Пользователь'} отправил(а) заявку в друзья`,
      entityType: 'FriendRequest',
      entityId: request.id,
    });

    return {
      success: true,
      requestId: request.id,
    };
  }

  async acceptFriendRequest(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        toUserId: userId,
        status: FriendRequestStatus.PENDING,
      },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    await this.makeUsersFriends(userId, request.fromUserId, request.id);

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    await this.notificationsService.create({
      userId: request.fromUserId,
      actorId: userId,
      type: NotificationType.FRIEND_REQUEST_ACCEPTED,
      title: 'Заявка принята',
      body: `${actor?.username ?? 'Пользователь'} принял(а) вашу заявку в друзья`,
      entityType: 'User',
      entityId: userId,
    });

    return {
      success: true,
    };
  }

  async declineFriendRequest(userId: string, requestId: string) {
    const request = await this.prisma.friendRequest.findFirst({
      where: {
        id: requestId,
        toUserId: userId,
        status: FriendRequestStatus.PENDING,
      },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    await this.prisma.friendRequest.update({
      where: {
        id: request.id,
      },
      data: {
        status: FriendRequestStatus.CANCELLED,
        respondedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  async removeFriend(userId: string, friendId: string) {
    this.ensureNotSelf(userId, friendId);

    const [userAId, userBId] = this.getFriendshipPair(userId, friendId);

    await this.prisma.$transaction([
      this.prisma.friendship.deleteMany({
        where: {
          userAId,
          userBId,
        },
      }),

      this.prisma.follow.deleteMany({
        where: {
          OR: [
            {
              followerId: userId,
              followingId: friendId,
            },
            {
              followerId: friendId,
              followingId: userId,
            },
          ],
        },
      }),

      this.prisma.friendRequest.updateMany({
        where: {
          OR: [
            {
              fromUserId: userId,
              toUserId: friendId,
              status: FriendRequestStatus.PENDING,
            },
            {
              fromUserId: friendId,
              toUserId: userId,
              status: FriendRequestStatus.PENDING,
            },
          ],
        },
        data: {
          status: FriendRequestStatus.CANCELLED,
          respondedAt: new Date(),
        },
      }),

      this.prisma.follow.create({
        data: {
          followerId: friendId,
          followingId: userId,
          source: FollowSource.FRIEND_REQUEST_CANCELLED,
        },
      }),
    ]);

    return {
      success: true,
    };
  }

  async followUser(userId: string, targetUserId: string) {
    this.ensureNotSelf(userId, targetUserId);

    await this.ensureUserExists(targetUserId);

    const isFriend = await this.isFriend(userId, targetUserId);

    if (isFriend) {
      throw new BadRequestException('You cannot follow your friend');
    }

    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: targetUserId,
        },
      },
      create: {
        followerId: userId,
        followingId: targetUserId,
        source: FollowSource.FRIEND_REQUEST_IGNORING,
      },
      update: {
        source: FollowSource.FRIEND_REQUEST_IGNORING,
      },
    });

    return {
      success: true,
    };
  }

  async unfollowUser(userId: string, targetUserId: string) {
    this.ensureNotSelf(userId, targetUserId);

    await this.prisma.$transaction([
      this.prisma.follow.deleteMany({
        where: {
          followerId: userId,
          followingId: targetUserId,
        },
      }),

      this.prisma.friendRequest.updateMany({
        where: {
          fromUserId: userId,
          toUserId: targetUserId,
          status: FriendRequestStatus.PENDING,
        },
        data: {
          status: FriendRequestStatus.CANCELLED,
          respondedAt: new Date(),
        },
      }),
    ]);

    return {
      success: true,
    };
  }

  async removeFollower(userId: string, followerId: string) {
    this.ensureNotSelf(userId, followerId);

    await this.prisma.$transaction([
      this.prisma.follow.deleteMany({
        where: {
          followerId,
          followingId: userId,
        },
      }),

      this.prisma.friendRequest.updateMany({
        where: {
          fromUserId: followerId,
          toUserId: userId,
          status: FriendRequestStatus.PENDING,
        },
        data: {
          status: FriendRequestStatus.CANCELLED,
          respondedAt: new Date(),
        },
      }),
    ]);

    return {
      success: true,
    };
  }

  private async makeUsersFriends(
    userId: string,
    targetUserId: string,
    acceptedRequestId?: string,
  ) {
    const [userAId, userBId] = this.getFriendshipPair(userId, targetUserId);
    const now = new Date();

    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.friendship.upsert({
        where: {
          userAId_userBId: {
            userAId,
            userBId,
          },
        },
        create: {
          userAId,
          userBId,
        },
        update: {},
      }),

      this.prisma.follow.deleteMany({
        where: {
          OR: [
            {
              followerId: userId,
              followingId: targetUserId,
            },
            {
              followerId: targetUserId,
              followingId: userId,
            },
          ],
        },
      }),

      this.prisma.friendRequest.updateMany({
        where: {
          fromUserId: userId,
          toUserId: targetUserId,
          status: FriendRequestStatus.PENDING,
        },
        data: {
          status: FriendRequestStatus.CANCELLED,
          respondedAt: now,
        },
      }),
    ];

    if (acceptedRequestId) {
      operations.push(
        this.prisma.friendRequest.update({
          where: {
            id: acceptedRequestId,
          },
          data: {
            status: FriendRequestStatus.ACCEPTED,
            respondedAt: now,
          },
        }),
      );
    } else {
      operations.push(
        this.prisma.friendRequest.updateMany({
          where: {
            fromUserId: targetUserId,
            toUserId: userId,
            status: FriendRequestStatus.PENDING,
          },
          data: {
            status: FriendRequestStatus.CANCELLED,
            respondedAt: now,
          },
        }),
      );
    }

    await this.prisma.$transaction(operations);
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

    const friendshipMap = await this.getFriendshipMap(userId, targetUserIds);

    return targetUserIds.filter(
      (targetUserId) => !(friendshipMap.get(targetUserId) ?? false),
    ).length;
  }

  private async getFriendUsers(userId: string, search?: string) {
    const where: Prisma.FriendshipWhereInput = {
      OR: [
        {
          userAId: userId,
        },
        {
          userBId: userId,
        },
      ],
      ...(search
        ? {
            OR: [
              {
                userAId: userId,
                userB: this.getUserSearchFilter(search),
              },
              {
                userBId: userId,
                userA: this.getUserSearchFilter(search),
              },
            ],
          }
        : {}),
    };

    const friendships = await this.prisma.friendship.findMany({
      where,
      include: {
        userA: {
          include: {
            profile: true,
          },
        },
        userB: {
          include: {
            profile: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return friendships.map((friendship) =>
      friendship.userAId === userId ? friendship.userB : friendship.userA,
    );
  }

  private getUserSearchFilter(search: string): Prisma.UserWhereInput {
    return {
      OR: [
        {
          username: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          email: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ],
    };
  }

  private toUserCard(user: PublicUserWithProfile, isOnline: boolean) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      handle: `@${user.username}`,
      avatarUrl: user.profile?.avatarUrl ?? null,
      bio: user.profile?.bio ?? 'Пока нет описания профиля.',
      isOnline,
    };
  }

  private sortUsers<T extends { username: string }>(
    items: T[],
    sort: 'name' | 'interaction',
  ) {
    if (sort === 'interaction') {
      return items;
    }

    return [...items].sort((a, b) =>
      a.username.localeCompare(b.username, 'ru'),
    );
  }

  private getPagination(total: number, page: number, limit: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private getFriendshipPair(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort() as [string, string];
  }

  private ensureNotSelf(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException(
        'You cannot perform this action with yourself',
      );
    }
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
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

  private async getFollowingMap(userId: string, targetUserIds: string[]) {
    if (targetUserIds.length === 0) {
      return new Map<string, boolean>();
    }

    const follows = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
        followingId: {
          in: targetUserIds,
        },
      },
    });

    return new Map(follows.map((follow) => [follow.followingId, true]));
  }

  private async getIncomingPendingRequestMap(
    userId: string,
    targetUserIds: string[],
  ) {
    if (targetUserIds.length === 0) {
      return new Map<string, string>();
    }

    const requests = await this.prisma.friendRequest.findMany({
      where: {
        fromUserId: {
          in: targetUserIds,
        },
        toUserId: userId,
        status: FriendRequestStatus.PENDING,
      },
    });

    return new Map(requests.map((request) => [request.fromUserId, request.id]));
  }

  private async getMutualFriendsCountMap(
    userId: string,
    targetUserIds: string[],
  ) {
    const myFriendIds = new Set(
      (await this.getFriendUsers(userId)).map((user) => user.id),
    );

    const result = new Map<string, number>();

    for (const targetUserId of targetUserIds) {
      const targetFriendIds = (await this.getFriendUsers(targetUserId)).map(
        (user) => user.id,
      );

      result.set(
        targetUserId,
        targetFriendIds.filter((friendId) => myFriendIds.has(friendId)).length,
      );
    }

    return result;
  }
}
