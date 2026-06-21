'use client'

// Обёртка защищённых страниц: пока проверяем auth — показываем loader, если сессии нет — уводим на login.
import { ReactNode, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../providers/AuthProvider'

type ProtectedRouteProps = {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const { isLoading, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isLoading, isAuthenticated, router])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#fbf9ff]">
        <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
          Проверяем авторизацию...
        </div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
