// Бизнес-логика авторизации: пользователи, сессии, refresh/access токены, смена пароля и обновление профиля.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Request } from 'express'
import { PrismaService } from '../prisma/prisma.service'
import { deleteUploadedFileByUrl } from '../common/files/file-cleanup.util'
import { MediaQueueService } from '../common/files/media-queue.service'
import type { Env } from '../config/env.schema'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { PasswordService } from './password.service'
import { TokenService } from './token.service'
import * as bcrypt from 'bcrypt'
import { getFutureDateInDays } from 'src/common/utils/date.util'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { createHash, randomBytes } from 'crypto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { ChangePasswordDto } from './dto/change-password.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService<Env, true>,
    private readonly mediaQueueService: MediaQueueService,
  ) { }

  // Регистрация
  async register(dto: RegisterDto, req: Request) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    })

    if (existingUser) {
      throw new ConflictException('Email or username already exists')
    }

    const passwordHash = await this.passwordService.hash(dto.password)

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        passwordHash,
        profile: {
          create: {},
        },
      },
    })

    return this.createAuthSession(user.id, req, false)
  }

  // Вход 
  async login(dto: LoginDto, req: Request) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    })

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const isPasswordValid = await this.passwordService.compare(
      dto.password,
      user.passwordHash,
    )

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials')
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    return this.createAuthSession(user.id, req, dto.rememberMe ?? false)
  }

  // Отправить заявку на восстановление пароля
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: {
        email: dto.email,
      },
    })

    if (!user) {
      return {
        success: true,
        message: 'If this email exists, password reset instructions were sent',
      }
    }

    const resetToken = randomBytes(32).toString('hex')
    const resetTokenHash = this.hashResetToken(resetToken)
    const resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordResetTokenHash: resetTokenHash,
        passwordResetTokenExpiresAt: resetTokenExpiresAt,
      },
    })

    const frontendUrl = this.configService.get('CLIENT_URL', {
      infer: true,
    })

    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`

    await this.prisma.emailOutbox.create({
      data: {
        to: user.email,
        subject: 'Восстановление пароля',
        body: `Перейдите по ссылке для восстановления пароля: ${resetLink}`,
        type: 'PASSWORD_RESET',
      },
    })

    return {
      success: true,
      message: 'If this email exists, password reset instructions were sent',
      resetLink,
    }
  }

  // Подтвердить восстановление пароля с токеном
  async resetPassword(dto: ResetPasswordDto) {
    const resetTokenHash = this.hashResetToken(dto.token)

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: resetTokenHash,
        passwordResetTokenExpiresAt: {
          gt: new Date(),
        },
      },
    })

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token')
    }

    const passwordHash = await this.passwordService.hash(dto.password)

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    })

    return {
      success: true,
    }
  }

  // Обновить токен 
  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing')
    }

    const payload = this.tokenService.verifyRefreshToken(refreshToken)

    const session = await this.prisma.session.findUnique({
      where: {
        id: payload.sessionId,
      },
      include: {
        user: {
          include: {
            profile: true,
          }
        }
      },
    })

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid session')
    }

    const isTokenValid = await bcrypt.compare(
      refreshToken,
      session.refreshTokenHash,
    )

    if (!isTokenValid) {
      throw new UnauthorizedException('Invalid refresh token')
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    })

    const accessToken = this.tokenService.signAccessToken({
      sub: session.user.id,
      email: session.user.email,
      username: session.user.username,
      sessionId: session.id,
    })

    return {
      accessToken,
      user: this.toPublicUserWithProfile(session.user),
    }
  }

  // Выйти с аккаунта
  async logout(refreshToken: string | undefined) {
    if (!refreshToken) {
      return { success: true }
    }

    try {
      const payload = this.tokenService.verifyRefreshToken(refreshToken)

      await this.prisma.session.updateMany({
        where: {
          id: payload.sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      })
    } catch {
      return { success: true }
    }

    return { success: true }
  }

  // Выйти с выбранной сессии( кроме текущей )
  async logoutSession(
    userId: string,
    currentSessionId: string,
    sessionId: string,
  ) {
    if (sessionId === currentSessionId) {
      throw new UnauthorizedException(
        'Use logout endpoint to logout current session',
      )
    }

    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })

    if (result.count === 0) {
      throw new UnauthorizedException('Session not found')
    }

    return { success: true }
  }

  // Выйти со всех сессий
  async logoutAll(userId: string) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })

    return { success: true }
  }

  // Выйти со всех сессий кроме текущей
  async logoutAllExceptCurrent(
    userId: string,
    currentSessionId: string,
  ) {
    await this.prisma.session.updateMany({
      where: {
        userId,
        id: {
          not: currentSessionId,
        },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })

    return { success: true }
  }

  // Получить все сессии
  async getSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        lastSeenAt: 'desc',
      },
    })

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        country: session.country,
        city: session.city,
        device: session.device,
        browser: session.browser,
        os: session.os,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        isCurrent: session.id === currentSessionId,
      })),
    }
  }

  // Получить текущего пользователя
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    })

    if (!user) {
      throw new UnauthorizedException()
    }


    return {
      user: this.toPublicUserWithProfile(user),
    }
  }

  // Обновить данные текущего пользователя
  async updateMe(userId: string, dto: UpdateProfileDto) {
    if (dto.username) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          username: dto.username,
          id: {
            not: userId,
          },
        },
      })

      if (existingUser) {
        throw new ConflictException('Username already exists')
      }
    }

    if (dto.email) {
      const existingEmail = await this.prisma.user.findFirst({
        where: {
          email: dto.email,
          id: { not: userId },
        },
      })

      if (existingEmail) {
        throw new ConflictException('Email already exists')
      }
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, profile: { select: { avatarUrl: true } } },
    })

    const emailChanged = Boolean(dto.email && currentUser?.email !== dto.email)

    const profileData = {
      bio: dto.bio,
      age: dto.age,
      city: dto.city,
      country: dto.country,
      avatarUrl: dto.avatarUrl,
    }

    const hasProfileData = Object.values(profileData).some(
      (value) => value !== undefined,
    )

    if (
      dto.avatarUrl !== undefined &&
      currentUser?.profile?.avatarUrl &&
      currentUser.profile.avatarUrl !== dto.avatarUrl
    ) {
      deleteUploadedFileByUrl(currentUser.profile.avatarUrl)
    }

    const user = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        username: dto.username,
        email: dto.email,
        ...(emailChanged ? { isEmailVerified: false } : {}),
        ...(hasProfileData
          ? {
            profile: {
              upsert: {
                create: profileData,
                update: profileData,
              },
            },
          }
          : {}),
      },
      include: {
        profile: true,
      },
    })

    return {
      user: this.toPublicUserWithProfile(user),
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    })

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const isPasswordValid = await this.passwordService.compare(dto.oldPassword, user.passwordHash)

    if (!isPasswordValid) {
      throw new UnauthorizedException('Старый пароль указан неверно')
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword)

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    })

    return { success: true }
  }

  async requestEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new UnauthorizedException()
    }

    if (user.isEmailVerified) {
      return { success: true, message: 'Email уже подтверждён' }
    }

    const token = randomBytes(32).toString('hex')
    const tokenHash = this.hashResetToken(token)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const frontendUrl = this.configService.get('CLIENT_URL', { infer: true })
    const verifyLink = `${frontendUrl}/verify-email?token=${token}`

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          emailVerificationTokenHash: tokenHash,
          emailVerificationTokenExpiresAt: expiresAt,
        },
      }),
      this.prisma.emailOutbox.create({
        data: {
          to: user.email,
          subject: 'Подтверждение email',
          body: `Перейдите по ссылке для подтверждения email: ${verifyLink}`,
          type: 'EMAIL_VERIFICATION',
        },
      }),
    ])

    return { success: true, message: 'Письмо подтверждения отправлено', verifyLink }
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashResetToken(token)
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationTokenExpiresAt: { gt: new Date() },
      },
      include: { profile: true },
    })

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token')
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationTokenExpiresAt: null,
      },
      include: { profile: true },
    })

    return { success: true, user: this.toPublicUserWithProfile(updated) }
  }

  prepareUploadedAvatar(_userId: string, file: any) {
    if (!file) {
      throw new BadRequestException('Файл не загружен')
    }

    const url = `/uploads/profile/${file.filename}`
    void this.mediaQueueService.enqueueUploadedFile({ url, kind: 'profile-avatar' })

    return {
      type: 'IMAGE',
      url,
      filename: file.originalname ?? file.filename,
      mimeType: file.mimetype ?? 'image/*',
      sizeBytes: file.size ?? null,
    }
  }

  // Создать сессию с токенами
  private async createAuthSession(
    userId: string,
    req: Request,
    rememberMe: boolean,
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: true,
      },
    })

    const expiresInDays = this.getRefreshExpiresInDays(rememberMe)
    const expiresAt = getFutureDateInDays(expiresInDays)

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: 'temporary',
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        expiresAt,
      },
    })

    const refreshToken = this.tokenService.signRefreshToken(
      {
        sub: user.id,
        sessionId: session.id,
      },
      expiresInDays,
    )

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10)

    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash },
    })

    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      username: user.username,
      sessionId: session.id,
    })

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
      user: this.toPublicUserWithProfile(user),
    }
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  private getRefreshExpiresInDays(rememberMe: boolean): number {
    const key = rememberMe
      ? 'JWT_REFRESH_EXPIRES_IN_DAYS_REMEMBER'
      : 'JWT_REFRESH_EXPIRES_IN_DAYS'

    return Number(this.configService.get(key, { infer: true }))
  }

  private toPublicUserWithProfile(user: {
    id: string
    email: string
    username: string
    isEmailVerified: boolean
    createdAt: Date
    profile: {
      id: string
      avatarUrl: string | null
      bio: string | null
      age: number | null
      city: string | null
      country: string | null
    } | null
  }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      profile: user.profile,
    }
  }
}

