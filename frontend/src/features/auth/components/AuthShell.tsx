import { ReactNode } from 'react'
import { AuthHeader } from './AuthHeader'

type AuthShellProps = {
  active: 'login' | 'register'
  children: ReactNode
}

export function AuthShell({ active, children }: AuthShellProps) {
  return (
    <main className="min-h-screen bg-[#fbf9ff] px-4 pt-32 text-zinc-950">
      <AuthHeader active={active} />

      <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center justify-center">
        {children}
      </section>
    </main>
  )
}