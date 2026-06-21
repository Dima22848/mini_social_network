// Главный модуль backend. Тут собираются все доменные модули: auth, пользователи, профили, посты, чаты, уведомления, Redis и cron-задачи.
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validateEnv } from './config/env.validation'
import { PrismaModule } from './prisma/prisma.module'
import { RedisModule } from './redis/redis.module'
import { HealthModule } from './health/health.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ProfilesModule } from './profiles/profiles.module'
import { PostsModule } from './posts/posts.module'
import { ChatsModule } from './chats/chats.module'
import { NotificationsModule } from './notifications/notifications.module'
import { MaintenanceModule } from './maintenance/maintenance.module'


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: '.env',
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    PostsModule,
    ChatsModule,
    NotificationsModule,
    MaintenanceModule,
  ],
})
export class AppModule {}