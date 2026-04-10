import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Routes, Route, Link, Navigate, matchPath, useLocation, useNavigate } from "react-router-dom"

import useAuthSession from "./hooks/useAuthSession"
import CompleteProfileModal from "./components/auth/CompleteProfileModal"
import OnlineRouteGuard from "./components/common/OnlineRouteGuard"
import SiteVisitTracker from "./components/common/SiteVisitTracker"
import RetryingNotice from "./components/common/RetryingNotice"
import AppErrorBoundary from "./components/common/AppErrorBoundary"
import PageTransitionOverlay from "./components/common/PageTransitionOverlay"
import { PageLoadingScreen } from "./components/common/PageStatusScreen"
import { isProfileComplete, signOutUser } from "./lib/auth"
import SubscriptionGuard from "./components/auth/SubscriptionGuard" 
import Home from "./pages/Home"

function isChunkLoadFailure(error) {
  const message = String(error?.message || error || "").toLowerCase()
  return (
    message.includes("error loading dynamically imported module") ||
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("failed to load module script") ||
    message.includes("chunkloaderror") ||
    message.includes("loading chunk")
  )
}

function ChunkRouteFallback({ pageLabel = "this page" }) {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === "undefined") return false
    return !navigator.onLine
  })
  const [isRetrying, setIsRetrying] = useState(false)
  const retryKey =
    typeof window === "undefined"
      ? ""
      : `ctm_chunk_retry_${window.location.pathname}_${pageLabel.replace(/\s+/g, "_")}`

  const retryPage = useCallback((forceManual = false) => {
    if (typeof window === "undefined") return
    if (forceManual && retryKey) {
      try {
        window.sessionStorage.removeItem(retryKey)
      } catch (error) {
        console.warn("Could not clear chunk retry key", error)
      }
    }
    setIsRetrying(true)
    window.location.reload()
  }, [retryKey])

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false)
    }
    function handleOffline() {
      setIsOffline(true)
    }

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || isOffline || !retryKey) return

    let alreadyRetried = false
    try {
      alreadyRetried = window.sessionStorage.getItem(retryKey) === "1"
    } catch (error) {
      console.warn("Could not read chunk retry key", error)
    }

    if (alreadyRetried) return

    try {
      window.sessionStorage.setItem(retryKey, "1")
    } catch (error) {
      console.warn("Could not write chunk retry key", error)
    }

    const timer = window.setTimeout(() => {
      retryPage(false)
    }, 700)

    return () => window.clearTimeout(timer)
  }, [isOffline, retryKey, retryPage])

  return (
    <RetryingNotice
      message={
        isRetrying
          ? "Network unavailable, retrying..."
          : isOffline
            ? "Network unavailable, retrying..."
            : "Something happened, retrying..."
      }
    />
  )
}

function resilientLazy(importer, options = {}) {
  return lazy(async () => {
    try {
      return await importer()
    } catch (error) {
      if (!isChunkLoadFailure(error)) throw error

      const pageLabel = options.pageLabel || "this page"
      return {
        default: function ResilientChunkFallback() {
          return <ChunkRouteFallback pageLabel={pageLabel} />
        },
      }
    }
  })
}

