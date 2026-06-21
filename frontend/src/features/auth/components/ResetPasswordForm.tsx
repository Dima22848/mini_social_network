'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useResetPasswordMutation } from '../api/auth.queries'
import { useAuth } from '../providers/AuthProvider'

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Минимум 8 символов').max(72, 'Максимум 72 символа'),
    confirmPassword: z.string().min(8, 'Минимум 8 символов'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Пароли не совпадают',
    path: ['confirmPassword'],
  })

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>

export function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetPasswordMutation = useResetPasswordMutation()
  const { user } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const token = searchParams.get('token')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  async function onSubmit(data: ResetPasswordFormData) {
    if (!token) {
      setServerError('Reset token missing')
      return
    }

    setServerError(null)

    try {
      await resetPasswordMutation.mutateAsync({
        token,
        password: data.password,
      })

      setSuccess(true)

      setTimeout(() => {
        router.push(user ? '/settings?tab=security' : '/login')
      }, 1200)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Ошибка восстановления пароля')
    }
  }

  return (
    <div className="w-full max-w-[520px] rounded-3xl border border-zinc-100 bg-white px-10 py-10 shadow-[0_18px_60px_rgba(88,64,120,0.12)]">
      <Link
        href={user ? "/settings?tab=security" : "/login"}
        className="mb-8 inline-flex items-center text-sm font-semibold text-violet-600 hover:text-violet-700"
      >
        {user ? '← Вернуться в настройки' : '← Вернуться ко входу'}
      </Link>

      <div className="mb-8 text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">
          Новый пароль
        </h1>
        <p className="mx-auto mt-4 max-w-[410px] text-base leading-7 text-zinc-500">
          Придумайте новый пароль для вашего аккаунта.
        </p>
      </div>

      {!token && (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          Ссылка восстановления некорректная: отсутствует token.
        </div>
      )}

      {success && (
        <div className="mb-5 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          Пароль обновлён. Сейчас перенаправим вас дальше.
        </div>
      )}

      {serverError && (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium">Новый пароль</label>
          <input
            type="password"
            placeholder="Введите новый пароль"
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
            placeholder="Повторите новый пароль"
            {...register('confirmPassword')}
            className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
          {errors.confirmPassword && (
            <p className="mt-2 text-sm text-red-500">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || resetPasswordMutation.isPending || !token}
          className="h-13 w-full rounded-xl bg-violet-600 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting || resetPasswordMutation.isPending ? 'Сохраняем...' : 'Сохранить пароль'}
        </button>
      </form>
    </div>
  )
}