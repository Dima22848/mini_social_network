'use client'

import Link from 'next/link'
import {
  MessageCircle,
  Newspaper,
  Settings,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import type { AuthUser } from '@/features/auth/types/auth.types'
import { usePathname } from 'next/navigation'

type ProfileSidebarProps = {
  user: AuthUser
}

const navItems = [
  {
    label: 'Профиль',
    href: '/profile',
    icon: User,
  },
  {
    label: 'Друзья',
    href: '/friends',
    icon: Users,
  },
  {
    label: 'Подписки',
    href: '/subscriptions',
    icon: UserPlus,
  },
  {
    label: 'Сообщения',
    href: '/messages',
    icon: MessageCircle,
  },
  {
    label: 'Новостная лента',
    href: '/feed',
    icon: Newspaper,
  },
  {
    label: 'Настройки',
    href: '/settings',
    icon: Settings,
  },
]

export function ProfileSidebar({ user }: ProfileSidebarProps) {
  const pathname = usePathname()
  
  const avatarUrl = user.profile?.avatarUrl

  return (
    <aside className="space-y-5">
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-3xl font-semibold text-violet-700">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={user.username} className="h-full w-full object-cover" />
          ) : (
            user.username.slice(0, 1).toUpperCase()
          )}
        </div>

        <h2 className="mt-4 text-xl font-semibold">{user.username}</h2>
        <p className="mt-1 break-all text-sm text-zinc-500">{user.email}</p>
      </div>

      <nav className="rounded-3xl border border-zinc-100 bg-white p-3 shadow-sm">
        {navItems.map((item) => {
          const Icon = item.icon

          const isActive = pathname === item.href.split('?')[0]
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive
                  ? 'flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700'
                  : 'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-zinc-600 transition hover:bg-violet-50 hover:text-violet-700'
              }
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}