// --- IMPORTS ---
const loadAbout = () => import("./pages/About")
const loadServices = () => import("./pages/Services")
const loadAffiliate = () => import("./pages/Affiliate")
const loadCareers = () => import("./pages/Careers")
const loadContact = () => import("./pages/Contact")
const loadStaffPortal = () => import("./pages/StaffPortal")
const loadPrivacy = () => import("./pages/Privacy")
const loadTerms = () => import("./pages/Terms")
const loadCreateAccount = () => import("./pages/CreateAccount")
const loadStaffDashboard = () => import("./pages/StaffDashboard")
const loadStaffTraffic = () => import("./pages/staff/StaffTraffic")
const loadStaffUsers = () => import("./pages/staff/StaffUsers")
const loadStaffCommunity = () => import("./pages/staff/StaffCommunity")
const loadStaffVerifications = () => import("./pages/staff/StaffVerifications")
const loadStaffIDGenerator = () => import("./pages/staff/StaffIDGenerator")
const loadStaffInbox = () => import("./pages/staff/StaffInbox")
const loadUserDashboard = () => import("./pages/UserDashboard")
const loadShopRegistration = () => import("./pages/ShopRegistration")
const loadArea = () => import("./pages/Area")
const loadCat = () => import("./pages/Cat")
const loadSearch = () => import("./pages/Search")
const loadShopDetail = () => import("./pages/ShopDetail")
const loadProductDetail = () => import("./pages/ProductDetail")
const loadShopIndex = () => import("./pages/ShopIndex")
const loadMerchantDiscovery = () => import("./pages/MerchantDiscovery")
const loadVendorsPanel = () => import("./pages/VendorsPanel")
const loadImageOptimizer = () => import("./pages/vendors/ImageOptimizer")
const loadAddProduct = () => import("./pages/vendors/AddProduct")
const loadEditProduct = () => import("./pages/vendors/EditProduct")
const loadMerchantProducts = () => import("./pages/vendors/MerchantProducts")
const loadMerchantBanner = () => import("./pages/vendors/MerchantBanner")
const loadMerchantSettings = () => import("./pages/vendors/MerchantSettings")
const loadMerchantNews = () => import("./pages/vendors/MerchantNews")
const loadMerchantPromoBanner = () => import("./pages/vendors/MerchantPromoBanner")
const loadMerchantAnalytics = () => import("./pages/vendors/MerchantAnalytics")
const loadMerchantPayment = () => import("./pages/vendors/MerchantPayment")
const loadMerchantServiceFee = () => import("./pages/vendors/MerchantServiceFee")
const loadMerchantVideoKYC = () => import("./pages/vendors/MerchantVideoKYC")

const About = resilientLazy(loadAbout, { pageLabel: "about" })
const Services = resilientLazy(loadServices, { pageLabel: "services" })
const Affiliate = resilientLazy(loadAffiliate, { pageLabel: "affiliate" })
const Careers = resilientLazy(loadCareers, { pageLabel: "careers" })
const Contact = resilientLazy(loadContact, { pageLabel: "contact" })
const StaffPortal = resilientLazy(loadStaffPortal, { pageLabel: "staff portal" })
const Privacy = resilientLazy(loadPrivacy, { pageLabel: "privacy" })
const Terms = resilientLazy(loadTerms, { pageLabel: "terms" })
const CreateAccount = resilientLazy(loadCreateAccount, { pageLabel: "create account" })
const StaffDashboard = resilientLazy(loadStaffDashboard, { pageLabel: "staff dashboard" })
const StaffTraffic = resilientLazy(loadStaffTraffic, { pageLabel: "staff traffic" })
const StaffUsers = resilientLazy(loadStaffUsers, { pageLabel: "staff users" })
const StaffCommunity = resilientLazy(loadStaffCommunity, { pageLabel: "staff community" })
const StaffVerifications = resilientLazy(loadStaffVerifications, { pageLabel: "staff verifications" })
const StaffIDGenerator = resilientLazy(loadStaffIDGenerator, { pageLabel: "staff ID generator" })
const StaffInbox = resilientLazy(loadStaffInbox, { pageLabel: "staff inbox" })
const UserDashboard = resilientLazy(loadUserDashboard, { pageLabel: "user dashboard" })
const ShopRegistration = resilientLazy(loadShopRegistration, { pageLabel: "shop registration" })
const Area = resilientLazy(loadArea, { pageLabel: "area view" })
const Cat = resilientLazy(loadCat, { pageLabel: "category view" })
const Search = resilientLazy(loadSearch, { pageLabel: "search" })
const ShopDetail = resilientLazy(loadShopDetail, { pageLabel: "shop details" })
const ProductDetail = resilientLazy(loadProductDetail, { pageLabel: "product details" })
const ShopIndex = resilientLazy(loadShopIndex, { pageLabel: "market index" })
const MerchantDiscovery = resilientLazy(loadMerchantDiscovery, { pageLabel: "merchant profile" })
const VendorsPanel = resilientLazy(loadVendorsPanel, { pageLabel: "vendor panel" })
const ImageOptimizer = resilientLazy(loadImageOptimizer, { pageLabel: "image optimizer" })
const AddProduct = resilientLazy(loadAddProduct, { pageLabel: "add product" })
const EditProduct = resilientLazy(loadEditProduct, { pageLabel: "edit product" })
const MerchantProducts = resilientLazy(loadMerchantProducts, { pageLabel: "merchant products" })
const MerchantBanner = resilientLazy(loadMerchantBanner, { pageLabel: "shop banner" })
const MerchantSettings = resilientLazy(loadMerchantSettings, { pageLabel: "merchant settings" })
const MerchantNews = resilientLazy(loadMerchantNews, { pageLabel: "merchant news" })
const MerchantPromoBanner = resilientLazy(loadMerchantPromoBanner, { pageLabel: "promo banner" })
const MerchantAnalytics = resilientLazy(loadMerchantAnalytics, { pageLabel: "merchant analytics" })
const MerchantPayment = resilientLazy(loadMerchantPayment, { pageLabel: "payment page" })
const MerchantServiceFee = resilientLazy(loadMerchantServiceFee, { pageLabel: "service fee page" })
const MerchantVideoKYC = resilientLazy(loadMerchantVideoKYC, { pageLabel: "video verification" })

