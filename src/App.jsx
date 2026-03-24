import { Suspense, lazy, useState } from "react"
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

// --- IMPORTS ---
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"))
const StaffIDGenerator = lazy(() => import("./pages/staff/StaffIDGenerator"))
const StaffInbox = lazy(() => import("./pages/staff/StaffInbox"))
const UserDashboard = lazy(() => import("./pages/UserDashboard"))
const ShopRegistration = lazy(() => import("./pages/ShopRegistration"))
const Area = lazy(() => import("./pages/Area"))
const Cat = lazy(() => import("./pages/Cat"))
const Search = lazy(() => import("./pages/Search"))
const ShopDetail = lazy(() => import("./pages/ShopDetail"))
const ProductDetail = lazy(() => import("./pages/ProductDetail"))
const ShopIndex = lazy(() => import("./pages/ShopIndex"))
const MerchantDiscovery = lazy(() => import("./pages/MerchantDiscovery"))
const VendorsPanel = lazy(() => import("./pages/VendorsPanel"))
const ImageOptimizer = lazy(() => import("./pages/vendors/ImageOptimizer"))
const AddProduct = lazy(() => import("./pages/vendors/AddProduct"))
const EditProduct = lazy(() => import("./pages/vendors/EditProduct"))
const MerchantProducts = lazy(() => import("./pages/vendors/MerchantProducts"))
const MerchantBanner = lazy(() => import("./pages/vendors/MerchantBanner"))
const MerchantSettings = lazy(() => import("./pages/vendors/MerchantSettings"))
const MerchantNews = lazy(() => import("./pages/vendors/MerchantNews"))
const MerchantPromoBanner = lazy(() => import("./pages/vendors/MerchantPromoBanner"))
const MerchantAnalytics = lazy(() => import("./pages/vendors/MerchantAnalytics"))
const MerchantPayment = lazy(() => import("./pages/vendors/MerchantPayment"))
const MerchantServiceFee = lazy(() => import("./pages/vendors/MerchantServiceFee"))
const MerchantVideoKYC = lazy(() => import("./pages/vendors/MerchantVideoKYC"))

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
