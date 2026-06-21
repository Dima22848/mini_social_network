'use client'

import { AuthShell } from '@/features/auth/components/AuthShell'
import { ResetPasswordForm } from '@/features/auth/components/ResetPasswordForm'
import { useAuth } from '@/features/auth/providers/AuthProvider'
import { ProfileHeader } from '@/features/profile/components/ProfileHeader'
import { ProfileSidebar } from '@/features/profile/components/ProfileSidebar'

export default function ResetPasswordPage() {
  const { user } = useAuth()

  if (user) {
    return (
      <main className="min-h-screen bg-[#fbf9ff] text-zinc-950">
        <ProfileHeader user={user} />
        <div className="mx-auto grid w-full max-w-screen-2xl grid-cols-[240px_minmax(0,1fr)] gap-7 px-6 pb-10 pt-28 max-lg:grid-cols-1 max-lg:px-4">
          <div className="max-lg:hidden">
            <ProfileSidebar user={user} />
          </div>
          <div className="flex min-h-[620px] items-center justify-center">
            <ResetPasswordForm />
          </div>
        </div>
      </main>
    )
  }

  return (
    <AuthShell active="login">
      <ResetPasswordForm />
    </AuthShell>
  )
}
