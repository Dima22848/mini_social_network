// WebSocket-шлюз чатов: realtime-сообщения, typing, read receipts, presence и обновление списка чатов без перезагрузки.
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChatsService } from './chats.service';
import { PresenceService } from '../presence/presence.service';
import { CreateMessageDto } from './dto/create-message.dto';

type AuthedSocket = Socket & {
  data: {
    user?: {
      id: string;
      email: string;
      username: string;
      sessionId: string;
    };
  };
};

@WebSocketGateway({
  namespace: 'chats',
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
export class ChatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
    private readonly chatsService: ChatsService,
    private readonly presenceService: PresenceService,
  ) {}

  async handleConnection(socket: AuthedSocket) {
    const token = this.getTokenFromSocket(socket);

    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      const session = await this.prisma.session.findUnique({
        where: { id: payload.sessionId },
        select: { id: true, userId: true, revokedAt: true, expiresAt: true },
      });

      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt < new Date()
      ) {
        socket.disconnect(true);
        return;
      }

      socket.data.user = {
        id: payload.sub,
        email: payload.email,
        username: payload.username,
        sessionId: payload.sessionId,
      };

      socket.join(`user:${payload.sub}`);
      await this.presenceService.markOnline(payload.sub, socket.id);

      const chatIds = await this.chatsService.getUserChatIds(payload.sub);
      for (const chatId of chatIds) {
        socket.join(`chat:${chatId}`);
      }

      this.server.emit('presence:changed', {
        userId: payload.sub,
        isOnline: true,
        lastSeenAt: new Date().toISOString(),
      });
    } catch {
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: AuthedSocket) {
    const user = socket.data.user;

    if (!user) {
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.presenceService.markSocketOffline(user.id, socket.id);
    const isOnline = await this.presenceService.isOnline(user.id);

    this.server.emit('presence:changed', {
      userId: user.id,
      isOnline,
      lastSeenAt: new Date().toISOString(),
    });
  }

  async emitChatCreated(chatOrId: any) {
    const chatId = typeof chatOrId === 'string' ? chatOrId : chatOrId?.id;

    if (!chatId) {
      return;
    }

    const memberIds = await this.chatsService.getChatAudience(chatId);

    for (const userId of memberIds) {
      this.server.in(`user:${userId}`).socketsJoin(`chat:${chatId}`);
      const chat = await this.chatsService
        .getChatForUserById(userId, chatId)
        .catch(() => null);
      if (chat) {
        this.server.to(`user:${userId}`).emit('chat:created', chat);
      }
    }
  }


  async emitMessageCreated(message: any) {
    const chatId = message?.chatId;

    if (!chatId) {
      return;
    }

    const memberIds = await this.chatsService.getChatAudience(chatId);

    for (const userId of memberIds) {
      this.server.in(`user:${userId}`).socketsJoin(`chat:${chatId}`);
    }

    this.server.to(`chat:${chatId}`).emit('message:new', message);
    this.server.to(`chat:${chatId}`).emit('chat:updated', {
      chatId,
      lastMessage: message,
    });

    for (const userId of memberIds) {
      const chat = await this.chatsService
        .getChatForUserById(userId, chatId)
        .catch(() => null);

      if (chat) {
        this.server.to(`user:${userId}`).emit('chat:created', chat);
      }
    }
  }

  async emitChatMembersChanged(chatId: string, extraUserIds: string[] = []) {
    const audience = new Set([
      ...(await this.chatsService.getChatAudience(chatId, true)),
      ...extraUserIds,
    ]);

    this.server.to(`chat:${chatId}`).emit('chat:updated', { chatId });

    for (const userId of audience) {
      const chat = await this.chatsService
        .getChatForUserById(userId, chatId)
        .catch(() => null);
      this.server.to(`user:${userId}`).emit('chat:updated', { chatId, chat });
      if (chat) {
        if (chat.isReadOnly) {
          this.server.in(`user:${userId}`).socketsLeave(`chat:${chatId}`);
        } else {
          this.server.in(`user:${userId}`).socketsJoin(`chat:${chatId}`);
        }
        this.server.to(`user:${userId}`).emit('chat:created', chat);
      } else {
        this.server.in(`user:${userId}`).socketsLeave(`chat:${chatId}`);
        this.server
          .to(`user:${userId}`)
          .emit('chat:removed', { chatId, reason: 'member_removed' });
      }
    }
  }

  async emitChatDeletedOrLeft(chatId: string, result: any) {
    const affectedUserIds: string[] = Array.isArray(result?.affectedUserIds)
      ? result.affectedUserIds
      : [];

    if (result?.action === 'deleted') {
      this.server.to(`chat:${chatId}`).emit('chat:deleted', { chatId });
      for (const userId of affectedUserIds) {
        this.server.in(`user:${userId}`).socketsLeave(`chat:${chatId}`);
        this.server.to(`user:${userId}`).emit('chat:deleted', { chatId });
      }
      return;
    }

    for (const userId of affectedUserIds) {
      this.server
        .to(`user:${userId}`)
        .emit('chat:removed', { chatId, reason: 'left' });
    }
    this.server.to(`chat:${chatId}`).emit('chat:updated', { chatId });
  }

  @SubscribeMessage('chat:join')
  async joinChat(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { chatId: string },
  ) {
    const user = this.requireSocketUser(socket);
    await this.chatsService.requireMember(body.chatId, user.id);
    socket.join(`chat:${body.chatId}`);
    return { success: true };
  }

  @SubscribeMessage('message:send')
  async sendMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: CreateMessageDto & { chatId: string },
  ) {
    const user = this.requireSocketUser(socket);
    const message = await this.chatsService.createMessage(
      user.id,
      body.chatId,
      body,
    );

    this.server.to(`chat:${body.chatId}`).emit('message:new', message);
    this.server.to(`chat:${body.chatId}`).emit('chat:updated', {
      chatId: body.chatId,
      lastMessage: message,
    });

    return message;
  }

  @SubscribeMessage('message:react')
  async react(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody()
    body: { messageId: string; emoji: '👍' | '👎' | '🔥' | '❤️' | '😡' },
  ) {
    const user = this.requireSocketUser(socket);
    const message = await this.chatsService.toggleReaction(
      user.id,
      body.messageId,
      body.emoji,
    );
    this.server.to(`chat:${message.chatId}`).emit('message:updated', message);
    return message;
  }

  @SubscribeMessage('message:read')
  async read(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { chatId: string; messageId?: string },
  ) {
    const user = this.requireSocketUser(socket);
    const result = await this.chatsService.markAsRead(
      user.id,
      body.chatId,
      body.messageId,
    );

    this.server.to(`chat:${body.chatId}`).emit('message:read', {
      chatId: body.chatId,
      messageId: body.messageId,
      userId: user.id,
      readAt: new Date().toISOString(),
    });

    return result;
  }

  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { chatId: string; isTyping: boolean },
  ) {
    const user = this.requireSocketUser(socket);
    await this.chatsService.requireMember(body.chatId, user.id);

    socket.to(`chat:${body.chatId}`).emit('typing', {
      chatId: body.chatId,
      user: {
        id: user.id,
        username: user.username,
      },
      isTyping: body.isTyping,
    });

    return { success: true };
  }

  private getTokenFromSocket(socket: Socket) {
    const tokenFromAuth = socket.handshake.auth?.accessToken;

    if (typeof tokenFromAuth === 'string') {
      return tokenFromAuth;
    }

    const authorization = socket.handshake.headers.authorization;

    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length);
    }

    return null;
  }

  private requireSocketUser(socket: AuthedSocket) {
    const user = socket.data.user;

    if (!user) {
      throw new WsException('Unauthorized');
    }

    return user;
  }
}
