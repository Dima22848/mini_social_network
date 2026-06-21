// Роуты социальных списков: друзья, подписки, поиск пользователей и заявки в друзья.
import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AccessTokenGuard } from '../auth/guards/access-token.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../auth/types/current-user-payload.type'
import { UsersService } from './users.service'
import { FriendsQueryDto, SubscriptionsQueryDto } from './dto/users-query.dto'

@UseGuards(AccessTokenGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('discover')
  discoverUsers(
    @CurrentUser() user: CurrentUserPayload,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.discoverUsers(user.id, { search, limit: limit ? Number(limit) : undefined })
  }

  @Get('search')
  searchUsers(
    @CurrentUser() user: CurrentUserPayload,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.searchUsers(user.id, { search, limit: limit ? Number(limit) : undefined })
  }

  @Get('friends')
  getFriends(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: FriendsQueryDto,
  ) {
    return this.usersService.getFriendsPage(user.id, query)
  }

  @Get('subscriptions')
  getSubscriptions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: SubscriptionsQueryDto,
  ) {
    return this.usersService.getSubscriptionsPage(user.id, query)
  }

  @Post(':targetUserId/friend-request')
  sendFriendRequest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.usersService.sendFriendRequest(user.id, targetUserId)
  }

  @Post('friend-requests/:requestId/accept')
  acceptFriendRequest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.usersService.acceptFriendRequest(user.id, requestId)
  }

  @Post('friend-requests/:requestId/decline')
  declineFriendRequest(
    @CurrentUser() user: CurrentUserPayload,
    @Param('requestId') requestId: string,
  ) {
    return this.usersService.declineFriendRequest(user.id, requestId)
  }

  @Delete('friends/:friendId')
  removeFriend(
    @CurrentUser() user: CurrentUserPayload,
    @Param('friendId') friendId: string,
  ) {
    return this.usersService.removeFriend(user.id, friendId)
  }

  @Post(':targetUserId/follow')
  followUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.usersService.followUser(user.id, targetUserId)
  }

  @Delete('following/:targetUserId')
  unfollowUser(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.usersService.unfollowUser(user.id, targetUserId)
  }

  @Delete('followers/:followerId')
  removeFollower(
    @CurrentUser() user: CurrentUserPayload,
    @Param('followerId') followerId: string,
  ) {
    return this.usersService.removeFollower(user.id, followerId)
  }
}
