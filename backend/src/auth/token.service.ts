import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as jwt from 'jsonwebtoken'
import type { Env } from '../config/env.schema'

export type AccessTokenPayload = {
  sub: string
  email: string
  username: string
  sessionId: string
}

export type RefreshTokenPayload = {
  sub: string
  sessionId: string
}

@Injectable()
export class TokenService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  signAccessToken(payload: AccessTokenPayload) {
    const secret = this.configService.get('JWT_ACCESS_SECRET', { infer: true })
    const expiresIn = this.configService.get('JWT_ACCESS_EXPIRES_IN', {
      infer: true,
    }) as jwt.SignOptions['expiresIn']

    return jwt.sign(payload, secret, { expiresIn })
  }

  signRefreshToken(payload: RefreshTokenPayload, expiresInDays: number) {
    const secret = this.configService.get('JWT_REFRESH_SECRET', { infer: true })

    return jwt.sign(payload, secret, {
      expiresIn: `${expiresInDays}d`,
    })
  }

  verifyRefreshToken(token: string) {
    const secret = this.configService.get('JWT_REFRESH_SECRET', { infer: true })

    return jwt.verify(token, secret) as RefreshTokenPayload
  }

  verifyAccessToken(token: string) {
    const secret = this.configService.get('JWT_ACCESS_SECRET', { infer: true })

    return jwt.verify(token, secret) as AccessTokenPayload
  }
}