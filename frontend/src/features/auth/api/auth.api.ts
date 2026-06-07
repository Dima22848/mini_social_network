import type {
  AuthResponse,
  ForgotPasswordResponse,
  MeResponse,
  SessionsResponse,
  SuccessResponse,
} from '../types/auth.types'

const API_URL = process.env.NEXT_PUBLIC_API_URL

type ApiErrorBody = {
  message?: string | string[]
  error?: string
  statusCode?: number
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorMessage = 'Request failed'

    try {
      const errorBody = (await response.json()) as ApiErrorBody

      if (Array.isArray(errorBody.message)) {
        errorMessage = errorBody.message.join(', ')
      } else if (errorBody.message) {
        errorMessage = errorBody.message
      } else if (errorBody.error) {
        errorMessage = errorBody.error
      }
    } catch {
      errorMessage = response.statusText
    }

    throw new Error(errorMessage)
  }

  return response.json() as Promise<T>
}

export const authApi = {
  register(data: {
    email: string
    username: string
    password: string
  }) {
    return apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  login(data: {
    email: string
    password: string
    rememberMe: boolean
  }) {
    return apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  refresh() {
    return apiRequest<AuthResponse>('/auth/refresh', {
      method: 'POST',
    })
  },

  me(accessToken: string) {
    return apiRequest<MeResponse>('/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  },

  logout() {
    return apiRequest<SuccessResponse>('/auth/logout', {
      method: 'POST',
    })
  },

  forgotPassword(data: { email: string }) {
    return apiRequest<ForgotPasswordResponse>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  resetPassword(data: {
    token: string
    password: string
  }) {
    return apiRequest<SuccessResponse>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  updateMe(
    accessToken: string,
    data: {
      username?: string
      bio?: string
      age?: number
      city?: string
      country?: string
    },
  ) {
    return apiRequest<MeResponse>('/auth/me', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(data),
    })
  },

  getSessions(accessToken: string) {
    return apiRequest<SessionsResponse>('/auth/sessions', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  },

  logoutAll(accessToken: string) {
    return apiRequest<SuccessResponse>('/auth/logout-all', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  },

  logoutAllExceptCurrent(accessToken: string) {
    return apiRequest<SuccessResponse>('/auth/logout-all-except-current', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  },

  logoutSession(accessToken: string, sessionId: string) {
    return apiRequest<SuccessResponse>(`/auth/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  },
}