const ROUTE_PRELOADERS = [
  { path: "/", label: "Home", load: () => Promise.resolve() },
  { path: "/about", label: "About", load: loadAbout },
  { path: "/services", label: "Services", load: loadServices },
  { path: "/affiliate", label: "Affiliate", load: loadAffiliate },
  { path: "/careers", label: "Careers", load: loadCareers },
  { path: "/contact", label: "Contact", load: loadContact },
  { path: "/staff-portal", label: "Staff portal", load: loadStaffPortal },
  { path: "/staff-dashboard", label: "Staff dashboard", load: loadStaffDashboard },
  { path: "/staff-traffic", label: "Staff traffic", load: loadStaffTraffic },
  { path: "/staff-users", label: "Staff users", load: loadStaffUsers },
  { path: "/staff-community", label: "Staff community", load: loadStaffCommunity },
  { path: "/staff-verifications", label: "Staff verifications", load: loadStaffVerifications },
  { path: "/staff-issue-id", label: "Staff ID generator", load: loadStaffIDGenerator },
  { path: "/staff-inbox", label: "Staff inbox", load: loadStaffInbox },
  { path: "/privacy", label: "Privacy", load: loadPrivacy },
  { path: "/terms", label: "Terms", load: loadTerms },
  { path: "/create-account", label: "Create account", load: loadCreateAccount },
  { path: "/reposearch", label: "Merchant profile", load: loadMerchantDiscovery },
  { path: "/shop-detail", label: "Shop details", load: loadShopDetail },
  { path: "/product-detail", label: "Product details", load: loadProductDetail },
  { path: "/user-dashboard", label: "Dashboard", load: loadUserDashboard },
  { path: "/remita", label: "Payment", load: loadMerchantPayment },
  { path: "/merchant-video-kyc", label: "Video verification", load: loadMerchantVideoKYC },
  { path: "/merchant-promo-banner", label: "Promo banner", load: loadMerchantPromoBanner },
  { path: "/merchant-settings", label: "Merchant settings", load: loadMerchantSettings },
  { path: "/merchant-banner", label: "Merchant banner", load: loadMerchantBanner },
  { path: "/merchant-products", label: "Merchant products", load: loadMerchantProducts },
  { path: "/merchant-edit-product", label: "Edit product", load: loadEditProduct },
  { path: "/merchant-add-product", label: "Add product", load: loadAddProduct },
  { path: "/service-fee", label: "Service fee", load: loadMerchantServiceFee },
  { path: "/merchant-analytics", label: "Merchant analytics", load: loadMerchantAnalytics },
  { path: "/merchant-news", label: "Merchant news", load: loadMerchantNews },
  { path: "/shop-registration", label: "Shop registration", load: loadShopRegistration },
  { path: "/vendor-panel", label: "Vendor panel", load: loadVendorsPanel },
  { path: "/area", label: "Area", load: loadArea },
  { path: "/cat", label: "Category", load: loadCat },
  { path: "/search", label: "Search", load: loadSearch },
  { path: "/shop-index", label: "Market", load: loadShopIndex },
]

