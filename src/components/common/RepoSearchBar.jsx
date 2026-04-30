import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { FaMagnifyingGlass, FaCircleInfo } from "react-icons/fa6"
import {
  extractRepoSearchDigits,
  normalizeRepoSearchId,
  REPO_SEARCH_INVALID_MESSAGE,
} from "../../lib/repoSearch"

function RepoSearchBar() {
  const navigate = useNavigate()
  const [merchantId, setMerchantId] = useState("")
  const [isSearching, setIsSearching] = useState(false)

  function handleSearch() {
    if (isSearching) return

    const value = normalizeRepoSearchId(merchantId)
    if (!value) return
    
    setIsSearching(true)

    navigate(`/reposearch?merchantId=${encodeURIComponent(value)}`)
  }

  return (
    <div className={`repo-search-wrapper relative mx-auto w-full max-w-[450px] ${isSearching ? "opacity-75 pointer-events-none" : ""}`}>
      <p className="search-label mb-2 text-base font-semibold text-yellow-400">
        Search Repository
      </p>

      <div className="relative">
        <div className="flex w-full items-center overflow-hidden rounded-full border border-white/20 bg-white/10 transition focus-within:border-pink-600 focus-within:bg-white/15 focus-within:shadow-[0_0_15px_rgba(219,39,119,0.4)]">
          <span className="pl-5 pr-2 text-base font-black uppercase tracking-[0.1em] text-yellow-400">
            CT-
          </span>
          <input
            type="text"
            value={merchantId}
            disabled={isSearching}
            inputMode="numeric"
            pattern="[0-9]*"
            onChange={(e) => setMerchantId(extractRepoSearchDigits(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch()
            }}
            placeholder={isSearching ? "Searching..." : "Enter shop number"}
            className="repo-input w-full border-none bg-transparent py-3 pr-12 text-base font-semibold tracking-[0.05em] text-white outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-white/50"
          />
        </div>

        <button
          type="button"
          onClick={handleSearch}
          disabled={isSearching || !merchantId.trim()}
          className="search-icon-btn absolute right-4 top-1/2 -translate-y-1/2 text-white/60 transition hover:text-pink-500 disabled:opacity-30 disabled:hover:text-white/60"
          aria-label="Search repository"
        >
          <FaMagnifyingGlass className={isSearching ? "animate-pulse" : ""} />
        </button>
      </div>

      <p className="id-hint mt-2 flex items-center gap-1 text-[0.8rem] font-semibold text-yellow-400">
        <FaCircleInfo />
        {REPO_SEARCH_INVALID_MESSAGE}
      </p>
    </div>
  )
}

export default RepoSearchBar
