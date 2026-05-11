import { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { createPortal } from "react-dom"
import { FaBullhorn, FaGift, FaTicket, FaXmark } from "react-icons/fa6"

import AuthNotification from "../components/auth/AuthNotification"
import BrandText from "../components/common/BrandText"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import useAuthSession, { clearAuthMemory } from "../hooks/useAuthSession"
import useCachedFetch, {
  primeCachedFetchStore,
  readCachedFetchStore,
} from "../hooks/useCachedFetch"
import useMyShop from "../hooks/useMyShop" // <-- Import our new logic file
import { signOutUser } from "../lib/auth"
import {
  buildDashboardBaseCacheKey,
  buildDashboardDynamicCacheKey,
  dedupeDashboardNotifications,
  fetchDashboardBaseData,
  fetchDashboardDynamicData,
} from "../lib/dashboardData"
import { prepareProductDetailTransition } from "../lib/detailPageTransitions"
import { getFriendlyErrorMessage, isNetworkError } from "../lib/friendlyErrors"
import { buildShopDetailCacheKey, fetchShopDetailData } from "../lib/shopDetailData"
import { supabase } from "../lib/supabase"
import { UPLOAD_RULES, formatBytes } from "../lib/uploadRules"
import { prepareVendorDashboardEntryTransition } from "../lib/vendorRouteTransitions"
import { buildWishlistCacheKey, fetchWishlistData } from "../lib/wishlistData"
import { isActiveMarketplaceShop, isServiceCategory, isServiceShop } from "../lib/serviceCategories"

import DashboardHeader from "../components/dashboard/layout/DashboardHeader"
import MarketSection from "../components/dashboard/sections/MarketSection"
import NotificationsSection from "../components/dashboard/sections/NotificationsSection"

const loadServicesProfileSection = () =>
  import("../components/dashboard/sections/ServicesProfileSection")
const loadShopDetailPage = () => import("./ShopDetail")
const loadSearchPage = () => import("./Search")
const loadAreaPage = () => import("./Area")
const loadCatPage = () => import("./Cat")
const loadServiceCategoryPage = () => import("./ServiceCategory")
const loadServiceProviderPage = () => import("./ServiceProvider")
const loadShopIndexPage = () => import("./ShopIndex")
const loadDiscoveryDetailPage = () => import("./DiscoveryDetail")
const loadWishlistDashboardView = () =>
  import("../features/dashboard/views/WishlistDashboardView")

const ServicesProfileSection = lazy(loadServicesProfileSection)

let cropperAssetsPromise = null

function loadCropperAssets() {
  if (!cropperAssetsPromise) {
    cropperAssetsPromise = Promise.all([
      import("cropperjs"),
      import("cropperjs/dist/cropper.css"),
    ]).then(([module]) => module.default)
  }

  return cropperAssetsPromise
}

const AVATAR_RULE = UPLOAD_RULES.avatars
const MAX_FILE_SIZE = AVATAR_RULE.maxBytes
const MAX_SOURCE_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_AVATAR_MIME_TYPES = new Set(AVATAR_RULE.allowedMime)
const AVATAR_BUCKET = AVATAR_RULE.bucket
const AVATAR_WIDTH_STEPS = [900, 760, 640, 520, 420, 360]
const AVATAR_QUALITY_STEPS = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56]

const EMPTY_DASHBOARD_DATA = {
  profile: null,
  promos: [],
  announcements: [],
  categories: [],
  areas: [],
  shops: [],
  serviceShops: [],
  products: [],
  serviceProducts: [],
  notifications: [],
  wishlistCount: 0,
  unread: 0,
}

const ALLOWED_TABS = new Set(["market", "services", "profile", "notifications"])
const ALLOWED_SERVICE_VIEWS = new Set([
  "menu",
  "about",
  "services-info",
  "careers",
  "support",
  "faq",
  "report-abuse",
  "wishlist",
])

const ANNOUNCEMENT_SEEN_KEY_PREFIX = "ctm_dashboard_announcements_seen"

function normalizePositiveId(value) {
  const normalized = String(value ?? "").trim()
  if (!/^\d+$/.test(normalized)) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return String(parsed)
}

function inferDashboardNotificationKind(item) {
  const explicitKind = String(item?.kind || "").trim().toLowerCase()
  if (explicitKind) return explicitKind

  const title = String(item?.title || "").toLowerCase()
  const message = String(item?.message || "").toLowerCase()
  const combined = `${title} ${message}`

  if (combined.includes("service fee")) {
    return combined.includes("needs attention") || combined.includes("could not confirm")
      ? "service_fee_rejected"
      : "service_fee_confirmed"
  }

  if (combined.includes("verification fee") || combined.includes("verification payment") || combined.includes("promo code")) {
    return combined.includes("needs attention") || combined.includes("could not confirm")
      ? "verification_payment_rejected"
      : "verification_payment_confirmed"
  }

  if (combined.includes("video kyc")) {
    return combined.includes("needs attention") || combined.includes("not approved")
      ? "kyc_rejected"
      : "kyc_approved"
  }

  if (combined.includes("shop application")) {
    return combined.includes("approved") ? "shop_approved" : "shop_rejected"
  }

  if (combined.includes("verified")) return "kyc_approved"

  return "system"
}

