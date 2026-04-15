import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { signInWithPassword } from "../lib/auth"

// --- LOCAL ASSET IMPORT ---
import ctmLogo from "../assets/images/logo.jpg"

function StaffPortal() {
  const navigate = useNavigate()

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
      const { auth: data } = await signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
      })

      if (!data.user) {
        throw new Error("No user returned from system.")
      }

      // 2. Verify staff status
      const { data: staff, error: staffError } = await supabase
        .from("staff_profiles")
        .select("*")
        .eq("id", data.user.id)
        .single()

      if (staffError || !staff) {
        await supabase.auth.signOut()
        throw new Error("Access denied: Restricted to staff accounts only.")
      }

      navigate("/staff-dashboard")
    } catch (error) {
      // Show cleaner messages for common errors
      setErrorMessage(error.message)
    } finally {
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
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
              />
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