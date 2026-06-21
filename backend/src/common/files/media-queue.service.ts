// Очередь BullMQ для медиа. Сейчас она проверяет загруженные файлы, дальше сюда удобно добавить thumbnails/metadata.
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Queue, Worker } from 'bullmq'
import { existsSync } from 'fs'
import { join, normalize } from 'path'
import type { Env } from '../../config/env.schema'

type MediaJob = {
  url: string
  kind: 'profile-avatar' | 'chat-attachment' | 'post-attachment' | 'chat-avatar'
}

@Injectable()
export class MediaQueueService implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue
  private worker?: Worker

  constructor(private readonly configService: ConfigService<Env, true>) {}

  onModuleInit() {
    const connection = this.getConnectionOptions()

    this.queue = new Queue('media-files', { connection })
    this.worker = new Worker(
      'media-files',
      async (job) => {
        const path = this.resolveUploadPath(job.data.url)
        if (!path || !existsSync(path)) {
          throw new Error(`Uploaded file was not found: ${job.data.url}`)
        }

        return { ok: true }
      },
      { connection },
    )
  }

  async enqueueUploadedFile(data: MediaJob) {
    if (!this.queue) return

    await this.queue.add('uploaded-file-check', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 100,
      removeOnFail: 200,
    })
  }

  async onModuleDestroy() {
    await this.worker?.close()
    await this.queue?.close()
  }

  private getConnectionOptions() {
    const host = this.configService.get('REDIS_HOST', { infer: true })
    const port = this.configService.get('REDIS_PORT', { infer: true })
    const password = this.configService.get('REDIS_PASSWORD', { infer: true })
    const db = this.configService.get('REDIS_DB', { infer: true })

    return {
      host,
      port,
      db,
      password: password.length > 0 ? password : undefined,
      maxRetriesPerRequest: null,
    }
  }

  private resolveUploadPath(url: string) {
    if (!url.startsWith('/uploads/')) return null

    const relativePath = normalize(url.replace(/^\/uploads\//, ''))
    if (relativePath.startsWith('..') || relativePath.includes('..')) return null

    return join(process.cwd(), 'uploads', relativePath)
  }
}
