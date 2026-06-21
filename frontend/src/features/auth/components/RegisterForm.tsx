'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRegisterMutation } from '../api/auth.queries'
import { useAuth } from '../providers/AuthProvider'

const registerSchema = z
  .object({
    email: z.string().email('Введите корректный email'),
    username: z.string().min(3, 'Минимум 3 символа').max(30, 'Максимум 30 символов'),
    password: z.string().min(8, 'Минимум 8 символов').max(72, 'Максимум 72 символа'),
    confirmPassword: z.string().min(8, 'Минимум 8 символов'),
    sendNewsToEmail: z.boolean(),
    sendUserNotificationsToEmail: z.boolean(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

type RegisterFormData = z.infer<typeof registerSchema>

export function RegisterForm() {
  const router = useRouter()
  const { setAuth, isAuthenticated } = useAuth()
  const registerMutation = useRegisterMutation()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      sendNewsToEmail: false,
      sendUserNotificationsToEmail: false,
    },
  })

  async function onSubmit(data: RegisterFormData) {
    setServerError(null)

    try {
      const result = await registerMutation.mutateAsync({
        email: data.email,
        username: data.username,
        password: data.password,
      })

      setAuth({
        user: result.user,
        accessToken: result.accessToken,
      })

      router.push('/profile')
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Ошибка регистрации')
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/profile')
    }
  }, [isAuthenticated, router])

  return (
    <div className="w-full max-w-[500px] rounded-3xl border border-zinc-100 bg-white px-10 py-10 shadow-[0_18px_60px_rgba(88,64,120,0.12)]">
      <div className="mb-7 text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">
          Создать аккаунт
        </h1>
        <p className="mt-4 text-base leading-6 text-zinc-500">
          Присоединяйтесь к Social и открывайте новые вкусы вместе с сообществом ценителей.
        </p>
      </div>

      {serverError && (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium">E-mail</label>
          <input
            type="email"
            placeholder="name@example.com"
            {...register('email')}
            className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
          {errors.email && (
            <p className="mt-2 text-sm text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Никнейм</label>
          <input
            type="text"
            placeholder="Введите никнейм"
            {...register('username')}
            className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
          {errors.username && (
            <p className="mt-2 text-sm text-red-500">{errors.username.message}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Пароль</label>
          <input
            type="password"
            placeholder="Введите пароль"
            {...register('password')}
            className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
          {errors.password && (
            <p className="mt-2 text-sm text-red-500">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Подтвердите пароль</label>
          <input
            type="password"
            placeholder="Повторите пароль"
            {...register('confirmPassword')}
            className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
          {errors.confirmPassword && (
            <p className="mt-2 text-sm text-red-500">{errors.confirmPassword.message}</p>
          )}
        </div>

        <label className="flex items-start gap-2 text-xs leading-5 text-zinc-700">
          <input
            type="checkbox"
            {...register('sendNewsToEmail')}
            className="mt-0.5 h-4 w-4 accent-violet-600"
          />
          Отправлять новости на e-mail о новом алкоголе?
        </label>

        <label className="flex items-start gap-2 text-xs leading-5 text-zinc-700">
          <input
            type="checkbox"
            {...register('sendUserNotificationsToEmail')}
            className="mt-0.5 h-4 w-4 accent-violet-600"
          />
          Отправлять уведомления от других пользователей на ваш e-mail?
        </label>

        <button
          type="submit"
          disabled={isSubmitting || registerMutation.isPending}
          className="h-13 w-full rounded-xl bg-violet-600 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting || registerMutation.isPending ? 'Создаём аккаунт...' : 'Зарегистрироваться'}
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-zinc-500">
        Уже есть аккаунт?{' '}
        <Link href="/login" className="font-semibold text-violet-600 hover:text-violet-700">
          Войти
        </Link>
      </p>
    </div>
  )
}