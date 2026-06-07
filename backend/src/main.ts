import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import type { Env } from './config/env.schema'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const configService = app.get(ConfigService<Env, true>)

  const port = configService.get('PORT', { infer: true })
  const apiPrefix = configService.get('API_PREFIX', { infer: true })
  const clientUrl = configService.get('CLIENT_URL', { infer: true })
  const cookieSecret = configService.get('COOKIE_SECRET', { infer: true })

  app.setGlobalPrefix(apiPrefix)

  app.enableCors({
    origin: clientUrl,
    credentials: true,
  })

  app.use(cookieParser(cookieSecret))

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  await app.listen(port)

  console.log(`🚀 API is running on http://localhost:${port}/${apiPrefix}`)
}

bootstrap()