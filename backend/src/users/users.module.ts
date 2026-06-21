import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { PresenceModule } from '../presence/presence.module'
import { TokenService } from 'src/auth/token.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [PresenceModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService, TokenService],
})
export class UsersModule {}
