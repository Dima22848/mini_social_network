'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import {
  useLogoutAllExceptCurrentMutation,
  useLogoutAllMutation,
  useLogoutSessionMutation,
  useSessionsQuery,
} from '@/features/auth/api/auth.queries'

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
  const { clearAuth } = useAuth()
  const sessionsQuery = useSessionsQuery()
  const logoutSessionMutation = useLogoutSessionMutation()
  const logoutAllExceptCurrentMutation = useLogoutAllExceptCurrentMutation()
  const logoutAllMutation = useLogoutAllMutation()

  const serverError =
    sessionsQuery.error instanceof Error
      ? sessionsQuery.error.message
      : logoutSessionMutation.error instanceof Error
        ? logoutSessionMutation.error.message
        : logoutAllExceptCurrentMutation.error instanceof Error
          ? logoutAllExceptCurrentMutation.error.message
          : logoutAllMutation.error instanceof Error
            ? logoutAllMutation.error.message
            : null

  async function handleLogoutSession(sessionId: string) {
    await logoutSessionMutation.mutateAsync(sessionId)
  }

  async function handleLogoutAllExceptCurrent() {
    await logoutAllExceptCurrentMutation.mutateAsync()
  }

  async function handleLogoutAll() {
    try {
      await logoutAllMutation.mutateAsync()
    } finally {
      clearAuth()
      router.replace('/login')
    }
  }

  if (sessionsQuery.isLoading) {
    return <p className="text-sm text-zinc-500">Загружаем сессии...</p>
  }

  const sessions = sessionsQuery.data?.sessions ?? []

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
          disabled={logoutAllExceptCurrentMutation.isPending}
          onClick={handleLogoutAllExceptCurrent}
          className="rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50 disabled:opacity-60"
        >
          Завершить все кроме текущей
        </button>

        <button
          type="button"
          disabled={logoutAllMutation.isPending}
          onClick={handleLogoutAll}
          className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
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
                  disabled={logoutSessionMutation.isPending}
                  onClick={() => handleLogoutSession(session.id)}
                  className="rounded-xl border border-red-100 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
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
