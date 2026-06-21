'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { authApi } from '@/features/auth/api/auth.api'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Проверяем ссылку подтверждения...')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('В ссылке отсутствует token.')
      return
    }

    authApi.verifyEmail({ token })
      .then(() => {
        setStatus('success')
        setMessage('Email успешно подтверждён.')
      })
      .catch((error) => {
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Не удалось подтвердить email.')
      })
  }, [token])

  return (
    <AuthShell active="login">
      <div className="w-full max-w-[520px] rounded-3xl border border-zinc-100 bg-white px-10 py-10 text-center shadow-[0_18px_60px_rgba(88,64,120,0.12)]">
        <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-2xl font-black text-white ${status === 'error' ? 'bg-red-500' : status === 'success' ? 'bg-emerald-500' : 'bg-violet-600'}`}>
          {status === 'loading' ? '…' : status === 'success' ? '✓' : '!'}
        </div>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">Подтверждение email</h1>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-zinc-500">{message}</p>
        <Link href={status === 'success' ? '/profile' : '/login'} className="mt-8 inline-flex rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-100 hover:bg-violet-700">
          {status === 'success' ? 'Перейти в профиль' : 'Вернуться ко входу'}
        </Link>
      </div>
    </AuthShell>
  )
}
