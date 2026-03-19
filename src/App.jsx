import { Routes, Route } from "react-router-dom"
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
import UserDashboard from "./pages/UserDashboard"
import ShopRegistration from "./pages/ShopRegistration"
import Area from "./pages/Area"
import Cat from "./pages/Cat"
import Search from "./pages/Search"
import ShopDetail from "./pages/ShopDetail"
import ProductDetail from "./pages/ProductDetail"
import ShopIndex from "./pages/ShopIndex"
import MerchantDiscovery from "./pages/MerchantDiscovery"
import VendorsPanel from "./pages/VendorsPanel" // <-- UPDATED IMPORT
import ProtectedRoute from "./components/auth/ProtectedRoute"
import useAuthSession from "./hooks/useAuthSession"
import CompleteProfileModal from "./components/auth/CompleteProfileModal"
import { isProfileComplete, signOutUser } from "./lib/auth"

function ProtectedDashboardRoute({ children }) {
  const { loading, session, user, profile, suspended, isOffline } = useAuthSession()

  // 1. By returning children directly during loading, we let the individual
  // pages render their own beautiful Shimmer skeletons instead of a generic spinner!
  if (loading && !isOffline) {
    return <>{children}</>
  }

  // 2. Prevent "Offline Kick": Allow access if normal conditions are met, OR if offline with a cached user
  const isAllowed = (Boolean(session) && Boolean(user) && !suspended) || (isOffline && Boolean(user))

  const needsProfileSetup = user && (!profile || !isProfileComplete(profile))

  return (
    <ProtectedRoute isAllowed={isAllowed} redirectTo="/">
      {/* 3. Don't force profile setup while offline (they can't save anyway) */}
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
          {/* 4. Professional Global Offline Banner */}
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
      <Route path="/staff-portal" element={<StaffPortal />} />
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
        path="/shop-registration"
        element={
          <ProtectedDashboardRoute>
            <ShopRegistration />
          </ProtectedDashboardRoute>
        }
      />

      {/* NEW VENDORS PANEL ROUTE */}
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
    </Routes>
  )
}

export default App