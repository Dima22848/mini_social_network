'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '../api/auth.api'

const forgotPasswordSchema = z.object({
  email: z.string().email('Введите корректный email'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

export function ForgotPasswordForm() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  async function onSubmit(data: ForgotPasswordFormData) {
    setServerError(null)
    setResetLink(null)

    try {
      const result = await authApi.forgotPassword(data)

      setIsSuccess(true)
      setResetLink(result.resetLink ?? null)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Ошибка отправки письма')
    }
  }

  return (
    <div className="w-full max-w-[560px] rounded-3xl border border-zinc-100 bg-white px-10 py-10 shadow-[0_18px_60px_rgba(88,64,120,0.12)]">
      <Link
        href="/login"
        className="mb-8 inline-flex items-center text-sm font-semibold text-violet-600 hover:text-violet-700"
      >
        ← Вернуться ко входу в аккаунт
      </Link>

      <div className="mb-8 text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight">
          Восстановление пароля
        </h1>
        <p className="mx-auto mt-4 max-w-[410px] text-base leading-7 text-zinc-500">
          Введите e-mail, который вы использовали при регистрации. Мы отправим вам письмо с инструкциями по восстановлению пароля.
        </p>
      </div>

      {serverError && (
        <div className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      {isSuccess && (
        <div className="mb-6 rounded-2xl border border-green-100 bg-green-50 px-5 py-5 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-xl font-bold text-white">
            ✓
          </div>
          <h2 className="text-xl font-semibold">Письмо отправлено</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Если такой email существует, инструкции по восстановлению пароля отправлены.
          </p>

          {resetLink && (
            <Link
              href={resetLink}
              className="mt-4 block break-all rounded-xl border border-violet-100 bg-white px-4 py-3 text-sm font-medium text-violet-600 hover:text-violet-700"
            >
              Dev reset link: {resetLink}
            </Link>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="h-13 w-full rounded-xl bg-violet-600 text-base font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Отправляем...' : 'Отправить письмо'}
        </button>
      </form>
    </div>
  )
}