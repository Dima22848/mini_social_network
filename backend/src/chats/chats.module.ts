import { Module } from '@nestjs/common'
import { ChatsController } from './chats.controller'
import { ChatsGateway } from './chats.gateway'
import { ChatsService } from './chats.service'
import { AuthModule } from '../auth/auth.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PresenceModule } from '../presence/presence.module'

import { MediaQueueModule } from '../common/files/media-queue.module'

@Module({
  imports: [MediaQueueModule, AuthModule, NotificationsModule, PresenceModule],
  controllers: [ChatsController],
  providers: [ChatsService, ChatsGateway],
  exports: [ChatsService],
})
export class ChatsModule {}
