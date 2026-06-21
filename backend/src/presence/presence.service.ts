// Online presence через Redis. Redis здесь удобнее базы: статус часто меняется и не должен грузить PostgreSQL.
import { Injectable } from '@nestjs/common'
import { RedisService } from '../redis/redis.service'

@Injectable()
export class PresenceService {
  private readonly ttlSeconds = 70

  constructor(private readonly redisService: RedisService) {}

  private getUserPresenceKey(userId: string) {
    return `presence:user:${userId}`
  }

  private getUserSocketsKey(userId: string) {
    return `presence:user:${userId}:sockets`
  }

  async markOnline(userId: string, socketId: string) {
    const redis = this.redisService.getClient()

    await redis.sadd(this.getUserSocketsKey(userId), socketId)
    await redis.expire(this.getUserSocketsKey(userId), this.ttlSeconds)
    await redis.set(this.getUserPresenceKey(userId), 'online', 'EX', this.ttlSeconds)
  }

  async touch(userId: string) {
    const redis = this.redisService.getClient()

    await redis.set(this.getUserPresenceKey(userId), 'online', 'EX', this.ttlSeconds)
    await redis.expire(this.getUserSocketsKey(userId), this.ttlSeconds)
  }

  async markSocketOffline(userId: string, socketId: string) {
    const redis = this.redisService.getClient()
    const socketsKey = this.getUserSocketsKey(userId)

    await redis.srem(socketsKey, socketId)

    const socketsCount = await redis.scard(socketsKey)

    if (socketsCount === 0) {
      await redis.del(socketsKey)
      await redis.del(this.getUserPresenceKey(userId))
    }
  }

  async isOnline(userId: string) {
    const value = await this.redisService.get(this.getUserPresenceKey(userId))

    return value === 'online'
  }

  async getOnlineMap(userIds: string[]) {
    if (userIds.length === 0) {
      return new Map<string, boolean>()
    }

    const redis = this.redisService.getClient()
    const values = await redis.mget(
      userIds.map((userId) => this.getUserPresenceKey(userId)),
    )

    return new Map(
      userIds.map((userId, index) => [userId, values[index] === 'online']),
    )
  }
}
