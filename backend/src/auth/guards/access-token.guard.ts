// Guard для защищённых HTTP-роутов: проверяет JWT, затем дополнительно сверяет активность сессии в базе.
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Request } from 'express'
import { TokenService } from '../token.service'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly prismaService: PrismaService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>()

    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Access token missing')
    }

    const token = authHeader.split(' ')[1]

    let payload: {
      sub: string
      email: string
      username: string
      sessionId: string
    }

    try {
      payload = this.tokenService.verifyAccessToken(token)
    } catch {
      throw new UnauthorizedException('Invalid access token')
    }

    const session = await this.prismaService.session.findUnique({
      where: {
        id: payload.sessionId,
      },
      select: {
        id: true,
        userId: true,
        revokedAt: true,
        expiresAt: true,
      },
    })

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid session')
    }

    ; (request as Request & {
      user: {
        id: string
        email: string
        username: string
        sessionId: string
      }
    }).user = {
      id: payload.sub,
      email: payload.email,
      username: payload.username,
      sessionId: payload.sessionId,
    }

    return true
  }
}