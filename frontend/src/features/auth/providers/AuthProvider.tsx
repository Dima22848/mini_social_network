'use client'

// Клиентское состояние авторизации. Здесь живёт access token, snapshot сессии и тихое обновление токена без reload страницы.
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AuthUser } from '../types/auth.types'
import {
  getMillisecondsUntilAccessTokenRefresh,
  refreshAccessTokenSilently,
  registerAuthRefreshBridge,
  syncAuthRefreshSnapshot,
} from '../lib/auth-refresh-client'

type RestoreAuthOptions = {
  force?: boolean
  silent?: boolean
}

type AuthSnapshot = {
  user: AuthUser
  accessToken: string
}

type AuthContextValue = {
  user: AuthUser | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setAuth: (data: { user: AuthUser; accessToken: string }) => void
  setUser: (user: AuthUser) => void
  clearAuth: () => void
  restoreAuth: (options?: RestoreAuthOptions) => Promise<boolean>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTH_STORAGE_KEY = 'social.auth.snapshot'
const REFRESH_TIMEOUT_MS = 8000

function readAuthSnapshot(): AuthSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as AuthSnapshot

    if (!parsed.user || !parsed.accessToken) {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    return parsed
  } catch {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

function writeAuthSnapshot(snapshot: AuthSnapshot) {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot))
}

function removeAuthSnapshot() {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.removeItem(AUTH_STORAGE_KEY)
}

async function refreshWithTimeout() {
  const timeoutPromise = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), REFRESH_TIMEOUT_MS)
  })

  const accessToken = await Promise.race([refreshAccessTokenSilently(), timeoutPromise])

  if (!accessToken) {
    return null
  }

  return readAuthSnapshot()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // Важно: не читаем sessionStorage в initial state.
  // Иначе сервер рисует loading, а первый клиентский рендер сразу рисует app-shell,
  // из-за чего появляется Hydration failed.
  const [user, setUserState] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const userRef = useRef<AuthUser | null>(null)
  const accessTokenRef = useRef<string | null>(null)
  const restorePromiseRef = useRef<Promise<boolean> | null>(null)

  const setAuth = useCallback((data: { user: AuthUser; accessToken: string }) => {
    userRef.current = data.user
    accessTokenRef.current = data.accessToken

    setUserState(data.user)
    setAccessToken(data.accessToken)
    setIsLoading(false)

    const snapshot = {
      user: data.user,
      accessToken: data.accessToken,
    }

    writeAuthSnapshot(snapshot)
    syncAuthRefreshSnapshot(snapshot)
  }, [])

  const setUser = useCallback((user: AuthUser) => {
    userRef.current = user
    setUserState(user)

    if (accessTokenRef.current) {
      const snapshot = {
        user,
        accessToken: accessTokenRef.current,
      }

      writeAuthSnapshot(snapshot)
      syncAuthRefreshSnapshot(snapshot)
    }
  }, [])

  const clearAuth = useCallback(() => {
    userRef.current = null
    accessTokenRef.current = null

    setUserState(null)
    setAccessToken(null)
    setIsLoading(false)

    removeAuthSnapshot()
    syncAuthRefreshSnapshot(null)
    queryClient.removeQueries()
  }, [queryClient])

  useEffect(() => {
    registerAuthRefreshBridge({
      applyAuth: setAuth,
      clearAuth,
    })
  }, [setAuth, clearAuth])

  const restoreAuth = useCallback(
    async (options: RestoreAuthOptions = {}) => {
      const { force = false, silent = false } = options
      const snapshot = readAuthSnapshot()
      const alreadyHasAuth = Boolean(userRef.current && accessTokenRef.current)

      if (snapshot && !alreadyHasAuth) {
        setAuth(snapshot)
      }

      if (!force && alreadyHasAuth) {
        return true
      }

      if (restorePromiseRef.current && !force) {
        return restorePromiseRef.current
      }

      if (!silent && !snapshot && !alreadyHasAuth) {
        setIsLoading(true)
      }

      const restorePromise = refreshWithTimeout()
        .then((data) => {
          if (!data) {
            if (!snapshot && !alreadyHasAuth) {
              clearAuth()
              return false
            }

            setIsLoading(false)
            return true
          }

          setAuth(data)

          return true
        })
        .catch(() => {
          // Если snapshot есть, не выбрасываем пользователя из UI из-за временной ошибки refresh.
          // Если snapshot нет, тогда авторизации действительно нет.
          if (!snapshot && !alreadyHasAuth) {
            clearAuth()
            return false
          }

          setIsLoading(false)
          return true
        })
        .finally(() => {
          restorePromiseRef.current = null
          setIsLoading(false)
        })

      restorePromiseRef.current = restorePromise

      return restorePromise
    },
    [setAuth, clearAuth],
  )

  useEffect(() => {
    void restoreAuth({ force: true, silent: false })
  }, [restoreAuth])

  useEffect(() => {
    function restoreAfterBrowserHistory() {
      const snapshot = readAuthSnapshot()

      if (snapshot) {
        setAuth(snapshot)
        void restoreAuth({ force: true, silent: true })
        return
      }

      void restoreAuth({ force: true, silent: false })
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        restoreAfterBrowserHistory()
      }
    }

    function handlePopState() {
      restoreAfterBrowserHistory()
    }

    window.addEventListener('pageshow', handlePageShow)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [restoreAuth, setAuth])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }

      if (userRef.current && accessTokenRef.current) {
        void restoreAuth({ force: true, silent: true })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [restoreAuth])

  useEffect(() => {
    if (!accessToken) {
      return
    }

    const refreshInMs = getMillisecondsUntilAccessTokenRefresh(accessToken)

    if (!refreshInMs) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void restoreAuth({ force: true, silent: true })
    }, refreshInMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [accessToken, restoreAuth])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: Boolean(user && accessToken),
      isLoading,
      setAuth,
      setUser,
      clearAuth,
      restoreAuth,
    }),
    [user, accessToken, isLoading, setAuth, setUser, clearAuth, restoreAuth],
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
