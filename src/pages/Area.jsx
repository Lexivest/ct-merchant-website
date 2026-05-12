import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
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

function normalizePositiveId(value) {
  const normalized = String(value ?? "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return String(parsed)
}

function Area() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const areaId = normalizePositiveId(searchParams.get("id"))
  
  usePreventPullToRefresh()

  // 1. Unified Auth State
  const { user, loading: authLoading } = useAuthSession()
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [viewMode, setViewMode] = useState("shops")
  const [transitionState, setTransitionState] = useState({
    pending: false,
    shopId: "",
    type: "shop",
    error: "",
  })

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
  }, [authLoading, navigate, user])

  // 2. Extracted Data Fetching Logic for Hook
  const fetchAreaShops = async () => {
    if (!areaId) throw new Error("Area ID missing.")

    const [{ data: areaData, error: areaError }] = await Promise.all([
      supabase.from("areas").select("name").eq("id", areaId).maybeSingle()
    ])
    if (areaError) throw areaError

    const nowIso = new Date().toISOString()

    let query = supabase
      .from("shops")
      .select("*")
      .eq("area_id", areaId)
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
      .eq("area_id", areaId)
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
      areaName: areaData?.name || "Area",
      shops: shops || [],
      services: services || [],
      serviceProducts,
    }
  }

  // 3. Smart Caching Hook
  const cacheKey = `area_shops_${areaId || 'none'}_q_${debouncedSearch}`
  const {
    data,
    loading: dataLoading,
    error: dataError,
    mutate,
    isRevalidating,
  } = useCachedFetch(
    cacheKey,
    fetchAreaShops,
    {
      dependencies: [areaId, debouncedSearch, user?.id],
      ttl: 1000 * 60 * 15,
      persist: "session",
      skip: authLoading || !user || !areaId,
      keepPreviousData: true,
    }
  )

  const areaName = data?.areaName || "Area"
  const shops = data?.shops || []
  const services = data?.services || []
  const serviceProducts = data?.serviceProducts || []
  const visibleListings = viewMode === "services" ? services : shops
  const headerTitle = `${viewMode === "services" ? "Services" : "Shops"} in ${areaName}`
  const serviceProductsByShopId = serviceProducts.reduce((map, product) => {
    const key = String(product?.shop_id || "")
    if (!key) return map
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(product)
    return map
  }, new Map())

  function getDisplayImage(shop) {
    if (shop?.image_url) return shop.image_url
    if (shop?.storefront_url) return shop.storefront_url
    if (shop?.store_front_url) return shop.store_front_url
    if (Array.isArray(shop?.banners) && shop.banners.length > 0) return shop.banners[0]
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
    setTransitionState({ pending: true, shopId, type: "shop", error: "" })
    try {
      await prepareShopDetailTransition({ shopId, userId: user?.id || null })
      navigate(`/shop-detail?id=${shopId}`, { state: { fromDiscoveryTransition: true } })
    } catch (error) {
      const safeMsg = isNetworkError(error) ? "Network error. Please try again." : getFriendlyErrorMessage(error)
      setTransitionState({ pending: false, shopId, type: "shop", error: safeMsg })
    }
  }

  async function openServiceWithTransition(service) {
    if (!service?.id) return

    setTransitionState({ pending: true, shopId: service.id, type: "service", error: "" })

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
          fromAreaTransition: true,
          prefetchedServiceProviderData: serviceProviderData,
        },
      })
    } catch (error) {
      const safeMsg = isNetworkError(error)
        ? "Network error. Please try again."
        : getFriendlyErrorMessage(error, "We could not open this service right now. Please try again.")
      setTransitionState({ pending: false, shopId: service.id, type: "service", error: safeMsg })
    }
  }

  return (
    <>
      <PageTransitionOverlay
        visible={transitionState.pending}
        error={transitionState.error}
        onRetry={() => {
          if (transitionState.shopId) {
            if (transitionState.type === "service") {
              const service = services.find((item) => String(item.id) === String(transitionState.shopId))
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
      <div className={`flex h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${transitionState.pending ? "pointer-events-none select-none" : ""}`}>
        {!areaId ? (
          <GlobalErrorScreen
            title="Area unavailable"
            message="This area link is incomplete or no longer available."
            onBack={() => navigate(-1)}
          />
        ) : null}
        {!areaId ? null : (
        <>
        <PageSeo
          title={`${headerTitle} | CTMerchant`}
          description={`Browse verified shops, service providers, and local merchants in ${areaName} on CTMerchant.`}
          canonicalPath={`/area?id=${areaId}`}
          noindex
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
                placeholder={`Search ${viewMode === "services" ? "services" : "shops"} in ${areaName}...`}
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
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {[
              { key: "shops", label: `Shops (${shops.length})`, icon: null },
              { key: "services", label: `Services (${services.length})`, icon: <FaBriefcase /> },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setViewMode(item.key)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black transition ${
                  viewMode === item.key
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          {authLoading || (dataLoading && !data) ? (
            <PageLoadingScreen
              fullScreen={false}
              title={`Loading ${viewMode === "services" ? "services" : "shops"}`}
              message={`Preparing ${viewMode === "services" ? "services" : "stores"} in ${areaName}...`}
            />
          ) : dataError && !data ? (
            <GlobalErrorScreen
              fullScreen={false}
              error={dataError}
              message={getRetryingMessage(dataError)}
              onRetry={mutate}
              onBack={() => navigate(-1)}
            />
          ) : visibleListings.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-5 text-center text-slate-400">
              {viewMode === "services" ? (
                <FaBriefcase className="mb-4 text-5xl opacity-30" />
              ) : (
                <FaStoreSlash className="mb-4 text-5xl opacity-30" />
              )}
              <span className="font-semibold text-[#0F1111]">
                No {viewMode === "services" ? "services" : "shops"} found here.
              </span>
              <span className="mt-1 text-[0.85rem]">Try searching for something else or check back later.</span>
            </div>
          ) : (
            visibleListings.map((shop) => {
              const serviceItems = serviceProductsByShopId.get(String(shop.id)) || []
              const isService = viewMode === "services"
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
                  key={shop.id}
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
                        <FaCircleCheck className="shrink-0 text-[0.9rem] text-[#007185]" title="Verified" />
                      ) : null}
                    </div>

                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="rounded bg-pink-50 px-2 py-1 text-[0.7rem] font-bold text-pink-600">
                        {shop.category || (isService ? "Service" : "Uncategorized")}
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
        </>
        )}
      </div>
    </>
  )
}

export default Area
