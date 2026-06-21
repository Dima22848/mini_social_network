// Cron-задачи обслуживания: чистим уже отозванные или истёкшие сущности, чтобы база не разрасталась мусором.
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async deleteRevokedSessions() {
    const result = await this.prisma.session.deleteMany({
      where: { revokedAt: { not: null } },
    })

    if (result.count > 0) {
      this.logger.log(`Deleted revoked sessions: ${result.count}`)
    }
  }
}
