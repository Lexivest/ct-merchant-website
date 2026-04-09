import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaChevronRight,
  FaStoreSlash,
  FaLayerGroup,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import { ShimmerBlock, ShimmerCard } from "../components/common/Shimmers"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import RetryingNotice, { getRetryingMessage } from "../components/common/RetryingNotice"

// --- PROFESSIONAL SHIMMER COMPONENT ---
function CatShimmer() {
  return (
    <div className="flex flex-col items-center justify-center pt-6 w-full">
      <div className="w-full mb-6 flex items-center gap-3">
        <ShimmerBlock className="h-12 w-12 rounded-lg" />
        <div>
          <ShimmerBlock className="mb-2 h-8 w-48 rounded" />
          <ShimmerBlock className="h-4 w-32 rounded" />
        </div>
      </div>
      <div className="w-full grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
        <ShimmerCard />
        <ShimmerCard />
        <ShimmerCard />
        <ShimmerCard />
      </div>
    </div>
  )
}

function Cat() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const catName = searchParams.get("name")

  // Apply pull-to-refresh prevention
  usePreventPullToRefresh()

  // 1. Unified Auth State (isOffline removed to rely on global wrapper)
  const { user, profile, loading: authLoading } = useAuthSession()

  useEffect(() => {
    if (!authLoading && (!user || !catName)) {
      navigate(-1)
    }
  }, [authLoading, catName, navigate, user])

  // 2. Extracted Data Fetching Logic for Hook
  const fetchCategoryData = async () => {
    if (!user || !catName || !profile?.city_id) {
      return { shops: [], products: [] }
    }

    const { data: shopsData, error: shopsError } = await supabase
      .from("shops")
      .select("*")
      .eq("city_id", profile.city_id)
      .eq("category", catName)
      .eq("is_verified", true)
      .order("name", { ascending: true })
      .limit(100)

    if (shopsError) throw shopsError

    let productsData = []
    if ((shopsData || []).length > 0) {
      const shopIds = shopsData.map((shop) => shop.id)
      const { data: prods, error: productsError } = await supabase
        .from("products")
        .select("*")
        .in("shop_id", shopIds)
        .eq("is_available", true)
        .limit(300)

      if (productsError) throw productsError
      productsData = prods || []
    }

    return { shops: shopsData || [], products: productsData }
  }

  // 3. Smart Caching Hook
  const cacheKey = `cat_${catName}_city_${profile?.city_id || 'none'}`
  const { data, loading: dataLoading, error: dataError, mutate } = useCachedFetch(
    cacheKey,
    fetchCategoryData,
    { dependencies: [catName, profile?.city_id, user?.id], ttl: 1000 * 60 * 15 } // Cache for 15 minutes
  )

  const shops = data?.shops || []
  const products = data?.products || []

  function buildShopGrid(shop) {
    const p = products
      .filter((x) => x.shop_id === shop.id && x.image_url && x.condition !== "Fairly Used")
      .slice(0, 4)

    const items = []

    for (let i = 0; i < 4; i += 1) {
      if (i < p.length) {
        const item = p[i]
        const prodName = item.name || item.product_name || item.title || "Product"
        const price = item.price || item.product_price
        const discount = item.discount_price
        const hasDiscount = discount && discount < price
        const percent = hasDiscount ? Math.round(((price - discount) / price) * 100) : 0

        items.push(
          <div key={`${shop.id}-${i}`} className="flex w-full flex-col gap-1 overflow-hidden">
            <div className="relative block aspect-square overflow-hidden rounded bg-[#F7F7F7]">
              <StableImage
                src={item.image_url}
                alt={prodName}
                containerClassName="h-full w-full bg-[#F7F7F7]"
                className="h-full w-full object-cover"
              />
              {hasDiscount ? (
                <div className="absolute left-1 top-1 rounded bg-[#DC2626] px-1 py-[2px] text-[0.65rem] font-extrabold text-white">
                  -{percent}%
                </div>
              ) : null}
            </div>
            <div className="flex flex-col">
              <div className="truncate text-[0.75rem] font-medium text-[#0F1111]" title={prodName}>
                {prodName}
              </div>
              <div className="truncate text-[0.8rem] font-extrabold text-pink-600">
                {hasDiscount ? (
                  <>
                    <span className="mr-1 text-[0.65rem] font-medium text-[#888C8C] line-through">
                      ₦{Number(price).toLocaleString()}
                    </span>
                    ₦{Number(discount).toLocaleString()}
                  </>
                ) : price ? (
                  `₦${Number(price).toLocaleString()}`
                ) : (
                  ""
                )}
              </div>
            </div>
          </div>
        )
      } else {
        items.push(
          <div key={`${shop.id}-empty-${i}`} className="flex w-full flex-col gap-1 overflow-hidden">
            <div className="flex aspect-square items-center justify-center rounded border border-dashed border-[#D5D9D9] bg-[#F7F7F7]">
              <span className="text-[1.2rem] text-[#E5E7EB]">🖼</span>
            </div>
            <div className="select-none text-transparent">
              <div className="text-[0.75rem]">-</div>
              <div className="text-[0.8rem]">-</div>
            </div>
          </div>
        )
      }
    }

    return items
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#0F1111]">
      <PageSeo
        title={`${catName || "Category"} Shops | CTMerchant`}
        description={`Discover verified shops and products in the ${catName || "selected"} category on CTMerchant.`}
        canonicalPath={`/cat${catName ? `?name=${encodeURIComponent(catName)}` : ""}`}
      />
      <header className="sticky top-0 z-50 bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>
          <div className="flex-1 truncate text-[1.15rem] font-bold tracking-[0.5px]">
            {catName || "Category"}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 py-6">
        {authLoading || ((!user || !catName) && !authLoading) || (dataLoading && !data) ? (
          <CatShimmer />
        ) : dataError && !data ? (
          <RetryingNotice fullScreen={false} message={getRetryingMessage(dataError)} onRetry={mutate} />
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100 text-[1.4rem] text-pink-600">
                <FaLayerGroup />
              </div>
              <div>
                <div className="text-[1.4rem] font-extrabold text-[#0F1111]">{catName}</div>
                <div className="mt-0.5 text-[0.9rem] font-semibold text-[#565959]">
                  {shops.length} verified stores found in your city
                </div>
              </div>
            </div>

            {shops.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-[#D5D9D9] bg-white px-5 py-16 text-center text-[#888C8C]">
                <FaStoreSlash className="mb-4 text-[3rem] opacity-30" />
                <span className="text-[1.1rem] font-extrabold text-[#0F1111]">No stores found</span>
                <span className="mt-1 text-sm">
                  There are no verified stores for {catName} in your area yet.
                </span>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="mt-5 rounded-md border border-[#D5D9D9] bg-white px-6 py-2.5 font-semibold text-[#0F1111] transition hover:bg-slate-50"
                >
                  Back
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
                {shops.map((shop) => (
                  <div key={shop.id} className="flex flex-col">
                    <div
                      onClick={() => navigate(`/shop-detail?id=${shop.id}`)}
                      className="flex h-full cursor-pointer flex-col rounded-lg border border-[#D5D9D9] bg-white px-5 py-6 transition hover:translate-y-[-2px] hover:border-[#B0B5B5] hover:bg-[#Fcfcfc] hover:shadow-[0_8px_16px_rgba(0,0,0,0.08)]"
                    >
                      <div className="mb-4 line-clamp-2 text-[1.15rem] font-extrabold leading-[1.2] text-[#0F1111]">
                        {shop.name}
                        <span className="ml-1 text-[0.9rem] text-[#007185]" title="Verified">
                          ✓
                        </span>
                      </div>

                      <div className="mb-5 grid grid-cols-2 gap-3">
                        {buildShopGrid(shop)}
                      </div>

                      <div className="mt-auto inline-flex items-center gap-1 text-[0.85rem] font-semibold text-[#007185]">
                        Visit shop <FaChevronRight className="text-[0.75rem]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default Cat
