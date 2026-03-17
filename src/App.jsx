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
import ProtectedRoute from "./components/auth/ProtectedRoute"
import useAuthSession from "./hooks/useAuthSession"

function ProtectedDashboardRoute({ children }) {
  const { loading, user, suspended } = useAuthSession()

  if (loading) {
    return children
  }

  return (
    <ProtectedRoute isAllowed={Boolean(user) && !suspended} redirectTo="/">
      {children}
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
    </Routes>
  )
}

export default App