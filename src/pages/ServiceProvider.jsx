import { useEffect, useMemo, useRef } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaBriefcase,
  FaCircleCheck,
  FaFacebook,
  FaGlobe,
  FaImage,
  FaLocationDot,
  FaMapLocationDot,
  FaPhone,
  FaShield,
  FaStore,
  FaTelegram,
  FaXTwitter,
} from "react-icons/fa6"

import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageSeo from "../components/common/PageSeo"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import StableImage from "../components/common/StableImage"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch, {
  primeCachedFetchStore,
  readCachedFetchStore,
} from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { fetchShopDetailData } from "../lib/shopDetailData"
import { logShopAnalyticsEvent } from "../lib/shopAnalytics"
import {
  getServiceCategoryMeta,
  getServiceProviderImage,
  isServiceCategory,
} from "../lib/serviceCategories"

const EMPTY_PRODUCTS = []

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "Request quote"
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return "Request quote"
  return `From N${amount.toLocaleString()}`
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

function normalizePhoneForWhatsapp(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "")
  if (!digits) return ""
  if (digits.startsWith("+")) return digits.slice(1)
  if (digits.startsWith("0")) return `234${digits.slice(1)}`
  return digits
}

function getProductImages(products = []) {
  const images = []

  products.forEach((product) => {
    ;[product.image_url, product.image_url_2, product.image_url_3]
      .filter(Boolean)
      .forEach((imageUrl) => {
        if (!images.includes(imageUrl)) images.push(imageUrl)
      })
  })

  return images.slice(0, 12)
}

