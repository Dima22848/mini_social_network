// HTTP-слой авторизации: принимает запросы login/register/refresh/logout и отдаёт наружу только безопасные данные пользователя.
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
  UseInterceptors,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { extname, join } from 'path'
import { mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
const multer = require('multer')
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import type { Env } from '../config/env.schema'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { AccessTokenGuard } from './guards/access-token.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import type { CurrentUserPayload } from './types/current-user-payload.type'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { ChangePasswordDto } from './dto/change-password.dto'



@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>,
  ) { }

  // Регистрация
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, req)

    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    )

    return {
      accessToken: result.accessToken,
      user: result.user,
    }
  }

  // вход
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, req)

    this.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    )

    return {
      accessToken: result.accessToken,
      user: result.user,
    }
  }

  // отправить запрос на генерацию токена восстановления пароля
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto)
  }

  // подтвердить восстановление пароля с токеном
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto)
  }

  // обновить токен
  @Post('refresh')
  async refresh(
    @Req() req: Request,
  ) {
    const cookieName = this.configService.get('REFRESH_TOKEN_COOKIE_NAME', {
      infer: true,
    })

    const refreshToken = req.cookies?.[cookieName]

    return this.authService.refresh(refreshToken)
  }

  // Выйти с текущей сессии
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName = this.configService.get('REFRESH_TOKEN_COOKIE_NAME', {
      infer: true,
    })

    const refreshToken = req.cookies?.[cookieName]

    const result = await this.authService.logout(refreshToken)

    this.clearRefreshCookie(res)

    return result
  }

  // Выйти с определенной сессии (кроме текущей)  
  @UseGuards(AccessTokenGuard)
  @Delete('sessions/:sessionId')
  logoutSession(
    @CurrentUser() user: CurrentUserPayload,
    @Param('sessionId') sessionId: string,
  ) {

    return this.authService.logoutSession(user.id, user.sessionId, sessionId)
  }

  // Выйти со всех сессий
  @UseGuards(AccessTokenGuard)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(user.id)

    this.clearRefreshCookie(res)

    return result
  }

  // Выйти со всех сессий кроме текущей
  @UseGuards(AccessTokenGuard)
  @Post('logout-all-except-current')
  logoutAllExceptCurrent(
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.authService.logoutAllExceptCurrent(user.id, user.sessionId)
  }

  // Получить текущего пользователя
  @UseGuards(AccessTokenGuard)
  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.me(user.id)
  }

  // Обновить данные текущего пользователя
  @UseGuards(AccessTokenGuard)
  @Patch('me')
  updateMe(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateMe(user.id, dto)
  }

  @UseGuards(AccessTokenGuard)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto)
  }

  @UseGuards(AccessTokenGuard)
  @Post('email-verification')
  requestEmailVerification(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.requestEmailVerification(user.id)
  }

  @Post('verify-email')
  verifyEmail(@Body('token') token: string) {
    return this.authService.verifyEmail(token)
  }

  @UseGuards(AccessTokenGuard)
  @Post('avatar-upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        const uploadDir = join(process.cwd(), 'uploads', 'profile')
        mkdirSync(uploadDir, { recursive: true })
        callback(null, uploadDir)
      },
      filename: (_req, file, callback) => {
        const extension = extname(file.originalname || '')
        callback(null, `${Date.now()}-${randomUUID()}${extension}`)
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      if (String(file.mimetype ?? '').startsWith('image/')) {
        callback(null, true)
        return
      }

      callback(new Error('Можно загрузить только изображение'), false)
    },
  }))
  uploadAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile() file: any,
  ) {
    return this.authService.prepareUploadedAvatar(user.id, file)
  }

  // получить все сессии
  @UseGuards(AccessTokenGuard)
  @Get('sessions')
  getSessions(
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.authService.getSessions(user.id, user.sessionId)
  }

  // Установить рефрештокен в куки
  private setRefreshCookie(
    res: Response,
    refreshToken: string,
    expiresAt: Date,
  ) {
    const cookieName = this.configService.get('REFRESH_TOKEN_COOKIE_NAME', {
      infer: true,
    })

    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure: this.configService.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.configService.get('COOKIE_SAME_SITE', { infer: true }),
      domain:
        this.configService.get('COOKIE_DOMAIN', { infer: true }) || undefined,
      path: '/',
      expires: expiresAt,
    })
  }

  // Убрать рефрештокен с куки
  private clearRefreshCookie(res: Response) {
    const cookieName = this.configService.get('REFRESH_TOKEN_COOKIE_NAME', {
      infer: true,
    })

    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: this.configService.get('COOKIE_SECURE', { infer: true }),
      sameSite: this.configService.get('COOKIE_SAME_SITE', { infer: true }),
      domain:
        this.configService.get('COOKIE_DOMAIN', { infer: true }) || undefined,
      path: '/',
    })
  }
}

