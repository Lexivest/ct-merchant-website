import { Routes, Route, Link } from "react-router-dom"
import Home from "./pages/Home"
import About from "./pages/About"
import Services from "./pages/Services"
import Affiliate from "./pages/Affiliate"
import Careers from "./pages/Careers"
import Contact from "./pages/Contact"

import StaffPortal from "./pages/StaffPortal"
import StaffDashboard from "./pages/StaffDashboard" 
import StaffIDGenerator from "./pages/staff/StaffIDGenerator" 
import StaffInbox from "./pages/staff/StaffInbox" // <-- Adjust path if you saved it differently

import Privacy from "./pages/Privacy"
import Terms from "./pages/Terms"
import CreateAccount from "./pages/CreateAccount"
import UserDashboard from "./pages/UserDashboard"
import ShopRegistration from "./pages/ShopRegistration"
import Area from "./pages/Area"
import Cat from "./pages/Cat"
import Search from "./pages/Search"
import ShopDetail from "./pages/ShopDetail"
import ProductDetail from "./pages/ProductDetail"
import ShopIndex from "./pages/ShopIndex"
import MerchantDiscovery from "./pages/MerchantDiscovery"
import VendorsPanel from "./pages/VendorsPanel"

import ProtectedRoute from "./components/auth/ProtectedRoute"
import useAuthSession from "./hooks/useAuthSession"
import CompleteProfileModal from "./components/auth/CompleteProfileModal"
import { isProfileComplete, signOutUser } from "./lib/auth"
import SubscriptionGuard from "./components/auth/SubscriptionGuard" 

// --- IMPORTS ---
import ImageOptimizer from "./pages/vendors/ImageOptimizer" // We will use this file for the new Staff Studio
import AddProduct from "./pages/vendors/AddProduct"
import EditProduct from "./pages/vendors/EditProduct"
import MerchantProducts from "./pages/vendors/MerchantProducts"
import MerchantBanner from "./pages/vendors/MerchantBanner"
import MerchantSettings from "./pages/vendors/MerchantSettings"
import MerchantNews from "./pages/vendors/MerchantNews"
import MerchantPromoBanner from "./pages/vendors/MerchantPromoBanner"
import MerchantAnalytics from "./pages/vendors/MerchantAnalytics"
import MerchantPayment from "./pages/vendors/MerchantPayment"
import MerchantServiceFee from "./pages/vendors/MerchantServiceFee"
import MerchantVideoKYC from "./pages/vendors/MerchantVideoKYC"

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
  const needsProfileSetup = user && (!profile || !isProfileComplete(profile))

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
              window.location.href = "/"
            }}
            onCompleted={() => {
              window.location.reload()
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
  return (
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
      <Route path="/staff-studio" element={<ImageOptimizer />} /> {/* <-- MOVED CT STUDIO HERE */}
      <Route path="/staff-inbox" element={<StaffInbox />} /> {/* <-- ADD THIS */}

      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/create-account" element={<CreateAccount />} />

      <Route path="/reposearch" element={<MerchantDiscovery />} />
      <Route path="/shop-detail" element={<ShopDetail />} />
      <Route path="/product-detail" element={<ProductDetail />} />

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
        element={
          <ProtectedDashboardRoute>
            <MerchantPayment />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-video-kyc"
        element={
          <ProtectedDashboardRoute>
            <MerchantVideoKYC />
          </ProtectedDashboardRoute>
        }
      />

      {/* --- LOCKED PREMIUM ROUTES START HERE --- */}
      <Route
        path="/merchant-promo-banner"
        element={
          <ProtectedDashboardRoute>
            <SubscriptionGuard>
              <MerchantPromoBanner />
            </SubscriptionGuard>
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-settings"
        element={
          <ProtectedDashboardRoute>
            <SubscriptionGuard>
              <MerchantSettings />
            </SubscriptionGuard>
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-banner"
        element={
          <ProtectedDashboardRoute>
            <SubscriptionGuard>
              <MerchantBanner />
            </SubscriptionGuard>
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-products"
        element={
          <ProtectedDashboardRoute>
            <SubscriptionGuard>
              <MerchantProducts />
            </SubscriptionGuard>
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-edit-product"
        element={
          <ProtectedDashboardRoute>
            <SubscriptionGuard>
              <EditProduct />
            </SubscriptionGuard>
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-add-product"
        element={
          <ProtectedDashboardRoute>
            <SubscriptionGuard>
              <AddProduct />
            </SubscriptionGuard>
          </ProtectedDashboardRoute>
        }
      />
      {/* Old CT Studio Route Removed From Here! */}
      {/* --- LOCKED PREMIUM ROUTES END HERE --- */}

      {/* --- UNLOCKED / FREE ROUTES --- */}
      <Route
        path="/service-fee"
        element={
          <ProtectedDashboardRoute>
            <MerchantServiceFee />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-analytics"
        element={
          <ProtectedDashboardRoute>
            <MerchantAnalytics />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/merchant-news"
        element={
          <ProtectedDashboardRoute>
            <MerchantNews />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/shop-registration"
        element={
          <ProtectedDashboardRoute>
            <ShopRegistration />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/vendor-panel"
        element={
          <ProtectedDashboardRoute>
            <VendorsPanel />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/area"
        element={
          <ProtectedDashboardRoute>
            <Area />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/cat"
        element={
          <ProtectedDashboardRoute>
            <Cat />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/search"
        element={
          <ProtectedDashboardRoute>
            <Search />
          </ProtectedDashboardRoute>
        }
      />

      <Route
        path="/shop-index"
        element={
          <ProtectedDashboardRoute>
            <ShopIndex />
          </ProtectedDashboardRoute>
        }
      />

      {/* --- CATCH-ALL 404 ROUTE --- */}
      <Route
        path="*"
        element={<NotFoundPage />}
      />
    </Routes>
  )
}

export default App
