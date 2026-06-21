// Публичные профили пользователей: отдаём профиль, счётчики и отношение текущего пользователя к этому профилю.
import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { AccessTokenGuard } from '../auth/guards/access-token.guard'
import type { CurrentUserPayload } from '../auth/types/current-user-payload.type'
import { ProfilesService } from './profiles.service'

@UseGuards(AccessTokenGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get(':identifier')
  getProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Param('identifier') identifier: string,
  ) {
    return this.profilesService.getPublicProfile(user.id, identifier)
  }
}