const DEFAULT_ROUTE_PRELOADER = {
  label: "Page",
  load: () => Promise.resolve(),
}

function getLocationKey(location) {
  return `${location.pathname}${location.search}${location.hash || ""}`
}

function findRoutePreloader(pathname) {
  return (
    ROUTE_PRELOADERS.find((entry) =>
      matchPath({ path: entry.path, end: true }, pathname)
    ) || DEFAULT_ROUTE_PRELOADER
  )
}

function RouteLoadingScreen({
  title = "Loading your page",
  message = "Please wait while we prepare the next screen.",
}) {
  return (
    <div className="min-h-screen bg-[#E3E6E6] px-4 py-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-4 flex items-center justify-between rounded-xl bg-[#131921] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-pulse rounded bg-white/20" />
            <div className="h-5 w-36 animate-pulse rounded bg-white/20" />
          </div>
          <div className="h-6 w-6 animate-pulse rounded bg-white/20" />
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="aspect-video w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="mt-4 h-6 w-52 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-slate-100" />
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="space-y-2">
                <div className="aspect-square animate-pulse rounded-lg bg-slate-100" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>

        <div className="px-2 py-5 text-center">
          <h2 className="text-xl font-black text-slate-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        </div>
      </div>
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <h1 className="mb-4 text-6xl font-black text-pink-600">404</h1>
      <h2 className="mb-2 text-2xl font-bold text-slate-900">Page Not Found</h2>
      <p className="mb-8 max-w-md text-slate-500">
        The page you are looking for does not exist or may have moved.
      </p>
      <Link
        to="/"
        className="rounded-xl bg-pink-600 px-6 py-3 font-bold text-white transition hover:bg-pink-700"
      >
        Return Home
      </Link>
    </div>
  )
}

