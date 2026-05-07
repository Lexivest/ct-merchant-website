import { useEffect, useMemo, useRef } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaBoxOpen,
  FaBullhorn,
  FaCircleCheck,
  FaLocationDot,
  FaMapPin,
  FaPhone,
  FaStore,
} from "react-icons/fa6"
import { FaWhatsapp } from "react-icons/fa"

import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageSeo from "../components/common/PageSeo"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import StableImage from "../components/common/StableImage"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import ScrollingTicker from "../components/common/ScrollingTicker"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch, {
  primeCachedFetchStore,
  readCachedFetchStore,
} from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { fetchShopDetailData } from "../lib/shopDetailData"
import { logShopAnalyticsEvent } from "../lib/shopAnalytics"
import {
  getServiceProviderImage,
  isServiceCategory,
  isServiceShop,
} from "../lib/serviceCategories"

const EMPTY_PRODUCTS = []

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "Request quote"
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return "Request quote"
  return `From N${amount.toLocaleString()}`
}

function normalizePhoneForWhatsapp(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "")
  if (!digits) return ""
  if (digits.startsWith("+")) return digits.slice(1)
  if (digits.startsWith("0")) return `234${digits.slice(1)}`
  return digits
}

function getNameInitials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!parts.length) return "CT"
  return parts.map((part) => part[0]?.toUpperCase() || "").join("")
}

