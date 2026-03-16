function RepoSearchBar() {
  return (
    <div className="w-full max-w-md">
      <p className="mb-2 text-base font-semibold text-yellow-400">
        Search Repository
      </p>

      <div className="relative">
        <input
          type="text"
          placeholder="Enter Merchant ID..."
          className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3 pr-12 text-sm font-semibold uppercase tracking-[0.05em] text-white outline-none transition placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-white/50 focus:border-pink-600 focus:bg-white/15 focus:shadow-[0_0_15px_rgba(219,39,119,0.35)]"
        />

        <button
          type="button"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 transition hover:text-pink-500"
          aria-label="Search repository"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
      </div>

      <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-yellow-400">
        <span>ⓘ</span>
        <span>Search by unique ID (e.g., 209234)</span>
      </p>
    </div>
  )
}

export default RepoSearchBar