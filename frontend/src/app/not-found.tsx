import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbf9ff] px-4">
      <div className="rounded-3xl border border-zinc-100 bg-white px-10 py-9 text-center shadow-sm">
        <h1 className="text-3xl font-semibold">Страница не найдена</h1>
        <p className="mt-3 text-sm text-zinc-500">
          Такой страницы пока нет или она была удалена.
        </p>

        <Link
          href="/profile"
          className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Вернуться в профиль
        </Link>
      </div>
    </main>
  )
}