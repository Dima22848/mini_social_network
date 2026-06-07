import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('api'),

  CLIENT_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),

  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(1),
  JWT_REFRESH_EXPIRES_IN_DAYS_REMEMBER: z.coerce.number().int().positive().default(30),

  COOKIE_SECRET: z.string().min(16),
  REFRESH_TOKEN_COOKIE_NAME: z.string().default('refreshToken'),

  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional().default(''),

  MAIL_FROM: z.string().email().default('no-reply@example.com'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(14).default(10),
})

export type Env = z.infer<typeof envSchema>