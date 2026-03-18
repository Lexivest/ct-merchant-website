import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { FaMagnifyingGlass, FaCircleInfo } from "react-icons/fa6"

function RepoSearchBar() {
  const navigate = useNavigate()
  const [merchantId, setMerchantId] = useState("")

  function handleSearch() {
    // 1. Trim and normalize the ID to uppercase to match the visual UI
    const value = merchantId.trim().toUpperCase()
    if (!value) return
    
    // 2. FIXED ROUTE: Navigate to /reposearch as defined in App.jsx
    navigate(`/reposearch?merchantId=${encodeURIComponent(value)}`)
  }

  return (
    <div className="repo-search-wrapper relative mx-auto w-full max-w-[450px]">
      <p className="search-label mb-2 text-base font-semibold text-yellow-400">
        Search Repository
      </p>

      <div className="relative">
        <input
          type="text"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch()
          }}
          placeholder="Enter Merchant ID..."
          className="repo-input w-full rounded-full border border-white/20 bg-white/10 px-5 py-3 pr-12 text-base font-semibold uppercase tracking-[0.05em] text-white outline-none transition placeholder:normal-case placeholder:tracking-normal placeholder:text-white/50 focus:border-pink-600 focus:bg-white/15 focus:shadow-[0_0_15px_rgba(219,39,119,0.4)]"
        />

        <button
          type="button"
          onClick={handleSearch}
          className="search-icon-btn absolute right-4 top-1/2 -translate-y-1/2 text-white/60 transition hover:text-pink-500"
          aria-label="Search repository"
        >
          <FaMagnifyingGlass />
        </button>
      </div>

      <p className="id-hint mt-2 flex items-center gap-1 text-[0.8rem] font-semibold text-yellow-400">
        <FaCircleInfo />
        Search by unique ID (e.g. 209234)
      </p>
    </div>
  )
}

export default RepoSearchBar