type PaginationProps = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)

  const visiblePages =
    pages.length <= 6 ? pages : [...pages.slice(0, 5), totalPages]

  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-100 bg-white text-zinc-500 disabled:opacity-40"
      >
        ‹
      </button>

      {visiblePages.map((currentPage, index) => {
        const shouldShowDots =
          pages.length > 6 && index === visiblePages.length - 1

        return (
          <div key={currentPage} className="flex items-center gap-2">
            {shouldShowDots && <span className="px-2 text-zinc-400">...</span>}

            <button
              type="button"
              onClick={() => onPageChange(currentPage)}
              className={
                currentPage === page
                  ? 'flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white shadow-lg shadow-violet-200'
                  : 'flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-100 bg-white text-sm font-semibold text-zinc-600 hover:border-violet-200 hover:text-violet-700'
              }
            >
              {currentPage}
            </button>
          </div>
        )
      })}

      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-100 bg-white text-zinc-500 disabled:opacity-40"
      >
        ›
      </button>
    </div>
  )
}