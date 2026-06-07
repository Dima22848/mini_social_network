'use client'

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { authApi } from '../api/auth.api'
import type { AuthUser } from '../types/auth.types'

type AuthContextValue = {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setAuth: (data: { user: AuthUser; accessToken: string }) => void
  setUser: (user: AuthUser) => void
  clearAuth: () => void
  validateAuth: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const setAuth = useCallback((data: { user: AuthUser; accessToken: string }) => {
    setUserState(data.user)
    setAccessToken(data.accessToken)
  }, [])

  const setUser = useCallback((user: AuthUser) => {
    setUserState(user)
  }, [])

  const clearAuth = useCallback(() => {
    setUserState(null)
    setAccessToken(null)
  }, [])

  const validateAuth = useCallback(async () => {
    if (!accessToken) {
      clearAuth()
      return false
    }

    try {
      const result = await authApi.me(accessToken)

      setUserState(result.user)

      return true
    } catch {
      clearAuth()
      return false
    }
  }, [accessToken, clearAuth])

  useEffect(() => {
    let ignore = false

    async function restoreAuth() {
      try {
        const data = await authApi.refresh()

        if (!ignore) {
          setAuth({
            user: data.user,
            accessToken: data.accessToken,
          })
        }
      } catch {
        if (!ignore) {
          clearAuth()
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }

    restoreAuth()

    return () => {
      ignore = true
    }
  }, [setAuth, clearAuth])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isLoading,
      setAuth,
      setUser,
      clearAuth,
      validateAuth,
    }),
    [
      user,
      accessToken,
      isLoading,
      setAuth,
      setUser,
      clearAuth,
      validateAuth,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}