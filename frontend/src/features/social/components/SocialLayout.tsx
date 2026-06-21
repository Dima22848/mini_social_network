'use client'

import { ReactNode } from 'react'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { ProfileHeader } from '@/features/profile/components/ProfileHeader'
import { ProfileSidebar } from '@/features/profile/components/ProfileSidebar'

export function SocialLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  if (!user) {
    return null
  }

  return (
    <main className="min-h-screen bg-[#fbf9ff] text-zinc-950">
      <ProfileHeader user={user} />

      <div className="mx-auto grid max-w-7xl grid-cols-[240px_minmax(0,1fr)] gap-7 px-6 pb-10 pt-28 max-lg:grid-cols-1 max-lg:px-4">
        <div className="max-lg:hidden">
          <ProfileSidebar user={user} />
        </div>

        {children}
      </div>
    </main>
  )
}