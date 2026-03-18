import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaLocationDot,
  FaChevronRight,
  FaStoreSlash,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import { ShimmerList } from "../components/common/Shimmers"

function Area() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const areaId = searchParams.get("id")

  // 1. Unified Auth State
  const { user, loading: authLoading, isOffline } = useAuthSession()
  const [query, setQuery] = useState("")

  // Gatekeeper Redirect
  if (!authLoading && !user) {
    navigate("/", { replace: true })
    return null
  }

  // 2. Extracted Data Fetching Logic for Hook
  const fetchAreaShops = async () => {
    if (!areaId) {
      throw new Error("Area ID missing.")
    }

    const [
      { data: areaData, error: areaError },
      { data: shopsData, error: shopsError }
    ] = await Promise.all([
      supabase.from("areas").select("name").eq("id", areaId).single(),
      supabase
        .from("shops")
        .select("*")
        .eq("area_id", areaId)
        .order("name", { ascending: true }),
    ])

    if (areaError) throw areaError
    if (shopsError) throw shopsError

    return {
      areaName: areaData?.name || "Area",
      shops: shopsData || [],
    }
  }

  // 3. Smart Caching Hook
  const cacheKey = `area_data_${areaId || 'none'}`
  const { data, loading: dataLoading, error: dataError } = useCachedFetch(
    cacheKey,
    fetchAreaShops,
    { dependencies: [areaId], ttl: 1000 * 60 * 15 } // Cache area data for 15 minutes
  )

  const areaName = data?.areaName || ""
  const shops = data?.shops || []

  // Update document title safely when data resolves
  useEffect(() => {
    if (areaName) {
      document.title = `${areaName} | CTMerchant`
    }
  }, [areaName])

  // 4. Memoized Filtering
  const filteredShops = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return shops

    return shops.filter((shop) => {
      const name = shop.name?.toLowerCase() || ""
      const category = shop.category?.toLowerCase() || ""
      const uniqueId = (shop.unique_id || "").toLowerCase()
      return name.includes(q) || category.includes(q) || uniqueId.includes(q)
    })
  }, [shops, query])

  function getDisplayImage(shop) {
    if (shop.image_url) return shop.image_url
    if (shop.store_front_url) return shop.store_front_url
    if (Array.isArray(shop.banners) && shop.banners.length > 0) return shop.banners[0]
    return ""
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#0F1111]">
      {/* Offline Banner */}
      {isOffline && (
        <div className="z-[101] bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-800 shadow-sm border-b border-amber-200">
          <i className="fa-solid fa-wifi-slash mr-2"></i>
          You are offline. Showing cached area data.
        </div>
      )}

      <div className={`sticky ${isOffline ? 'top-[36px]' : 'top-0'} z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]`}>
        <header className="mx-auto flex w-full max-w-[800px] items-center gap-4 px-4 py-3 text-white">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>
          <div className="flex-1 truncate text-[1.15rem] font-bold tracking-[0.5px]">
            {authLoading || (dataLoading && !data) ? "Loading..." : `Merchants in ${areaName}`}
          </div>
        </header>

        <div className="mx-auto w-full max-w-[800px] px-4 pb-4">
          <div className="flex h-11 overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search in this area..."
              className="flex-1 px-4 text-base text-[#0F1111] outline-none"
            />
            <button
              type="button"
              className="flex w-[52px] items-center justify-center bg-pink-600 text-white"
              aria-label="Search"
            >
              <span className="text-[1.1rem]">⌕</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[800px] flex-1 px-4 py-5">
        {authLoading || (dataLoading && !data) ? (
          <div className="pt-2">
            <ShimmerList />
          </div>
        ) : dataError && !data ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-[#D5D9D9] bg-white px-5 py-16 text-center text-[#888C8C]">
            <FaTriangleExclamation className="mb-4 text-[2.5rem] text-[#C40000]" />
            <span className="font-semibold text-[#0F1111]">{dataError}</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 text-base font-bold text-pink-600 transition hover:text-pink-700"
            >
              Tap to Retry
            </button>
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-16 text-center text-[#888C8C]">
            <FaStoreSlash className="mb-4 text-[3rem] opacity-30" />
            <span className="font-semibold text-[#0F1111]">
              {shops.length === 0
                ? "No shops found in this area."
                : "No matching shops found in this area."}
            </span>
            <span className="mt-1 text-sm">Try searching in a different area.</span>
          </div>
        ) : (
          filteredShops.map((shop) => {
            const displayImg = getDisplayImage(shop)
            const rawId = shop.unique_id || "N/A"
            const displayId = rawId.includes("-") ? rawId.split("-").pop() : rawId

            return (
              <div
                key={shop.id}
                onClick={() => navigate(`/shop-detail?id=${shop.id}`)}
                className="mb-3 flex cursor-pointer items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:translate-y-[-2px] hover:border-[#B0B5B5] hover:shadow-[0_4px_10px_rgba(0,0,0,0.08)] active:scale-[0.98]"
              >
                {displayImg ? (
                  <img
                    src={displayImg}
                    alt={shop.name}
                    className="h-16 w-16 shrink-0 rounded-lg border border-[#E5E7EB] object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-pink-200 bg-pink-100 text-[1.4rem] font-extrabold text-pink-600">
                    {shop.name?.charAt(0)?.toUpperCase() || "S"}
                  </div>
                )}

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="truncate text-[1.05rem] font-extrabold">{shop.name}</span>
                    {shop.is_verified ? (
                      <span title="Verified" className="text-[0.9rem] text-[#007185]">✓</span>
                    ) : null}
                  </div>

                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="rounded bg-pink-100 px-2 py-1 text-[0.7rem] font-bold text-pink-600">
                      {shop.category}
                    </span>
                    {shop.is_verified ? (
                      <span className="text-[0.75rem] font-semibold text-[#565959]">
                        ID: {displayId}
                      </span>
                    ) : null}
                  </div>

                  <div className="truncate text-[0.85rem] font-medium text-[#565959]">
                    <FaLocationDot className="mr-1 inline text-[#888C8C]" />
                    {shop.address}
                  </div>
                </div>

                <FaChevronRight className="text-[1.1rem] text-[#D5D9D9]" />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default Area