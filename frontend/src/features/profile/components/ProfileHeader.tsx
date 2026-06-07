'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, ChevronDown, Home, LogOut, Settings, User } from 'lucide-react'
import { useState } from 'react'
import { authApi } from '@/features/auth/api/auth.api'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import type { AuthUser } from '@/features/auth/types/auth.types'

type ProfileHeaderProps = {
  user: AuthUser
}

export function ProfileHeader({ user }: ProfileHeaderProps) {
  const router = useRouter()
  const { clearAuth } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  async function handleLogout() {
    try {
      await authApi.logout()
    } finally {
      clearAuth()
      router.replace('/login')
    }
  }

  const avatarUrl = user.profile?.avatarUrl

  return (
    <header className="fixed left-4 right-4 top-3 z-30 rounded-3xl border border-violet-100/70 bg-white/90 px-8 py-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <Link href="/profile" className="font-serif text-4xl font-semibold tracking-tight text-zinc-950">
          Social
        </Link>

        <div className="flex items-center gap-4">
          <button
            type="button"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-zinc-100 bg-white text-zinc-600 transition hover:border-violet-200 hover:text-violet-600"
            aria-label="Уведомления"
          >
            <Bell size={20} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-violet-600" />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen((value) => !value)}
              className="flex items-center gap-3 rounded-full border border-zinc-100 bg-white py-1.5 pl-1.5 pr-3 transition hover:border-violet-200"
            >
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={user.username} className="h-full w-full object-cover" />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )}
              </div>

              <ChevronDown size={16} className="text-zinc-500" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 mt-3 w-56 overflow-hidden rounded-2xl border border-zinc-100 bg-white p-2 shadow-[0_18px_60px_rgba(88,64,120,0.16)]">
                <Link
                  href="/profile"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-violet-50 hover:text-violet-700"
                >
                  <Home size={17} />
                  Главная страница
                </Link>

                <Link
                  href="/settings"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-violet-50 hover:text-violet-700"
                >
                  <Settings size={17} />
                  Настройки
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <LogOut size={17} />
                  Выйти с аккаунта
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}