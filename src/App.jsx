import { Suspense, lazy, useEffect, useState } from "react"
import { Routes, Route, Link, useNavigate } from "react-router-dom"
import Home from "./pages/Home"
import About from "./pages/About"
import Services from "./pages/Services"
import Affiliate from "./pages/Affiliate"
import Careers from "./pages/Careers"
import Contact from "./pages/Contact"

import StaffPortal from "./pages/StaffPortal"

import Privacy from "./pages/Privacy"
import Terms from "./pages/Terms"
import CreateAccount from "./pages/CreateAccount"

import ProtectedRoute from "./components/auth/ProtectedRoute"
import useAuthSession from "./hooks/useAuthSession"
import CompleteProfileModal from "./components/auth/CompleteProfileModal"
import OnlineRouteGuard from "./components/common/OnlineRouteGuard"
import { isProfileComplete, signOutUser } from "./lib/auth"
import SubscriptionGuard from "./components/auth/SubscriptionGuard" 

function isChunkLoadFailure(error) {
  const message = String(error?.message || error || "").toLowerCase()
  return (
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-lg rounded-[28px] border border-amber-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl text-amber-700">
          !
        </div>
        <h1 className="mt-5 text-3xl font-black text-slate-900">
          {isOffline ? "You are offline" : "Page load interrupted"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {isOffline
            ? `This screen (${pageLabel}) was not fully cached before your connection dropped. Reconnect and reload to continue.`
            : `We could not load assets required for ${pageLabel}. Reload the app to continue.`}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex-1 rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white transition hover:bg-slate-800"
          >
            Reload app
          </button>
          <Link
            to="/"
            className="flex-1 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 font-bold text-amber-800 transition hover:bg-amber-100"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
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
const StaffDashboard = resilientLazy(() => import("./pages/StaffDashboard"), {
  pageLabel: "staff dashboard",
})
const StaffIDGenerator = resilientLazy(() => import("./pages/staff/StaffIDGenerator"), {
  pageLabel: "staff ID generator",
})
const StaffInbox = resilientLazy(() => import("./pages/staff/StaffInbox"), {
  pageLabel: "staff inbox",
})
const UserDashboard = resilientLazy(() => import("./pages/UserDashboard"), {
  pageLabel: "user dashboard",
})
const ShopRegistration = resilientLazy(() => import("./pages/ShopRegistration"), {
  pageLabel: "shop registration",
})
const Area = resilientLazy(() => import("./pages/Area"), { pageLabel: "area view" })
const Cat = resilientLazy(() => import("./pages/Cat"), { pageLabel: "category view" })
const Search = resilientLazy(() => import("./pages/Search"), { pageLabel: "search" })
const ShopDetail = resilientLazy(() => import("./pages/ShopDetail"), {
  pageLabel: "shop details",
})
const ProductDetail = resilientLazy(() => import("./pages/ProductDetail"), {
  pageLabel: "product details",
})
const ShopIndex = resilientLazy(() => import("./pages/ShopIndex"), {
  pageLabel: "market index",
})
const MerchantDiscovery = resilientLazy(() => import("./pages/MerchantDiscovery"), {
  pageLabel: "merchant profile",
})
const VendorsPanel = resilientLazy(() => import("./pages/VendorsPanel"), {
  pageLabel: "vendor panel",
})
const ImageOptimizer = resilientLazy(() => import("./pages/vendors/ImageOptimizer"), {
  pageLabel: "image optimizer",
})
const AddProduct = resilientLazy(() => import("./pages/vendors/AddProduct"), {
  pageLabel: "add product",
})
const EditProduct = resilientLazy(() => import("./pages/vendors/EditProduct"), {
  pageLabel: "edit product",
})
const MerchantProducts = resilientLazy(() => import("./pages/vendors/MerchantProducts"), {
  pageLabel: "merchant products",
})
const MerchantBanner = resilientLazy(() => import("./pages/vendors/MerchantBanner"), {
  pageLabel: "shop banner",
})
const MerchantSettings = resilientLazy(() => import("./pages/vendors/MerchantSettings"), {
  pageLabel: "merchant settings",
})
const MerchantNews = resilientLazy(() => import("./pages/vendors/MerchantNews"), {
  pageLabel: "merchant news",
})
const MerchantPromoBanner = resilientLazy(() => import("./pages/vendors/MerchantPromoBanner"), {
  pageLabel: "promo banner",
})
const MerchantAnalytics = resilientLazy(() => import("./pages/vendors/MerchantAnalytics"), {
  pageLabel: "merchant analytics",
})
const MerchantPayment = resilientLazy(() => import("./pages/vendors/MerchantPayment"), {
  pageLabel: "payment page",
})
const MerchantServiceFee = resilientLazy(() => import("./pages/vendors/MerchantServiceFee"), {
  pageLabel: "service fee page",
})
const MerchantVideoKYC = resilientLazy(() => import("./pages/vendors/MerchantVideoKYC"), {
  pageLabel: "video verification",
})

function RouteLoadingScreen({
  title = "Loading your page",
  message = "Please wait while we prepare the next screen.",
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] border border-pink-100 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-pink-100 border-t-pink-600" />
        <h2 className="mt-5 text-2xl font-black text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
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

function ProtectedDashboardRoute({ children }) {
  const navigate = useNavigate()
  const [completedProfileUserId, setCompletedProfileUserId] = useState(null)
  const { loading, session, user, profile, suspended, isOffline } = useAuthSession()

  useEffect(() => {
    if (!user || isOffline) return undefined

    let cancelled = false
    const preload = () => {
      if (cancelled) return
      Promise.allSettled([
        import("./pages/vendors/AddProduct"),
        import("./pages/vendors/EditProduct"),
        import("./pages/vendors/MerchantBanner"),
        import("./pages/ShopRegistration"),
        import("./pages/vendors/MerchantProducts"),
        import("./pages/vendors/MerchantNews"),
      ]).catch(() => {
        // Best-effort preloading only. Route-level fallback still handles misses.
      })
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
  }, [user?.id, isOffline])

  if (loading && !isOffline) {
    return (
      <RouteLoadingScreen
        title="Checking your session"
        message="We are confirming your access before opening this dashboard."
      />
    )
  }

  const isAllowed = (Boolean(session) && Boolean(user) && !suspended) || (isOffline && Boolean(user))
  const needsProfileSetup =
    user &&
    completedProfileUserId !== user.id &&
    (!profile || !isProfileComplete(profile))

  return (
    <ProtectedRoute isAllowed={isAllowed} redirectTo="/">
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
          {isOffline && (
            <div className="sticky top-0 z-[999] bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-800 shadow-sm">
              <i className="fa-solid fa-wifi-slash mr-2"></i>
              You are currently offline. Showing cached data.
            </div>
          )}
          {children}
        </>
      )}
    </ProtectedRoute>
  )
}

function App() {
  const withOnlineGuard = (element, options = {}) => (
    <OnlineRouteGuard {...options}>{element}</OnlineRouteGuard>
  )

  const withProtectedOnlineGuard = (element, options = {}) => (
    <ProtectedDashboardRoute>
      {withOnlineGuard(element, {
        backTo: "/user-dashboard?tab=market",
        ...options,
      })}
    </ProtectedDashboardRoute>
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
        <Route path="/staff-dashboard" element={<StaffDashboard />} />
        <Route path="/staff-issue-id" element={<StaffIDGenerator />} />
        <Route path="/staff-studio" element={<ImageOptimizer />} />
        <Route path="/staff-inbox" element={<StaffInbox />} />

        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/create-account" element={<CreateAccount />} />

        <Route
          path="/reposearch"
          element={withOnlineGuard(<MerchantDiscovery />)}
        />
        <Route
          path="/shop-detail"
          element={withOnlineGuard(<ShopDetail />)}
        />
        <Route
          path="/product-detail"
          element={withOnlineGuard(<ProductDetail />)}
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
          element={withProtectedOnlineGuard(<VendorsPanel />)}
        />

        <Route
          path="/area"
          element={withProtectedOnlineGuard(<Area />)}
        />

        <Route
          path="/cat"
          element={withProtectedOnlineGuard(<Cat />)}
        />

        <Route
          path="/search"
          element={withProtectedOnlineGuard(<Search />)}
        />

        <Route
          path="/shop-index"
          element={withProtectedOnlineGuard(<ShopIndex />)}
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

export default App