function ServicePackageCard({ product }) {
  const keyFeatures = product?.attributes?.["Key Features"] || ""
  const support = product?.attributes?.["Warranty"] || ""

  return (
    <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-[22px] border border-slate-100 bg-slate-50">
          {product.image_url ? (
            <StableImage
              src={product.image_url}
              alt={product.name}
              width={340}
              height={260}
              aspectRatio={1.2}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[1.2] items-center justify-center text-3xl text-slate-300">
              <FaImage />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-2 inline-flex rounded-full bg-pink-50 px-3 py-1 text-[0.68rem] font-black uppercase tracking-widest text-pink-700">
            Service offer
          </div>
          <h3 className="text-xl font-black leading-tight text-slate-950">
            {product.name}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-600">
            {product.description || "Contact this provider for full service details and availability."}
          </p>
          {keyFeatures ? (
            <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-700">
              {keyFeatures}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">
              {formatPrice(product.price)}
            </span>
            {support ? (
              <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
                {support}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
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
  const serviceCategory = isServiceCategory(selectedService)
    ? selectedService
    : currentShop?.category || "Service Provider"
  const serviceMeta = getServiceCategoryMeta(serviceCategory)
  const heroImage = data?.shopBanner || getServiceProviderImage(currentShop, products)
  const logoImage =
    currentShop?.image_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      currentShop?.name || "Service",
    )}`
  const portfolioImages = useMemo(() => getProductImages(products), [products])
  const ownerInitials = getNameInitials(currentShop?.name || "CT Service")

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
    if (!phone) return

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
    if (!currentShop?.phone) return

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

  function openExternalUrl(url) {
    if (!url) return
    const formattedUrl = url.startsWith("http") ? url : `https://${url}`
    window.open(formattedUrl, "_blank", "noopener,noreferrer")
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
          addressLocality: currentShop.cities?.name,
          addressCountry: "NG",
        },
        telephone: currentShop.phone,
        url: window.location.href,
      }
    : null

  return (
    <div
      className={`min-h-screen bg-[#f3f6fb] text-slate-950 ${
        location.state?.fromServiceCategory ? "ctm-page-enter" : ""
      }`}
    >
      <PageSeo
        title={currentShop?.name ? `${currentShop.name} | CTMerchant Services` : "Service Provider | CTMerchant"}
        description={
          currentShop?.description ||
          "View a verified CTMerchant service provider profile, contact options, address, and service offers."
        }
        canonicalPath={`/service-provider${shopId ? `?id=${encodeURIComponent(shopId)}` : ""}`}
        image={heroImage || logoImage}
        structuredData={serviceStructuredData}
        noindex
      />

      <header className="sticky top-0 z-50 bg-[#101827] text-white shadow-lg">
        <div className="mx-auto grid w-full max-w-[1120px] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={goBackSafe}
            className="rounded-full p-2 transition hover:bg-white/10"
            aria-label="Go back"
          >
            <FaArrowLeft />
          </button>
          <div className="min-w-0 text-center">
            <span className="block truncate text-[1.05rem] font-black">
              {currentShop?.cities?.name || "Local"} Service Page
            </span>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[0.72rem] font-black">
            {ownerInitials}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-4 pb-12 pt-5">
        <section className="overflow-hidden rounded-[38px] bg-white shadow-sm">
          <div className="relative min-h-[300px] overflow-hidden bg-slate-900">
            {heroImage ? (
              <StableImage
                src={heroImage}
                alt={currentShop?.name || "Service provider"}
                containerClassName="absolute inset-0 h-full w-full bg-slate-900"
                className="h-full w-full object-cover opacity-60"
                loading="eager"
                fetchPriority="high"
              />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(15,23,42,0.96)_0%,rgba(15,23,42,0.72)_48%,rgba(219,39,119,0.45)_100%)]" />

            <div className="relative z-[1] flex min-h-[300px] flex-col justify-end p-5 sm:p-8">
              <div className="mb-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-widest text-pink-700">
                  <FaBriefcase /> {serviceMeta?.serviceGroupTitle || serviceCategory}
                </span>
                {currentShop?.is_verified ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/95 px-3 py-1.5 text-[0.72rem] font-black uppercase tracking-widest text-emerald-950">
                    <FaCircleCheck /> Verified Provider
                  </span>
                ) : null}
              </div>

              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-4 flex items-center gap-4">
                    <StableImage
                      src={logoImage}
                      alt={currentShop?.name || "Service logo"}
                      containerClassName="h-20 w-20 shrink-0 rounded-[24px] border border-white/30 bg-white"
                      className="h-full w-full object-cover"
                    />
                    <div className="min-w-0">
                      <h1 className="text-3xl font-black leading-tight text-white sm:text-5xl">
                        {currentShop?.name}
                      </h1>
                      <p className="mt-2 flex items-center gap-2 text-sm font-bold text-white/75">
                        <FaLocationDot className="text-pink-300" />
                        <span className="truncate">
                          {currentShop?.areas?.name || currentShop?.cities?.name || "Service area"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <p className="max-w-3xl whitespace-pre-wrap text-sm font-semibold leading-7 text-white/82 sm:text-base">
                    {currentShop?.description || "Professional service provider available through CTMerchant."}
                  </p>
                </div>

                <div className="grid min-w-[250px] gap-2">
                  <button
                    type="button"
                    onClick={openWhatsapp}
                    disabled={!currentShop?.whatsapp && !currentShop?.phone}
                    className="rounded-2xl bg-[#25D366] px-5 py-3 text-sm font-black text-white shadow-lg transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
                  >
                    WhatsApp service provider
                  </button>
                  <button
                    type="button"
                    onClick={callProvider}
                    disabled={!currentShop?.phone}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-lg transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
                  >
                    Call provider now
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="mb-1 flex items-center gap-2 text-[0.72rem] font-black uppercase tracking-widest text-slate-400">
                <FaShield /> Trust
              </div>
              <div className="font-black text-slate-950">
                CTMerchant approval and KYC flow
              </div>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <div className="mb-1 flex items-center gap-2 text-[0.72rem] font-black uppercase tracking-widest text-slate-400">
                <FaStore /> Category
              </div>
              <div className="font-black text-slate-950">{serviceCategory}</div>
            </div>
            <button
              type="button"
              onClick={openMaps}
              disabled={!currentShop?.address && !currentShop?.latitude}
              className="rounded-3xl bg-slate-950 p-4 text-left text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              <div className="mb-1 flex items-center gap-2 text-[0.72rem] font-black uppercase tracking-widest text-white/55">
                <FaMapLocationDot /> Location
              </div>
              <div className="line-clamp-2 font-black">
                {currentShop?.address || "Address not provided"}
              </div>
            </button>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className="rounded-[34px] bg-white p-5 shadow-sm sm:p-7">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-pink-600">
                    Services offered
                  </div>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    Packages, portfolio and service details
                  </h2>
                </div>
              </div>

              {products.length > 0 ? (
                <div className="grid gap-4">
                  {products.map((product) => (
                    <ServicePackageCard key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                  <FaBriefcase className="mx-auto mb-3 text-4xl text-slate-300" />
                  <h3 className="text-lg font-black text-slate-950">Service details coming soon</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-slate-500">
                    This provider has not added service packages yet. You can still contact them directly from the buttons above.
                  </p>
                </div>
              )}
            </div>

            {portfolioImages.length > 0 ? (
              <div className="rounded-[34px] bg-white p-5 shadow-sm sm:p-7">
                <div className="mb-4">
                  <div className="text-[0.72rem] font-black uppercase tracking-[0.18em] text-blue-600">
                    Work gallery
                  </div>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    Photos from this service provider
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {portfolioImages.map((imageUrl, index) => (
                    <StableImage
                      key={`${imageUrl}-${index}`}
                      src={imageUrl}
                      alt={`${currentShop?.name || "Service"} gallery ${index + 1}`}
                      width={360}
                      height={360}
                      aspectRatio={1}
                      containerClassName="overflow-hidden rounded-[24px] border border-slate-100 bg-slate-50"
                      className="h-full w-full object-cover transition duration-700 hover:scale-105"
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-5">
            <div className="rounded-[34px] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Contact & business info</h2>
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={openWhatsapp}
                  disabled={!currentShop?.whatsapp && !currentShop?.phone}
                  className="w-full rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  WhatsApp provider
                </button>
                <button
                  type="button"
                  onClick={callProvider}
                  disabled={!currentShop?.phone}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <FaPhone /> Call provider
                </button>
                <button
                  type="button"
                  onClick={openMaps}
                  disabled={!currentShop?.address && !currentShop?.latitude}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                >
                  <FaLocationDot /> Visit address
                </button>
              </div>

              <div className="mt-5 space-y-4 text-sm">
                <div>
                  <div className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400">
                    Address
                  </div>
                  <p className="mt-1 font-bold leading-6 text-slate-700">
                    {currentShop?.address || "Not provided"}
                  </p>
                </div>
                <div>
                  <div className="text-[0.7rem] font-black uppercase tracking-widest text-slate-400">
                    City
                  </div>
                  <p className="mt-1 font-bold text-slate-700">
                    {currentShop?.cities?.name || "Not provided"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[34px] bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-slate-950">Online presence</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {currentShop?.website_url ? (
                  <button type="button" onClick={() => openExternalUrl(currentShop.website_url)} className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-700">
                    <FaGlobe className="mr-2 inline" /> Website
                  </button>
                ) : null}
                {currentShop?.facebook_url ? (
                  <button type="button" onClick={() => openExternalUrl(currentShop.facebook_url)} className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700">
                    <FaFacebook className="mr-2 inline" /> Facebook
                  </button>
                ) : null}
                {currentShop?.telegram_url ? (
                  <button type="button" onClick={() => openExternalUrl(currentShop.telegram_url)} className="rounded-2xl bg-sky-50 px-4 py-3 text-sm font-black text-sky-700">
                    <FaTelegram className="mr-2 inline" /> Telegram
                  </button>
                ) : null}
                {currentShop?.twitter_url ? (
                  <button type="button" onClick={() => openExternalUrl(currentShop.twitter_url)} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-900">
                    <FaXTwitter className="mr-2 inline" /> X
                  </button>
                ) : null}
              </div>
              {!currentShop?.website_url &&
              !currentShop?.facebook_url &&
              !currentShop?.telegram_url &&
              !currentShop?.twitter_url ? (
                <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-500">
                  No external business links were provided.
                </p>
              ) : null}
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}
