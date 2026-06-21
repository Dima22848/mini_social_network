// HTTP-роуты уведомлений: список, прочтение, удаление и пользовательские настройки уведомлений.
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { AccessTokenGuard } from '../auth/guards/access-token.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../auth/types/current-user-payload.type'
import { NotificationsService } from './notifications.service'

@UseGuards(AccessTokenGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.list(user.id)
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.markAllRead(user.id)
  }

  @Delete()
  deleteAll(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.deleteAll(user.id)
  }

  @Delete(':notificationId')
  deleteOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.deleteOne(user.id, notificationId)
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.getPreferences(user.id)
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: Partial<{ posts: boolean; chats: boolean; friends: boolean }>,
  ) {
    return this.notificationsService.updatePreferences(user.id, body)
  }
}
