import { useEffect, useMemo, useState } from "react"
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
  getServiceCategoryMeta,
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

function summarizeServiceProducts(products = []) {
  const visible = products.filter(Boolean).slice(0, 3)
  if (!visible.length) return []
  return visible.map((product) => product.name).filter(Boolean)
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
  const serviceNames = summarizeServiceProducts(products)
  const minPrice = products
    .map((product) => Number(product.price))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b)[0]

  return (
    <button
      type="button"
      onClick={() => onOpen(shop.id)}
      className="group w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-xl active:scale-[0.99]"
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-center">
        <div className="relative overflow-hidden rounded-[22px] border border-slate-100 bg-slate-50">
          {imageUrl ? (
            <StableImage
              src={imageUrl}
              alt={shop.name}
              width={420}
              height={280}
              aspectRatio={1.35}
              className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex aspect-[1.35] items-center justify-center bg-gradient-to-br from-pink-50 to-blue-50 text-4xl font-black text-pink-600">
              {String(shop.name || "S").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[0.65rem] font-black uppercase tracking-widest text-slate-800 shadow-sm">
            ID {displayId}
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-pink-50 px-3 py-1 text-[0.7rem] font-black text-pink-700">
              {shop.category}
            </span>
            {shop.is_verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[0.7rem] font-black text-emerald-700">
                <FaCircleCheck /> Verified
              </span>
            ) : null}
          </div>

          <h2 className="text-[1.25rem] font-black leading-tight text-slate-950">
            {shop.name}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">
            {shop.description || "Professional service provider available in your city."}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {serviceNames.length ? (
              serviceNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.72rem] font-bold text-slate-600"
                >
                  {name}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.72rem] font-bold text-slate-600">
                Service profile
              </span>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-500">
            <FaLocationDot className="text-pink-600" />
            <span className="truncate">
              {shop.areas?.name || shop.address || shop.cities?.name || "City service area"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
          <div className="text-right">
            <div className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400">
              Service fee
            </div>
            <div className="text-lg font-black text-slate-950">
              {formatPrice(minPrice)}
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">
            View page <FaChevronRight className="text-xs" />
          </span>
        </div>
      </div>
    </button>
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
  const serviceMeta = getServiceCategoryMeta(serviceName)
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
  const totalListings = useMemo(
    () => providers.reduce((sum, provider) => sum + provider.products.length, 0),
    [providers],
  )

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
        className={`min-h-screen bg-slate-100 text-slate-950 ${
          transitionState.pending ? "pointer-events-none select-none" : ""
        }`}
      >
        <PageSeo
          title={`${serviceName} | CTMerchant Services`}
          description={`Find verified ${serviceName} providers in your city on CTMerchant.`}
          canonicalPath={`/service-category?name=${encodeURIComponent(serviceName)}`}
          noindex
        />

        <header className="sticky top-0 z-50 bg-[#101827] text-white shadow-lg">
          <div className="mx-auto flex w-full max-w-[980px] items-center gap-4 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-full p-2 transition hover:bg-white/10"
              aria-label="Go back"
            >
              <FaArrowLeft />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[1rem] font-black">{serviceName}</div>
              <div className="text-[0.72rem] font-bold uppercase tracking-widest text-white/55">
                Service finder
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[980px] px-4 py-5">
          <section className="overflow-hidden rounded-[34px] bg-[radial-gradient(circle_at_top_left,#fdf2f8_0%,#ffffff_42%,#e0f2fe_100%)] p-5 shadow-sm sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[0.7rem] font-black uppercase tracking-widest text-pink-700 shadow-sm">
                  <FaBriefcase /> {serviceMeta?.serviceGroupTitle || "Local Services"}
                </div>
                <h1 className="max-w-3xl text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                  Find verified {serviceName}
                </h1>
                <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                  Service providers here follow the same CTMerchant approval, KYC, city, open-shop, and active-subscription rules as the marketplace.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:min-w-[220px]">
                <div className="rounded-2xl bg-white/90 p-3 text-center shadow-sm">
                  <div className="text-2xl font-black text-slate-950">{providers.length}</div>
                  <div className="text-[0.68rem] font-black uppercase tracking-widest text-slate-400">
                    Providers
                  </div>
                </div>
                <div className="rounded-2xl bg-white/90 p-3 text-center shadow-sm">
                  <div className="text-2xl font-black text-slate-950">{totalListings}</div>
                  <div className="text-[0.68rem] font-black uppercase tracking-widest text-slate-400">
                    Listings
                  </div>
                </div>
              </div>
            </div>
          </section>

          {isRevalidating ? (
            <div className="mt-4 inline-flex rounded-full bg-slate-900 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-white">
              Updating services...
            </div>
          ) : null}

          <section className="mt-5">
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
              <div className="grid gap-4">
                {providers.map((provider) => (
                  <ServiceProviderCard
                    key={provider.shop.id}
                    provider={provider}
                    onOpen={openProvider}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  )
}
