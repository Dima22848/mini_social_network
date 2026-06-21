// Общий fetch-helper для защищённых запросов: перед запросом обновляет почти истёкший JWT, а после 401 пробует refresh и retry.
import type { AuthUser } from '../types/auth.types'

const API_URL = process.env.NEXT_PUBLIC_API_URL

export type AuthSnapshot = {
  user: AuthUser
  accessToken: string
}

type BridgeHandlers = {
  applyAuth: (snapshot: AuthSnapshot) => void
  clearAuth: () => void
}

let currentSnapshot: AuthSnapshot | null = null
let bridgeHandlers: BridgeHandlers | null = null
let refreshPromise: Promise<string | null> | null = null

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  return window.atob(padded)
}

function getAccessTokenExpiresAt(accessToken: string) {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const [, payloadPart] = accessToken.split('.')

    if (!payloadPart) {
      return null
    }

    const payload = JSON.parse(decodeBase64Url(payloadPart)) as { exp?: number }

    return payload.exp ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function shouldRefreshAccessToken(accessToken: string, refreshBeforeMs = 60_000) {
  const expiresAt = getAccessTokenExpiresAt(accessToken)

  if (!expiresAt) {
    return false
  }

  return expiresAt - Date.now() <= refreshBeforeMs
}

async function parseErrorMessage(response: Response) {
  try {
    const errorBody = (await response.json()) as {
      message?: string | string[]
      error?: string
    }

    if (Array.isArray(errorBody.message)) {
      return errorBody.message.join(', ')
    }

    return errorBody.message || errorBody.error || response.statusText
  } catch {
    return response.statusText
  }
}

export function registerAuthRefreshBridge(handlers: BridgeHandlers) {
  bridgeHandlers = handlers
}

export function syncAuthRefreshSnapshot(snapshot: AuthSnapshot | null) {
  currentSnapshot = snapshot
}

export async function refreshAccessTokenSilently() {
  if (refreshPromise) {
    return refreshPromise
  }

  if (!API_URL) {
    return null
  }

  refreshPromise = fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })
    .then(async (response) => {
      if (!response.ok) {
        bridgeHandlers?.clearAuth()
        return null
      }

      const data = (await response.json()) as AuthSnapshot
      currentSnapshot = data
      bridgeHandlers?.applyAuth(data)

      return data.accessToken
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

async function sendAuthorizedRequest(
  path: string,
  accessToken: string,
  options: RequestInit,
  isMultipart: boolean,
) {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)

  if (!isMultipart && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })
}

export async function apiRequestWithAuth<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  let tokenToUse = accessToken

  // Не ждём, пока запрос упадёт по 401. Если JWT почти истёк, тихо берём новый.
  if (shouldRefreshAccessToken(tokenToUse)) {
    tokenToUse = (await refreshAccessTokenSilently()) ?? tokenToUse
  }

  let response = await sendAuthorizedRequest(path, tokenToUse, options, false)

  // На случай если вкладка долго висела открытой или запрос попал ровно в момент истечения JWT.
  if (response.status === 401) {
    const refreshedToken = await refreshAccessTokenSilently()

    if (refreshedToken) {
      response = await sendAuthorizedRequest(path, refreshedToken, options, false)
    }
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json() as Promise<T>
}

export async function apiUploadRequestWithAuth<T>(
  path: string,
  accessToken: string,
  formData: FormData,
): Promise<T> {
  let tokenToUse = accessToken

  if (shouldRefreshAccessToken(tokenToUse)) {
    tokenToUse = (await refreshAccessTokenSilently()) ?? tokenToUse
  }

  let response = await sendAuthorizedRequest(
    path,
    tokenToUse,
    { method: 'POST', body: formData },
    true,
  )

  if (response.status === 401) {
    const refreshedToken = await refreshAccessTokenSilently()

    if (refreshedToken) {
      response = await sendAuthorizedRequest(
        path,
        refreshedToken,
        { method: 'POST', body: formData },
        true,
      )
    }
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json() as Promise<T>
}

export function getMillisecondsUntilAccessTokenRefresh(accessToken: string) {
  const expiresAt = getAccessTokenExpiresAt(accessToken)

  if (!expiresAt) {
    return null
  }

  return Math.max(expiresAt - Date.now() - 60_000, 5_000)
}
