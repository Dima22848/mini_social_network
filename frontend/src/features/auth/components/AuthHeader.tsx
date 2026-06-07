import Link from 'next/link'

type AuthHeaderProps = {
  active: 'login' | 'register'
}

export function AuthHeader({ active }: AuthHeaderProps) {
  return (
    <header className="fixed left-4 right-4 top-3 z-10 rounded-3xl border border-violet-100/70 bg-white/90 px-8 py-4 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between">
        <Link href="/login" className="font-serif text-4xl font-semibold tracking-tight text-zinc-950">
          Social
        </Link>

        <nav className="flex items-center gap-10 text-sm font-medium">
          <Link
            href="/login"
            className={
              active === 'login'
                ? 'relative text-violet-600 after:absolute after:-bottom-5 after:left-0 after:h-1 after:w-full after:rounded-full after:bg-violet-600'
                : 'text-zinc-500 transition hover:text-violet-600'
            }
          >
            Войти
          </Link>

          <Link
            href="/register"
            className={
              active === 'register'
                ? 'relative text-violet-600 after:absolute after:-bottom-5 after:left-0 after:h-1 after:w-full after:rounded-full after:bg-violet-600'
                : 'text-zinc-500 transition hover:text-violet-600'
            }
          >
            Регистрация
          </Link>
        </nav>
      </div>
    </header>
  )
}