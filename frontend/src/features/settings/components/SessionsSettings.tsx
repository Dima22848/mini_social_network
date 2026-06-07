'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import type { AuthSession } from '@/features/auth/types/auth.types'

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function SessionsSettings() {
  const router = useRouter()
  const { accessToken, clearAuth } = useAuth()
  const [sessions, setSessions] = useState<AuthSession[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)

  async function loadSessions() {
    if (!accessToken) {
      return
    }

    try {
      setIsLoading(true)
      const result = await authApi.getSessions(accessToken)
      setSessions(result.sessions)
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : 'Ошибка загрузки сессий',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  async function handleLogoutSession(sessionId: string) {
    if (!accessToken) {
      return
    }

    await authApi.logoutSession(accessToken, sessionId)
    await loadSessions()
  }

  async function handleLogoutAllExceptCurrent() {
    if (!accessToken) {
      return
    }

    await authApi.logoutAllExceptCurrent(accessToken)
    await loadSessions()
  }

  async function handleLogoutAll() {
    if (!accessToken) {
      return
    }

    try {
      await authApi.logoutAll(accessToken)
    } finally {
      clearAuth()
      router.replace('/login')
    }
  }

  if (isLoading) {
    return <p className="text-sm text-zinc-500">Загружаем сессии...</p>
  }

  return (
    <div className="space-y-5">
      {serverError && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleLogoutAllExceptCurrent}
          className="rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
        >
          Завершить все кроме текущей
        </button>

        <button
          type="button"
          onClick={handleLogoutAll}
          className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
        >
          Завершить все
        </button>
      </div>

      <div className="space-y-3">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {session.browser || 'Неизвестный браузер'}
                  </h3>

                  {session.isCurrent && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                      Текущая
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-zinc-500">
                  {session.os || 'Неизвестная ОС'} ·{' '}
                  {session.device || 'Устройство не определено'}
                </p>

                <p className="mt-1 text-sm text-zinc-500">
                  IP: {session.ipAddress || 'Неизвестно'}
                </p>

                <p className="mt-1 text-sm text-zinc-500">
                  Последняя активность: {formatDate(session.lastSeenAt)}
                </p>
              </div>

              {!session.isCurrent && (
                <button
                  type="button"
                  onClick={() => handleLogoutSession(session.id)}
                  className="rounded-xl border border-red-100 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  Завершить
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}