import {
  CalendarDays,
  CheckCircle2,
  CircleUserRound,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import type { AuthUser } from '@/features/auth/types/auth.types'

type ProfileInfoCardProps = {
  user: AuthUser
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}

export function ProfileInfoCard({ user }: ProfileInfoCardProps) {
  const profile = user.profile

  const location = [profile?.city, profile?.country].filter(Boolean).join(', ')

  const items = [
    {
      label: 'Никнейм',
      value: user.username,
      icon: CircleUserRound,
    },
    {
      label: 'E-mail',
      value: user.email,
      icon: Mail,
    },
    {
      label: 'Статус e-mail',
      value: user.isEmailVerified ? 'Подтверждён' : 'Не подтверждён',
      icon: user.isEmailVerified ? CheckCircle2 : ShieldCheck,
    },
    {
      label: 'Дата регистрации',
      value: formatDate(user.createdAt),
      icon: CalendarDays,
    },
    {
      label: 'Возраст',
      value: profile?.age ? `${profile.age} лет` : 'Не указан',
      icon: CircleUserRound,
    },
    {
      label: 'Город и страна',
      value: location || 'Не указано',
      icon: MapPin,
    },
  ]

  return (
    <section className="rounded-3xl border border-zinc-100 bg-white p-6 shadow-sm">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon

          return (
            <div key={item.label} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
                <Icon size={19} />
              </div>

              <div>
                <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
                <p className="mt-1 text-sm leading-5 text-zinc-500">{item.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 border-t border-zinc-100 pt-5">
        <p className="text-sm font-semibold text-zinc-900">О себе</p>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {profile?.bio || 'Пользователь пока не добавил информацию о себе.'}
        </p>
      </div>
    </section>
  )
}