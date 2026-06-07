import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import type { Env } from '../config/env.schema'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name)
  private client: Redis

  constructor(private readonly configService: ConfigService<Env, true>) {
    const host = this.configService.get('REDIS_HOST', { infer: true })
    const port = this.configService.get('REDIS_PORT', { infer: true })
    const password = this.configService.get('REDIS_PASSWORD', { infer: true })
    const db = this.configService.get('REDIS_DB', { infer: true })

    this.client = new Redis({
      host,
      port,
      db,
      password: password.length > 0 ? password : undefined,
      maxRetriesPerRequest: null,
    })
  }

  onModuleInit() {
    this.client.on('connect', () => {
      this.logger.log('Redis connected')
    })

    this.client.on('error', (error) => {
      this.logger.error('Redis error', error)
    })
  }

  async onModuleDestroy() {
    await this.client.quit()
  }

  getClient() {
    return this.client
  }

  async get(key: string) {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) {
      return this.client.set(key, value, 'EX', ttlSeconds)
    }

    return this.client.set(key, value)
  }

  async del(key: string) {
    return this.client.del(key)
  }
}