export default function ServiceProvider() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const shopId = searchParams.get("id")
  const selectedService = searchParams.get("service") || ""
  const { user, loading: authLoading } = useAuthSession()
  const viewTrackedRef = useRef(false)

  usePreventPullToRefresh()

  const routePrefetchedData =
    location.state?.prefetchedServiceProviderData?.shop &&
    String(location.state.prefetchedServiceProviderData.shop.id) === String(shopId)
      ? location.state.prefetchedServiceProviderData
      : null

  const cacheKey = `service_provider_${shopId || "unknown"}_${user?.id || "anon"}`

  useEffect(() => {
    if (!routePrefetchedData || readCachedFetchStore(cacheKey)) return
    primeCachedFetchStore(cacheKey, routePrefetchedData, Date.now(), { persist: "session" })
  }, [cacheKey, routePrefetchedData])

  const {
    data,
    loading,
    error,
    mutate,
  } = useCachedFetch(
    cacheKey,
    () => fetchShopDetailData({ shopId, userId: user?.id || null }),
    {
      dependencies: [shopId, user?.id],
      ttl: 1000 * 60 * 5,
      persist: "session",
      skip: !shopId,
    },
  )

  const currentShop = data?.shop
  const products = data?.products || EMPTY_PRODUCTS
  const approvedNews = data?.approvedNews || []
  const serviceProducts = useMemo(
    () => products.filter((product) => product?.is_available !== false && product?.is_approved !== false),
    [products],
  )
  const serviceCategory = isServiceCategory(selectedService)
    ? selectedService
    : currentShop?.category || "Service"
  const heroImage =
    data?.shopBanner ||
    currentShop?.storefront_url ||
    getServiceProviderImage(currentShop, serviceProducts)
  const logoImage =
    currentShop?.image_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      currentShop?.name || "Service",
    )}`
  const ownerInitials = getNameInitials(currentShop?.name || "CT Service")
  const cityName = currentShop?.cities?.name || "Local"
  const tickerText = approvedNews.join(" • ")
  const isValidServiceProvider =
    !currentShop || isServiceShop(currentShop) || isServiceCategory(currentShop.category)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
  }, [authLoading, navigate, user])

  useEffect(() => {
    viewTrackedRef.current = false
  }, [shopId])

  useEffect(() => {
    if (!currentShop?.id || viewTrackedRef.current) return
    if (user?.id && user.id === currentShop.owner_id) return

    viewTrackedRef.current = true

    void logShopAnalyticsEvent({
      shopId: currentShop.id,
      eventType: "shop_view",
      eventSource: "service_provider",
      metadata: {
        screen: "service-provider",
        service_category: serviceCategory,
      },
    })
  }, [currentShop?.id, currentShop?.owner_id, serviceCategory, user?.id])

  function goBackSafe() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate("/user-dashboard")
  }

  function openWhatsapp() {
    const phone = normalizePhoneForWhatsapp(currentShop?.whatsapp || currentShop?.phone)
    if (!phone || !currentShop?.id) return

    void logShopAnalyticsEvent({
      shopId: currentShop.id,
      eventType: "contact_whatsapp",
      eventSource: "service_provider",
      contactStatus: "opened",
      metadata: {
        screen: "service-provider",
        service_category: serviceCategory,
      },
    })

    const message = encodeURIComponent(
      `Hello ${currentShop.name}, I found your ${serviceCategory} service on CTMerchant.`,
    )
    window.open(`https://wa.me/${phone}?text=${message}`, "_blank", "noopener,noreferrer")
  }

  function callProvider() {
    if (!currentShop?.phone || !currentShop?.id) return

    void logShopAnalyticsEvent({
      shopId: currentShop.id,
      eventType: "contact_phone",
      eventSource: "service_provider",
      contactStatus: "opened",
      metadata: {
        screen: "service-provider",
        service_category: serviceCategory,
      },
    })

    window.location.href = `tel:${currentShop.phone}`
  }

  function openMaps() {
    if (currentShop?.latitude && currentShop?.longitude) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${currentShop.latitude},${currentShop.longitude}`,
        "_blank",
        "noopener,noreferrer",
      )
      return
    }

    if (!currentShop?.address) return
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(currentShop.address)}`,
      "_blank",
      "noopener,noreferrer",
    )
  }

  if (!shopId) {
    return (
      <GlobalErrorScreen
        title="Service unavailable"
        message="This service page link is incomplete or no longer available."
        onBack={goBackSafe}
      />
    )
  }

  if (!data && (authLoading || loading)) {
    return (
      <PageLoadingScreen
        title="Opening service page"
        message="Please wait while we prepare this provider."
      />
    )
  }

  if (error && !data) {
    return (
      <GlobalErrorScreen
        error={error}
        message={getRetryingMessage(error)}
        onRetry={mutate}
        onBack={goBackSafe}
      />
    )
  }

  if (!isValidServiceProvider) {
    return (
      <GlobalErrorScreen
        title="Service unavailable"
        message="This provider is not registered as a service provider."
        onBack={goBackSafe}
      />
    )
  }

  const serviceStructuredData = currentShop
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: currentShop.name,
        description: currentShop.description,
        image: heroImage || logoImage,
        address: {
          "@type": "PostalAddress",
          streetAddress: currentShop.address,
          addressLocality: cityName,
          addressCountry: "NG",
        },
        telephone: currentShop.phone,
        url: window.location.href,
      }
    : null

  return (
    <div
      className={`mx-auto flex min-h-screen max-w-[1200px] flex-col bg-[#E3E6E6] pb-[90px] ${
        location.state?.fromServiceCategory ? "ctm-page-enter" : ""
      }`}
    >
      <PageSeo
        title={currentShop?.name ? `${currentShop.name} | CTMerchant Services` : "Service Provider | CTMerchant"}
        description={
          currentShop?.description ||
          "View service details, address, and contact options on CTMerchant."
        }
        canonicalPath={`/service-provider${shopId ? `?id=${encodeURIComponent(shopId)}` : ""}`}
        image={heroImage || logoImage}
        structuredData={serviceStructuredData}
        noindex
      />

      <header className="sticky top-0 z-[100] flex flex-col bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center px-4 py-3">
          <button
            type="button"
            onClick={goBackSafe}
            className="shrink-0 text-[1.2rem] transition hover:text-pink-500"
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>

          <div className="pointer-events-none min-w-0 text-center">
            <span className="block truncate text-[1.05rem] font-black tracking-tight">
              {cityName} Service Hub
            </span>
          </div>

          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[0.76rem] font-black text-white">
            {ownerInitials}
          </div>
        </div>

        {approvedNews.length > 0 ? (
          <div className="bg-[#232F3E] px-4 py-2 text-white">
            <div className="relative flex items-center gap-3 overflow-hidden">
              <FaBullhorn className="shrink-0 text-pink-500" />
              <ScrollingTicker
                text={tickerText}
                className="flex-1"
                textClassName="text-white"
                minDuration={28}
                speedFactor={0.22}
              />
            </div>
          </div>
        ) : null}
      </header>

      <main className="main-layout flex w-full flex-col lg:flex-row lg:gap-6 lg:bg-transparent lg:p-10">
        <div className="left-col lg:flex-1">
          <section className="content-block mb-2 overflow-hidden bg-white !p-0 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="image-container flex w-full flex-col items-center bg-white">
              <div className="main-img-wrapper relative flex aspect-square w-full items-center justify-center overflow-hidden bg-[#F7F7F7] lg:max-h-[560px]">
                {heroImage ? (
                  <StableImage
                    src={heroImage}
                    alt={currentShop?.name || "Service provider"}
                    containerClassName="h-full w-full bg-[#F7F7F7]"
                    className="block h-full w-full object-contain"
                    loading="eager"
                    fetchPriority="high"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-white text-5xl font-black text-pink-600">
                    {ownerInitials}
                  </div>
                )}
              </div>

              <div className="w-full border-t border-slate-100 bg-white p-4">
                <div className="mb-4 flex items-center gap-3">
                  <StableImage
                    src={logoImage}
                    alt={currentShop?.name || "Service logo"}
                    containerClassName="h-14 w-14 shrink-0 rounded-2xl border border-slate-200 bg-white"
                    className="h-full w-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h1 className="truncate text-[1.2rem] font-black text-[#0F1111]">
                        {currentShop?.name}
                      </h1>
                      {currentShop?.is_verified ? (
                        <FaCircleCheck className="shrink-0 text-[#007185]" />
                      ) : null}
                    </div>
                    <p className="truncate text-[0.85rem] font-bold text-slate-500">
                      {serviceCategory}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={openWhatsapp}
                    disabled={!currentShop?.whatsapp && !currentShop?.phone}
                    title="Contact provider on WhatsApp"
                    className="group relative min-h-[86px] overflow-hidden rounded-[24px] bg-gradient-to-br from-[#18A84C] via-[#25D366] to-[#0F8F3A] px-3 py-4 text-center text-white shadow-[0_16px_30px_rgba(37,211,102,0.26)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(37,211,102,0.35)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-400 disabled:shadow-none"
                  >
                    <span className="absolute -right-4 -top-5 h-20 w-20 rounded-full bg-white/20 blur-xl transition group-hover:scale-125" />
                    <span className="absolute left-4 top-4 h-2.5 w-2.5 animate-ping rounded-full bg-white/70" />
                    <span className="relative flex items-center justify-center gap-2 text-[1.05rem] font-black">
                      <FaWhatsapp className="text-[1.45rem]" />
                      WhatsApp
                    </span>
                    <span className="relative mt-1 block text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-white/85">
                      WhatsApp provider
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={callProvider}
                    disabled={!currentShop?.phone}
                    title="Call provider"
                    className="group relative min-h-[86px] overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0F7285] via-[#007185] to-[#083344] px-3 py-4 text-center text-white shadow-[0_16px_30px_rgba(0,113,133,0.22)] transition hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(0,113,133,0.32)] disabled:cursor-not-allowed disabled:from-slate-300 disabled:via-slate-300 disabled:to-slate-400 disabled:shadow-none"
                  >
                    <span className="absolute right-4 top-4 flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/85" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/75 [animation-delay:120ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/65 [animation-delay:240ms]" />
                    </span>
                    <span className="absolute -left-5 bottom-0 h-20 w-20 rounded-full bg-white/10 blur-xl transition group-hover:scale-125" />
                    <span className="relative flex items-center justify-center gap-2 text-[1.05rem] font-black">
                      <FaPhone className="text-[1.2rem]" />
                      Call
                    </span>
                    <span className="relative mt-1 block text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-white/85">
                      Call provider now
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={openMaps}
                  disabled={!currentShop?.address && !currentShop?.latitude}
                  className="mt-3 w-full rounded-[24px] border border-pink-100 bg-gradient-to-br from-white via-pink-50/70 to-orange-50 px-4 py-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-[0_16px_34px_rgba(219,39,119,0.12)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex items-center gap-2 text-[1rem] font-black text-pink-700">
                    <FaStore />
                    Visit address
                  </span>
                  <span className="mt-1 flex items-start gap-2 text-[0.82rem] font-semibold leading-5 text-slate-600">
                    <FaLocationDot className="mt-1 shrink-0 text-pink-500" />
                    {currentShop?.address || "Address not provided."}
                  </span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="right-col flex flex-col lg:w-[420px] lg:shrink-0">
          <section className="content-block mb-2 bg-white px-5 py-6 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="mb-2 border-b-2 border-slate-100 pb-1.5 text-[1.05rem] font-extrabold text-[#0F1111]">
              Service Description
            </div>
            <p className="whitespace-pre-wrap text-[0.95rem] leading-7 text-slate-600">
              {currentShop?.description || "Service details not provided yet."}
            </p>
          </section>

          <section className="content-block mb-2 bg-white px-5 py-6 lg:mb-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <div className="mb-3 text-[0.85rem] font-extrabold uppercase tracking-[0.5px] text-pink-600">
              Provider Information
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="mb-2 flex items-center font-extrabold text-[#0F1111]">
                <FaMapPin className="mr-2 text-pink-600" />
                <span>{currentShop?.name || "Service Provider"}</span>
              </div>
              <div className="flex items-start text-[0.9rem] text-slate-600">
                <FaLocationDot className="mr-2 mt-1 shrink-0 text-slate-400" />
                <span>{currentShop?.address || "Address not provided."}</span>
              </div>
            </div>
          </section>

          {serviceProducts.length > 0 ? (
            <section className="content-block bg-white px-5 py-6 lg:rounded-lg lg:border lg:border-slate-300 lg:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <h2 className="mb-4 flex items-center gap-3 text-[1.15rem] font-extrabold text-[#0F1111]">
                <span className="inline-block h-[20px] w-[6px] rounded bg-pink-600" />
                Services Offered
              </h2>
              <div className="space-y-3">
                {serviceProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3"
                  >
                    {product.image_url ? (
                      <StableImage
                        src={product.image_url}
                        alt={product.name}
                        containerClassName="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                        <FaBoxOpen />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-[0.9rem] font-extrabold text-[#0F1111]">
                        {product.name}
                      </div>
                      <div className="mt-1 text-[0.85rem] font-black text-pink-600">
                        {formatPrice(product.price)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  )
}
