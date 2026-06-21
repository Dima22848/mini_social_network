'use client'

// Левая панель профиля и навигации. Используется на всех защищённых страницах desktop-версии.
import Link from 'next/link'
import { useState } from 'react'
import {
  MessageCircle,
  Newspaper,
  Settings,
  User,
  UserPlus,
  Users,
} from 'lucide-react'
import type { AuthUser } from '@/features/auth/types/auth.types'
import { getAssetUrl } from '@/shared/utils/assets'
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
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false)
  
  const avatarUrl = getAssetUrl(user.profile?.avatarUrl)

  return (
    <aside className="space-y-5">
      <div className="rounded-3xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
        <button
          type="button"
          onClick={() => avatarUrl && setIsAvatarPreviewOpen(true)}
          disabled={!avatarUrl}
          className={`mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-violet-100 text-3xl font-semibold text-violet-700 ${avatarUrl ? 'cursor-zoom-in hover:ring-4 hover:ring-violet-100' : 'cursor-default'}`}
          aria-label="Посмотреть аватар профиля"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={user.username} className="h-full w-full object-cover" />
          ) : (
            user.username.slice(0, 1).toUpperCase()
          )}
        </button>

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
      {isAvatarPreviewOpen && avatarUrl && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 px-4 py-6" onMouseDown={() => setIsAvatarPreviewOpen(false)}>
          <div className="relative max-h-[90dvh] w-full max-w-3xl overflow-hidden rounded-3xl bg-white p-3 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setIsAvatarPreviewOpen(false)} className="absolute right-4 top-4 z-10 rounded-full bg-white/90 px-3 py-1.5 text-xl leading-none text-slate-700 shadow-lg hover:bg-white" aria-label="Закрыть аватар">
              ×
            </button>
            <img src={avatarUrl} alt={user.username} className="max-h-[calc(90dvh-1.5rem)] w-full rounded-2xl object-contain" />
          </div>
        </div>
      )}
    </aside>
  )
}