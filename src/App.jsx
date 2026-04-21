import { Suspense, lazy, useCallback, useEffect, useState } from "react"
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from "react-router-dom"

import useAuthSession from "./hooks/useAuthSession"
import CompleteProfileModal from "./components/auth/CompleteProfileModal"
import OnlineRouteGuard from "./components/common/OnlineRouteGuard"
import SiteVisitTracker from "./components/common/SiteVisitTracker"
import AppErrorBoundary from "./components/common/AppErrorBoundary"
import GlobalErrorScreen from "./components/common/GlobalErrorScreen"
import NetworkStatusScreen from "./components/common/NetworkStatusScreen"
import { PageLoadingScreen } from "./components/common/PageStatusScreen"
import { isProfileComplete, signOutUser } from "./lib/auth"
import SubscriptionGuard from "./components/auth/SubscriptionGuard" 
import Home from "./pages/Home"
import { forceFreshAppReload, isChunkLoadFailure } from "./lib/runtimeRecovery"
import { useVersionCheck } from "./hooks/useVersionCheck"

function ChunkRouteFallback({ pageLabel = "this page" }) {
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === "undefined") return false
    return !navigator.onLine
  })
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
    forceFreshAppReload({ reason: "chunk", manual: forceManual })
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
      forceFreshAppReload({ reason: "chunk", manual: false })
    }, 700)

    return () => window.clearTimeout(timer)
  }, [isOffline, retryKey, retryPage])

  if (isOffline) {
    return (
      <NetworkStatusScreen
        title="No internet connection"
        message={`CTMerchant could not finish opening ${pageLabel}. Reconnect and we will retry automatically.`}
        reconnectMessage="Connection restored. Reopening CTMerchant now."
        onRetry={() => retryPage(true)}
        onBack={() => {
          if (typeof window === "undefined") return
          if (window.history.length > 1) {
            window.history.back()
            return
          }
          window.location.assign("/")
        }}
      />
    )
  }

  return (
    <GlobalErrorScreen
      error={new Error(`Failed to load ${pageLabel}`)}
      title="Website update in progress"
      message="A fresh version of CTMerchant is available. Retry will safely reload the latest files."
      onRetry={() => retryPage(true)}
      onBack={() => {
        if (typeof window === "undefined") return
        if (window.history.length > 1) {
          window.history.back()
          return
        }
        window.location.assign("/")
      }}
    />
  )
}

function isHardReloadNavigation() {
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return false
  }

  try {
    const navigationEntries = performance.getEntriesByType("navigation")
    const entry = Array.isArray(navigationEntries) ? navigationEntries[0] : null
    if (entry?.type) {
      return entry.type === "reload"
    }
  } catch {
    // Fall back below.
  }

  const legacyNavigation = performance.navigation
  return legacyNavigation?.type === 1
}

// --- NEW HELPER: Transparently retries the import ---
const retryImport = async (importer, retries = 3, interval = 1000) => {
  try {
    return await importer()
  } catch (error) {
    // If we are out of retries, or it's not a chunk error, throw it up the chain
    if (retries === 0 || !isChunkLoadFailure(error)) {
      throw error
    }
    // Wait for the interval (1 second), then recursively try again
    await new Promise((res) => setTimeout(res, interval))
    return retryImport(importer, retries - 1, interval)
  }
}

