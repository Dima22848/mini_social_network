export type UserProfile = {
  id: string
  avatarUrl: string | null
  bio: string | null
  age: number | null
  city: string | null
  country: string | null
}

export type AuthUser = {
  id: string
  email: string
  username: string
  isEmailVerified: boolean
  createdAt: string
  profile: UserProfile | null
}

export type AuthResponse = {
  accessToken: string
  user: AuthUser
}

export type MeResponse = {
  user: AuthUser
}

export type SuccessResponse = {
  success: true
}

export type ForgotPasswordResponse = {
  success: true
  message: string
  resetLink?: string
}

export type AuthSession = {
  id: string
  userAgent: string | null
  ipAddress: string | null
  country: string | null
  city: string | null
  device: string | null
  browser: string | null
  os: string | null
  lastSeenAt: string
  expiresAt: string
  createdAt: string
  isCurrent: boolean
}

export type SessionsResponse = {
  sessions: AuthSession[]
}