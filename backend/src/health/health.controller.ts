import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RedisService } from '../redis/redis.service'

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`

    const redis = this.redisService.getClient()
    const redisPong = await redis.ping()

    return {
      status: 'ok',
      postgres: 'connected',
      redis: redisPong,
    }
  }
}