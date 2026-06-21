'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useLoginMutation } from '../api/auth.queries'
import { useAuth } from '../providers/AuthProvider'

const loginSchema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(8, 'Минимум 8 символов'),
  rememberMe: z.boolean(),
})

type LoginFormData = z.infer<typeof loginSchema>

export function LoginForm() {
  const router = useRouter()
  const { setAuth, isAuthenticated } = useAuth()
  const loginMutation = useLoginMutation()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  })

  async function onSubmit(data: LoginFormData) {
    setServerError(null)

    try {
      const result = await loginMutation.mutateAsync(data)

      setAuth({
        user: result.user,
        accessToken: result.accessToken,
      })

      router.push('/profile')
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Ошибка входа')
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/profile')
    }
  }, [isAuthenticated, router])


  return (
    <div className="w-full max-w-[500px] rounded-3xl border border-zinc-100 bg-white px-10 py-11 shadow-[0_18px_60px_rgba(88,64,120,0.12)]">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">
          Вход в аккаунт
        </h1>
        <p className="mt-4 text-base leading-6 text-zinc-500">
          Добро пожаловать! Войдите, чтобы открывать новые вкусы и делиться впечатлениями.
        </p>
      </div>

      {serverError && (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium">Email</label>
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

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-zinc-700">
            <input
              type="checkbox"
              {...register('rememberMe')}
              className="h-4 w-4 accent-violet-600"
            />
            Запомнить меня
          </label>

          <Link href="/forgot-password" className="font-medium text-violet-600 hover:text-violet-700">
            Забыли пароль?
          </Link>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || loginMutation.isPending}
          className="h-13 w-full rounded-xl bg-violet-600 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting || loginMutation.isPending ? 'Входим...' : 'Войти'}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-zinc-500">
        Нет аккаунта?{' '}
        <Link href="/register" className="font-semibold text-violet-600 hover:text-violet-700">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  )
}