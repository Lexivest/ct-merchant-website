import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaBoxOpen,
  FaBullhorn,
  FaChevronRight,
  FaCircleCheck,
  FaCircleInfo,
  FaHouse,
  FaLocationDot,
  FaMapLocationDot,
  FaShield,
  FaStore,
  FaTriangleExclamation,
  FaPhone,
  FaGlobe,
  FaFacebook,
  FaInstagram,
  FaXTwitter,
  FaTiktok,
} from "react-icons/fa6"
import "leaflet/dist/leaflet.css"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch, {
  primeCachedFetchStore,
  readCachedFetchStore,
  clearCachedFetchStore,
  invalidateCachedFetchStore,
} from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import AiAssistantWidget from "../components/common/AiAssistantWidget"
import { ShopDetailEntrySkeleton } from "../components/common/DetailEntrySkeletons"
import { getRetryingMessage } from "../components/common/RetryingNotice"
import ScrollingTicker from "../components/common/ScrollingTicker"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import {
  buildDashboardBaseCacheKey,
  buildDashboardDynamicCacheKey,
  prepareDashboardTransition,
} from "../lib/dashboardData"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import { logShopAnalyticsEvent } from "../lib/shopAnalytics"
import { buildShopDetailCacheKey, fetchShopDetailData } from "../lib/shopDetailData"
import {
  buildProductDetailCacheKey,
  fetchProductDetailData,
} from "../lib/productDetailData"
import {
  buildProductDetailPrefetchFromRepoPayload,
  buildRepoSearchQuerySuffix,
  fetchPublicRepoProductDetail,
  fetchPublicRepoShopDetail,
} from "../lib/repoSearch"

const EMPTY_PRODUCTS = []
const EMPTY_NEWS = []
const ShopCommunitySection = lazy(() => import("../components/shop/ShopCommunitySection"))
const loadProductDetailPage = () => import("./ProductDetail")

function getNameInitials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!parts.length) return "CT"
  return parts.map((part) => part[0]?.toUpperCase() || "").join("")
}

function ShopSectionFallback({ title, body }) {
  return (
    <div className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
      <div className="mb-3 h-6 w-40 rounded bg-slate-200" />
      <div className="rounded-[20px] border border-slate-200 bg-[#FCFCFD] p-4">
        <div className="mb-3 h-4 w-48 rounded bg-slate-200" />
        <div className="mb-3 h-24 rounded-[18px] bg-slate-100" />
        <div className="h-4 w-64 rounded bg-slate-200" />
      </div>
      {title ? <div className="sr-only">{title}</div> : null}
      {body ? <div className="sr-only">{body}</div> : null}
    </div>
  )
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return ""
  return `₦${Number(value).toLocaleString()}`
}

