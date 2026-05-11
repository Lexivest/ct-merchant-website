import { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { signInWithPassword, signOutUser } from "../lib/auth"
import { buildStaffAuthProfile, resolveStaffAccess, withStaffAuthTimeout } from "../lib/staffAuth"
import { primeStaffPortalMemory, startStaffSession } from "../lib/staffSession"
import { primeAuthSessionState } from "../hooks/useAuthSession"

// --- LOCAL ASSET IMPORT ---
import ctmLogo from "../assets/images/logo.jpg"

function StaffPortal() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionExpired = new URLSearchParams(location.search).get("expired") === "1"

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })

  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    setErrorMessage("")
    setIsSubmitting(true)

    try {
      // 1. Authenticate using the shared logic (handles suspension and tracking)
      const result = await withStaffAuthTimeout(
        signInWithPassword({
          email: formData.email.trim(),
          password: formData.password,
        }),
        "Login is taking too long. Please check your connection and try again."
      )

      const authUser = result.auth?.user || result.auth?.session?.user

      if (!authUser) throw new Error("Login failed. Please check your credentials.")

      const sessionResult = await withStaffAuthTimeout(
        supabase.auth.getSession(),
        "Could not confirm the staff session. Please retry."
      )
      const session = result.auth?.session || sessionResult.data?.session || null

      // 2. Immediate Role Verification (Backend tables define staff/admin)
      const staffAccess = await resolveStaffAccess(authUser.id)

      if (!staffAccess) {
        await signOutUser()
        throw new Error("Access Denied. This portal is restricted to authorized staff members only.")
      }

      const staffProfile = buildStaffAuthProfile(authUser, staffAccess)
      startStaffSession(authUser.id)
      primeStaffPortalMemory(authUser, staffAccess)
      primeAuthSessionState({
        session,
        user: authUser,
        profile: staffProfile,
        suspended: false,
        profileLoaded: true,
      })

      void import("./StaffDashboard")
      // fromStaffTransition: true puts ProtectedStaffRoute into card-transition
      // fast-path — it reads the already-primed staffPortalMemory and renders
      // children immediately, bypassing the needsStaffFallback loading cycle
      // that would otherwise fire when the background auth re-fetch overwrites
      // the staffProfile with the raw DB profile (which lacks staff_portal_access).
      navigate("/staff-dashboard", { replace: true, state: { fromStaffTransition: true } })
      
    } catch (error) {
      setErrorMessage(error.message)
      setIsSubmitting(false)
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-pink-950/40 px-4 py-10">
      <div className="w-full max-w-md rounded-[28px] bg-pink-200 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.25)]">
        <div className="rounded-[24px] border border-pink-100 bg-white p-8 md:p-10">
          <div className="text-center">
            {/* --- LOCAL LOGO APPLIED --- */}
            <img
              src={ctmLogo}
              alt="CT-Merchant Logo"
              className="mx-auto h-20 w-20 rounded-2xl object-cover shadow-sm"
            />

            <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.28em] text-pink-600">
              CT-Merchant Ltd.
            </p>

            <h1 className="mt-2 text-3xl font-extrabold text-slate-900">
              Staff Portal
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder="Email"
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="Password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="staff-secure-password w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-sm tracking-[0.28em] text-slate-900 outline-none transition placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
              />
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                For staff security, password characters stay masked while typing and are never displayed back on screen.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-pink-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(219,39,119,0.28)] transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Verifying..." : "Login"}
            </button>
          </form>

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {!errorMessage && sessionExpired ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Your staff session expired after 20 minutes of inactivity. Please sign in again.
            </div>
          ) : null}

          <div className="mt-8 border-t border-slate-200 pt-6 text-center">
            <p className="text-sm font-medium text-slate-500">
              Powered by CT-Tech.
            </p>

            <Link
              to="/"
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-slate-50"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default StaffPortal
