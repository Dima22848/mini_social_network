import { Module } from '@nestjs/common'
import { RedisModule } from '../../redis/redis.module'
import { MediaQueueService } from './media-queue.service'

@Module({
  imports: [RedisModule],
  providers: [MediaQueueService],
  exports: [MediaQueueService],
})
export class MediaQueueModule {}
