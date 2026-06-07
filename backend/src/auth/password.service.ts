import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcrypt'
import type { Env } from '../config/env.schema'

@Injectable()
export class PasswordService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  hash(password: string) {
    const saltRounds = this.configService.get('BCRYPT_SALT_ROUNDS', {
      infer: true,
    })

    return bcrypt.hash(password, saltRounds)
  }

  compare(password: string, hash: string) {
    return bcrypt.compare(password, hash)
  }
}