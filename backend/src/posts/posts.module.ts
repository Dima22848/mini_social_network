import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { TokenService } from 'src/auth/token.service';
import { NotificationsModule } from '../notifications/notifications.module';

import { MediaQueueModule } from '../common/files/media-queue.module';
import { PresenceModule } from '../presence/presence.module';

@Module({
  imports: [MediaQueueModule, NotificationsModule, PresenceModule],
  controllers: [PostsController],
  providers: [PostsService, TokenService],
})
export class PostsModule {}
