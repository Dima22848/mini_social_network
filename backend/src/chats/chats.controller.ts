// HTTP-роуты сообщений: список чатов, сообщения, участники, вложения, загрузка файлов и действия с группами.
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileAssetType } from '@prisma/client'
import { FileInterceptor } from '@nestjs/platform-express'
import { extname, join } from 'path'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import { AccessTokenGuard } from '../auth/guards/access-token.guard'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../auth/types/current-user-payload.type'
import { ChatsService } from './chats.service'
import { ChatsQueryDto } from './dto/chats-query.dto'
import { CreateGroupChatDto } from './dto/create-group-chat.dto'
import { CreateMessageDto } from './dto/create-message.dto'
import { ToggleMessageReactionDto } from './dto/toggle-message-reaction.dto'
import { UpdateMemberRoleDto } from './dto/update-member-role.dto'
import { ToggleChatNotificationsDto } from './dto/toggle-chat-notifications.dto'
import { InviteChatMembersDto } from './dto/invite-chat-members.dto'
import { UpdateChatTitleDto } from './dto/update-chat-title.dto'
import { UpdateChatAvatarDto } from './dto/update-chat-avatar.dto'
import { ChatsGateway } from './chats.gateway'

const multer = require('multer')

@UseGuards(AccessTokenGuard)
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chatsService: ChatsService,
    private readonly chatsGateway: ChatsGateway,
  ) {}

  @Get()
  listChats(@CurrentUser() user: CurrentUserPayload, @Query() query: ChatsQueryDto) {
    return this.chatsService.listChats(user.id, query)
  }

  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', {
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        const uploadDir = join(process.cwd(), 'uploads', 'chat')
        mkdirSync(uploadDir, { recursive: true })
        callback(null, uploadDir)
      },
      filename: (_req, file, callback) => {
        const extension = extname(file.originalname || '')
        callback(null, `${Date.now()}-${randomUUID()}${extension}`)
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
  }))
  uploadFile(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: any,
    @Body('type') type?: FileAssetType,
  ) {
    return this.chatsService.prepareUploadedFile(user.id, file, type)
  }

  @Get('by-slug/:slug')
  getChatBySlug(@CurrentUser() user: CurrentUserPayload, @Param('slug') slug: string) {
    return this.chatsService.getChatBySlug(user.id, slug)
  }

  @Get(':chatId')
  getChat(@CurrentUser() user: CurrentUserPayload, @Param('chatId') chatId: string) {
    return this.chatsService.getChat(user.id, chatId)
  }

  @Get(':chatId/messages')
  getMessages(@CurrentUser() user: CurrentUserPayload, @Param('chatId') chatId: string) {
    return this.chatsService.getMessages(user.id, chatId)
  }

  @Get(':chatId/pinned')
  getPinnedMessages(@CurrentUser() user: CurrentUserPayload, @Param('chatId') chatId: string) {
    return this.chatsService.getPinnedMessages(user.id, chatId)
  }

  @Get(':chatId/members')
  getMembers(@CurrentUser() user: CurrentUserPayload, @Param('chatId') chatId: string) {
    return this.chatsService.getMembers(user.id, chatId)
  }

  @Get(':chatId/attachments')
  getAttachments(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Query('type') type?: FileAssetType,
  ) {
    return this.chatsService.getAttachments(user.id, chatId, type)
  }

  @Post('direct/:targetUserId')
  createDirectChat(
    @CurrentUser() user: CurrentUserPayload,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.chatsService.createDirectChat(user.id, targetUserId)
  }

  @Post('groups')
  async createGroupChat(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGroupChatDto) {
    const chat = await this.chatsService.createGroupChat(user.id, dto)
    await this.chatsGateway.emitChatCreated(chat.id)
    return chat
  }

  @Patch(':chatId/title')
  updateChatTitle(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Body() dto: UpdateChatTitleDto,
  ) {
    return this.chatsService.updateChatTitle(user.id, chatId, dto)
  }

  @Patch(':chatId/avatar')
  updateChatAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Body() dto: UpdateChatAvatarDto,
  ) {
    return this.chatsService.updateChatAvatar(user.id, chatId, dto)
  }

  @Post(':chatId/messages')
  async createMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Body() dto: CreateMessageDto,
  ) {
    const message = await this.chatsService.createMessage(user.id, chatId, dto)
    await this.chatsGateway.emitMessageCreated(message)
    return message
  }

  @Post(':chatId/read')
  markAsRead(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Body() body: { messageId?: string },
  ) {
    return this.chatsService.markAsRead(user.id, chatId, body.messageId)
  }

  @Post(':chatId/messages/:messageId/reactions/toggle')
  toggleReaction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('messageId') messageId: string,
    @Body() dto: ToggleMessageReactionDto,
  ) {
    return this.chatsService.toggleReaction(user.id, messageId, dto.emoji)
  }

  @Post(':chatId/messages/:messageId/pin')
  pinMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatsService.pinMessage(user.id, chatId, messageId)
  }

  @Post(':chatId/messages/:messageId/unpin')
  unpinMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatsService.unpinMessage(user.id, chatId, messageId)
  }

  @Post(':chatId/members/invite')
  async inviteMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Body() dto: InviteChatMembersDto,
  ) {
    const result = await this.chatsService.inviteMembers(user.id, chatId, dto)
    await this.chatsGateway.emitChatMembersChanged(chatId, dto.memberIds)
    return result
  }

  @Patch(':chatId/notifications')
  toggleNotifications(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Body() dto: ToggleChatNotificationsDto,
  ) {
    return this.chatsService.toggleNotifications(user.id, chatId, dto.enabled)
  }

  @Patch(':chatId/members/:targetUserId/role')
  updateMemberRole(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Param('targetUserId') targetUserId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.chatsService.updateMemberRole(user.id, chatId, targetUserId, dto.role)
  }

  @Post(':chatId/leave')
  async leaveChat(@CurrentUser() user: CurrentUserPayload, @Param('chatId') chatId: string) {
    const result = await this.chatsService.leaveOrDeleteChat(user.id, chatId)
    await this.chatsGateway.emitChatDeletedOrLeft(chatId, result)
    return result
  }

  @Delete(':chatId')
  async leaveOrDeleteChat(@CurrentUser() user: CurrentUserPayload, @Param('chatId') chatId: string) {
    const result = await this.chatsService.leaveOrDeleteChat(user.id, chatId)
    await this.chatsGateway.emitChatDeletedOrLeft(chatId, result)
    return result
  }

  @Delete(':chatId/members/:targetUserId')
  async removeMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    const result = await this.chatsService.removeMember(user.id, chatId, targetUserId)
    await this.chatsGateway.emitChatMembersChanged(chatId, [targetUserId])
    return result
  }

  @Delete(':chatId/messages/:messageId')
  deleteMessage(
    @CurrentUser() user: CurrentUserPayload,
    @Param('chatId') chatId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.chatsService.deleteMessage(user.id, chatId, messageId)
  }
}