function ShopDetailProductCard({ product, onOpenProduct }) {
  const hasDiscount = product.discount_price && Number(product.discount_price) < Number(product.price)
  const percent = hasDiscount
    ? Math.round(((Number(product.price) - Number(product.discount_price)) / Number(product.price)) * 100)
    : 0
  const priceClass = hasDiscount ? "prod-price flash-price" : "prod-price"
  const images = useMemo(
    () => [product.image_url, product.image_url_2, product.image_url_3].filter(Boolean),
    [product.image_url, product.image_url_2, product.image_url_3]
  )
  const shouldRotate = hasDiscount && images.length > 1
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  useEffect(() => {
    if (!shouldRotate) return undefined

    const intervalId = window.setInterval(() => {
      setActiveImageIndex((current) => (current + 1) % images.length)
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [images.length, shouldRotate])

  return (
    <div
      className="product-card relative flex cursor-pointer flex-col transition hover:-translate-y-1 hover:opacity-90"
      onClick={() => onOpenProduct(product.id)}
    >
      <div className="prod-img-wrap relative aspect-square w-full overflow-hidden bg-white">
        {images.length ? (
          images.map((imageUrl, index) => (
            <div
              key={`${product.id}-${imageUrl}-${index}`}
              className={`absolute inset-0 transition-all duration-1000 ease-in-out ${
                index === activeImageIndex || !shouldRotate
                  ? "opacity-100 scale-100"
                  : "pointer-events-none opacity-0 scale-110"
              }`}
            >
              <StableImage
                src={imageUrl}
                alt={product.name}
                containerClassName="h-full w-full bg-white"
                className="prod-img h-full w-full object-contain transition duration-300 hover:scale-105"
              />
            </div>
          ))
        ) : (
          <StableImage
            src={product.image_url}
            alt={product.name}
            containerClassName="h-full w-full bg-white"
            className="prod-img h-full w-full object-contain transition duration-300 hover:scale-105"
          />
        )}
        {hasDiscount ? (
          <span className="badge badge-discount flash-offer absolute left-1 top-1 z-[2] rounded bg-red-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
            -{percent}%
          </span>
        ) : null}
        {product.condition === "Fairly Used" ? (
          <span className="badge badge-used absolute right-1 top-1 z-[2] rounded bg-orange-600 px-2 py-1 text-[0.65rem] font-extrabold text-white">
            Fairly Used
          </span>
        ) : null}
        {shouldRotate ? (
          <div className="absolute bottom-2 left-0 right-0 z-[2] flex justify-center gap-1">
            {images.map((_, index) => (
              <span
                key={`${product.id}-dot-${index}`}
                className={`h-1 rounded-full transition-all duration-500 ${
                  index === activeImageIndex ? "w-4 bg-slate-800/80" : "w-1 bg-slate-300/90"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="prod-info flex flex-1 flex-col px-1 pt-3">
        <div className="prod-name mb-1 line-clamp-2 text-[0.85rem] font-bold leading-[1.3] text-[#0F1111]" title={product.name}>
          {product.name}
        </div>
        <div className={`${priceClass} mt-auto text-[1.05rem] font-extrabold text-pink-600`}>
          {hasDiscount ? (
            <>
              <span className="prod-old-price mr-1 text-[0.75rem] font-medium text-slate-400 line-through">
                {formatPrice(product.price)}
              </span>
              {formatPrice(product.discount_price)}
            </>
          ) : (
            formatPrice(product.price)
          )}
        </div>
      </div>
    </div>
  )
}

function ShopDetail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notify } = useGlobalFeedback()
  const [searchParams] = useSearchParams()
  const shopId = searchParams.get("id")
  const preselectedProductId = searchParams.get("comment_product")
  const repoRefFromUrl = searchParams.get("repo_ref")?.trim() || ""
  const repoRefFromState =
    location.state?.prefetchedShopData?.__repoRef ||
    location.state?.prefetchedShopData?.shop?.unique_id ||
    ""
  const repoRef = repoRefFromUrl || repoRefFromState
  const isRepoSearchEntry =
    searchParams.get("repo_public") === "1" ||
    location.state?.fromRepoSearch === true
  const routePrefetchedShopData =
    location.state?.prefetchedShopData?.shop &&
    String(location.state.prefetchedShopData.shop.id) === String(shopId)
      ? location.state.prefetchedShopData
      : null

  usePreventPullToRefresh()

  // 1. Unified Auth State
  const { user, profile, loading: authLoading } = useAuthSession()
  const usePublicRepoMode = isRepoSearchEntry && !user?.id && Boolean(repoRef)

  // 2. Data Fetching Logic
  const fetchShopData = async () =>
    usePublicRepoMode
      ? fetchPublicRepoShopDetail({
          repoRef,
          shopId,
        })
      : fetchShopDetailData({
          shopId,
          userId: user?.id || null,
        })

  // 3. Smart Caching Hook
  const cacheKey = usePublicRepoMode
    ? `repo_public_shop_${repoRef || "unknown"}_${shopId || "unknown"}`
    : buildShopDetailCacheKey(shopId, user?.id || null)
  if (routePrefetchedShopData && !readCachedFetchStore(cacheKey)) {
    const prefetchTimestamp = routePrefetchedShopData.__repoSearchDetailReady
      ? Date.now()
      : 0
    primeCachedFetchStore(cacheKey, routePrefetchedShopData, prefetchTimestamp, {
      persist: "session",
    })
  }

  const { data, loading: dataLoading, error, mutate } = useCachedFetch(
    cacheKey,
    fetchShopData,
    {
      dependencies: [shopId, user?.id],
      ttl: 1000 * 60 * 5,
      persist: "session",
      skip: !shopId,
    }
  )

  // 4. Local Optimistic State
  const [hasLiked, setHasLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [activeInfoSection, setActiveInfoSection] = useState(null)
  const [shouldLoadCommunity, setShouldLoadCommunity] = useState(false)
  const [productTransition, setProductTransition] = useState({
    pending: false,
    productId: "",
    error: "",
  })
  const [dashboardTransition, setDashboardTransition] = useState({
    pending: false,
    error: "",
  })

  useEffect(() => {
    if (data) {
      setHasLiked(data.hasLiked)
      setLikeCount(data.likeCount)
    }
  }, [data])

  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const leafletModuleRef = useRef(null)
  const communityLoaderRef = useRef(null)
  const viewTrackedRef = useRef(false)

  const currentShop = data?.shop
  const products = data?.products ?? EMPTY_PRODUCTS
  const approvedNews = data?.approvedNews ?? EMPTY_NEWS
  const shopBanner = data?.shopBanner || ""
  const shopLogo =
    currentShop?.image_url ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
      currentShop?.name || "Shop"
    )}`

  useEffect(() => {
    setShouldLoadCommunity(false)
  }, [shopId])

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
      eventSource: isRepoSearchEntry ? "repo_search" : "shop_detail",
      repoRef: isRepoSearchEntry ? repoRef : null,
      metadata: {
        screen: "shop-detail",
        repo_public: usePublicRepoMode,
      },
    })
  }, [currentShop?.id, currentShop?.owner_id, isRepoSearchEntry, repoRef, usePublicRepoMode, user?.id])

  useEffect(() => {
    if (!shopId || usePublicRepoMode) return undefined

    let refreshTimerId = null

    const scheduleRefresh = () => {
      if (refreshTimerId) {
        window.clearTimeout(refreshTimerId)
      }

      refreshTimerId = window.setTimeout(() => {
        refreshTimerId = null
        mutate()
      }, 500)
    }

    const invalidateChangedProduct = (payload) => {
      const changedProductId = payload.new?.id || payload.old?.id
      if (!changedProductId) return

      invalidateCachedFetchStore((key) =>
        key.startsWith(`prod_detail_${changedProductId}_`)
      )
    }

    const channel = supabase
      .channel(`shop-detail-live-${shopId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shops", filter: `id=eq.${shopId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `shop_id=eq.${shopId}` },
        (payload) => {
          invalidateChangedProduct(payload)
          scheduleRefresh()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_banners_news", filter: `shop_id=eq.${shopId}` },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_likes", filter: `shop_id=eq.${shopId}` },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          scheduleRefresh()
        }
      })

    return () => {
      if (refreshTimerId) {
        window.clearTimeout(refreshTimerId)
      }
      supabase.removeChannel(channel)
    }
  }, [mutate, shopId, usePublicRepoMode])

  useEffect(() => {
    if (shouldLoadCommunity) return undefined

    const revealCommunity = () => {
      setShouldLoadCommunity(true)
    }

    const node = communityLoaderRef.current
    const idleTimer = window.setTimeout(revealCommunity, 1400)

    if (!node || typeof window.IntersectionObserver !== "function") {
      return () => {
        window.clearTimeout(idleTimer)
      }
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          revealCommunity()
          observer.disconnect()
        }
      },
      { rootMargin: "320px 0px" }
    )

    observer.observe(node)

    return () => {
      window.clearTimeout(idleTimer)
      observer.disconnect()
    }
  }, [shouldLoadCommunity])

  const specialProducts = useMemo(
    () => products.filter((p) => p.discount_price && p.discount_price < p.price),
    [products]
  )

  const usedProducts = useMemo(
    () => products.filter((p) => p.condition === "Fairly Used"),
    [products]
  )

  const newProducts = useMemo(
    () =>
      products.filter(
        (p) => !(p.discount_price && p.discount_price < p.price) && p.condition !== "Fairly Used"
      ),
    [products]
  )

  const tickerText = useMemo(() => {
    const cityName = currentShop?.cities?.name || "Local"
    if (approvedNews.length > 0) return approvedNews.join(" • ")
    return `${cityName} Repository of shops, products and services`
  }, [approvedNews, currentShop])

  useEffect(() => {
    if (activeInfoSection !== "map") return undefined
    if (!currentShop?.latitude || !currentShop?.longitude || !mapRef.current) return undefined

    if (mapInstanceRef.current) {
      const resizeTimer = window.setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 150)
      return () => {
        window.clearTimeout(resizeTimer)
      }
    }

    const lat = Number(currentShop.latitude)
    const lng = Number(currentShop.longitude)

    if (Number.isNaN(lat) || Number.isNaN(lng)) return undefined

    let cancelled = false
    let resizeTimer = null

    const initialiseMap = async () => {
      try {
        if (!leafletModuleRef.current) {
          const leafletModule = await import("leaflet")
          leafletModuleRef.current = leafletModule.default || leafletModule
        }

        if (cancelled || mapInstanceRef.current || !mapRef.current) return

        const L = leafletModuleRef.current
        const map = L.map(mapRef.current).setView([lat, lng], 15)

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
        }).addTo(map)

        L.circleMarker([lat, lng], {
          radius: 8,
          weight: 2,
          color: "#db2777",
          fillColor: "#db2777",
          fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("Shop Location")
          .openPopup()

        mapInstanceRef.current = map

        resizeTimer = window.setTimeout(() => {
          map.invalidateSize()
        }, 250)

      } catch (mapError) {
        console.error("Failed to initialize shop map", mapError)
      }
    }

    void initialiseMap()

    return () => {
      cancelled = true
      if (resizeTimer) {
        window.clearTimeout(resizeTimer)
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [activeInfoSection, currentShop])

  function goBackSafe() {
    if (document.referrer && document.referrer.includes(window.location.hostname)) {
      navigate(-1)
      return
    }
    navigate("/user-dashboard")
  }

  async function openDashboardWithTransition() {
    if (!user?.id) {
      navigate("/user-dashboard", { replace: true })
      return
    }

    const cityId = profile?.city_id || "none"
    const baseKey = buildDashboardBaseCacheKey(cityId)
    const dynamicKey = buildDashboardDynamicCacheKey(user.id, cityId)
    const hasCache = readCachedFetchStore(baseKey)?.data && readCachedFetchStore(dynamicKey)?.data

    // If we have cache, don't even set the pending loader state, just go
    if (!hasCache) {
      setDashboardTransition({
        pending: true,
        error: "",
      })
    }

    try {
      const prefetchedDashboardData = await prepareDashboardTransition({
        userId: user.id,
        profile,
      })

      navigate("/user-dashboard", {
        replace: true,
        state: {
          fromDetailTransition: true,
          prefetchedDashboardData,
        },
      })
    } catch (transitionError) {
      setDashboardTransition({
        pending: false,
        error: getFriendlyErrorMessage(
          transitionError,
          "The dashboard could not be opened right now."
        ),
      })
    }
  }

  const shopStructuredData = useMemo(() => {
    if (!currentShop) return null
    return {
      "@context": "https://schema.org",
      "@type": "Store",
      "name": currentShop.name,
      "description": currentShop.description,
      "image": shopBanner || shopLogo,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": currentShop.address,
        "addressLocality": currentShop.cities?.name,
        "addressCountry": "NG"
      },
      "telephone": currentShop.phone,
      "url": window.location.href
    }
  }, [currentShop, shopBanner, shopLogo])

  async function _toggleLike() {
    if (!user?.id) {
      notify({ type: "info", title: "Login required", message: "Please sign in to like shops." })
      return
    }

    const nextLiked = !hasLiked
    const nextCount = nextLiked ? likeCount + 1 : Math.max(0, likeCount - 1)

    setHasLiked(nextLiked)
    setLikeCount(nextCount)

    try {
      if (nextLiked) {
        const { error } = await supabase.from("shop_likes").insert({
          shop_id: shopId,
          user_id: user.id,
        })
        if (error) throw error

        // Invalidate dashboard dynamic cache so liked count updates
        clearCachedFetchStore((key) => key.startsWith("dashboard_dynamic_"))
      } else {
        const { error } = await supabase
          .from("shop_likes")
          .delete()
          .eq("shop_id", shopId)
          .eq("user_id", user.id)
        if (error) throw error

        // Invalidate dashboard dynamic cache so liked count updates
        clearCachedFetchStore((key) => key.startsWith("dashboard_dynamic_"))
      }
    } catch {
      setHasLiked(!nextLiked)
      setLikeCount(likeCount)
      notify({ type: "error", title: "Action failed", message: "We could not update your shop like. Please try again." })
    }
  }

  function openGoogleMaps() {
    if (currentShop?.latitude && currentShop?.longitude) {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=$${currentShop.latitude},${currentShop.longitude}`,
        "_blank",
        "noopener,noreferrer"
      )
      return
    }

    if (!currentShop?.address) return
    window.open(
      `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(currentShop.address)}`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  function openExternalUrl(url) {
    if (!url) return
    const formattedUrl = url.startsWith("http") ? url : `https://${url}`
    window.open(formattedUrl, "_blank", "noopener,noreferrer")
  }

  function handlePhoneContact() {
    if (!currentShop?.phone) return

    void logShopAnalyticsEvent({
      shopId: currentShop.id,
      eventType: "contact_phone",
      eventSource: isRepoSearchEntry ? "repo_search" : "shop_detail",
      contactStatus: "opened",
      repoRef: isRepoSearchEntry ? repoRef : null,
      metadata: {
        screen: "shop-detail",
        contact_channel: "phone",
      },
    })

    window.location.href = `tel:${currentShop.phone}`
  }

  function _formatPrice(value) {
    if (value === null || value === undefined || value === "") return ""
    return `₦${Number(value).toLocaleString()}`
  }

  async function openProductWithTransition(productId) {
    if (!productId) return
    const repoSuffix = isRepoSearchEntry && repoRef ? buildRepoSearchQuerySuffix(repoRef) : ""

    const cacheKey = buildProductDetailCacheKey(productId, user?.id || null)
    const cachedEntry = readCachedFetchStore(cacheKey)
    const hasFreshCache =
      cachedEntry && Date.now() - cachedEntry.timestamp <= 1000 * 60 * 5

    setProductTransition({
      pending: true,
      productId,
      error: "",
    })

    try {
      let prefetchedProductData =
        usePublicRepoMode
          ? buildProductDetailPrefetchFromRepoPayload(data, productId)
          : cachedEntry?.data || null

      if (!usePublicRepoMode && hasFreshCache) {
        await loadProductDetailPage()
        navigate(`/product-detail?id=${productId}${shopId ? `&shop_src=${shopId}` : ""}${repoSuffix}`, {
          state: {
            fromProductTransition: true,
            prefetchedProductData,
          },
        })
        return
      }

      const transitionResult = await new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error("Timed out while opening the product."))
        }, 10000)

        const fetcher = usePublicRepoMode
          ? fetchPublicRepoProductDetail({
              repoRef,
              productId,
              shopId,
            })
          : fetchProductDetailData({ productId, userId: user?.id || null })

        Promise.all([fetcher, loadProductDetailPage()])
          .then(([prefetchedData]) => {
            window.clearTimeout(timeoutId)
            resolve(prefetchedData)
          })
          .catch((error) => {
            window.clearTimeout(timeoutId)
            reject(error)
          })
      })

      prefetchedProductData = transitionResult
      primeCachedFetchStore(cacheKey, transitionResult, Date.now(), { persist: "session" })

      navigate(`/product-detail?id=${productId}${shopId ? `&shop_src=${shopId}` : ""}${repoSuffix}`, {
        state: {
          fromProductTransition: true,
          prefetchedProductData,
        },
      })
    } catch (error) {
      console.error("Failed to open product detail", error)
      const safeMessage = isNetworkError(error)
        ? "We could not open this product right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this product right now. Please try again."
          )

      setProductTransition({
        pending: false,
        productId,
        error: safeMessage,
      })
    }
  }

  function renderProductCard(product) {
    return (
      <ShopDetailProductCard
        key={product.id}
        product={product}
        onOpenProduct={openProductWithTransition}
      />
    )
  }

  function renderInfoSection() {
    if (!activeInfoSection) return null

    if (activeInfoSection === "storefront") {
      return (
        <div className="mb-4 rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
          {currentShop?.storefront_url ? (
            <StableImage
              src={currentShop.storefront_url}
              alt="Store Front"
              containerClassName="flex min-h-[240px] w-full items-center justify-center overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50"
              className="max-h-[560px] w-full object-contain"
            />
          ) : (
            <div className="rounded-[16px] border border-dashed border-orange-200 bg-orange-50 px-5 py-10 text-center">
              <div className="text-[1rem] font-extrabold text-[#0F1111]">No storefront photo yet</div>
              <div className="mt-2 text-[0.9rem] text-slate-600">
                The merchant has not uploaded a storefront image for this shop.
              </div>
            </div>
          )}
        </div>
      )
    }

    if (activeInfoSection === "map") {
      const hasCoordinates = Boolean(
        currentShop?.latitude && 
        currentShop?.longitude && 
        !Number.isNaN(Number(currentShop.latitude)) && 
        !Number.isNaN(Number(currentShop.longitude))
      )
      const hasAddress = Boolean(currentShop?.address)

      return (
        <div className="mb-4 rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
          {hasCoordinates ? (
            <div
              ref={mapRef}
              className="h-[220px] w-full rounded-[16px] border border-slate-200 bg-slate-50"
            />
          ) : (
            <div className="flex items-start gap-3 rounded-[16px] border border-blue-200 bg-blue-50 p-4">
              <FaLocationDot className="mt-0.5 text-blue-600" />
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-black uppercase tracking-wider text-blue-700">Shop Address</span>
                <p className="text-[0.85rem] font-bold leading-snug text-slate-900">
                  {hasAddress
                    ? currentShop.address
                    : "The merchant has not provided an address or GPS location."}
                </p>
                <p className="mt-1 text-[0.75rem] leading-normal text-slate-600">
                  GPS coordinates were not provided for this shop. Please use the address listed above to find this merchant.
                </p>
              </div>
            </div>
          )}

          {hasCoordinates || hasAddress ? (
            <button
              type="button"
              onClick={openGoogleMaps}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-[0.85rem] font-bold text-[#0F1111] transition hover:bg-[#F7FAFA] sm:w-auto"
            >
              {hasCoordinates ? "Open in Google Maps" : "Open address in Maps"}
              <span>↗</span>
            </button>
          ) : null}
        </div>
      )
    }

    if (activeInfoSection === "about") {
      return (
        <div className="flex flex-col gap-3">
          <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-sm">
            {/* Shop Identity Row */}
            <div className="flex items-start gap-3">
              <StableImage
                src={shopLogo}
                alt="Shop Logo"
                containerClassName="h-[64px] w-[64px] shrink-0 rounded-xl border border-slate-300 bg-white"
                className="h-full w-full object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <h2 className="truncate text-[1.25rem] font-black leading-tight text-[#0F1111]">
                  {currentShop?.name}
                </h2>
                {currentShop?.category && (
                  <div className="inline-flex self-start rounded-full bg-pink-100 px-3 py-1 text-[0.65rem] font-black text-pink-600">
                    {currentShop.category}
                  </div>
                )}
              </div>
            </div>

            {/* Social Row */}
            <div className="mt-4 flex flex-wrap gap-2.5">
              {currentShop?.phone && (
                <button
                  type="button"
                  onClick={handlePhoneContact}
                  className="flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-[#3B82F6] text-white transition hover:opacity-90"
                >
                  <FaPhone className="text-lg" />
                </button>
              )}
              {currentShop?.website_url && (
                <button type="button" onClick={() => openExternalUrl(currentShop.website_url)} className="flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-[#4F46E5] text-white transition hover:opacity-90">
                  <FaGlobe className="text-lg" />
                </button>
              )}
              {currentShop?.facebook_url && (
                <button type="button" onClick={() => openExternalUrl(currentShop.facebook_url)} className="flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-[#1877F2] text-white transition hover:opacity-90">
                  <FaFacebook className="text-xl" />
                </button>
              )}
              {currentShop?.instagram_url && (
                <button type="button" onClick={() => openExternalUrl(currentShop.instagram_url)} className="flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-[#C13584] text-white transition hover:opacity-90">
                  <FaInstagram className="text-xl" />
                </button>
              )}
              {currentShop?.twitter_url && (
                <button type="button" onClick={() => openExternalUrl(currentShop.twitter_url)} className="flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-[#111111] text-white transition hover:opacity-90">
                  <FaXTwitter className="text-lg" />
                </button>
              )}
              {currentShop?.tiktok_url && (
                <button type="button" onClick={() => openExternalUrl(currentShop.tiktok_url)} className="flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-[#111111] text-white transition hover:opacity-90">
                  <FaTiktok className="text-lg" />
                </button>
              )}
            </div>
          </div>

          {(currentShop?.address || currentShop?.description) && (
            <div className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
              {currentShop?.address && (
                <div className="mb-4 flex flex-col gap-1">
                  <span className="text-[0.7rem] font-black uppercase tracking-wider text-slate-500">Business Address</span>
                  <p className="text-[0.9rem] font-semibold text-slate-800">{currentShop.address}</p>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] font-black uppercase tracking-wider text-slate-500">About Business</span>
                <p className="whitespace-pre-wrap text-[0.9rem] leading-relaxed text-slate-600">
                  {currentShop?.description || "No description provided by the merchant."}
                </p>
              </div>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  // EARLY EXITS
  if (!shopId) {
    return (
      <GlobalErrorScreen
        title="Shop unavailable"
        message="This shop link is incomplete or no longer available."
        onBack={goBackSafe}
      />
    )
  }

  if (!data && (authLoading || dataLoading)) {
    return <ShopDetailEntrySkeleton />
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

  const ownerAvatarUrl = data?.ownerProfile?.avatar_url || ""
  const ownerAvatarInitials = getNameInitials(
    data?.ownerProfile?.full_name || currentShop?.name || "CT Merchant"
  )
  const isLoggedIn = Boolean(user?.id)

  return (
    <>
      <PageTransitionOverlay
        visible={productTransition.pending || dashboardTransition.pending}
        error={productTransition.error || dashboardTransition.error}
        onRetry={() => {
          if (productTransition.error && productTransition.productId) {
            void openProductWithTransition(productTransition.productId)
            return
          }
          if (dashboardTransition.error) {
            void openDashboardWithTransition()
          }
        }}
        onDismiss={() => {
          setProductTransition({
            pending: false,
            productId: "",
            error: "",
          })
          setDashboardTransition({
            pending: false,
            error: "",
          })
        }}
      />
      <div
        className={`min-h-screen bg-[#E3E6E6] pb-10 ${
          location.state?.fromMarketTransition || location.state?.fromDiscoveryTransition
            ? "ctm-page-enter"
            : ""
        } ${
          productTransition.pending || dashboardTransition.pending
            ? "pointer-events-none select-none"
            : ""
        }`}
      >
      <PageSeo
        title={currentShop?.name ? `${currentShop.name} | CTMerchant Shop` : "Shop Details | CTMerchant"}
        description={
          currentShop?.description ||
          "View verified shop details, contact options, maps, and available products on CTMerchant."
        }
        canonicalPath={`/shop-detail${shopId ? `?id=${encodeURIComponent(shopId)}` : ""}`}
        image={shopBanner || shopLogo}
        structuredData={shopStructuredData}
      />
      <div className="mx-auto max-w-[1600px]">
        <header className="sticky top-0 z-[100] flex flex-col bg-[#131921] text-white shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center px-4 py-3">
            <div className="flex items-center justify-start">
              <button
                type="button"
                onClick={openDashboardWithTransition}
                className="shrink-0 text-[1.2rem] transition hover:text-pink-500"
                aria-label="Go home"
              >
                <FaHouse />
              </button>
            </div>

            <div className="min-w-0 text-center">
              <span className="block truncate text-[1.15rem] font-bold tracking-[0.5px]">
                {currentShop?.name || "Shop Details"}
              </span>
            </div>

            <div className="flex items-center justify-end">
              {ownerAvatarUrl ? (
                <img
                  src={ownerAvatarUrl}
                  alt={data?.ownerProfile?.full_name || currentShop?.name || "Shop owner"}
                  className="h-9 w-9 rounded-full border border-white/20 object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[0.76rem] font-black text-white">
                  {ownerAvatarInitials}
                </div>
              )}
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

        {shopBanner ? (
          <section className="relative mb-2 overflow-hidden bg-white p-[6px]">
            <StableImage
              src={shopBanner}
              alt="Shop Banner"
              containerClassName="sponsored-product-slider relative aspect-[8/3] w-full max-h-[420px] overflow-hidden bg-white"
              className="absolute inset-0 block h-full w-full bg-white object-contain object-center"
              loading="eager"
              fetchPriority="high"
            />
          </section>
        ) : null}

        {!isLoggedIn ? (
          <div className="mx-auto max-w-[1000px] px-4 pt-6">
            <div className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[0.9rem] font-semibold text-blue-900">
                Login to contact seller.
              </p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="inline-flex items-center justify-center rounded-md bg-pink-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-pink-700"
              >
                Login
              </button>
            </div>
          </div>
        ) : null}

        <section className={`border-y border-slate-300 bg-white px-4 pt-6 ${activeInfoSection ? "mb-2 pb-6" : "mb-0 pb-3"}`}>
          {/* Aligned Tabs for Single Row */}
          <div className={`flex w-full flex-row flex-nowrap items-center justify-between gap-2 overflow-x-auto border-b border-slate-200 pb-3 sm:justify-start ${activeInfoSection ? "mb-5" : "mb-0"}`}>
            {[
              { key: "storefront", label: "Storefront", icon: <FaStore />, active: "border-orange-300 bg-orange-50 text-orange-700", idle: "border-orange-200 bg-white text-orange-700 hover:bg-orange-50" },
              { key: "map", label: "Location", icon: <FaMapLocationDot />, active: "border-blue-300 bg-blue-50 text-blue-700", idle: "border-blue-200 bg-white text-blue-700 hover:bg-blue-50" },
              { key: "about", label: "About", icon: <FaCircleInfo />, active: "border-emerald-300 bg-emerald-50 text-emerald-700", idle: "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50" },
            ].map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveInfoSection((current) => (current === section.key ? null : section.key))}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1.5 text-[0.7rem] font-extrabold transition sm:flex-none sm:px-4 sm:text-[0.75rem] ${
                  activeInfoSection === section.key ? section.active : section.idle
                }`}
              >
                <span className="shrink-0">{section.icon}</span>
                <span className="truncate">{section.label}</span>
              </button>
            ))}
          </div>

          {renderInfoSection()}
        </section>

        {specialProducts.length > 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
            <h2 className="mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
              <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
              Special Offers
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
              {specialProducts.map(renderProductCard)}
            </div>
          </section>
        ) : null}

        {usedProducts.length > 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
            <h2 className="mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
              <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
              Fairly Used Deals
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
              {usedProducts.map(renderProductCard)}
            </div>
          </section>
        ) : null}

        {newProducts.length > 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
            <h2 className="mb-4 flex items-center gap-3 text-[1.35rem] font-extrabold text-[#0F1111]">
              <span className="inline-block h-[22px] w-[6px] rounded bg-pink-600" />
              New Stocks
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
              {newProducts.map(renderProductCard)}
            </div>
          </section>
        ) : null}

        {products.length === 0 ? (
          <section className="mb-2 border-y border-slate-300 bg-white px-4 py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-slate-50">
              <FaBoxOpen className="text-[28px] text-slate-400" />
            </div>
            <p className="text-[1.1rem] font-bold text-[#0F1111]">
              No products listed yet
            </p>
            <p className="mt-1 text-[0.9rem] text-slate-600">
              Check back later for updates from this merchant.
            </p>
          </section>
        ) : null}

        <div ref={communityLoaderRef} className="h-px" aria-hidden="true" />

        {shouldLoadCommunity ? (
          <Suspense
            fallback={<ShopSectionFallback title="Shop Community" body="Loading community discussion." />}
          >
              <ShopCommunitySection
                shopId={shopId}
                ownerId={currentShop?.owner_id}
                shopName={currentShop?.name}
                products={products}
                user={user}
                preselectedProductId={preselectedProductId}
                onOpenProduct={openProductWithTransition}
              />
          </Suspense>
        ) : (
          <ShopSectionFallback
            title="Shop Community"
            body="Preparing community discussion."
          />
        )}
      </div>
    </div>

    <AiAssistantWidget 
      mode="shopping" 
      isRepoSearch={isRepoSearchEntry}
      shopData={currentShop ? { 
        id: currentShop.id, 
        name: currentShop.name, 
        category: currentShop.category,
        city: currentShop.cities?.name 
      } : null} 
    />
  </>
)
}

export default ShopDetail
