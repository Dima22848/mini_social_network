// Бизнес-логика постов: карточки профиля, новостная лента, комментарии, реакции и очистка старых вложений.
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FileAssetStatus,
  FileAssetType,
  Prisma,
  ReactionType,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { deleteUploadedFileByUrl } from '../common/files/file-cleanup.util';
import { MediaQueueService } from '../common/files/media-queue.service';
import { PresenceService } from '../presence/presence.service';

@Injectable()
export class PostsService {
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

    const url = `/uploads/posts/${file.filename}`;
    void this.mediaQueueService.enqueueUploadedFile({
      url,
      kind: 'post-attachment',
    });

    return {
      type,
      url,
      thumbnailUrl: null,
      filename: file.originalname ?? file.filename,
      mimeType: file.mimetype ?? 'application/octet-stream',
      sizeBytes: file.size ?? null,
      width: null,
      height: null,
      duration: null,
    };
  }

  async createPost(authorId: string, dto: CreatePostDto) {
    const content = dto.content?.trim() ?? '';
    const attachments = dto.attachments ?? [];

    if (!content && attachments.length === 0) {
      throw new BadRequestException('Post must contain text or attachments');
    }

    const post = await this.prisma.post.create({
      data: {
        authorId,
        content: content || null,
        attachments: {
          create: attachments.map((attachment, index) => ({
            sortOrder: index,
            file: {
              create: {
                uploadedById: authorId,
                type: attachment.type,
                status: FileAssetStatus.READY,
                url: attachment.url,
                thumbnailUrl: attachment.thumbnailUrl ?? null,
                filename: attachment.filename ?? null,
                mimeType: attachment.mimeType ?? null,
                sizeBytes: attachment.sizeBytes ?? null,
                width: attachment.width ?? null,
                height: attachment.height ?? null,
                duration: attachment.duration ?? null,
              },
            },
          })),
        },
      },
      include: this.getPostInclude(authorId),
    });

    return this.toPostCard(post, new Set([authorId]));
  }

  async getUserPosts(
    viewerId: string,
    identifier: string,
    query: PostsQueryDto,
  ) {
    const authorId = await this.resolveUserId(identifier);

    const page = query.page ?? 1;
    const limit = query.limit ?? 6;
    const skip = (page - 1) * limit;

    const where = {
      authorId,
      deletedAt: null,
    };

    const [posts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: this.getPostInclude(viewerId),
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),

      this.prisma.post.count({
        where,
      }),
    ]);

    const onlineUserIds = await this.getOnlineUserIds(
      posts.map((post) => post.authorId),
    );

    return {
      items: posts.map((post) => this.toPostCard(post, onlineUserIds)),
      pagination: this.getPagination(total, page, limit),
    };
  }

  async getFeedPosts(userId: string, query: PostsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 6;
    const skip = (page - 1) * limit;

    const authorIds = await this.getFeedAuthorIds(userId);

    if (authorIds.length === 0) {
      return {
        items: [],
        pagination: this.getPagination(0, page, limit),
      };
    }

    const where = {
      authorId: {
        in: authorIds,
      },
      deletedAt: null,
    };

    const [posts, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: this.getPostInclude(userId),
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),

      this.prisma.post.count({
        where,
      }),
    ]);

    const onlineUserIds = await this.getOnlineUserIds(
      posts.map((post) => post.authorId),
    );

    return {
      items: posts.map((post) => this.toPostCard(post, onlineUserIds)),
      pagination: this.getPagination(total, page, limit),
    };
  }

  async updatePost(authorId: string, postId: string, dto: CreatePostDto) {
    const content = dto.content?.trim() ?? '';
    const attachments = dto.attachments ?? [];

    if (!content && attachments.length === 0) {
      throw new BadRequestException('Post must contain text or attachments');
    }

    const post = await this.prisma.post.findFirst({
      where: { id: postId, authorId, deletedAt: null },
      select: { id: true, attachments: { include: { file: true } } },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const oldFiles = post.attachments.map((attachment) => attachment.file);

    await this.prisma.$transaction(async (tx) => {
      await tx.postAttachment.deleteMany({ where: { postId } });
      await tx.fileAsset.deleteMany({
        where: { id: { in: oldFiles.map((file) => file.id) } },
      });

      await tx.post.update({
        where: { id: postId },
        data: {
          content: content || null,
          attachments: {
            create: attachments.map((attachment, index) => ({
              sortOrder: index,
              file: {
                create: {
                  uploadedById: authorId,
                  type: attachment.type,
                  status: FileAssetStatus.READY,
                  url: attachment.url,
                  thumbnailUrl: attachment.thumbnailUrl ?? null,
                  filename: attachment.filename ?? null,
                  mimeType: attachment.mimeType ?? null,
                  sizeBytes: attachment.sizeBytes ?? null,
                  width: attachment.width ?? null,
                  height: attachment.height ?? null,
                  duration: attachment.duration ?? null,
                },
              },
            })),
          },
        },
      });
    });

    for (const file of oldFiles) {
      deleteUploadedFileByUrl(file.url);
      deleteUploadedFileByUrl(file.thumbnailUrl);
    }

    const updated = await this.prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: this.getPostInclude(authorId),
    });

    return this.toPostCard(updated, new Set([updated.authorId]));
  }

  async deletePost(authorId: string, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, authorId, deletedAt: null },
      select: { id: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }

  async togglePostReaction(userId: string, postId: string, type: ReactionType) {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
      select: {
        id: true,
        authorId: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingReaction = await this.prisma.postReaction.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      if (!existingReaction) {
        await tx.postReaction.create({
          data: {
            postId,
            userId,
            type,
          },
        });

        await tx.post.update({
          where: {
            id: postId,
          },
          data:
            type === ReactionType.LIKE
              ? { likesCount: { increment: 1 } }
              : { dislikesCount: { increment: 1 } },
        });

        return;
      }

      if (existingReaction.type === type) {
        await tx.postReaction.delete({
          where: {
            postId_userId: {
              postId,
              userId,
            },
          },
        });

        await tx.post.update({
          where: {
            id: postId,
          },
          data:
            type === ReactionType.LIKE
              ? { likesCount: { decrement: 1 } }
              : { dislikesCount: { decrement: 1 } },
        });

        return;
      }

      await tx.postReaction.update({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
        data: {
          type,
        },
      });

      await tx.post.update({
        where: {
          id: postId,
        },
        data:
          type === ReactionType.LIKE
            ? {
                likesCount: { increment: 1 },
                dislikesCount: { decrement: 1 },
              }
            : {
                likesCount: { decrement: 1 },
                dislikesCount: { increment: 1 },
              },
      });
    });

    if (post.authorId !== userId) {
      await this.notificationsService.create({
        userId: post.authorId,
        actorId: userId,
        type:
          type === ReactionType.LIKE
            ? NotificationType.POST_LIKE
            : NotificationType.POST_DISLIKE,
        title:
          type === ReactionType.LIKE
            ? 'Новый лайк поста'
            : 'Новый дизлайк поста',
        body: 'Пользователь отреагировал на ваш пост',
        entityType: 'Post',
        entityId: postId,
      });
    }

    const updatedPost = await this.prisma.post.findUniqueOrThrow({
      where: {
        id: postId,
      },
      include: this.getPostInclude(userId),
    });

    return this.toPostCard(updatedPost, new Set([updatedPost.authorId]));
  }

  async getPostComments(userId: string, postId: string) {
    await this.ensurePostExists(postId);

    const comments = await this.prisma.postComment.findMany({
      where: {
        postId,
        deletedAt: null,
      },
      include: {
        author: {
          include: {
            profile: true,
          },
        },
        reactions: {
          where: {
            userId,
          },
          select: {
            type: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const onlineUserIds = await this.getOnlineUserIds(
      comments.map((comment) => comment.authorId),
    );

    return {
      items: comments.map((comment) =>
        this.toCommentCard(comment, onlineUserIds),
      ),
    };
  }

  async createComment(userId: string, postId: string, dto: CreateCommentDto) {
    const content = dto.content.trim();

    if (!content) {
      throw new BadRequestException('Comment cannot be empty');
    }

    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true, authorId: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    let parentAuthorId: string | null = null;

    if (dto.parentId) {
      const parentComment = await this.prisma.postComment.findFirst({
        where: {
          id: dto.parentId,
          postId,
          deletedAt: null,
        },
        select: {
          id: true,
          authorId: true,
        },
      });

      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }

      parentAuthorId = parentComment.authorId;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.postComment.create({
        data: {
          postId,
          authorId: userId,
          parentId: dto.parentId ?? null,
          content,
        },
      });

      await tx.post.update({
        where: {
          id: postId,
        },
        data: {
          commentsCount: {
            increment: 1,
          },
        },
      });

      if (dto.parentId) {
        await tx.postComment.update({
          where: {
            id: dto.parentId,
          },
          data: {
            repliesCount: {
              increment: 1,
            },
          },
        });
      }
    });

    if (post.authorId !== userId) {
      await this.notificationsService.create({
        userId: post.authorId,
        actorId: userId,
        type: NotificationType.POST_COMMENT,
        title: 'Новый комментарий к посту',
        body: content,
        entityType: 'Post',
        entityId: postId,
      });
    }

    if (parentAuthorId && parentAuthorId !== userId) {
      await this.notificationsService.create({
        userId: parentAuthorId,
        actorId: userId,
        type: NotificationType.COMMENT_REPLY,
        title: 'Новый ответ на комментарий',
        body: content,
        entityType: 'Post',
        entityId: postId,
      });
    }

    return this.getPostComments(userId, postId);
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, authorId: userId, deletedAt: null },
      select: { id: true, postId: true, parentId: true, repliesCount: true },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const deletedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.postComment.update({
        where: { id: commentId },
        data: { deletedAt },
      });

      await tx.post.update({
        where: { id: comment.postId },
        data: { commentsCount: { decrement: 1 } },
      });

      if (comment.parentId) {
        await tx.postComment.update({
          where: { id: comment.parentId },
          data: { repliesCount: { decrement: 1 } },
        });
      }
    });

    return this.getPostComments(userId, comment.postId);
  }

  async toggleCommentReaction(
    userId: string,
    commentId: string,
    type: ReactionType,
  ) {
    const comment = await this.prisma.postComment.findFirst({
      where: {
        id: commentId,
        deletedAt: null,
      },
      select: {
        id: true,
        postId: true,
        authorId: true,
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    const existingReaction = await this.prisma.postCommentReaction.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      if (!existingReaction) {
        await tx.postCommentReaction.create({
          data: {
            commentId,
            userId,
            type,
          },
        });

        await tx.postComment.update({
          where: {
            id: commentId,
          },
          data:
            type === ReactionType.LIKE
              ? { likesCount: { increment: 1 } }
              : { dislikesCount: { increment: 1 } },
        });

        return;
      }

      if (existingReaction.type === type) {
        await tx.postCommentReaction.delete({
          where: {
            commentId_userId: {
              commentId,
              userId,
            },
          },
        });

        await tx.postComment.update({
          where: {
            id: commentId,
          },
          data:
            type === ReactionType.LIKE
              ? { likesCount: { decrement: 1 } }
              : { dislikesCount: { decrement: 1 } },
        });

        return;
      }

      await tx.postCommentReaction.update({
        where: {
          commentId_userId: {
            commentId,
            userId,
          },
        },
        data: {
          type,
        },
      });

      await tx.postComment.update({
        where: {
          id: commentId,
        },
        data:
          type === ReactionType.LIKE
            ? {
                likesCount: { increment: 1 },
                dislikesCount: { decrement: 1 },
              }
            : {
                likesCount: { decrement: 1 },
                dislikesCount: { increment: 1 },
              },
      });
    });

    if (comment.authorId !== userId) {
      await this.notificationsService.create({
        userId: comment.authorId,
        actorId: userId,
        type:
          type === ReactionType.LIKE
            ? NotificationType.COMMENT_LIKE
            : NotificationType.COMMENT_DISLIKE,
        title:
          type === ReactionType.LIKE
            ? 'Новый лайк комментария'
            : 'Новый дизлайк комментария',
        body: 'Пользователь отреагировал на ваш комментарий',
        entityType: 'Post',
        entityId: comment.postId,
      });
    }

    return this.getPostComments(userId, comment.postId);
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

  private getPostInclude(viewerId: string) {
    return {
      author: {
        include: {
          profile: true,
        },
      },
      attachments: {
        include: {
          file: true,
        },
        orderBy: {
          sortOrder: 'asc' as const,
        },
      },
      reactions: {
        where: {
          userId: viewerId,
        },
        select: {
          type: true,
        },
      },
    };
  }

  private toPostCard(post: any, onlineUserIds: Set<string> = new Set()) {
    return {
      id: post.id,
      content: post.content,
      likesCount: post.likesCount,
      dislikesCount: post.dislikesCount,
      commentsCount: post.commentsCount,
      createdAt: post.createdAt,
      viewerReaction: post.reactions[0]?.type ?? null,
      author: {
        id: post.author.id,
        username: post.author.username,
        email: post.author.email,
        avatarUrl: post.author.profile?.avatarUrl ?? null,
        isOnline: onlineUserIds.has(post.author.id),
      },
      attachments: post.attachments.map((attachment: any) => ({
        id: attachment.id,
        sortOrder: attachment.sortOrder,
        file: {
          id: attachment.file.id,
          type: attachment.file.type,
          status: attachment.file.status,
          url: attachment.file.url,
          thumbnailUrl: attachment.file.thumbnailUrl,
          filename: attachment.file.filename,
          mimeType: attachment.file.mimeType,
          sizeBytes: attachment.file.sizeBytes,
          width: attachment.file.width,
          height: attachment.file.height,
          duration: attachment.file.duration,
        },
      })),
    };
  }

  private toCommentCard(comment: any, onlineUserIds: Set<string> = new Set()) {
    return {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      content: comment.content,
      likesCount: comment.likesCount,
      dislikesCount: comment.dislikesCount,
      repliesCount: comment.repliesCount,
      createdAt: comment.createdAt,
      viewerReaction: comment.reactions[0]?.type ?? null,
      author: {
        id: comment.author.id,
        username: comment.author.username,
        email: comment.author.email,
        avatarUrl: comment.author.profile?.avatarUrl ?? null,
        isOnline: onlineUserIds.has(comment.author.id),
      },
    };
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

  private async getFeedAuthorIds(userId: string) {
    const [friendships, follows] = await Promise.all([
      this.prisma.friendship.findMany({
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
        select: {
          userAId: true,
          userBId: true,
        },
      }),

      this.prisma.follow.findMany({
        where: {
          followerId: userId,
        },
        select: {
          followingId: true,
        },
      }),
    ]);

    const authorIds = new Set<string>();

    for (const friendship of friendships) {
      authorIds.add(
        friendship.userAId === userId ? friendship.userBId : friendship.userAId,
      );
    }

    for (const follow of follows) {
      authorIds.add(follow.followingId);
    }

    authorIds.delete(userId);

    return [...authorIds];
  }

  private getPagination(total: number, page: number, limit: number) {
    return {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async resolveUserId(identifier: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: identifier }, { username: identifier }],
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.id;
  }

  private async ensureUserExists(userId: string) {
    await this.resolveUserId(userId);
  }

  private async ensurePostExists(postId: string) {
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }
  }
}
