import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaBriefcase,
  FaChevronRight,
  FaCircleCheck,
  FaLocationDot,
  FaMagnifyingGlass,
  FaStoreSlash,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch, { primeCachedFetchStore } from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"
import { fetchShopDetailData } from "../lib/shopDetailData"
import { getServiceProviderImage } from "../lib/serviceCategories"

const loadServiceProviderPage = () => import("./ServiceProvider")

function ShopIndex() {
  const navigate = useNavigate()

  usePreventPullToRefresh()

  // 1. Unified Auth State
  const { user, profile, loading: authLoading } = useAuthSession()
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [transitionState, setTransitionState] = useState({
    pending: false,
    shopId: "",
    type: "shop",
    error: "",
  })

  // Debounce the search input by 400ms to avoid DB spam
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // 2. Extracted Data Fetching Logic for Hook
  const fetchDirectory = async () => {
    if (!profile?.city_id) {
      throw new Error("City data not found. Please complete your profile.")
    }

    const nowIso = new Date().toISOString()

    let query = supabase
      .from("shops")
      .select("*")
      .eq("city_id", profile.city_id)
      .eq("is_service", false)
      .eq("status", "approved")
      .eq("is_verified", true)
      .eq("is_open", true)
      .gt("subscription_end_date", nowIso)
      .order("name", { ascending: true })
      .limit(100)

    let serviceQuery = supabase
      .from("shops")
      .select("*, areas(name), cities(name)")
      .eq("city_id", profile.city_id)
      .eq("is_service", true)
      .eq("status", "approved")
      .eq("is_verified", true)
      .eq("is_open", true)
      .gt("subscription_end_date", nowIso)
      .order("name", { ascending: true })
      .limit(100)

    if (debouncedSearch) {
      const q = debouncedSearch.trim().replace(/,/g, "")
      const ilikeQuery = `%${q}%`
      query = query.or(`name.ilike.${ilikeQuery},category.ilike.${ilikeQuery},unique_id.ilike.${ilikeQuery},address.ilike.${ilikeQuery}`)
      serviceQuery = serviceQuery.or(`name.ilike.${ilikeQuery},category.ilike.${ilikeQuery},unique_id.ilike.${ilikeQuery},address.ilike.${ilikeQuery},description.ilike.${ilikeQuery}`)
    }

    const [{ data: shops, error: shopsError }, { data: services, error: servicesError }] =
      await Promise.all([query, serviceQuery])

    if (shopsError) throw shopsError
    if (servicesError) throw servicesError

    const serviceIds = (services || []).map((service) => service.id).filter(Boolean)
    let serviceProducts = []

    if (serviceIds.length > 0) {
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, shop_id, name, description, price, image_url, category, is_available, is_approved")
        .in("shop_id", serviceIds)
        .eq("is_available", true)
        .eq("is_approved", true)
        .order("id", { ascending: false })
        .limit(300)

      if (productsError) throw productsError
      serviceProducts = products || []
    }

    return {
      shops: shops || [],
      services: services || [],
      serviceProducts,
    }
  }

  // 3. Smart Caching Hook
  const cacheKey = `dir_city_${profile?.city_id || 'none'}_q_${debouncedSearch}`
  const { data: directoryData, loading: dataLoading, error: dataError, mutate } = useCachedFetch(
    cacheKey,
    fetchDirectory,
    { dependencies: [profile?.city_id, debouncedSearch], ttl: 1000 * 60 * 15, persist: "session" }
  )

  const headerTitle = profile?.cities?.name
    ? `${profile.cities.name} Shops & Services Directory`
    : "Shops & Services Directory"
  const directoryStructuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": `${headerTitle} | CTMerchant`,
    "url": "https://www.ctmerchant.com.ng/shop-index",
    "description": "Browse verified shops and service providers in your city on the CTMerchant directory.",
    "isPartOf": {
      "@type": "WebSite",
      "name": "CTMerchant",
      "url": "https://www.ctmerchant.com.ng/",
    },
  }

  // 4. Server-side Search Results
  const normalizedDirectory = Array.isArray(directoryData)
    ? {
        shops: directoryData,
        services: [],
        serviceProducts: [],
      }
    : {
        shops: directoryData?.shops || [],
        services: directoryData?.services || [],
        serviceProducts: directoryData?.serviceProducts || [],
      }
  const serviceProductsByShopId = normalizedDirectory.serviceProducts.reduce((map, product) => {
    const key = String(product?.shop_id || "")
    if (!key) return map
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(product)
    return map
  }, new Map())
  const directoryEntries = [
    ...normalizedDirectory.shops.map((shop) => ({ type: "shop", shop })),
    ...normalizedDirectory.services.map((shop) => ({ type: "service", shop })),
  ].sort((a, b) => String(a.shop?.name || "").localeCompare(String(b.shop?.name || "")))

  function getDisplayImage(shop) {
    if (shop?.image_url) return shop.image_url
    if (shop?.storefront_url) return shop.storefront_url
    if (shop?.store_front_url) return shop.store_front_url
    if (Array.isArray(shop?.banners) && shop.banners.length > 0) {
      return shop.banners[0]
    }
    return ""
  }

  function getDisplayId(shop) {
    const rawId = String(shop?.unique_id || "N/A")
    return rawId.includes("-") ? rawId.split("-").pop() : rawId
  }

  function formatServicePrice(value) {
    const amount = Number(value || 0)
    if (!Number.isFinite(amount) || amount <= 0) return "Request quote"
    return `From N${amount.toLocaleString()}`
  }

  async function openShopWithTransition(shopId) {
    if (!shopId) return

    setTransitionState({
      pending: true,
      shopId,
      type: "shop",
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
        shopId,
        type: "shop",
        error: safeMessage,
      })
    }
  }

  async function openServiceWithTransition(service) {
    if (!service?.id) return

    setTransitionState({
      pending: true,
      shopId: service.id,
      type: "service",
      error: "",
    })

    try {
      const [serviceProviderData] = await Promise.all([
        fetchShopDetailData({
          shopId: service.id,
          userId: user?.id || null,
        }),
        loadServiceProviderPage(),
      ])

      primeCachedFetchStore(
        `service_provider_${service.id}_${user?.id || "anon"}`,
        serviceProviderData,
        undefined,
        { persist: "session" },
      )

      navigate(`/service-provider?id=${encodeURIComponent(service.id)}&service=${encodeURIComponent(service.category || "")}`, {
        state: {
          fromMarketTransition: true,
          prefetchedServiceProviderData: serviceProviderData,
        },
      })
    } catch (error) {
      const safeMessage = isNetworkError(error)
        ? "We could not open this service right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this service right now. Please try again."
          )

      setTransitionState({
        pending: false,
        shopId: service.id,
        type: "service",
        error: safeMessage,
      })
    }
  }

  // Redirect if not authenticated (Gatekeeper backup)
  if (!authLoading && !user) {
    navigate("/", { replace: true })
    return null
  }

  return (
    <>
      <PageTransitionOverlay
        visible={transitionState.pending}
        error={transitionState.error}
        onRetry={() => {
          if (transitionState.shopId) {
            if (transitionState.type === "service") {
              const service = normalizedDirectory.services.find(
                (item) => String(item.id) === String(transitionState.shopId)
              )
              void openServiceWithTransition(service)
            } else {
              void openShopWithTransition(transitionState.shopId)
            }
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
        className={`flex h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
          transitionState.pending ? "pointer-events-none select-none" : ""
        }`}
      >
      <PageSeo
        title={`${headerTitle} | CTMerchant`}
        description="Browse verified shops and service providers in your city on the CTMerchant directory."
        canonicalPath="/shop-index"
        noindex
        structuredData={directoryStructuredData}
      />
      <div className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <header className="mx-auto flex w-full max-w-[800px] items-center gap-4 px-4 py-3 text-white">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
          >
            <FaArrowLeft />
          </button>

          <div className="truncate text-[1.15rem] font-bold tracking-[0.5px]">
            {headerTitle}
          </div>
        </header>

        <div className="mx-auto w-full max-w-[800px] px-4 pb-4">
          <div className="flex h-11 overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search shops, services, ID, or category..."
              className="flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
            />
            <button
              type="button"
              className="flex w-[52px] items-center justify-center bg-pink-600 text-white"
              aria-label="Search"
            >
              <FaMagnifyingGlass className="text-[1.1rem]" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[800px] flex-1 overflow-y-auto px-4 py-5">
        {authLoading || (dataLoading && !directoryData) ? (
          <PageLoadingScreen
            fullScreen={false}
            title="Loading directory"
            message="Please wait while we prepare shops and services."
          />
        ) : dataError && !directoryData ? (
          <GlobalErrorScreen
            fullScreen={false}
            error={dataError}
            message={getRetryingMessage(dataError)}
            onRetry={mutate}
          />
        ) : directoryEntries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-5 text-center text-slate-400">
            <FaStoreSlash className="mb-4 text-5xl opacity-30" />
            <span className="font-semibold text-[#0F1111]">
              No matching shops or services found.
            </span>
            <span className="mt-1 text-[0.85rem]">
              Try adjusting your search criteria.
            </span>
          </div>
        ) : (
          directoryEntries.map((entry) => {
            const { shop, type } = entry
            const isService = type === "service"
            const serviceItems = isService
              ? serviceProductsByShopId.get(String(shop.id)) || []
              : []
            const imageUrl = isService
              ? getServiceProviderImage(shop, serviceItems) || getDisplayImage(shop)
              : getDisplayImage(shop)
            const displayId = getDisplayId(shop)
            const minServicePrice = serviceItems
              .map((product) => Number(product?.price))
              .filter((price) => Number.isFinite(price) && price > 0)
              .sort((a, b) => a - b)[0]

            return (
              <div
                key={`${type}-${shop.id}`}
                onClick={() => {
                  if (isService) {
                    void openServiceWithTransition(shop)
                  } else {
                    void openShopWithTransition(shop.id)
                  }
                }}
                className="mb-3 flex cursor-pointer items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_4px_10px_rgba(0,0,0,0.08)] active:scale-[0.98]"
              >
                {imageUrl ? (
                  <StableImage
                    src={imageUrl}
                    alt={shop.name}
                    containerClassName="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white"
                    className="h-full w-full object-contain p-1"
                  />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-pink-200 bg-pink-50 text-[1.4rem] font-extrabold text-pink-600">
                    {String(shop?.name || "S").charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="truncate text-[1.05rem] font-extrabold text-[#0F1111]">
                      {shop.name}
                    </span>

                    {shop.is_verified ? (
                      <FaCircleCheck
                        className="shrink-0 text-[0.9rem] text-[#007185]"
                        title="Verified"
                      />
                    ) : null}
                  </div>

                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[0.68rem] font-black ${
                      isService
                        ? "bg-indigo-50 text-indigo-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}>
                      {isService ? <FaBriefcase /> : null}
                      {isService ? "Service" : "Shop"}
                    </span>

                    <span className="rounded bg-pink-50 px-2 py-1 text-[0.7rem] font-bold text-pink-600">
                      {shop.category || "Uncategorized"}
                    </span>

                    {shop.is_verified ? (
                      <span className="text-[0.75rem] font-semibold text-slate-500">
                        ID: {displayId}
                      </span>
                    ) : null}
                  </div>

                  <div className="truncate text-[0.85rem] font-medium text-slate-500">
                    <FaLocationDot className="mr-1 inline text-slate-400" />
                    {shop.address || "No address"}
                  </div>

                  {isService ? (
                    <div className="mt-1 text-[0.85rem] font-extrabold text-slate-900">
                      {formatServicePrice(minServicePrice)}
                    </div>
                  ) : null}
                </div>

                <FaChevronRight className="shrink-0 text-[1.1rem] text-slate-300" />
              </div>
            )
          })
        )}
      </div>
      </div>
    </>
  )
}

export default ShopIndex
