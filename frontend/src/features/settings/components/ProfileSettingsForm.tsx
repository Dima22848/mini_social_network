'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuth } from '@/features/auth/providers/AuthProvider'

type ProfileSettingsFormData = {
  username: string
  bio: string
  age: string
  city: string
  country: string
}

export function ProfileSettingsForm() {
  const { user, accessToken, setUser } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ProfileSettingsFormData>({
    defaultValues: {
      username: user?.username ?? '',
      bio: user?.profile?.bio ?? '',
      age: user?.profile?.age ? String(user.profile.age) : '',
      city: user?.profile?.city ?? '',
      country: user?.profile?.country ?? '',
    },
  })

  async function onSubmit(data: ProfileSettingsFormData) {
    if (!accessToken) {
      return
    }

    setServerError(null)
    setSuccess(false)

    try {
      const result = await authApi.updateMe(accessToken, {
        username: data.username,
        bio: data.bio || undefined,
        age: data.age ? Number(data.age) : undefined,
        city: data.city || undefined,
        country: data.country || undefined,
      })

      setUser(result.user)
      setSuccess(true)
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : 'Ошибка обновления профиля',
      )
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-5">
      {serverError && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
          Профиль обновлён.
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium">Никнейм</label>
        <input
          {...register('username')}
          className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Возраст</label>
        <input
          type="number"
          {...register('age')}
          className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">Город</label>
          <input
            {...register('city')}
            className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Страна</label>
          <input
            {...register('country')}
            className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">О себе</label>
        <textarea
          {...register('bio')}
          rows={5}
          className="w-full resize-none rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-100 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Сохраняем...' : 'Сохранить изменения'}
      </button>
    </form>
  )
}