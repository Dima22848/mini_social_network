// Socket namespace уведомлений: держит персональные комнаты пользователей для мгновенной доставки событий.
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Server } from 'socket.io'

@WebSocketGateway({
  namespace: 'chats',
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  },
})
export class NotificationsGateway {
  @WebSocketServer()
  server!: Server

  emitToUser(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit('notification:new', notification)
  }
}
