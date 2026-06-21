import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { TokenService } from 'src/auth/token.service'
import { NotificationsGateway } from './notifications.gateway'

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, TokenService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
