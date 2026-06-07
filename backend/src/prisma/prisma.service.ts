import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import type { Env } from '../config/env.schema'

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService<Env, true>) {
    const connectionString = configService.get('DATABASE_URL', { infer: true })

    const adapter = new PrismaPg({
      connectionString,
    })

    super({
      adapter,
      log:
        configService.get('NODE_ENV', { infer: true }) === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}