function DashboardSectionFallback({ label = "Loading section..." }) {
  return (
    <div className="screen active">
      <div className="tool-block-wrap bg-white px-4 py-6">
        <div className="mx-auto max-w-[900px] animate-pulse">
          <div className="mb-5 h-8 w-56 rounded bg-slate-200" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-slate-100" />
                <div className="mx-auto h-4 w-24 rounded bg-slate-200" />
                <div className="mx-auto mt-2 h-3 w-20 rounded bg-slate-100" />
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-sm font-semibold text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

function getAnnouncementTitle(item, index) {
  return item?.title || item?.headline || `Announcement ${index + 1}`
}

function getAnnouncementBody(item) {
  return item?.message || item?.body || item?.content || item?.text || ""
}

function DashboardAnnouncementsModal({ announcements, open, onClose }) {
  const safeAnnouncements = Array.isArray(announcements) ? announcements : []

  if (!open || !safeAnnouncements.length || typeof document === "undefined") {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-[30px] bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard announcements"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 bg-gradient-to-br from-[#2E1065] to-[#BE185D] px-5 py-5 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-xl">
              <FaBullhorn />
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight">Announcements</div>
              <div className="mt-0.5 text-sm font-semibold text-white/75">
                Important <BrandText /> updates for you.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            aria-label="Close announcements"
          >
            <FaXmark />
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto bg-slate-50 p-4 sm:p-6">
          <div className="space-y-3">
            {safeAnnouncements.map((item, index) => {
              const body = getAnnouncementBody(item)
              return (
                <article
                  key={item.id || `${body}-${index}`}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-700">
                      <FaBullhorn />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-black leading-tight text-slate-950">
                        {getAnnouncementTitle(item, index)}
                      </h3>
                      {body ? (
                        <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-600">
                          {body}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-2xl bg-[#2E1065] px-5 py-3 font-black text-white transition hover:bg-[#4C1D95]"
          >
            Continue to Dashboard
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

function PromoAlertBanner() {
  const [visible, setVisible] = useState(true)
  const [msgIndex, setMsgIndex] = useState(0)
  
  const messages = [
    "UP TO 50 PROMO CODES REMAINING!",
    "CLAIM YOUR DISCOUNT VOUCHER NOW!",
    "LIMITED TIME PLATFORM OFFER!"
  ]

  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [visible, messages.length])

  if (!visible) return null

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pt-4">
      <div className="animate-alert-flash relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl bg-[#BE185D] px-4 py-2.5 text-white shadow-lg shadow-pink-100/50 sm:py-3 sm:px-6">
        <div className="pointer-events-none absolute left-0 top-0 h-full w-full bg-[radial-gradient(circle_at_30%_-20%,rgba(255,255,255,0.15),transparent)]" />
        
        <div className="relative flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm backdrop-blur-sm sm:h-10 sm:w-10 sm:text-lg">
            <FaTicket className="animate-bounce" />
          </div>
          <div className="relative h-5 flex-1 overflow-hidden sm:h-6">
            <div 
              key={msgIndex}
              className="animate-slide-promo absolute inset-0 truncate text-[10px] font-black uppercase tracking-wider sm:text-xs"
            >
              {messages[msgIndex]}
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-2 sm:gap-3">
          <button 
            type="button"
            className="whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-[9px] font-black uppercase tracking-tighter text-[#BE185D] transition hover:bg-slate-50 active:scale-95 sm:px-6 sm:py-2 sm:text-[10px]"
          >
            Claim
          </button>
          <button 
            onClick={() => setVisible(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-black/10 sm:h-9 sm:w-9"
            aria-label="Dismiss alert"
          >
            <FaXmark className="text-xs sm:text-base" />
          </button>
        </div>
      </div>
    </div>
  )
}

function UserDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const prefetchedDashboardData = location.state?.prefetchedDashboardData || null

  const { loading: authLoading, user, profile, suspended, profileLoaded } = useAuthSession()
  
  // Use our new isolated tracking logic for the shop card
  const { shopData, shopMeta, canRegisterShop, loading: shopLoading } = useMyShop()

  const tabParam = searchParams.get("tab")
  const activeTab = ALLOWED_TABS.has(tabParam) ? tabParam : "market"
  const viewParam = searchParams.get("view")
  const serviceView =
    activeTab === "services" && ALLOWED_SERVICE_VIEWS.has(viewParam)
      ? viewParam
      : "menu"

  const cityId = profile?.city_id || "none"
  const baseCacheKey = buildDashboardBaseCacheKey(cityId)
  const dynamicCacheKey = buildDashboardDynamicCacheKey(user?.id, cityId)

  const { 
    data: baseData, 
    loading: baseLoading, 
    mutate: mutateBase 
  } = useCachedFetch(
    baseCacheKey,
    () => fetchDashboardBaseData(cityId),
    {
      dependencies: [cityId],
      ttl: 1000 * 60 * 60 * 24, // 24 hours for stable data
      persist: "session",
      revalidateOnMount: true,
      skip: !profileLoaded
    }
  )

  const { 
    data: dynamicData, 
    loading: dynamicLoading, 
    error: dataError, 
    isOffline: dynamicOffline,
    isRevalidating: dynamicRevalidating,
    mutate: mutateDynamic 
  } = useCachedFetch(
    dynamicCacheKey,
    () => fetchDashboardDynamicData({ userId: user?.id, cityId }),
    {
      dependencies: [user?.id, cityId],
      ttl: 1000 * 60 * 15, // 15 mins for dynamic data
      persist: "session",
      revalidateOnMount: true,
      skip: !profileLoaded
    }
  )

  const [localData, setLocalData] = useState(() => {
    if (prefetchedDashboardData) {
      return {
        ...prefetchedDashboardData,
        notifications: dedupeDashboardNotifications(prefetchedDashboardData.notifications || []),
        unread: dedupeDashboardNotifications(prefetchedDashboardData.notifications || []).filter((item) => !item.is_read).length,
      }
    }
    
    // Attempt to merge from separate caches if present
    const b = readCachedFetchStore(baseCacheKey)?.data
    const d = readCachedFetchStore(dynamicCacheKey)?.data
    if (b && d) {
      const nextNotifications = dedupeDashboardNotifications(d.notifications || [])
      return { 
        ...EMPTY_DASHBOARD_DATA, 
        ...b, 
        ...d,
        notifications: nextNotifications,
        unread: nextNotifications.filter((item) => !item.is_read).length,
      }
    }
    return EMPTY_DASHBOARD_DATA
  })

  const retryRouteTransitionRef = useRef(null)
  const [routeTransition, setRouteTransition] = useState({
    pending: false,
    error: "",
  })
  const [prefetchedWishlistItems, setPrefetchedWishlistItems] = useState(null)
  const [announcementsOpen, setAnnouncementsOpen] = useState(false)
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(false)

  useEffect(() => {
    // Only update localData if we have actual new content
    // This prevents wiping out the screen when a fetch fails or revalidates
    if (baseData || dynamicData) {
      setLocalData((prev) => {
        const isNotificationsTab = activeTab === "notifications"
        const nextNotifications = dedupeDashboardNotifications(dynamicData?.notifications || prev.notifications)
        const nextUnread = isNotificationsTab ? 0 : (nextNotifications || []).filter((item) => !item.is_read).length

        return {
          ...prev,
          profile: profile || prev.profile,
          ...(baseData || {}),
          ...(dynamicData || {}),
          notifications: nextNotifications,
          unread: nextUnread,
        }
      })
    }
  }, [baseData, dynamicData, profile, activeTab])

  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [searchInputDesktop, setSearchInputDesktop] = useState("")
  const [searchInputMobile, setSearchInputMobile] = useState("")
  const [searchSuggestionsDesktop, setSearchSuggestionsDesktop] = useState([])
  const [searchSuggestionsMobile, setSearchSuggestionsMobile] = useState([])

  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [profileEditForm, setProfileEditForm] = useState({
    full_name: "",
    phone: "",
    city_id: "",
    area_id: "",
  })
  const [profileEditAreas, setProfileEditAreas] = useState([])
  const [profileEditCities, setProfileEditCities] = useState([])
  const [profileEditError, setProfileEditError] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)

  const [avatarBlob, setAvatarBlob] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState("")
  const [cropModalOpen, setCropModalOpen] = useState(false)

  const cropImageRef = useRef(null)
  const cropperRef = useRef(null)
  const fileInputRef = useRef(null)
  const generatedAvatarPreviewRef = useRef("")

  function clearGeneratedAvatarPreview() {
    if (generatedAvatarPreviewRef.current) {
      URL.revokeObjectURL(generatedAvatarPreviewRef.current)
      generatedAvatarPreviewRef.current = ""
    }
  }

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
    if (suspended) {
      setNotice({
        visible: true,
        type: "error",
        title: "Account restricted",
        message: "Your account has been restricted. Please contact support.",
      })
    }
  }, [authLoading, user, suspended, navigate])

  useEffect(() => {
    if (!notice.visible) return undefined

    const timerId = window.setTimeout(() => {
      setNotice((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    }, 6500)

    return () => window.clearTimeout(timerId)
  }, [notice.visible, notice.title, notice.message, notice.type])

  useEffect(() => {
    function handleDocumentClick(event) {
      const target = event.target
      if (!(target instanceof Element)) return

      if (!target.closest(".desktop-search-wrap")) {
        setSearchSuggestionsDesktop([])
      }
      if (!target.closest(".mobile-search-wrap")) {
        setSearchSuggestionsMobile([])
      }
    }

    document.addEventListener("click", handleDocumentClick)
    return () => document.removeEventListener("click", handleDocumentClick)
  }, [])

  useEffect(() => {
    if (!cropModalOpen || !cropImageRef.current) return undefined

    let cancelled = false

    async function initCropper() {
      const Cropper = await loadCropperAssets()
      if (cancelled || !cropImageRef.current) return

      if (cropperRef.current) {
        cropperRef.current.destroy()
      }

      cropperRef.current = new Cropper(cropImageRef.current, {
        aspectRatio: 1,
        viewMode: 2,
        background: false,
        autoCropArea: 0.9,
        responsive: true,
        dragMode: "move",
        guides: true,
        highlight: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        movable: true,
        zoomOnTouch: true,
        zoomOnWheel: true,
        minCropBoxWidth: 120,
        minCropBoxHeight: 120,
        toggleDragModeOnDblclick: false,
      })
    }

    void initCropper()

    return () => {
      cancelled = true
      if (cropperRef.current) {
        cropperRef.current.destroy()
        cropperRef.current = null
      }
    }
  }, [avatarPreview, cropModalOpen])

  useEffect(() => {
    return () => {
      clearGeneratedAvatarPreview()
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return undefined

    const preloadServicesSection = () => {
      void loadServicesProfileSection()
    }

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadServicesSection, { timeout: 1500 })
      return () => {
        if ("cancelIdleCallback" in window) {
          window.cancelIdleCallback(idleId)
        }
      }
    }

    const timerId = window.setTimeout(preloadServicesSection, 900)
    return () => window.clearTimeout(timerId)
  }, [user?.id])

  function handleLogout() {
    // Wipe the in-memory auth state synchronously so the home page's
    // useAuthSession initializer reads { loading: false, user: null }
    // immediately — no white flash, no spinner cycle.
    clearAuthMemory()
    navigate("/", { replace: true })

    // Clean up local storage and sign out of Supabase in the background.
    // The SIGNED_OUT event still fires, but by then we've already navigated
    // away and there's no mounted ProtectedDashboardRoute to react to it.
    void (async () => {
      try {
        Object.keys(localStorage).forEach((key) => {
          if (key.startsWith("ctm_")) localStorage.removeItem(key)
        })
      } catch {
        // Local storage can be blocked by privacy settings; logout should still continue.
      }
      await signOutUser()
    })()
  }

  const markNotificationsRead = useCallback(async () => {
    if (!user || localData.unread === 0) return

    const nextNotifications = localData.notifications.map((item) => ({
      ...item,
      is_read: true,
    }))

    setLocalData((prev) => ({
      ...prev,
      unread: 0,
      notifications: nextNotifications,
    }))

    // Sync to cache to prevent stale reload
    if (dynamicCacheKey) {
      const currentCache = readCachedFetchStore(dynamicCacheKey)
        if (currentCache?.data) {
          primeCachedFetchStore(dynamicCacheKey, {
            ...currentCache.data,
            notifications: dedupeDashboardNotifications(nextNotifications),
          })
        }
      }

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
  }, [dynamicCacheKey, localData.notifications, localData.unread, user])

  useEffect(() => {
    if (activeTab === "notifications") {
      void markNotificationsRead()
    }
  }, [activeTab, markNotificationsRead])

  function updateDashboardLocation({ tab, view }, { replace = false } = {}) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab) next.set("tab", tab)
        else next.delete("tab")

        if (view) next.set("view", view)
        else next.delete("view")

        return next
      },
      { replace }
    )
  }

  function handleServiceViewChange(nextView) {
    startTransition(() => {
      updateDashboardLocation({
        tab: "services",
        view: nextView === "menu" ? null : nextView,
      })
    })
  }

  async function openWishlistWithTransition() {
    if (!user?.id) return

    const retryAction = () => openWishlistWithTransition()
    beginRouteTransition(retryAction)

    try {
      const cacheKey = buildWishlistCacheKey(user.id)
      const cachedWishlist = readCachedFetchStore(cacheKey)
      const prefetchedItems = await Promise.race([
        Promise.all([
          loadWishlistDashboardView(),
          cachedWishlist?.data
            ? Promise.resolve(cachedWishlist.data)
            : fetchWishlistData({ userId: user.id }),
        ]).then(([, items]) => items),
        new Promise((_, reject) =>
          window.setTimeout(
            () => reject(new Error("Timed out while opening your wishlist.")),
            10000
          )
        ),
      ])

      primeCachedFetchStore(cacheKey, prefetchedItems)
      setPrefetchedWishlistItems(prefetchedItems)

      startTransition(() => {
        updateDashboardLocation({
          tab: "services",
          view: "wishlist",
        })
      })

      window.requestAnimationFrame(() => {
        setRouteTransition({
          pending: false,
          error: "",
        })
      })
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open your wishlist right now. Please try again."
        ),
        retryAction
      )
    }
  }

  function switchScreen(tab) {
    if (tab === "services" || tab === "profile") {
      void loadServicesProfileSection()
    }

    startTransition(() => {
      if (tab === "services") {
        updateDashboardLocation({ tab: "services", view: null })
      } else {
        updateDashboardLocation({ tab, view: null })
      }
    })

    if (tab === "notifications") {
      markNotificationsRead()
    }
  }

  useEffect(() => {
    setNotice((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    setProfileEditError("")
    if (serviceView !== "wishlist") {
      setPrefetchedWishlistItems(null)
    }
  }, [activeTab, serviceView, user?.id])

  // Updated purely to rely on our new isolated shopData hook
  function handleShopClick() {
    const entityName = shopData?.is_service ? "service" : "shop"
    const entityTitle = shopData?.is_service ? "Service" : "Shop"

    if (!shopData) {
      if (!canRegisterShop || shopLoading || shopMeta.status === "locked") {
        setNotice({
          visible: true,
          type: "warning",
          title: "Status still syncing",
          message: "We could not confirm your shop status yet. Please check your connection and try again.",
        })
        return
      }
      void openDashboardRouteWithTransition("/shop-registration")
      return
    }

    if (shopData.is_open === false) {
      setNotice({
        visible: true,
        type: "error",
        title: `${entityTitle} access restricted`,
        message: `Your ${entityName} access has been restricted. Please contact support.`,
      })
      return
    }

    if (shopData.status === "pending") {
      setNotice({
        visible: true,
        type: "warning",
        title: "Application under review",
        message: `Your ${entityName} application is under review. We will notify you once staff completes the check.`,
      })
      return
    }

    if (shopData.status === "rejected") {
      setNotice({
        visible: true,
        type: "warning",
        title: "Correction required",
        message: shopData.rejection_reason || "Please update your details and resubmit.",
      })
      void openDashboardRouteWithTransition(
        `/shop-registration?id=${shopData.id}`
      )
      return
    }

    if (shopData.status === "approved") {
      void openDashboardRouteWithTransition("/vendor-panel")
      return
    }

    void openDashboardRouteWithTransition("/shop-registration")
  }

  const currentProfile = localData.profile || profile
  const marketShopIds = useMemo(() => {
    return new Set(
      (localData.shops || [])
        .map((shop) => normalizePositiveId(shop?.id))
        .filter(Boolean)
    )
  }, [localData.shops])
  const marketShopIdsRef = useRef(marketShopIds)

  useEffect(() => {
    marketShopIdsRef.current = marketShopIds
  }, [marketShopIds])

  useEffect(() => {
    const cityId = currentProfile?.city_id
    if (!user?.id || !cityId) return undefined

    let refreshTimerId = null
    const pendingSegments = new Set()

    // Helper to refresh specific dashboard segments via mutate
    function scheduleRefresh(segment = "dynamic") {
      pendingSegments.add(segment)

      if (refreshTimerId) window.clearTimeout(refreshTimerId)
      refreshTimerId = window.setTimeout(() => {
        const shouldRefreshBase = pendingSegments.has("base")
        const shouldRefreshDynamic = pendingSegments.has("dynamic")
        pendingSegments.clear()

        if (shouldRefreshBase) mutateBase()
        if (shouldRefreshDynamic) mutateDynamic()
      }, 400)
    }

    function shouldRefreshForProduct(payload) {
      const changedShopId = normalizePositiveId(payload.new?.shop_id || payload.old?.shop_id)
      const visibleShopIds = marketShopIdsRef.current

      if (!changedShopId || !visibleShopIds?.size) return true
      return visibleShopIds.has(changedShopId)
    }

    const channel = supabase
      .channel(`dashboard-realtime-${cityId}-${user.id}`)
      // 1. Base Data Changes (Announcements/Categories)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => scheduleRefresh("base")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "categories" },
        () => scheduleRefresh("base")
      )
      // 2. Dynamic Data Changes (Wishlist/Likes/Profile)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wishlist", filter: `user_id=eq.${user.id}` },
        () => scheduleRefresh("dynamic")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_likes", filter: `user_id=eq.${user.id}` },
        () => scheduleRefresh("dynamic")
      )
      // 3. Market changes. Keep broad tables scoped in the handler so unrelated
      // city/product updates do not churn the user's dashboard cache.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shops", filter: `city_id=eq.${cityId}` },
        () => scheduleRefresh("dynamic")
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "featured_city_banners" },
        (payload) => {
          const changedCityId = payload.new?.city_id || payload.old?.city_id
          if (!changedCityId || String(changedCityId) === String(cityId)) {
            scheduleRefresh("dynamic")
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sponsored_products" },
        (payload) => {
          const changedCityId = payload.new?.city_id || payload.old?.city_id
          if (!changedCityId || String(changedCityId) === String(cityId)) {
            scheduleRefresh("dynamic")
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        (payload) => {
          if (shouldRefreshForProduct(payload)) {
            scheduleRefresh("dynamic")
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "staff_discoveries" },
        () => scheduleRefresh("dynamic")
      )
      // 4. Notifications (Direct state update remains for speed, but dynamic mutate ensures sync)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "notifications", 
          filter: `user_id=eq.${user.id}` 
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
             scheduleRefresh("dynamic")
          } else {
            setLocalData((prev) => {
              let nextNotifications = [...prev.notifications]
              if (payload.eventType === 'UPDATE') {
                nextNotifications = nextNotifications.map(n => n.id === payload.new.id ? payload.new : n)
              } else if (payload.eventType === 'DELETE') {
                nextNotifications = nextNotifications.filter(n => n.id !== payload.old.id)
              }
              nextNotifications = dedupeDashboardNotifications(nextNotifications)
              
              return {
                ...prev,
                notifications: nextNotifications,
                unread: nextNotifications.filter(n => !n.is_read).length
              }
            })
          }
        }
      )
      .subscribe((status) => {
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          scheduleRefresh("dynamic")
        }
      })

    return () => {
      if (refreshTimerId) window.clearTimeout(refreshTimerId)
      supabase.removeChannel(channel)
    }
  }, [currentProfile?.city_id, user?.id, mutateBase, mutateDynamic])

  const sortedAreas = useMemo(() => {
    const areas = [...(localData.areas || [])].filter(
      (area) => normalizePositiveId(area?.id) !== null
    )
    const userAreaId = normalizePositiveId(currentProfile?.area_id)

    return areas.sort((a, b) => {
      const normalizedAreaIdA = normalizePositiveId(a?.id)
      const normalizedAreaIdB = normalizePositiveId(b?.id)

      if (normalizedAreaIdA && normalizedAreaIdA === userAreaId) return -1
      if (normalizedAreaIdB && normalizedAreaIdB === userAreaId) return 1
      return a.name.localeCompare(b.name)
    })
  }, [localData.areas, currentProfile?.area_id])

  const groupedShopsByArea = useMemo(() => {
    const shopsByArea = new Map()
    const servicesByArea = new Map()
    const serviceProductsByShopId = new Map()

    ;(localData.serviceProducts || []).forEach((product) => {
      const shopId = normalizePositiveId(product?.shop_id)
      if (!shopId) return
      const current = serviceProductsByShopId.get(shopId) || []
      current.push(product)
      serviceProductsByShopId.set(shopId, current)
    })

    ;(localData.shops || []).forEach((shop) => {
      if (isServiceShop(shop)) return
      const areaId = normalizePositiveId(shop?.area_id)
      if (!areaId) return

      if (!shopsByArea.has(areaId)) {
        shopsByArea.set(areaId, [])
      }
      shopsByArea.get(areaId).push(shop)
    })

    ;(localData.serviceShops || []).forEach((shop) => {
      const areaId = normalizePositiveId(shop?.area_id)
      if (!areaId) return

      if (!servicesByArea.has(areaId)) {
        servicesByArea.set(areaId, [])
      }

      servicesByArea.get(areaId).push({
        shop,
        products: serviceProductsByShopId.get(normalizePositiveId(shop?.id)) || [],
      })
    })

    const interleaveEntries = (shops = [], services = []) => {
      const entries = []
      const maxLength = Math.max(shops.length, services.length)

      for (let index = 0; index < maxLength; index += 1) {
        if (shops[index]) entries.push({ type: "shop", shop: shops[index] })
        if (services[index]) entries.push({ type: "service", provider: services[index] })
      }

      return entries
    }

    return sortedAreas
      .map((area) => {
        const areaId = normalizePositiveId(area?.id)
        const shops = shopsByArea.get(areaId) || []
        const services = servicesByArea.get(areaId) || []

        return {
          area,
          shops,
          services,
          entries: interleaveEntries(shops, services),
        }
      })
      .filter((group) => group.entries.length > 0)
  }, [sortedAreas, localData.shops, localData.serviceShops, localData.serviceProducts])

  useEffect(() => {
    const safeShops = Array.isArray(localData.shops) ? localData.shops : []
    if (!safeShops.length || groupedShopsByArea.length > 0) return

    console.warn("[market-grouping-debug]", {
      shopCount: safeShops.length,
      areaCount: sortedAreas.length,
      sampleShopAreaIds: [...new Set(
        safeShops
          .map((shop) => normalizePositiveId(shop?.area_id))
          .filter(Boolean)
      )].slice(0, 12),
      sampleAreaIds: sortedAreas
        .map((area) => normalizePositiveId(area?.id))
        .filter(Boolean)
        .slice(0, 12),
    })
  }, [groupedShopsByArea.length, localData.shops, sortedAreas])

  const announcementSignature = useMemo(() => {
    const announcements = localData.announcements || []
    if (!announcements.length) return ""

    return announcements
      .slice(0, 8)
      .map((item, index) =>
        [
          item.id || index,
          item.updated_at || item.created_at || "",
          getAnnouncementBody(item).slice(0, 80),
        ].join(":")
      )
      .join("|")
  }, [localData.announcements])

  const announcementSeenKey = useMemo(() => {
    if (!user?.id || !announcementSignature) return ""
    return `${ANNOUNCEMENT_SEEN_KEY_PREFIX}_${user.id}_${announcementSignature}`
  }, [announcementSignature, user?.id])

  useEffect(() => {
    if (!localData.announcements?.length || !announcementSeenKey) {
      setHasUnreadAnnouncements(false)
      return
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        setHasUnreadAnnouncements(
          window.localStorage.getItem(announcementSeenKey) !== "1"
        )
        return
      }
    } catch {
      // If storage is blocked, fall back to showing the badge for the current mount.
    }

    setHasUnreadAnnouncements(true)
  }, [announcementSeenKey, localData.announcements?.length])

  function markAnnouncementsSeen({ close = true } = {}) {
    if (announcementSeenKey) {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(announcementSeenKey, "1")
        }
      } catch {
        // Ignore storage failures; the close action should still work.
      }
    }

    setHasUnreadAnnouncements(false)
    if (close) {
      setAnnouncementsOpen(false)
    }
  }

  function openAnnouncementsModal() {
    retryRouteTransitionRef.current = null
    setRouteTransition({
      pending: false,
      error: "",
    })
    markAnnouncementsSeen({ close: false })
    setAnnouncementsOpen(true)
  }

  function updateSuggestions(value, mode) {
    const q = value.trim().toLowerCase()

    if (q.length < 2) {
      if (mode === "desktop") setSearchSuggestionsDesktop([])
      else setSearchSuggestionsMobile([])
      return
    }

    const suggestions = []

    ;(localData.shops || []).forEach((shop) => {
      if (isServiceShop(shop)) return
      if (shop.name?.toLowerCase().includes(q)) {
        suggestions.push({
          text: shop.name,
          type: "Shop",
          icon: "shop",
        })
      }
    })

    ;(localData.products || []).forEach((product) => {
      const productName = product.name || product.product_name || product.title
      if (productName?.toLowerCase().includes(q)) {
        suggestions.push({
          text: productName,
          type: "Product",
          icon: "product",
        })
      }
    })

    const next = suggestions.slice(0, 6)

    if (mode === "desktop") setSearchSuggestionsDesktop(next)
    else setSearchSuggestionsMobile(next)
  }

  function beginRouteTransition(retryAction = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: true,
      error: "",
    })
  }

  function failRouteTransition(message, retryAction = null, originalError = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: false,
      error: originalError || message,
    })
  }

  function buildSearchTransitionData(value) {
    const trimmed = String(value || "").trim()
    if (!trimmed) {
      return {
        shops: (localData.shops || []).filter((shop) => !isServiceShop(shop)).slice(0, 30),
        allProducts: [],
        matchedProducts: [],
      }
    }

    const q = trimmed.toLowerCase()
    const matchedShops = (localData.shops || [])
      .filter((shop) => !isServiceShop(shop))
      .filter((shop) =>
        [
          shop.name,
          shop.category,
          shop.description,
          shop.unique_id,
          shop.address,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      )
      .slice(0, 50)

    const matchedProducts = (localData.products || [])
      .filter((product) =>
        [product.name, product.description, product.category]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      )
      .slice(0, 50)

    const matchedShopIds = new Set(matchedShops.map((shop) => shop.id))
    const relatedProducts = (localData.products || []).filter((product) =>
      matchedShopIds.has(product.shop_id)
    )

    const allProductsMap = new Map()
    matchedProducts.forEach((product) => {
      allProductsMap.set(product.id, product)
    })
    relatedProducts.forEach((product) => {
      allProductsMap.set(product.id, product)
    })

    return {
      shops: matchedShops,
      allProducts: Array.from(allProductsMap.values()),
      matchedProducts,
    }
  }

  async function openSearchWithTransition(value) {
    const trimmed = String(value || "").trim()
    if (!trimmed) return

    const retryAction = () => openSearchWithTransition(trimmed)
    beginRouteTransition(retryAction)

    try {
      primeCachedFetchStore(
        `search_city_${profile?.city_id || "none"}_q_${trimmed}`,
        buildSearchTransitionData(trimmed)
      )
      await loadSearchPage()
      navigate(`/search?q=${encodeURIComponent(trimmed)}`)
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open search right now. Please try again."
        ),
        retryAction
      )
    }
  }

  async function openAreaWithTransition(id) {
    const resolvedAreaId = normalizePositiveId(id)
    if (!resolvedAreaId || resolvedAreaId === "all") return

    const retryAction = () => openAreaWithTransition(resolvedAreaId)
    beginRouteTransition(retryAction)

    try {
      const areaName =
        localData.areas?.find((area) => String(area.id) === String(resolvedAreaId))?.name || "Area"
      const areaShops = (localData.shops || [])
        .filter((shop) => String(shop.area_id) === String(resolvedAreaId))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      const areaServices = (localData.serviceShops || [])
        .filter((shop) => String(shop.area_id) === String(resolvedAreaId))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      const areaServiceIds = new Set(areaServices.map((shop) => String(shop.id)))
      const areaServiceProducts = (localData.serviceProducts || [])
        .filter((product) => areaServiceIds.has(String(product.shop_id)))
        .slice(0, 300)

      primeCachedFetchStore(`area_shops_${resolvedAreaId}_q_`, {
        areaName,
        shops: areaShops,
        services: areaServices,
        serviceProducts: areaServiceProducts,
      })
      await loadAreaPage()
      navigate(`/area?id=${encodeURIComponent(resolvedAreaId)}`)
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open this area right now. Please try again."
        ),
        retryAction
      )
    }
  }

  async function openCategoryWithTransition(name) {
    if (!name || name === "all") return

    const retryAction = () => openCategoryWithTransition(name)
    beginRouteTransition(retryAction)

    try {
      const categoryShops = (localData.shops || [])
        .filter(
          (shop) =>
            !isServiceShop(shop) &&
            shop.category === name &&
            shop.is_verified &&
            String(shop.city_id) === String(profile?.city_id)
        )
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))

      const categoryShopIds = new Set(categoryShops.map((shop) => shop.id))
      const categoryProducts = (localData.products || [])
        .filter((product) => categoryShopIds.has(product.shop_id) && product.is_available === true)
        .slice(0, 300)

      primeCachedFetchStore(`cat_${name}_city_${profile?.city_id || "none"}`, {
        shops: categoryShops,
        products: categoryProducts,
      })
      await loadCatPage()
      navigate(`/cat?name=${encodeURIComponent(name)}`)
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open this category right now. Please try again."
        ),
        retryAction
      )
    }
  }

  function openServiceCategoryWithTransition(name) {
    if (!name || !isServiceCategory(name)) return

    const retryAction = () => openServiceCategoryWithTransition(name)

    try {
      const now = new Date()
      const serviceShopCandidates =
        (localData.serviceShops || []).length > 0
          ? localData.serviceShops || []
          : localData.shops || []

      const activeCityShops = serviceShopCandidates
        .filter((shop) => isServiceShop(shop) && isActiveMarketplaceShop(shop, profile?.city_id, now))
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))

      const serviceProducts = (localData.serviceProducts || [])
        .filter(
          (product) =>
            product.category === name &&
            product.is_available === true &&
            product.is_approved !== false
        )
        .slice(0, 250)

      const productShopIds = new Set(serviceProducts.map((product) => product.shop_id))
      const providers = activeCityShops
        .filter((shop) => shop.category === name || productShopIds.has(shop.id))
        .map((shop) => ({
          shop,
          products: serviceProducts.filter((product) => product.shop_id === shop.id),
        }))

      const hasDashboardServiceSnapshot =
        (localData.serviceShops || []).length > 0 ||
        (localData.shops || []).length > 0 ||
        (localData.serviceProducts || []).length > 0

      if (providers.length > 0 || hasDashboardServiceSnapshot) {
        primeCachedFetchStore(
          `service_category_${name}_city_${profile?.city_id || "none"}`,
          {
            providers,
          },
          Date.now(),
          { persist: "session" },
        )
      }

      void loadServiceCategoryPage().catch((error) => {
        console.warn("Service category warmup failed:", error)
      })

      navigate(`/service-category?name=${encodeURIComponent(name)}`, {
        state: { fromMarketServiceModal: true },
      })
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open this service category right now. Please try again."
        ),
        retryAction
      )
    }
  }

  async function openDiscoveryWithTransition(id) {
    if (!id) return

    const retryAction = () => openDiscoveryWithTransition(id)
    beginRouteTransition(retryAction)

    try {
      const discoveryData = (localData.staffDiscoveries || []).find(d => String(d.id) === String(id))
      if (discoveryData) {
        primeCachedFetchStore(`discovery_${id}`, discoveryData)
      }
      
      await loadDiscoveryDetailPage()
      navigate(`/discovery?id=${id}`)
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open this discovery right now. Please try again."
        ),
        retryAction
      )
    }
  }

  async function openShopIndexWithTransition() {
    const retryAction = () => openShopIndexWithTransition()
    beginRouteTransition(retryAction)

    try {
      primeCachedFetchStore(
        `dir_city_${profile?.city_id || "none"}_q_`,
        {
          shops: (localData.shops || []).filter((shop) => !isServiceShop(shop)),
          services: localData.serviceShops || [],
          serviceProducts: localData.serviceProducts || [],
        },
        Date.now(),
        { persist: "session" },
      )
      await loadShopIndexPage()
      navigate("/shop-index")
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open the shop directory right now. Please try again."
        ),
        retryAction
      )
    }
  }

  async function openDashboardRouteWithTransition(path) {
    if (!path) return

    const retryAction = () => openDashboardRouteWithTransition(path)
    beginRouteTransition(retryAction)

    try {
      await prepareVendorDashboardEntryTransition({
        path,
        userId: user?.id || null,
        cityId: profile?.city_id || null,
        shopId: shopData?.id || null,
      })
      navigate(path, { state: { fromVendorTransition: true } })
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open that page right now. Please try again."
        ),
        retryAction
      )
    }
  }

  function openNotificationAction(item) {
    const actionPath = String(item?.action_path || "").trim()
    if (!actionPath) return

    if (actionPath.startsWith("/merchant-video-kyc")) {
      const notificationKind = inferDashboardNotificationKind(item)
      const currentKycStatus = String(shopData?.kyc_status || "").trim().toLowerCase()
      const alreadyClosedKycFlow =
        Boolean(shopData?.is_verified) ||
        currentKycStatus === "submitted" ||
        currentKycStatus === "approved"

      if (notificationKind === "kyc_approved" || alreadyClosedKycFlow) {
        void openDashboardRouteWithTransition("/vendor-panel")
        return
      }
    }

    const isVendorFlow =
      actionPath === "/vendor-panel" ||
      actionPath.startsWith("/shop-registration") ||
      actionPath.startsWith("/merchant-video-kyc") ||
      actionPath.startsWith("/remita") ||
      actionPath.startsWith("/service-fee")

    if (isVendorFlow) {
      void openDashboardRouteWithTransition(actionPath)
      return
    }

    navigate(actionPath)
  }

  function executeSearch(mode) {
    const value =
      mode === "desktop" ? searchInputDesktop.trim() : searchInputMobile.trim()

    if (!value) return
    void openSearchWithTransition(value)
  }

  function applySuggestion(text, mode) {
    if (mode === "desktop") {
      setSearchInputDesktop(text)
      setSearchSuggestionsDesktop([])
    } else {
      setSearchInputMobile(text)
      setSearchSuggestionsMobile([])
    }

    void openSearchWithTransition(text)
  }

  function navigateArea(id) {
    void openAreaWithTransition(id)
  }

  function navigateCategory(name) {
    void openCategoryWithTransition(name)
  }

  async function openShopWithTransition(shopId) {
    if (!shopId) return

    const retryAction = () => openShopWithTransition(shopId)
    const cacheKey = buildShopDetailCacheKey(shopId, user?.id || null)
    const cachedEntry = readCachedFetchStore(cacheKey)
    const hasFreshCache =
      cachedEntry && Date.now() - cachedEntry.timestamp <= 1000 * 60 * 5

    beginRouteTransition(retryAction)

    try {
      if (hasFreshCache) {
        await loadShopDetailPage()
        navigate(`/shop-detail?id=${shopId}`, {
          state: { fromMarketTransition: true },
        })
        return
      }

      const transitionResult = await new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error("Timed out while opening the shop."))
        }, 10000)

        Promise.all([
          fetchShopDetailData({
            shopId,
            userId: user?.id || null,
            recordView: false,
          }),
          loadShopDetailPage(),
        ])
          .then(([shopDetailData]) => {
            window.clearTimeout(timeoutId)
            resolve(shopDetailData)
          })
          .catch((error) => {
            window.clearTimeout(timeoutId)
            reject(error)
          })
      })

      primeCachedFetchStore(
        buildShopDetailCacheKey(shopId, user?.id || null),
        transitionResult
      )

      navigate(`/shop-detail?id=${shopId}`, {
        state: { fromMarketTransition: true },
      })
    } catch (error) {
      console.error("Failed to open shop detail", error)
      const safeMessage = isNetworkError(error)
        ? "We could not open this shop right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this shop right now. Please try again."
          )

      failRouteTransition(safeMessage, retryAction)
    }
  }

  async function openServiceProviderWithTransition(shopId, serviceName = "") {
    if (!shopId) return

    const retryAction = () => openServiceProviderWithTransition(shopId, serviceName)
    const cacheKey = `service_provider_${shopId}_${user?.id || "anon"}`
    const cachedEntry = readCachedFetchStore(cacheKey)
    const hasFreshCache =
      cachedEntry && Date.now() - cachedEntry.timestamp <= 1000 * 60 * 5

    beginRouteTransition(retryAction)

    try {
      if (hasFreshCache) {
        await loadServiceProviderPage()
        navigate(`/service-provider?id=${encodeURIComponent(shopId)}&service=${encodeURIComponent(serviceName || "")}`, {
          state: { fromMarketTransition: true },
        })
        return
      }

      const serviceProviderData = await new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          reject(new Error("Timed out while opening the service."))
        }, 10000)

        Promise.all([
          fetchShopDetailData({
            shopId,
            userId: user?.id || null,
            recordView: false,
          }),
          loadServiceProviderPage(),
        ])
          .then(([shopDetailData]) => {
            window.clearTimeout(timeoutId)
            resolve(shopDetailData)
          })
          .catch((error) => {
            window.clearTimeout(timeoutId)
            reject(error)
          })
      })

      primeCachedFetchStore(cacheKey, serviceProviderData, undefined, { persist: "session" })

      navigate(`/service-provider?id=${encodeURIComponent(shopId)}&service=${encodeURIComponent(serviceName || "")}`, {
        state: {
          fromMarketTransition: true,
          prefetchedServiceProviderData: serviceProviderData,
        },
      })
    } catch (error) {
      console.error("Failed to open service provider", error)
      const safeMessage = isNetworkError(error)
        ? "We could not open this service right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this service right now. Please try again."
          )

      failRouteTransition(safeMessage, retryAction)
    }
  }

  async function openProductWithTransition(productId, shopId = "") {
    if (!productId) return

    const retryAction = () => openProductWithTransition(productId, shopId)
    beginRouteTransition(retryAction)

    try {
      const prefetchedProductData = await prepareProductDetailTransition({
        productId,
        userId: user?.id || null,
      })

      navigate(
        `/product-detail?id=${productId}${shopId ? `&shop_src=${shopId}` : ""}`,
        {
          state: {
            fromProductTransition: true,
            prefetchedProductData,
          },
        }
      )
    } catch (error) {
      console.error("Failed to open product detail", error)
      const safeMessage = isNetworkError(error)
        ? "We could not open this product right now. Please try again."
        : getFriendlyErrorMessage(
            error,
            "We could not open this product right now. Please try again."
          )

      failRouteTransition(safeMessage, retryAction, error)
    }
  }

  async function openProfileEdit() {
    const p = localData.profile
    if (!p) return

    clearGeneratedAvatarPreview()
    setProfileEditForm({
      full_name: p.full_name || "",
      phone: p.phone || "",
      city_id: p.city_id ? String(p.city_id) : "",
      area_id: p.area_id ? String(p.area_id) : "",
    })

    setAvatarBlob(null)
    setAvatarPreview(
      p.avatar_url ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          p.full_name || "User"
        )}`
    )

    setProfileEditError("")
    setProfileEditOpen(true)

    const citiesRes = await supabase
      .from("cities")
      .select("id, name")
      .or(`is_open.eq.true,id.eq.${p.city_id || 0}`)
      .order("name")

    if (!citiesRes.error) {
      setProfileEditCities(citiesRes.data || [])
    }

    const areasRes = await supabase
      .from("areas")
      .select("id, name")
      .eq("city_id", p.city_id)
      .order("name")

    if (!areasRes.error) {
      setProfileEditAreas(areasRes.data || [])
    }
  }

  function cancelProfileEdit() {
    clearGeneratedAvatarPreview()
    setProfileEditOpen(false)
    setProfileEditError("")
    setAvatarBlob(null)
  }

  async function handleProfileCityChange(cityId) {
    setProfileEditForm((prev) => ({
      ...prev,
      city_id: cityId,
      area_id: "",
    }))

    if (!cityId) {
      setProfileEditAreas([])
      return
    }

    const res = await supabase
      .from("areas")
      .select("id, name")
      .eq("city_id", cityId)
      .order("name")

    if (!res.error) {
      setProfileEditAreas(res.data || [])
    }
  }

  async function onAvatarSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setProfileEditError("")
    setAvatarBlob(null)

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
      setProfileEditError("Only JPG and PNG images are supported.")
      event.target.value = ""
      return
    }

    if (file.size > MAX_SOURCE_FILE_SIZE) {
      setProfileEditError("Image is too large. Please use a file under 10MB.")
      event.target.value = ""
      return
    }

    try {
      const fallbackBlob = await buildCompressedAvatarBlobFromFile(file)

      if (!fallbackBlob) {
        setProfileEditError("Could not process this image. Please try another JPG or PNG file.")
        event.target.value = ""
        return
      }

      if (fallbackBlob.size > MAX_FILE_SIZE) {
        setProfileEditError(
          `Image is too large (${Math.round(
            fallbackBlob.size / 1024
          )}KB). Maximum allowed size is ${formatBytes(MAX_FILE_SIZE)} for JPG/PNG avatars.`
        )
        event.target.value = ""
        return
      }

      // Keep an upload-ready blob even if the user closes the crop modal.
      setAvatarBlob(fallbackBlob)
    } catch (error) {
      setProfileEditError(getFriendlyErrorMessage(error, "Could not process this image. Please retry."))
      event.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onerror = () => {
      setProfileEditError("Could not read this file. Please try another JPG or PNG image.")
      event.target.value = ""
    }
    reader.onload = (e) => {
      if (e.target?.result) {
        setAvatarPreview(e.target.result)
        setCropModalOpen(true)
      }
      event.target.value = ""
    }
    reader.readAsDataURL(file)
  }

  function closeAvatarCropModal() {
    setCropModalOpen(false)
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not process the selected image."))
            return
          }
          resolve(blob)
        },
        type,
        quality
      )
    })
  }

  async function buildCompressedAvatarBlobFromFile(file) {
    const imageUrl = URL.createObjectURL(file)

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () =>
          reject(new Error("Could not load the selected image. Please try another file."))
        img.src = imageUrl
      })

      const longestEdge = Math.max(image.naturalWidth || 0, image.naturalHeight || 0)
      if (!longestEdge) {
        throw new Error("Selected image is invalid.")
      }

      let smallestBlob = null

      for (const targetLongestEdge of AVATAR_WIDTH_STEPS) {
        const ratio = Math.min(1, targetLongestEdge / longestEdge)
        const width = Math.max(1, Math.round(image.naturalWidth * ratio))
        const height = Math.max(1, Math.round(image.naturalHeight * ratio))

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext("2d")
        if (!context) continue

        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = "high"
        context.drawImage(image, 0, 0, width, height)

        for (const quality of AVATAR_QUALITY_STEPS) {
          const nextBlob = await canvasToBlob(canvas, "image/jpeg", quality)
          if (!smallestBlob || nextBlob.size < smallestBlob.size) {
            smallestBlob = nextBlob
          }

          if (nextBlob.size <= MAX_FILE_SIZE) {
            return nextBlob
          }
        }
      }

      return smallestBlob
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  }

  function setGeneratedAvatarPreview(blob) {
    if (generatedAvatarPreviewRef.current) {
      URL.revokeObjectURL(generatedAvatarPreviewRef.current)
    }

    const previewUrl = URL.createObjectURL(blob)
    generatedAvatarPreviewRef.current = previewUrl
    setAvatarPreview(previewUrl)
  }

  function isAvatarColumnMissingError(error) {
    const message = String(error?.message || "").toLowerCase()
    const details = String(error?.details || "").toLowerCase()
    const hint = String(error?.hint || "").toLowerCase()
    return (
      (message.includes("avatar_url") && message.includes("column")) ||
      (details.includes("avatar_url") && details.includes("column")) ||
      (hint.includes("avatar_url") && hint.includes("column"))
    )
  }

  function extractAvatarStoragePath(value) {
    if (!value || typeof value !== "string") return null
    const cleaned = value.split("?")[0]

    if (!cleaned.startsWith("http")) {
      return cleaned
    }

    const match = cleaned.match(
      /\/storage\/v1\/object\/(?:public|authenticated|sign)\/avatars\/(.+)$/i
    )

    return match?.[1] || null
  }

  function formatSupabaseError(error, fallback = "Unexpected error") {
    return getFriendlyErrorMessage(error, fallback)
  }

  async function hasAvatarColumnInProfiles() {
    if (!user?.id) return false

    const probe = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .eq("id", user.id)
      .maybeSingle()

    if (probe.error) {
      if (isAvatarColumnMissingError(probe.error)) {
        return false
      }

      const fromCurrentProfile = Boolean(
        currentProfile &&
          Object.prototype.hasOwnProperty.call(currentProfile, "avatar_url")
      )

      console.warn(
        "Could not verify profiles.avatar_url explicitly; falling back to loaded profile shape.",
        probe.error
      )
      return fromCurrentProfile
    }

    return Boolean(
      probe.data &&
        Object.prototype.hasOwnProperty.call(probe.data, "avatar_url")
    )
  }

  function getAvatarUploadFailureMessage(uploadErrors) {
    const combined = uploadErrors
      .map(({ filePath, error, stage }) => {
        const label = stage ? `${stage} ${filePath}` : filePath
        return `${label}: ${formatSupabaseError(error, "Upload failed")}`
      })
      .join(" | ")

    const normalized = combined.toLowerCase()

    if (
      normalized.includes("row-level security") ||
      normalized.includes("not allowed") ||
      normalized.includes("permission denied")
    ) {
      return `Avatar upload was blocked by storage permissions (RLS). Please allow authenticated users to upload into their folder in the '${AVATAR_BUCKET}' bucket. ${combined}`
    }

    if (normalized.includes("bucket") && normalized.includes("not found")) {
      return `Avatar upload failed because the '${AVATAR_BUCKET}' bucket was not found.`
    }

    return `Could not upload avatar. ${combined}`
  }

  async function buildCompressedAvatarBlob() {
    const cropper = cropperRef.current
    if (!cropper) return null

    let smallestBlob = null

    for (const width of AVATAR_WIDTH_STEPS) {
      const canvas = cropper.getCroppedCanvas({
        width,
        height: width,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      })

      if (!canvas) continue

      for (const quality of AVATAR_QUALITY_STEPS) {
        const nextBlob = await canvasToBlob(canvas, "image/jpeg", quality)
        if (!smallestBlob || nextBlob.size < smallestBlob.size) {
          smallestBlob = nextBlob
        }

        if (nextBlob.size <= MAX_FILE_SIZE) {
          return nextBlob
        }
      }
    }

    return smallestBlob
  }

  async function applyAvatarCrop() {
    if (!cropperRef.current) return

    try {
      const blob = await buildCompressedAvatarBlob()
      if (!blob) {
        setProfileEditError("Could not process this image. Please try another JPG or PNG file.")
        return
      }

      if (blob.size > MAX_FILE_SIZE) {
        setProfileEditError(
          `Image is too large (${Math.round(
            blob.size / 1024
          )}KB). Maximum allowed size is ${formatBytes(MAX_FILE_SIZE)} for JPG/PNG avatars.`
        )
        return
      }

      setAvatarBlob(blob)
      setGeneratedAvatarPreview(blob)
      setCropModalOpen(false)
      setProfileEditError("")
    } catch (error) {
      setProfileEditError(getFriendlyErrorMessage(error, "Could not process the selected image. Please retry."))
    }
  }

  async function uploadAvatarProcess() {
    if (!avatarBlob || !user) {
      return {
        avatarUrl: localData.profile?.avatar_url || null,
        uploadedPath: null,
        oldPath: extractAvatarStoragePath(localData.profile?.avatar_url),
      }
    }

    const oldPath = extractAvatarStoragePath(localData.profile?.avatar_url)

    const timestamp = Date.now()
    const uploadPaths = [
      `${user.id}/avatar_${timestamp}.jpg`,
      `${user.id}_avatar_${timestamp}.jpg`,
    ]
    const uploadErrors = []

    for (const filePath of uploadPaths) {
      let uploadRes
      try {
        uploadRes = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(filePath, avatarBlob, {
            contentType: "image/jpeg",
            upsert: false,
            cacheControl: "31536000",
          })
      } catch (error) {
        uploadErrors.push({
          filePath,
          stage: "upload",
          error,
        })
        continue
      }

      if (!uploadRes.error) {
        const publicUrl = supabase.storage
          .from(AVATAR_BUCKET)
          .getPublicUrl(filePath).data.publicUrl

        if (!publicUrl) {
          uploadErrors.push({
            filePath,
            stage: "url",
            error: new Error("Upload succeeded but public URL could not be generated."),
          })
          continue
        }

        return {
          avatarUrl: publicUrl,
          uploadedPath: filePath,
          oldPath,
        }
      }

      uploadErrors.push({
        filePath,
        stage: "upload",
        error: uploadRes.error,
      })
    }

    throw new Error(getAvatarUploadFailureMessage(uploadErrors))
  }

  async function saveProfile() {
    if (!user) return

    const fullName = profileEditForm.full_name.trim()
    const phone = profileEditForm.phone.trim()

    if (!fullName) {
      setProfileEditError("Full name is required.")
      return
    }

    if (!profileEditForm.city_id || !profileEditForm.area_id) {
      setProfileEditError("Please select both city and area.")
      return
    }

    try {
      setProfileSaving(true)
      setProfileEditError("")

      const avatarColumnExists = await hasAvatarColumnInProfiles()

      if (avatarBlob && !avatarColumnExists) {
        throw new Error(
          "Schema mismatch detected: profiles.avatar_url column is missing, so avatar uploads cannot be saved to profile records."
        )
      }

      const uploadResult = avatarBlob
        ? await uploadAvatarProcess()
        : {
            avatarUrl: localData.profile?.avatar_url || null,
            uploadedPath: null,
            oldPath: extractAvatarStoragePath(localData.profile?.avatar_url),
          }
      const avatarUrl = uploadResult.avatarUrl

      const updatePayload = {
        full_name: fullName,
        phone,
        city_id: parseInt(profileEditForm.city_id, 10),
        area_id: parseInt(profileEditForm.area_id, 10),
      }

      if (avatarColumnExists) {
        updatePayload.avatar_url = avatarUrl
      }

      const res = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", user.id)

      if (res.error) throw res.error

      if (
        uploadResult.oldPath &&
        uploadResult.uploadedPath &&
        uploadResult.oldPath !== uploadResult.uploadedPath
      ) {
        const cleanupRes = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([uploadResult.oldPath])

        if (cleanupRes.error) {
          console.warn("Old avatar cleanup failed:", cleanupRes.error)
        }
      }

    try {
      localStorage.removeItem("ctm_dashboard_cache")
    } catch {
      // Cache cleanup is best effort; profile refresh should continue.
    }

      const refreshedProfileRes = await supabase
        .from("profiles")
        .select("*, cities(name)")
        .eq("id", user.id)
        .maybeSingle()

      const refreshedProfile =
        refreshedProfileRes.data ||
        {
          ...(localData.profile || {}),
          full_name: fullName,
          phone,
          city_id: parseInt(profileEditForm.city_id, 10),
          area_id: parseInt(profileEditForm.area_id, 10),
          avatar_url: avatarUrl,
        }

      setLocalData((prev) => ({
        ...prev,
        profile: refreshedProfile,
      }))

      setNotice({
        visible: true,
        type: "success",
        title: "Profile updated",
        message: "Your changes have been saved successfully.",
      })
      setProfileEditOpen(false)
      clearGeneratedAvatarPreview()
      setAvatarBlob(null)
      
    } catch (err) {
      const message = formatSupabaseError(err, "Could not save profile. Please retry.")
      console.error("Profile save failed:", err)
      setProfileEditError(message)
      setNotice({
        visible: true,
        type: "error",
        title: "Profile update failed",
        message,
      })
    } finally {
      setProfileSaving(false)
    }
  }

  // Render simple silent loader if profile isn't ready
  if (authLoading || (!profileLoaded && !localData?.profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#E3E6E6]">
        <div className="rounded-2xl bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-slate-100">
          <CTMLoader size="sm" />
        </div>
      </div>
    )
  }

  // Handle data or transition errors
  if ((dataError && !localData?.shops?.length) || routeTransition.error) {
    return (
      <>
        <div className="fixed inset-0 z-[2001] flex items-center justify-center bg-slate-900/10 backdrop-blur-md px-4">
          <div className="w-full max-w-sm rounded-[32px] bg-white p-8 text-center shadow-[0_30px_70px_rgba(0,0,0,0.2)] border border-slate-100">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
              <i className="fa-solid fa-triangle-exclamation text-2xl"></i>
            </div>
            <h2 className="mb-2 text-xl font-black text-slate-900 leading-tight">Connection Issue</h2>
            <p className="mb-8 text-sm font-medium leading-relaxed text-slate-500">
              {getFriendlyErrorMessage(dataError || routeTransition.error, "We couldn't reach the server. Please check your internet and try again.")}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                   if (retryRouteTransitionRef.current) retryRouteTransitionRef.current()
                   else mutateDynamic()
                }}
                className="w-full rounded-2xl bg-slate-900 py-4 text-sm font-black text-white transition hover:bg-slate-800 active:scale-[0.98]"
              >
                Retry Connection
              </button>
              <button
                onClick={() => {
                  setRouteTransition({ pending: false, error: "" })
                  if (dataError) window.location.reload()
                }}
                className="w-full rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200 active:scale-[0.98]"
              >
                Refresh Dashboard
              </button>
            </div>
          </div>
        </div>
        {/* Background Blur UI remains visible to keep context */}
        {localData?.profile && (
          <div className="opacity-40 pointer-events-none grayscale-[40%]">
             <DashboardHeader activeTab={activeTab} currentProfile={currentProfile} user={user} unread={localData.unread} />
          </div>
        )}
      </>
    )
  }

  return (
    <div
      className={`bg-[#E3E6E6] text-[#0F1111] ${
        location.state?.fromDetailTransition ? "ctm-page-enter" : ""
      }`}
    >
      <PageTransitionOverlay visible={baseLoading || dynamicLoading || routeTransition.pending} />

      {/* Online indicator for background revalidation */}
      {(dynamicRevalidating || dynamicOffline) && (
        <div className="fixed top-2 left-1/2 z-[1000] -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-white backdrop-blur-md shadow-lg border border-white/10">
           {dynamicOffline ? (
             <span className="flex items-center gap-2 text-rose-400">
               <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" /> Offline: Showing Cached Data
             </span>
           ) : (
             <span className="flex items-center gap-2 text-sky-400">
               <div className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" /> Syncing Latest Updates...
             </span>
           )}
        </div>
      )}

      <div className={routeTransition.pending ? "pointer-events-none select-none" : ""}>
      <DashboardHeader
        activeTab={activeTab}
        currentProfile={currentProfile}
        user={user}
        sortedAreas={sortedAreas}
        categories={localData.categories}
        shops={localData.shops}
        products={localData.products}
        searchArea="all"
        setSearchArea={navigateArea}
        categoryFilter="all"
        setCategoryFilter={navigateCategory}
        searchInputDesktop={searchInputDesktop}
        setSearchInputDesktop={setSearchInputDesktop}
        searchInputMobile={searchInputMobile}
        setSearchInputMobile={setSearchInputMobile}
        searchSuggestionsDesktop={searchSuggestionsDesktop}
        searchSuggestionsMobile={searchSuggestionsMobile}
        updateSuggestions={updateSuggestions}
        executeSearch={executeSearch}
        applySuggestion={applySuggestion}
        switchScreen={switchScreen}
        unread={localData.unread}
        onShopIndex={openShopIndexWithTransition}
        announcementsCount={
          hasUnreadAnnouncements ? (localData.announcements || []).length : 0
        }
        onOpenAnnouncements={openAnnouncementsModal}
      />

      <main className="content-body mx-auto w-full max-w-[1600px] pb-24 lg:pb-10">
        {activeTab === "market" && (
          <MarketSection
            dashboardData={localData}
            groupedShopsByArea={groupedShopsByArea}
            navigateCategory={navigateCategory}
            onOpenShop={openShopWithTransition}
            onOpenServiceProvider={openServiceProviderWithTransition}
            onOpenProduct={openProductWithTransition}
            onOpenArea={openAreaWithTransition}
            onOpenDiscovery={openDiscoveryWithTransition}
            onOpenServiceCategory={openServiceCategoryWithTransition}
            loading={dynamicLoading && !localData?.shops?.length}
            error={dataError}
            onRetry={mutateDynamic}
            promoBanner={<PromoAlertBanner />}
          />
        )}
        {activeTab === "services" && (
          <Suspense fallback={<DashboardSectionFallback label="Loading dashboard tools..." />}>
            <ServicesProfileSection
              mode="services"
              serviceView={serviceView}
              setServiceView={handleServiceViewChange}
              user={user}
              currentProfile={currentProfile}
              profileEditOpen={profileEditOpen}
              openProfileEdit={openProfileEdit}
              cancelProfileEdit={cancelProfileEdit}
              handleLogout={handleLogout}
              handleShopClick={handleShopClick}
              shopCardMeta={shopMeta} /* PASSED THE ISOLATED META HERE */
              wishlistCount={localData.wishlistCount}
              prefetchedWishlistItems={prefetchedWishlistItems}
              onOpenWishlist={openWishlistWithTransition}
              onOpenProduct={openProductWithTransition}
              profileEditForm={profileEditForm}
              setProfileEditForm={setProfileEditForm}
              profileEditCities={profileEditCities}
              profileEditAreas={profileEditAreas}
              profileEditError={profileEditError}
              profileSaving={profileSaving}
              handleProfileCityChange={handleProfileCityChange}
              saveProfile={saveProfile}
              fileInputRef={fileInputRef}
              avatarPreview={avatarPreview}
              onAvatarSelect={onAvatarSelect}
              cropModalOpen={cropModalOpen}
              cropImageRef={cropImageRef}
              closeAvatarCropModal={closeAvatarCropModal}
              applyAvatarCrop={applyAvatarCrop}
            />
          </Suspense>
        )}

        {activeTab === "profile" && (
          <Suspense fallback={<DashboardSectionFallback label="Loading your profile..." />}>
            <ServicesProfileSection
              mode="profile"
              serviceView={serviceView}
              setServiceView={handleServiceViewChange}
              user={user}
              currentProfile={currentProfile}
              profileEditOpen={profileEditOpen}
              openProfileEdit={openProfileEdit}
              cancelProfileEdit={cancelProfileEdit}
              handleLogout={handleLogout}
              handleShopClick={handleShopClick}
              shopCardMeta={shopMeta} /* PASSED THE ISOLATED META HERE */
              wishlistCount={localData.wishlistCount}
              prefetchedWishlistItems={prefetchedWishlistItems}
              onOpenWishlist={openWishlistWithTransition}
              onOpenProduct={openProductWithTransition}
              profileEditForm={profileEditForm}
              setProfileEditForm={setProfileEditForm}
              profileEditCities={profileEditCities}
              profileEditAreas={profileEditAreas}
              profileEditError={profileEditError}
              profileSaving={profileSaving}
              handleProfileCityChange={handleProfileCityChange}
              saveProfile={saveProfile}
              fileInputRef={fileInputRef}
              avatarPreview={avatarPreview}
              onAvatarSelect={onAvatarSelect}
              cropModalOpen={cropModalOpen}
              cropImageRef={cropImageRef}
              closeAvatarCropModal={closeAvatarCropModal}
              applyAvatarCrop={applyAvatarCrop}
            />
          </Suspense>
        )}

        {activeTab === "notifications" && (
          <NotificationsSection
            notifications={localData.notifications}
            onOpenNotification={openNotificationAction}
          />
        )}
      </main>
      </div>
      <DashboardAnnouncementsModal
        announcements={localData.announcements || []}
        open={announcementsOpen}
        onClose={() => markAnnouncementsSeen()}
      />
    </div>
  )
}

export default UserDashboard
