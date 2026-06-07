'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../providers/AuthProvider'

type ProtectedRouteProps = {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const pathname = usePathname()

  const { isLoading, isAuthenticated, validateAuth } = useAuth()
  const [isCheckingRouteAccess, setIsCheckingRouteAccess] = useState(true)

  useEffect(() => {
    let ignore = false

    async function checkRouteAccess() {
      if (isLoading) {
        return
      }

      setIsCheckingRouteAccess(true)

      if (!isAuthenticated) {
        if (!ignore) {
          setIsCheckingRouteAccess(false)
          router.replace('/login')
        }

        return
      }

      const isValid = await validateAuth()

      if (ignore) {
        return
      }

      setIsCheckingRouteAccess(false)

      if (!isValid) {
        router.replace('/login')
      }
    }

    checkRouteAccess()

    return () => {
      ignore = true
    }
  }, [pathname, isLoading, isAuthenticated, validateAuth, router])

  if (isLoading || isCheckingRouteAccess) {
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