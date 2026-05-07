import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaBoxOpen,
  FaChevronRight,
  FaCircleCheck,
  FaMagnifyingGlass,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import AiAssistantWidget from "../components/common/AiAssistantWidget"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import {
  prepareProductDetailTransition,
  prepareShopDetailTransition,
} from "../lib/detailPageTransitions"

function normalizePositiveId(value) {
  const normalized = String(value ?? "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

function Search() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const initialQuery = searchParams.get("q") || ""
  const [query, setQuery] = useState(initialQuery)
  const [transitionState, setTransitionState] = useState({
    pending: false,
    kind: "",
    id: "",
    error: "",
  })

  usePreventPullToRefresh()

  // 1. Unified Auth State (isOffline removed to rely on global wrapper)
  const { user, profile, loading: authLoading } = useAuthSession()
  const shouldRedirectHome = !authLoading && !user

  useEffect(() => {
    if (!shouldRedirectHome) return
    navigate("/", { replace: true })
  }, [navigate, shouldRedirectHome])

  // 2. Extracted Data Fetching Logic for Hook
  const fetchSearchData = async () => {
    const resolvedCityId = normalizePositiveId(profile?.city_id)
    if (!resolvedCityId) return { shops: [], products: [] }

    const q = initialQuery.trim().replace(/,/g, "") // Sanitize for PostgREST
    if (!q) {
      const { data: defaultShops, error: defaultShopsError } = await supabase
        .from("shops")
        .select("*")
        .eq("city_id", resolvedCityId)
        .eq("is_service", false)
        .order("name", { ascending: true })
        .limit(30)

      if (defaultShopsError) throw defaultShopsError
      return { shops: defaultShops || [], allProducts: [], matchedProducts: [] }
    }

    const ilikeQuery = `%${q}%`

    // 1. Fast fetch of all shop IDs in the user's city
    const { data: cityShops, error: cityShopsError } = await supabase
      .from("shops")
      .select("id")
      .eq("city_id", resolvedCityId)
      .eq("is_service", false)

    if (cityShopsError) throw cityShopsError
    const cityShopIds = (cityShops || []).map((s) => s.id)

    // 2. Backend Search for Shops
    const { data: shops, error: shopsErr } = await supabase
      .from("shops")
      .select("*")
      .eq("city_id", resolvedCityId)
      .eq("is_service", false)
      .or(`name.ilike.${ilikeQuery},category.ilike.${ilikeQuery},description.ilike.${ilikeQuery},unique_id.ilike.${ilikeQuery},address.ilike.${ilikeQuery}`)
      .limit(50)

    if (shopsErr) throw shopsErr

    // 3. Backend Search for Products
    let cleanedProducts = []
    if (cityShopIds.length > 0) {
      // Safely search using confirmed columns to prevent schema mismatch errors
      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select("*")
        .in("shop_id", cityShopIds)
        .eq("is_available", true)
        .or(`name.ilike.${ilikeQuery},description.ilike.${ilikeQuery},category.ilike.${ilikeQuery}`)
        .limit(50)

      if (prodErr) throw prodErr
      cleanedProducts = products || []
    }

    // 4. Fetch a few products for the matched shops so the shop preview cards aren't empty
    const shopIds = (shops || []).map(s => s.id)
    let additionalProducts = []
    if (shopIds.length > 0) {
      const { data: shopProds, error: shopProductsError } = await supabase
        .from("products")
        .select("*")
        .in("shop_id", shopIds)
        .eq("is_available", true)
        .limit(100)

      if (shopProductsError) throw shopProductsError
      additionalProducts = shopProds || []
    }

    // Merge all products cleanly for the UI
    const allProdsMap = new Map()
    cleanedProducts.forEach(p => allProdsMap.set(p.id, p))
    additionalProducts.forEach(p => allProdsMap.set(p.id, p))

    return { shops: shops || [], allProducts: Array.from(allProdsMap.values()), matchedProducts: cleanedProducts }
  }

  // 3. Smart Caching Hook
  const cacheKey = `search_city_${profile?.city_id || 'none'}_q_${initialQuery}`
  const {
    data,
    loading: dataLoading,
    error: dataError,
    mutate,
    isRevalidating,
  } = useCachedFetch(
    cacheKey,
    fetchSearchData,
    {
      dependencies: [profile?.city_id, initialQuery],
      ttl: 1000 * 60 * 5,
      persist: "session",
      skip: authLoading || !user || !profile?.city_id,
      keepPreviousData: true,
    }
  )

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  const matchedShops = data?.shops || []
  const allProducts = data?.allProducts || []
  const matchedProducts = data?.matchedProducts || []

  async function openShopWithTransition(shopId) {
    if (!shopId) return

    setTransitionState({
      pending: true,
      kind: "shop",
      id: shopId,
      error: "",
    })

    try {
      await prepareShopDetailTransition({
        shopId,
        userId: user?.id || null,
      })
      navigate(`/shop-detail?id=${shopId}`, {
        state: { fromDiscoveryTransition: true },
      })
    } catch (error) {
      const safeMessage = isNetworkError(error)
        ? "We could not open this shop right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this shop right now. Please try again."
          )

      setTransitionState({
        pending: false,
        kind: "shop",
        id: shopId,
        error: safeMessage,
      })
    }
  }

  async function openProductWithTransition(productId, shopId = "") {
    if (!productId) return

    setTransitionState({
      pending: true,
      kind: "product",
      id: productId,
      error: "",
    })

    try {
      await prepareProductDetailTransition({
        productId,
        userId: user?.id || null,
      })
      navigate(
        `/product-detail?id=${productId}${shopId ? `&shop_src=${shopId}` : ""}`,
        { state: { fromDiscoveryTransition: true } }
      )
    } catch (error) {
      const safeMessage = isNetworkError(error)
        ? "We could not open this product right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this product right now. Please try again."
          )

      setTransitionState({
        pending: false,
        kind: "product",
        id: productId,
        error: safeMessage,
      })
    }
  }

  function runSearch() {
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace: true })
  }

  function buildShopCard(shop) {
    const shopProducts = allProducts
      .filter(
        (item) =>
          item.shop_id === shop.id &&
          item.image_url &&
          item.condition !== "Fairly Used"
      )
      .slice(0, 4)

    const cells = Array.from({ length: 4 }).map((_, index) => {
      const item = shopProducts[index]

      if (!item) {
        return (
          <div key={`empty-${shop.id}-${index}`} className="shop-grid-item-wrap">
            <div className="shop-grid-item empty">
              <FaBoxOpen className="text-[1.1rem] text-slate-300" />
            </div>
            <div className="shop-grid-caption select-none text-transparent">
              <div className="sg-name">-</div>
              <div className="sg-price">-</div>
            </div>
          </div>
        )
      }

      const name = item.name || item.product_name || item.title || "Product"
      const price = item.price || item.product_price
      const discount = item.discount_price
      const hasDiscount = discount && price && Number(discount) < Number(price)

      const percent = hasDiscount
        ? Math.round(((Number(price) - Number(discount)) / Number(price)) * 100)
        : 0

      return (
        <div key={`${shop.id}-${item.id}-${index}`} className="shop-grid-item-wrap">
          <div className="shop-grid-item">
            <StableImage
              src={item.image_url}
              alt={name}
              containerClassName="h-full w-full bg-[#F8FAFC]"
              className="h-full w-full object-contain p-2"
            />
            {hasDiscount ? (
              <div className="grid-badge flash-offer">-{percent}%</div>
            ) : null}
          </div>

          <div className="shop-grid-caption">
            <div className="sg-name" title={name}>
              {name}
            </div>
            <div className={hasDiscount ? "sg-price flash-price" : "sg-price"}>
              {hasDiscount ? (
                <>
                  <span className="sg-price-old">
                    ₦{Number(price).toLocaleString()}
                  </span>
                  ₦{Number(discount).toLocaleString()}
                </>
              ) : price ? (
                <>₦{Number(price).toLocaleString()}</>
              ) : (
                ""
              )}
            </div>
          </div>
        </div>
      )
    })

    return (
      <div
        key={shop.id}
        className="premium-shop-card cursor-pointer rounded-lg border border-[#D5D9D9] bg-white p-6 transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_8px_16px_rgba(0,0,0,0.08)]"
        onClick={() => openShopWithTransition(shop.id)}
      >
        <div className="shop-card-title">
          {shop.name}
          {shop.is_verified ? (
            <FaCircleCheck
              className="ml-1 inline text-[0.9rem] text-[#007185]"
              title="Verified"
            />
          ) : null}
        </div>

        <div className="shop-image-grid">{cells}</div>

        <div className="shop-cta">
          Visit shop <FaChevronRight className="ml-1 text-[0.75rem]" />
        </div>
      </div>
    )
  }

  function buildProductCard(product) {
    const name = product.name || product.product_name || product.title || "Product"
    const price = product.price || product.product_price
    const discount = product.discount_price
    const hasDiscount = discount && price && Number(discount) < Number(price)

    const percent = hasDiscount
      ? Math.round(((Number(price) - Number(discount)) / Number(price)) * 100)
      : 0

    return (
      <div
        key={product.id}
        className="product-card cursor-pointer rounded-lg border border-[#D5D9D9] bg-white transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_8px_16px_rgba(0,0,0,0.08)]"
        onClick={() => openProductWithTransition(product.id, product.shop_id)}
      >
        <div className="prod-img-wrap relative aspect-square w-full overflow-hidden bg-[#F7F7F7]">
          <StableImage
            src={product.image_url}
            alt={name}
            containerClassName="h-full w-full bg-[#F7F7F7]"
            className="prod-img h-full w-full object-contain p-2"
          />

          {hasDiscount ? (
            <span className="badge badge-discount flash-offer absolute left-2 top-2 rounded bg-red-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
              -{percent}%
            </span>
          ) : null}

          {product.condition === "Fairly Used" ? (
            <span className="badge badge-used absolute right-2 top-2 rounded bg-orange-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
              Used
            </span>
          ) : null}
        </div>

        <div className="prod-info flex flex-1 flex-col p-3">
          <div
            className="prod-name mb-1 line-clamp-2 text-[0.85rem] font-bold leading-[1.3] text-[#0F1111]"
            title={name}
          >
            {name}
          </div>

          <div className={hasDiscount ? "prod-price flash-price" : "prod-price"}>
            {hasDiscount ? (
              <>
                <span className="prod-old-price mr-1 text-[0.75rem] text-slate-400 line-through">
                  ₦{Number(price).toLocaleString()}
                </span>
                ₦{Number(discount).toLocaleString()}
              </>
            ) : price ? (
              <>₦{Number(price).toLocaleString()}</>
            ) : (
              ""
            )}
          </div>
        </div>
      </div>
    )
  }

  if (shouldRedirectHome) {
    return <PageLoadingScreen />
  }

  const hasResults = matchedShops.length > 0 || matchedProducts.length > 0

  return (
    <>
      <PageTransitionOverlay
        visible={transitionState.pending}
        error={transitionState.error}
        onRetry={() => {
          if (transitionState.kind === "shop" && transitionState.id) {
            void openShopWithTransition(transitionState.id)
            return
          }
          if (transitionState.kind === "product" && transitionState.id) {
            void openProductWithTransition(transitionState.id)
          }
        }}
        onDismiss={() =>
          setTransitionState((prev) => ({
            ...prev,
            pending: false,
            error: "",
          }))
        }
      />
      <div
        className={`min-h-screen bg-[#E3E6E6] ${
          transitionState.pending ? "pointer-events-none select-none" : ""
        }`}
      >
      <PageSeo
        title={
          query.trim()
            ? `Search results for "${query}" | CTMerchant`
            : "Search Shops and Products | CTMerchant"
        }
        description="Search verified shops and products in your local CTMerchant marketplace."
        canonicalPath="/search"
        noindex
      />
      <header className="sticky top-0 z-[1000] bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-[10px]">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-[1.2rem] transition hover:text-pink-500"
          >
            <FaArrowLeft />
          </button>

          <div className="flex h-[42px] flex-1 overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch()
              }}
              placeholder="Search shops and products..."
              className="flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
            />
            <button
              type="button"
              onClick={runSearch}
              className="flex w-[52px] items-center justify-center bg-pink-600 text-white transition hover:bg-pink-700"
            >
              <FaMagnifyingGlass />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-5 py-6">
        {!data && (authLoading || dataLoading) ? (
          <PageLoadingScreen
            fullScreen={false}
            title="Loading search"
            message="Please wait while we prepare your search results."
          />
        ) : dataError && !data ? (
          <GlobalErrorScreen
            fullScreen={false}
            error={dataError}
            message={getRetryingMessage(dataError)}
            onRetry={mutate}
            onBack={() => navigate(-1)}
          />
        ) : (
          <>
            <h2 className="mb-6 text-[1.1rem] font-semibold text-slate-600">
              Results for{" "}
              <span className="font-extrabold text-pink-600">
                "{query.trim()}"
              </span>
            </h2>

            {isRevalidating ? (
              <div className="mb-4 inline-flex rounded-full bg-slate-900 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-white">
                Updating results...
              </div>
            ) : null}

            {matchedShops.length > 0 ? (
              <section className="mb-10">
                <h2 className="sec-title mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
                  <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
                  Shops Matching Search
                </h2>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
                  {matchedShops.map(buildShopCard)}
                </div>
              </section>
            ) : null}

            {matchedProducts.length > 0 ? (
              <section>
                <h2 className="sec-title mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
                  <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
                  Products Matching Search
                </h2>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
                  {matchedProducts.map(buildProductCard)}
                </div>
              </section>
            ) : null}

            {!hasResults ? (
              <div className="state-box rounded-lg border border-[#D5D9D9] bg-white px-5 py-16 text-center">
                <FaMagnifyingGlass className="mx-auto mb-4 text-5xl opacity-30" />
                <span className="block text-[1.1rem] font-extrabold text-[#0F1111]">
                  No results found
                </span>
                <span className="mt-1 block text-[0.9rem] text-slate-500">
                  Try adjusting your search query or check spelling.
                </span>
              </div>
            ) : null}
          </>
        )}
      </main>
      <AiAssistantWidget mode="ambassador" />
      </div>
    </>
  )
}

export default Search
