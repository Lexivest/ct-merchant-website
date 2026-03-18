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
import ProtectedRoute from "./components/auth/ProtectedRoute"
import useAuthSession from "./hooks/useAuthSession"

// --- NEW IMPORTS FOR GOOGLE PROFILE GATEKEEPER ---
import CompleteProfileModal from "./components/auth/CompleteProfileModal"
import { isProfileComplete, signOutUser } from "./lib/auth"

function ProtectedDashboardRoute({ children }) {
  // 1. Added 'profile' to the destructured hook
  const { loading, session, user, profile, suspended } = useAuthSession()

  // 2. Added a spinner so the screen doesn't sit blank during initial load
  if (loading && !session && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600"></div>
      </div>
    )
  }

  const isAllowed = Boolean(session) && Boolean(user) && !suspended

  // 3. The Gatekeeper Check: User is logged in, but profile is missing core data
  const needsProfileSetup = user && (!profile || !isProfileComplete(profile))

  return (
    <ProtectedRoute isAllowed={isAllowed} redirectTo="/">
      {/* 4. If they need setup, hijack the route with the modal. Otherwise, render children. */}
      {needsProfileSetup ? (
        <div className="min-h-screen bg-slate-50">
          <CompleteProfileModal
            open={true}
            userId={user.id}
            fullName={user.user_metadata?.full_name || ""}
            onClose={async () => {
              // Bailout if they cancel
              await signOutUser()
              window.location.href = "/"
            }}
            onCompleted={() => {
              // Force reload to update session hook with fresh profile
              window.location.reload()
            }}
          />
        </div>
      ) : (
        children
      )}
    </ProtectedRoute>
  )
}

function App() {
  return (
    <Routes>
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
        path="/product-detail"
        element={
          <ProtectedDashboardRoute>
            <ProductDetail />
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