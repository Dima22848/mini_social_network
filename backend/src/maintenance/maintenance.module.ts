import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from '../prisma/prisma.module'
import { MaintenanceService } from './maintenance.service'

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
