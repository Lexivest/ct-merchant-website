import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaChevronRight,
  FaMagnifyingGlass,
  FaScrewdriverWrench,
} from "react-icons/fa6"

import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import useAuthSession from "../hooks/useAuthSession"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import {
  SERVICE_CATEGORY_GROUPS,
  isServiceCategory,
} from "../lib/serviceCategories"

// Warm up ServiceCategory chunk so the transition feels instant
let _serviceCategoryPrefetch = null
function prefetchServiceCategory() {
  if (!_serviceCategoryPrefetch) {
    _serviceCategoryPrefetch = import("./ServiceCategory").catch(() => {
      _serviceCategoryPrefetch = null
    })
  }
}

function LocalServices() {
  const navigate = useNavigate()

  usePreventPullToRefresh()

  const { user, loading: authLoading } = useAuthSession()

  const [query, setQuery] = useState("")
  const [transitioning, setTransitioning] = useState(false)

  const normalizedQuery = query.trim().toLowerCase()

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return SERVICE_CATEGORY_GROUPS

    return SERVICE_CATEGORY_GROUPS
      .map((group) => ({
        ...group,
        categories: group.categories.filter(
          (cat) =>
            cat.toLowerCase().includes(normalizedQuery) ||
            group.title.toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.categories.length > 0)
  }, [normalizedQuery])

  const totalCount = useMemo(
    () => SERVICE_CATEGORY_GROUPS.reduce((sum, g) => sum + g.categories.length, 0),
    []
  )

  function openCategory(name) {
    if (!name || !isServiceCategory(name)) return
    setTransitioning(true)
    // Brief yield so the overlay can paint before navigation
    setTimeout(() => {
      navigate(`/service-category?name=${encodeURIComponent(name)}`, {
        state: { fromLocalServices: true },
      })
    }, 60)
  }

  // Auth guard
  if (!authLoading && !user) {
    navigate("/", { replace: true })
    return null
  }

  return (
    <>
      <PageSeo
        title="Local Services | CTMerchant"
        description="Browse all service categories available in your city on CTMerchant."
        canonicalPath="/local-services"
        noindex
      />

      <PageTransitionOverlay
        visible={transitioning}
        onDismiss={() => setTransitioning(false)}
      />

      <div
        className={`flex h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
          transitioning ? "pointer-events-none select-none" : ""
        }`}
      >
        {/* ── Sticky header ── */}
        <div className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <header className="mx-auto flex w-full max-w-[800px] items-center gap-3 px-4 py-3 text-white">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
              aria-label="Go back"
            >
              <FaArrowLeft />
            </button>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 truncate text-[1.1rem] font-bold tracking-[0.5px]">
                <FaScrewdriverWrench className="shrink-0 text-pink-400" />
                Local Services
              </span>
              <span className="text-[0.72rem] font-semibold text-white/50">
                {totalCount} service categories available
              </span>
            </div>
          </header>

          {/* Search */}
          <div className="mx-auto w-full max-w-[800px] px-4 pb-4">
            <div className="flex h-11 overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search plumbing, catering, AC repair..."
                className="flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
                autoComplete="off"
              />
              <div className="flex w-[52px] items-center justify-center bg-pink-600 text-white">
                <FaMagnifyingGlass className="text-[1.1rem]" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Scrollable category list ── */}
        <div className="mx-auto w-full max-w-[800px] flex-1 overflow-y-auto px-4 py-5 pb-24">
          {visibleGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <FaScrewdriverWrench className="text-3xl text-slate-300" />
              <p className="text-sm font-bold text-slate-500">
                No service matched &ldquo;{query}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-xl bg-pink-600 px-4 py-2 text-xs font-black text-white transition hover:bg-pink-700"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {visibleGroups.map((group) => (
                <section key={group.key}>
                  {/* Group header */}
                  <div className="mb-3 border-b border-slate-200 pb-2">
                    <h2 className="text-[0.82rem] font-black uppercase tracking-[0.12em] text-[#131921]">
                      {group.title}
                    </h2>
                    {group.description ? (
                      <p className="mt-0.5 text-[0.72rem] font-medium text-slate-500">
                        {group.description}
                      </p>
                    ) : null}
                  </div>

                  {/* Category rows */}
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {group.categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => openCategory(cat)}
                        onPointerEnter={prefetchServiceCategory}
                        onFocus={prefetchServiceCategory}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-pink-50 active:bg-pink-100"
                      >
                        <span className="text-sm font-bold text-[#0F1111]">{cat}</span>
                        <FaChevronRight className="shrink-0 text-xs text-pink-500" />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default LocalServices
