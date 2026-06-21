// HTTP-роуты постов и ленты: создание, редактирование, реакции, комментарии и загрузка медиа.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { AccessTokenGuard } from '../auth/guards/access-token.guard'
import type { CurrentUserPayload } from '../auth/types/current-user-payload.type'
import { CreateCommentDto } from './dto/create-comment.dto'
import { CreatePostDto } from './dto/create-post.dto'
import { PostsQueryDto } from './dto/posts-query.dto'
import { ToggleReactionDto } from './dto/toggle-reaction.dto'
import { PostsService } from './posts.service'
import { FileInterceptor } from '@nestjs/platform-express'
import { FileAssetType } from '@prisma/client'
import { extname, join } from 'path'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

const multer = require('multer')

@UseGuards(AccessTokenGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('uploads')
  @UseInterceptors(FileInterceptor('file', {
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        const uploadDir = join(process.cwd(), 'uploads', 'posts')
        mkdirSync(uploadDir, { recursive: true })
        callback(null, uploadDir)
      },
      filename: (_req, file, callback) => {
        const extension = extname(file.originalname || '')
        callback(null, `${Date.now()}-${randomUUID()}${extension}`)
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024 },
  }))
  uploadFile(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: any,
    @Body('type') type?: FileAssetType,
  ) {
    return this.postsService.prepareUploadedFile(user.id, file, type)
  }

  @Post()
  createPost(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.createPost(user.id, dto)
  }

  @Get('feed')
  getFeed(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: PostsQueryDto,
  ) {
    return this.postsService.getFeedPosts(user.id, query)
  }

  @Get('users/:identifier')
  getUserPosts(
    @CurrentUser() user: CurrentUserPayload,
    @Param('identifier') identifier: string,
    @Query() query: PostsQueryDto,
  ) {
    return this.postsService.getUserPosts(user.id, identifier, query)
  }

  @Delete('comments/:commentId')
  deleteComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('commentId') commentId: string,
  ) {
    return this.postsService.deleteComment(user.id, commentId)
  }

  @Post('comments/:commentId/reactions/toggle')
  toggleCommentReaction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('commentId') commentId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.postsService.toggleCommentReaction(user.id, commentId, dto.type)
  }

  @Post(':postId/reactions/toggle')
  togglePostReaction(
    @CurrentUser() user: CurrentUserPayload,
    @Param('postId') postId: string,
    @Body() dto: ToggleReactionDto,
  ) {
    return this.postsService.togglePostReaction(user.id, postId, dto.type)
  }



  @Patch(':postId')
  updatePost(
    @CurrentUser() user: CurrentUserPayload,
    @Param('postId') postId: string,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.updatePost(user.id, postId, dto)
  }

  @Delete(':postId')
  deletePost(
    @CurrentUser() user: CurrentUserPayload,
    @Param('postId') postId: string,
  ) {
    return this.postsService.deletePost(user.id, postId)
  }

  @Get(':postId/comments')
  getPostComments(
    @CurrentUser() user: CurrentUserPayload,
    @Param('postId') postId: string,
  ) {
    return this.postsService.getPostComments(user.id, postId)
  }

  @Post(':postId/comments')
  createComment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.postsService.createComment(user.id, postId, dto)
  }
}