function SuspendedAccountGate({ onLogout }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-rose-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-3xl text-rose-700">
          !
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-900">Account Restricted</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your account is currently restricted. Please contact support and our team will assist you.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/contact"
            className="flex-1 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
          >
            Contact support
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex-1 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 font-bold text-rose-700 transition hover:bg-rose-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

function ProtectedDashboardRoute({ children }) {
  const navigate = useNavigate()
  const [completedProfileUserId, setCompletedProfileUserId] = useState(null)
  const { loading, user, profile, suspended, isOffline, profileLoaded } = useAuthSession()

  useEffect(() => {
    if (!user || isOffline) return undefined

    let cancelled = false
    const preload = () => {
      if (cancelled) return
      // Vendor routes preload removed to save bandwidth.
      // 90% of standard users don't need vendor scripts downloaded in the background.
    }

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preload, { timeout: 2500 })
      return () => {
        cancelled = true
        if ("cancelIdleCallback" in window) window.cancelIdleCallback(idleId)
      }
    }

    const timerId = window.setTimeout(preload, 700)
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [user, isOffline])

  if (!loading && !user) {
    return <Navigate to="/" replace />
  }

  if (!loading && user && suspended) {
    return (
      <SuspendedAccountGate
        onLogout={async () => {
          await signOutUser()
          navigate("/", { replace: true })
        }}
      />
    )
  }

  if (loading || (user && !profileLoaded && !isOffline)) {
    return (
      <RouteLoadingScreen
        title="Loading dashboard"
        message="Please wait while we prepare your dashboard."
      />
    )
  }

  const needsProfileSetup =
    user &&
    profileLoaded &&
    completedProfileUserId !== user.id &&
    (!profile || !isProfileComplete(profile))

  return (
    <>
      {needsProfileSetup && !isOffline ? (
        <div className="min-h-screen bg-slate-50">
          <CompleteProfileModal
            open={true}
            userId={user.id}
            fullName={user.user_metadata?.full_name || ""}
            onClose={async () => {
              await signOutUser()
              navigate("/", { replace: true })
            }}
            onCompleted={() => {
              setCompletedProfileUserId(user.id)
            }}
          />
        </div>
      ) : (
        <>
          {children}
        </>
      )}
    </>
  )
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const [renderedLocation, setRenderedLocation] = useState(location)
  const [isPageEntering, setIsPageEntering] = useState(false)
  const [transitionState, setTransitionState] = useState({
    pending: false,
    title: "Opening page",
    error: "",
  })
  const activeTransitionRef = useRef(0)
  const attemptedLocationRef = useRef(null)

  const withOnlineGuard = (element, options = {}) => (
    <OnlineRouteGuard {...options}>{element}</OnlineRouteGuard>
  )

  const withProtectedOnlineGuard = (element, options = {}) => (
    <ProtectedDashboardRoute>
      {withOnlineGuard(element, options)}
    </ProtectedDashboardRoute>
  )

  const withProtectedRoute = (element) => (
    <ProtectedDashboardRoute>{element}</ProtectedDashboardRoute>
  )

  const renderedLocationKey = useMemo(
    () => getLocationKey(renderedLocation),
    [renderedLocation]
  )
  const currentLocationKey = useMemo(() => getLocationKey(location), [location])

  useEffect(() => {
    if (currentLocationKey === renderedLocationKey) {
      return
    }

    const targetRoute = findRoutePreloader(location.pathname)

    const transitionId = activeTransitionRef.current + 1
    activeTransitionRef.current = transitionId
    attemptedLocationRef.current = location

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTransitionState({
      pending: true,
      title: `Opening ${targetRoute.label}`,
      error: "",
    })

    const timeoutId = window.setTimeout(() => {
      if (activeTransitionRef.current !== transitionId) return
      setTransitionState({
        pending: false,
        title: `Opening ${targetRoute.label}`,
        error: "We could not load that page right now. Please check your connection and try again.",
      })
      navigate(renderedLocationKey || "/", { replace: true })
    }, 10000)

    Promise.resolve(targetRoute.load())
      .then(() => {
        if (activeTransitionRef.current !== transitionId) return
        window.clearTimeout(timeoutId)
        setRenderedLocation(location)
        setTransitionState({
          pending: false,
          title: `Opening ${targetRoute.label}`,
          error: "",
        })
        setIsPageEntering(true)
      })
      .catch(() => {
        if (activeTransitionRef.current !== transitionId) return
        window.clearTimeout(timeoutId)
        setTransitionState({
          pending: false,
          title: `Opening ${targetRoute.label}`,
          error: "That page failed to load. Please try again.",
        })
        navigate(renderedLocationKey || "/", { replace: true })
      })

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentLocationKey, location, navigate, renderedLocationKey])

  useEffect(() => {
    if (!isPageEntering) return undefined

    const timerId = window.setTimeout(() => {
      setIsPageEntering(false)
    }, 260)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [isPageEntering])

  const retryPendingPage = useCallback(() => {
    const attemptedLocation = attemptedLocationRef.current
    if (!attemptedLocation) return
    setTransitionState((prev) => ({ ...prev, error: "" }))
    navigate(getLocationKey(attemptedLocation), { replace: true })
  }, [navigate])

  return (
    <>
      <SiteVisitTracker />
      <PageTransitionOverlay
        visible={transitionState.pending}
        title={transitionState.title}
        message="Please wait while we get the next screen ready."
        error={transitionState.error}
        onRetry={retryPendingPage}
        onDismiss={() => setTransitionState((prev) => ({ ...prev, error: "" }))}
      />
      <div className={isPageEntering ? "ctm-page-enter" : ""}>
        <Suspense
          fallback={
            <PageLoadingScreen
              title="Loading page"
              message="Please wait while we prepare this screen."
            />
          }
        >
          <Routes location={renderedLocation}>
            {/* PUBLIC ROUTES */}
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/services" element={<Services />} />
            <Route path="/affiliate" element={<Affiliate />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/contact" element={<Contact />} />
            
            {/* --- STAFF ROUTES --- */}
            <Route path="/staff-portal" element={<StaffPortal />} />
            <Route path="/staff-dashboard" element={<StaffDashboard />} />
            <Route path="/staff-traffic" element={<StaffTraffic />} />
            <Route path="/staff-users" element={<StaffUsers />} />
            <Route path="/staff-community" element={<StaffCommunity />} />
            <Route path="/staff-verifications" element={<StaffVerifications />} />
            <Route path="/staff-issue-id" element={<StaffIDGenerator />} />
            <Route path="/staff-studio" element={<ImageOptimizer />} />
            <Route path="/staff-inbox" element={<StaffInbox />} />

            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/create-account" element={<CreateAccount />} />

            <Route
              path="/reposearch"
              element={<MerchantDiscovery />}
            />
            <Route
              path="/shop-detail"
              element={<ShopDetail />}
            />
            <Route
              path="/product-detail"
              element={<ProductDetail />}
            />

            {/* PROTECTED DASHBOARD ROUTES */}
            <Route
              path="/user-dashboard"
              element={
                <ProtectedDashboardRoute>
                  <UserDashboard />
                </ProtectedDashboardRoute>
              }
            />

            <Route
              path="/remita"
              element={withProtectedOnlineGuard(<MerchantPayment />)}
            />

            <Route
              path="/merchant-video-kyc"
              element={withProtectedOnlineGuard(<MerchantVideoKYC />)}
            />

            {/* --- LOCKED PREMIUM ROUTES START HERE --- */}
            <Route
              path="/merchant-promo-banner"
              element={withProtectedOnlineGuard(
                <SubscriptionGuard>
                  <MerchantPromoBanner />
                </SubscriptionGuard>
              )}
            />

            <Route
              path="/merchant-settings"
              element={withProtectedOnlineGuard(
                <SubscriptionGuard>
                  <MerchantSettings />
                </SubscriptionGuard>
              )}
            />

            <Route
              path="/merchant-banner"
              element={withProtectedOnlineGuard(
                <SubscriptionGuard>
                  <MerchantBanner />
                </SubscriptionGuard>
              )}
            />

            <Route
              path="/merchant-products"
              element={withProtectedOnlineGuard(
                <SubscriptionGuard>
                  <MerchantProducts />
                </SubscriptionGuard>
              )}
            />

            <Route
              path="/merchant-edit-product"
              element={withProtectedOnlineGuard(
                <SubscriptionGuard>
                  <EditProduct />
                </SubscriptionGuard>
              )}
            />

            <Route
              path="/merchant-add-product"
              element={withProtectedOnlineGuard(
                <SubscriptionGuard>
                  <AddProduct />
                </SubscriptionGuard>
              )}
            />
            {/* --- LOCKED PREMIUM ROUTES END HERE --- */}

            {/* --- UNLOCKED / FREE ROUTES --- */}
            <Route
              path="/service-fee"
              element={withProtectedOnlineGuard(<MerchantServiceFee />)}
            />

            <Route
              path="/merchant-analytics"
              element={withProtectedOnlineGuard(<MerchantAnalytics />)}
            />

            <Route
              path="/merchant-news"
              element={withProtectedOnlineGuard(<MerchantNews />)}
            />

            <Route
              path="/shop-registration"
              element={withProtectedOnlineGuard(<ShopRegistration />)}
            />

            <Route
              path="/vendor-panel"
              element={withProtectedRoute(<VendorsPanel />)}
            />

            <Route
              path="/area"
              element={withProtectedRoute(<Area />)}
            />

            <Route
              path="/cat"
              element={withProtectedRoute(<Cat />)}
            />

            <Route
              path="/search"
              element={withProtectedRoute(<Search />)}
            />

            <Route
              path="/shop-index"
              element={withProtectedRoute(<ShopIndex />)}
            />

            {/* --- CATCH-ALL 404 ROUTE --- */}
            <Route
              path="*"
              element={<NotFoundPage />}
            />
          </Routes>
        </Suspense>
      </div>
    </>
  )
}

function App() {
  const location = useLocation()

  return (
    <AppErrorBoundary resetKey={`${location.pathname}${location.search}`}>
      <AppShell />
    </AppErrorBoundary>
  )
}

export default App