// --- UPDATED: Uses the retry helper before falling back ---
function resilientLazy(importer, options = {}) {
  return lazy(async () => {
    try {
      // Attempt to load the chunk with 3 invisible retries
      return await retryImport(importer, 3, 1000)
    } catch (error) {
      // If it STILL fails after 3 retries, catch it and use your existing fallback
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
const loadStaffPayments = () => import("./pages/staff/StaffPayments")
const loadStaffFeaturedCityBanners = () => import("./pages/staff/StaffFeaturedCityBanners")
const loadStaffSponsoredProducts = () => import("./pages/staff/StaffSponsoredProducts")
const loadStaffDiscoveries = () => import("./pages/staff/StaffDiscoveries")
const loadStaffIDGenerator = () => import("./pages/staff/StaffIDGenerator")
const loadStaffInbox = () => import("./pages/staff/StaffInbox")
const loadStaffSecurityRadar = () => import("./pages/staff/StaffSecurityRadar")
const loadStaffProducts = () => import("./pages/staff/StaffProducts")
const loadStaffShopContent = () => import("./pages/staff/StaffShopContent")
const loadStaffAnnouncements = () => import("./pages/staff/StaffAnnouncements")
const loadStaffNotifications = () => import("./pages/staff/StaffNotifications")
const loadUserDashboard = () => import("./pages/UserDashboard")
const loadShopRegistration = () => import("./pages/ShopRegistration")
const loadArea = () => import("./pages/Area")
const loadCat = () => import("./pages/Cat")
const loadSearch = () => import("./pages/Search")
const loadDiscoveryDetail = () => import("./pages/DiscoveryDetail")
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
const StaffPayments = resilientLazy(loadStaffPayments, { pageLabel: "staff payments" })
const StaffFeaturedCityBanners = resilientLazy(loadStaffFeaturedCityBanners, { pageLabel: "featured city banners" })
const StaffSponsoredProducts = resilientLazy(loadStaffSponsoredProducts, { pageLabel: "sponsored products studio" })
const StaffDiscoveries = resilientLazy(loadStaffDiscoveries, { pageLabel: "market discoveries" })
const StaffIDGenerator = resilientLazy(loadStaffIDGenerator, { pageLabel: "staff ID generator" })
const StaffInbox = resilientLazy(loadStaffInbox, { pageLabel: "staff inbox" })
const StaffSecurityRadar = resilientLazy(loadStaffSecurityRadar, { pageLabel: "security radar" })
const StaffProducts = resilientLazy(loadStaffProducts, { pageLabel: "product moderation" })
const StaffShopContent = resilientLazy(loadStaffShopContent, { pageLabel: "shop content moderation" })
const StaffAnnouncements = resilientLazy(loadStaffAnnouncements, { pageLabel: "city announcements" })
const StaffNotifications = resilientLazy(loadStaffNotifications, { pageLabel: "targeted notifications" })
const UserDashboard = resilientLazy(loadUserDashboard, { pageLabel: "user dashboard" })
const ShopRegistration = resilientLazy(loadShopRegistration, { pageLabel: "shop registration" })
const Area = resilientLazy(loadArea, { pageLabel: "area view" })
const Cat = resilientLazy(loadCat, { pageLabel: "category view" })
const Search = resilientLazy(loadSearch, { pageLabel: "search" })
const DiscoveryDetail = resilientLazy(loadDiscoveryDetail, { pageLabel: "discovery detail" })
const ShopDetail = resilientLazy(loadShopDetail, { pageLabel: "shop view" })

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
const MerchantPromoBanner = resilientLazy(loadMerchantPromoBanner, { pageLabel: "promo banner studio" })
const MerchantAnalytics = resilientLazy(loadMerchantAnalytics, { pageLabel: "merchant analytics" })
const MerchantPayment = resilientLazy(loadMerchantPayment, { pageLabel: "payment page" })
const MerchantServiceFee = resilientLazy(loadMerchantServiceFee, { pageLabel: "service fee page" })
const MerchantVideoKYC = resilientLazy(loadMerchantVideoKYC, { pageLabel: "video verification" })

function RouteLoadingScreen({
  title = "Loading your page",
  message = "Please wait while we prepare the next screen.",
}) {
  const isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false

  if (isHardReloadNavigation() && isOffline) {
    return (
      <NetworkStatusScreen
        title="Waiting for internet"
        message="CTMerchant is installed on this device, but this screen still needs internet to finish loading."
        reconnectMessage="Connection restored. Opening CTMerchant again."
        onRetry={() => {
          if (typeof window === "undefined") return
          window.location.reload()
        }}
        onBack={() => {
          if (typeof window === "undefined") return
          if (window.history.length > 1) {
            window.history.back()
            return
          }
          window.location.assign("/")
        }}
      />
    )
  }

  if (isHardReloadNavigation()) {
    return null
  }

  return <PageLoadingScreen title={title} message={message} />
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

function ProtectedStaffRoute({ children }) {
  const { loading, user, profile, profileLoaded } = useAuthSession()

  if (loading || (user && !profileLoaded)) {
    return <RouteLoadingScreen title="Accessing staff portal" message="Verifying credentials..." />
  }

  const authorizedRoles = ["super_admin", "city_admin", "staff", "director"];
  if (!user || !profile?.role || !authorizedRoles.includes(profile.role)) {
    return <Navigate to="/staff-portal" replace />
  }

  return children
}

function AppShell() {
  const location = useLocation()
  useVersionCheck({ pathname: location.pathname })

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

  return (
    <Suspense
      fallback={
        <RouteLoadingScreen
          title="Loading page"
          message="Please wait while we prepare this screen."
        />
      }
    >
      <SiteVisitTracker />
      <Routes>
        {/* PUBLIC ROUTES */}
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/services" element={<Services />} />
        <Route path="/affiliate" element={<Affiliate />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/contact" element={<Contact />} />
        
        {/* --- STAFF ROUTES --- */}
        <Route path="/staff-portal" element={<StaffPortal />} />
        <Route path="/staff-dashboard" element={<ProtectedStaffRoute><StaffDashboard /></ProtectedStaffRoute>} />
        <Route path="/staff-traffic" element={<ProtectedStaffRoute><StaffTraffic /></ProtectedStaffRoute>} />
        <Route path="/staff-users" element={<ProtectedStaffRoute><StaffUsers /></ProtectedStaffRoute>} />
        <Route path="/staff-community" element={<ProtectedStaffRoute><StaffCommunity /></ProtectedStaffRoute>} />
        <Route path="/staff-verifications" element={<ProtectedStaffRoute><StaffVerifications /></ProtectedStaffRoute>} />
        <Route path="/staff-payments" element={<ProtectedStaffRoute><StaffPayments /></ProtectedStaffRoute>} />
        <Route path="/staff-city-banners" element={<ProtectedStaffRoute><StaffFeaturedCityBanners /></ProtectedStaffRoute>} />
        <Route path="/staff-sponsored-products" element={<ProtectedStaffRoute><StaffSponsoredProducts /></ProtectedStaffRoute>} />
        <Route path="/staff-discoveries" element={<ProtectedStaffRoute><StaffDiscoveries /></ProtectedStaffRoute>} />
        <Route path="/staff-issue-id" element={<ProtectedStaffRoute><StaffIDGenerator /></ProtectedStaffRoute>} />
        <Route path="/staff-studio" element={<ProtectedStaffRoute><ImageOptimizer /></ProtectedStaffRoute>} />
        <Route path="/staff-inbox" element={<ProtectedStaffRoute><StaffInbox /></ProtectedStaffRoute>} />
        <Route path="/staff-security-radar" element={<ProtectedStaffRoute><StaffSecurityRadar /></ProtectedStaffRoute>} />
        <Route path="/staff-products" element={<ProtectedStaffRoute><StaffProducts /></ProtectedStaffRoute>} />
        <Route path="/staff-shop-content" element={<ProtectedStaffRoute><StaffShopContent /></ProtectedStaffRoute>} />
        <Route path="/staff-announcements" element={<ProtectedStaffRoute><StaffAnnouncements /></ProtectedStaffRoute>} />
        <Route path="/staff-notifications" element={<ProtectedStaffRoute><StaffNotifications /></ProtectedStaffRoute>} />

        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/create-account" element={<CreateAccount />} />

        <Route
          path="/reposearch"
          element={<MerchantDiscovery />}
        />
        <Route
          path="/discovery"
          element={<DiscoveryDetail />}
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
  )
}

function App() {
  return (
    <>
      <AppShell />
    </>
  )
}

export default App
