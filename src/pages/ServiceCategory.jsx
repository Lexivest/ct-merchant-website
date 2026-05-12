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

import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import StableImage from "../components/common/StableImage"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch, { primeCachedFetchStore } from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import { fetchShopDetailData } from "../lib/shopDetailData"
import {
  getServiceProviderImage,
  isActiveMarketplaceShop,
  isServiceCategory,
} from "../lib/serviceCategories"
import { supabase } from "../lib/supabase"

const SHOP_SELECT = `
  id,
  owner_id,
  name,
  unique_id,
  category,
  description,
  address,
  area_id,
  city_id,
  image_url,
  storefront_url,
  phone,
  whatsapp,
  is_service,
  is_verified,
  is_open,
  status,
  subscription_end_date,
  cities ( name ),
  areas ( name )
`

const loadServiceProviderPage = () => import("./ServiceProvider")
const EMPTY_PROVIDERS = []

function normalizePositiveId(value) {
  const normalized = String(value ?? "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return parsed
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "Request quote"
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return "Request quote"
  return `From N${amount.toLocaleString()}`
}

function getDisplayId(shop) {
  const rawId = String(shop?.unique_id || "N/A")
  return rawId.includes("-") ? rawId.split("-").pop() : rawId
}

function buildProvidersFromRows({ directShops = [], serviceProducts = [], cityId }) {
  const now = new Date()
  const providerMap = new Map()

  directShops.forEach((shop) => {
    if (!isActiveMarketplaceShop(shop, cityId, now)) return
    providerMap.set(String(shop.id), {
      shop,
      products: [],
    })
  })

  serviceProducts.forEach((product) => {
    const shop = product?.shops
    if (!shop || !isActiveMarketplaceShop(shop, cityId, now)) return

    const key = String(shop.id)
    const existing = providerMap.get(key) || { shop, products: [] }
    existing.products.push({
      id: product.id,
      shop_id: product.shop_id,
      name: product.name,
      description: product.description,
      price: product.price,
      image_url: product.image_url,
      image_url_2: product.image_url_2,
      image_url_3: product.image_url_3,
      category: product.category,
      attributes: product.attributes || {},
    })
    providerMap.set(key, existing)
  })

  return Array.from(providerMap.values()).sort((a, b) =>
    String(a.shop?.name || "").localeCompare(String(b.shop?.name || "")),
  )
}

async function fetchServiceCategoryData({ serviceName, cityId }) {
  if (!serviceName || !cityId) return { providers: [] }

  const nowIso = new Date().toISOString()

  const directShopsQuery = supabase
    .from("shops")
    .select(SHOP_SELECT)
    .eq("city_id", cityId)
    .eq("is_service", true)
    .eq("category", serviceName)
    .eq("status", "approved")
    .eq("is_verified", true)
    .eq("is_open", true)
    .gt("subscription_end_date", nowIso)
    .order("name", { ascending: true })
    .limit(120)

  const serviceProductsQuery = supabase
    .from("products")
    .select(`
      id,
      shop_id,
      name,
      description,
      price,
      image_url,
      image_url_2,
      image_url_3,
      category,
      attributes,
      is_available,
      is_approved,
      shops!inner (${SHOP_SELECT})
    `)
    .eq("category", serviceName)
    .eq("is_available", true)
    .eq("is_approved", true)
    .eq("shops.city_id", cityId)
    .eq("shops.is_service", true)
    .eq("shops.status", "approved")
    .eq("shops.is_verified", true)
    .eq("shops.is_open", true)
    .gt("shops.subscription_end_date", nowIso)
    .order("id", { ascending: false })
    .limit(250)

  const [directShopsResult, serviceProductsResult] = await Promise.all([
    directShopsQuery,
    serviceProductsQuery,
  ])

  if (directShopsResult.error) throw directShopsResult.error
  if (serviceProductsResult.error) throw serviceProductsResult.error

  return {
    providers: buildProvidersFromRows({
      directShops: directShopsResult.data || [],
      serviceProducts: serviceProductsResult.data || [],
      cityId,
    }),
  }
}

function ServiceProviderCard({ provider, onOpen }) {
  const { shop, products } = provider
  const imageUrl = getServiceProviderImage(shop, products)
  const displayId = getDisplayId(shop)
  const minPrice = products
    .map((product) => Number(product.price))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b)[0]

  return (
    <div
      onClick={() => onOpen(shop.id)}
      className="mb-3 flex cursor-pointer items-center gap-4 rounded-lg border border-[#D5D9D9] bg-white p-4 text-left shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-[0_4px_10px_rgba(0,0,0,0.08)] active:scale-[0.98]"
    >
      {imageUrl ? (
        <StableImage
          src={imageUrl}
          alt={shop.name}
          containerClassName="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white"
          className="h-full w-full object-cover"
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
            {shop.category || "Service"}
          </span>
          <span className="text-[0.75rem] font-semibold text-slate-500">
            ID: {displayId}
          </span>
        </div>

        <div className="truncate text-[0.85rem] font-medium text-slate-500">
          <FaLocationDot className="mr-1 inline text-slate-400" />
          {shop.address || shop.areas?.name || "No address"}
        </div>

        <div className="mt-1 text-[0.85rem] font-extrabold text-slate-900">
          {formatPrice(minPrice)}
        </div>
      </div>

      <FaChevronRight className="shrink-0 text-[1.1rem] text-slate-300" />
    </div>
  )
}

export default function ServiceCategory() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const serviceName = searchParams.get("name") || ""
  const { user, profile, loading: authLoading } = useAuthSession()
  const [transitionState, setTransitionState] = useState({
    pending: false,
    shopId: "",
    error: "",
  })

  usePreventPullToRefresh()

  const cityId = normalizePositiveId(profile?.city_id)
  const isValidService = isServiceCategory(serviceName)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
  }, [authLoading, navigate, user])

  const cacheKey = `service_category_${serviceName}_city_${cityId || "none"}`
  const {
    data,
    loading,
    error,
    mutate,
    isRevalidating,
  } = useCachedFetch(
    cacheKey,
    () => fetchServiceCategoryData({ serviceName, cityId }),
    {
      dependencies: [serviceName, cityId, user?.id],
      ttl: 1000 * 60 * 10,
      persist: "session",
      skip: authLoading || !user || !isValidService || !cityId,
      keepPreviousData: true,
    },
  )

  const providers = data?.providers || EMPTY_PROVIDERS
  async function openProvider(shopId) {
    if (!shopId) return

    setTransitionState({
      pending: true,
      shopId,
      error: "",
    })

    try {
      const [shopDetailData] = await Promise.all([
        fetchShopDetailData({
          shopId,
          userId: user?.id || null,
        }),
        loadServiceProviderPage(),
      ])

      primeCachedFetchStore(
        `service_provider_${shopId}_${user?.id || "anon"}`,
        shopDetailData,
        Date.now(),
        { persist: "session" },
      )

      navigate(`/service-provider?id=${encodeURIComponent(shopId)}&service=${encodeURIComponent(serviceName)}`, {
        state: {
          fromServiceCategory: true,
          prefetchedServiceProviderData: shopDetailData,
        },
      })
    } catch (openError) {
      const safeMessage = isNetworkError(openError)
        ? "We could not open this service page right now. Please try again."
        : getFriendlyErrorMessage(
            openError,
            "We could not open this service page right now. Please try again.",
          )

      setTransitionState({
        pending: false,
        shopId,
        error: safeMessage,
      })
    }
  }

  if (!serviceName || !isValidService) {
    return (
      <GlobalErrorScreen
        title="Service unavailable"
        message="This service category is incomplete or no longer available."
        onBack={() => navigate(-1)}
      />
    )
  }

  return (
    <>
      <PageTransitionOverlay
        visible={transitionState.pending}
        error={transitionState.error}
        onRetry={() => {
          if (transitionState.shopId) {
            void openProvider(transitionState.shopId)
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
          title={`${serviceName} | CTMerchant Services`}
          description={`Find verified ${serviceName} providers in your city on CTMerchant.`}
          canonicalPath={`/service-category?name=${encodeURIComponent(serviceName)}`}
          noindex
        />

        <header className="sticky top-0 z-50 bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <div className="mx-auto flex w-full max-w-[800px] items-center gap-4 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
              aria-label="Go back"
            >
              <FaArrowLeft />
            </button>
            <div className="min-w-0 flex-1 truncate text-[1.15rem] font-bold tracking-[0.5px]">
              {serviceName}
            </div>
          </div>
        </header>

        {isRevalidating ? (
          <div className="mx-auto w-full max-w-[800px] px-4 pt-2 pb-1">
            <div className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-white">
              Updating services...
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[800px] flex-1 overflow-y-auto px-4 py-5">

          <section>
            {authLoading || loading ? (
              <PageLoadingScreen
                fullScreen={false}
                title="Loading services"
                message="Please wait while we prepare verified providers."
              />
            ) : error && !data ? (
              <GlobalErrorScreen
                fullScreen={false}
                error={error}
                message={getRetryingMessage(error)}
                onRetry={mutate}
                onBack={() => navigate(-1)}
              />
            ) : providers.length === 0 ? (
              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-16 text-center shadow-sm">
                <FaStoreSlash className="mx-auto mb-4 text-5xl text-slate-300" />
                <h2 className="text-xl font-black text-slate-950">No providers found yet</h2>
                <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
                  No active verified provider for {serviceName} is available in your city yet.
                </p>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
                >
                  <FaMagnifyingGlass /> Explore other services
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-pink-100 text-[1.4rem] text-pink-600">
                    <FaBriefcase />
                  </div>
                  <div>
                    <div className="text-[1.4rem] font-extrabold text-[#0F1111]">{serviceName}</div>
                    <div className="mt-0.5 text-[0.9rem] font-semibold text-[#565959]">
                      {providers.length} verified providers found in your city
                    </div>
                  </div>
                </div>
                {providers.map((provider) => (
                  <ServiceProviderCard
                    key={provider.shop.id}
                    provider={provider}
                    onOpen={openProvider}
                  />
                ))}
              </>
            )}
          </section>
        </main>
      </div>
    </>
  )
}
