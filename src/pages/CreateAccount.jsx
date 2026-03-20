import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaCity,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaFileContract,
  FaLock,
  FaMapPin,
  FaPhone,
  FaUser,
  FaUserCheck,
} from "react-icons/fa"
import { FaCircleCheck } from "react-icons/fa6"
import AuthButton from "../components/auth/AuthButton"
import AuthInput from "../components/auth/AuthInput"
import AuthNotification from "../components/auth/AuthNotification"
import MainLayout from "../layouts/MainLayout"
import {
  fetchAreasByCity,
  fetchOpenCities,
  signInWithGoogleIdToken,
  signUpWithEmail,
  updateLastActiveIp,
} from "../lib/auth"
import { validateSignupForm } from "../lib/validators"
import useCachedFetch from "../hooks/useCachedFetch"
import useAuthSession from "../hooks/useAuthSession"
import { ShimmerBlock } from "../components/common/Shimmers"

// --- PROFESSIONAL SHIMMER COMPONENT ---
function CreateAccountShimmer() {
  return (
    <MainLayout>
      <section className="min-h-screen bg-pink-50 px-4 py-8">
        <div className="mx-auto max-w-md">
          <ShimmerBlock className="mb-6 h-10 w-24 rounded-xl" />
          <ShimmerBlock className="mx-auto mb-5 h-24 w-24 rounded-xl" />
          <div className="rounded-[28px] border border-pink-100 bg-white p-6 shadow-xl md:p-8">
            <ShimmerBlock className="mb-2 h-8 w-48 rounded" />
            <ShimmerBlock className="mb-6 h-4 w-64 rounded" />
            <ShimmerBlock className="mb-8 h-[44px] w-full rounded" />
            <ShimmerBlock className="mb-6 h-4 w-full rounded" />
            
            <div className="space-y-4">
              <ShimmerBlock className="h-14 w-full rounded-2xl" />
              <ShimmerBlock className="h-14 w-full rounded-2xl" />
              <ShimmerBlock className="h-14 w-full rounded-2xl" />
              <ShimmerBlock className="h-14 w-full rounded-2xl" />
            </div>
            <ShimmerBlock className="mt-8 h-12 w-full rounded-xl" />
          </div>
        </div>
      </section>
    </MainLayout>
  )
}

function CreateAccount() {
  const navigate = useNavigate()

  // 1. Unified Auth & Network State
  const { user, loading: authLoading, isOffline } = useAuthSession()

  // Redirect authenticated users away from signup
  useEffect(() => {
    if (user) {
      navigate("/user-dashboard", { replace: true })
    }
  }, [user, navigate])

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    cityId: "",
    areaId: "",
    password: "",
    confirmPassword: "",
  })

  // 2. Reactive Cached Fetching for Locations
  const { data: citiesData, loading: loadingCities } = useCachedFetch(
    "open_cities",
    fetchOpenCities,
    { ttl: 1000 * 60 * 60 * 24 }
  )
  const cities = citiesData || []

  // Areas fetch reactively whenever form.cityId changes
  const areaCacheKey = form.cityId ? `areas_city_${form.cityId}` : "areas_none"
  const { data: areasData, loading: loadingAreas } = useCachedFetch(
    areaCacheKey,
    async () => {
      if (!form.cityId) return []
      return await fetchAreasByCity(form.cityId)
    },
    { dependencies: [form.cityId], ttl: 1000 * 60 * 60 * 24 }
  )
  const areas = areasData || []

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  // --- Terms & Flow State ---
  const [termsOpen, setTermsOpen] = useState(false)
  const [termsScrolledBottom, setTermsScrolledBottom] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [pendingAuthMethod, setPendingAuthMethod] = useState("email") // 'email' | 'google'

  // --- Pro-tip: Use a Ref for the Google callback to avoid stale React state closures ---
  const googleCallbackRef = useRef()

  googleCallbackRef.current = async (response) => {
    if (isOffline) {
      setNotice({ visible: true, type: "error", title: "Network Offline", message: "Please connect to the internet to sign up with Google." })
      return
    }

    if (!response?.credential) {
      setNotice({ visible: true, type: "error", title: "Google sign-up failed", message: "No Google credential was received." })
      return
    }

    setTermsOpen(false) // Close modal instantly upon clicking Google

    try {
      setGoogleLoading(true)
      setNotice({ visible: false, type: "info", title: "", message: "" })

      const result = await signInWithGoogleIdToken(response.credential)
      const signedInUser = result.auth?.user || result.auth?.session?.user

      if (!signedInUser) throw new Error("Google sign-up did not return a valid user.")

      await updateLastActiveIp(signedInUser.id, result.ipData.ip)
      setNotice({ visible: true, type: "success", title: "Google sign-up successful", message: "Opening your dashboard..." })

      setTimeout(() => navigate("/user-dashboard"), 900)
      
    } catch (error) {
      setNotice({ visible: true, type: "error", title: "Google sign-up failed", message: error.message || "Please try again." })
    } finally {
      setGoogleLoading(false)
    }
  }

  // Initialize Google Sign-in Globally
  useEffect(() => {
    const clientId = "237791711830-h0kb3jmuq122l276e64dc6jbl5tluesu.apps.googleusercontent.com"

    function initializeGoogle() {
      if (!window.google?.accounts?.id) return

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => googleCallbackRef.current(res), // Use the Ref to ensure fresh state
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      setGoogleReady(true)
    }

    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        initializeGoogle()
        clearInterval(timer)
      }
    }, 300)

    return () => clearInterval(timer)
  }, [])

  const currentErrorsCount = useMemo(() => Object.keys(errors).length, [errors])

  function handleCityChange(event) {
    const cityId = event.target.value
    setForm((prev) => ({ ...prev, cityId, areaId: "" }))
    setErrors((prev) => ({ ...prev, cityId: "", areaId: "" }))
  }

  // --- Start Email Flow ---
  function handleSubmitStart(event) {
    event.preventDefault()
    const nextErrors = validateSignupForm(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setNotice({ visible: true, type: "error", title: "Please fix the highlighted fields", message: "Your account cannot be created until the form is valid." })
      return
    }

    setNotice({ visible: false, type: "info", title: "", message: "" })
    setPendingAuthMethod("email")
    setTermsScrolledBottom(false)
    setTermsOpen(true)
  }

  // --- Start Google Flow ---
  function handleGoogleStart() {
    setNotice({ visible: false, type: "info", title: "", message: "" })
    setPendingAuthMethod("google")
    setTermsScrolledBottom(false)
    setTermsOpen(true)
  }

  // --- Execute Email Sign Up ---
  async function executeEmailSignup() {
    if (isOffline) {
      setNotice({ visible: true, type: "error", title: "Network Offline", message: "Please connect to the internet to create your account." })
      setTermsOpen(false)
      return
    }

    try {
      setSubmitting(true)
      setNotice({ visible: false, type: "info", title: "", message: "" })

      await signUpWithEmail({
        fullName: form.fullName,
        phone: form.phone,
        email: form.email,
        password: form.password,
        cityId: form.cityId,
        areaId: form.areaId,
      })

      setTermsOpen(false)
      setShowSuccess(true)
    } catch (error) {
      setTermsOpen(false)
      setNotice({ visible: true, type: "error", title: "Registration failed", message: error.message || "Please try again." })
    } finally {
      setSubmitting(false)
    }
  }

  function closeSuccess() {
    setShowSuccess(false)
    navigate("/", { state: { prefillEmail: form.email } })
  }

  if (authLoading || (loadingCities && cities.length === 0)) {
    return <CreateAccountShimmer />
  }

  return (
    <>
      <MainLayout>
        <section className="min-h-screen bg-pink-50 px-4 py-8">
          <div className="mx-auto max-w-md">
            
            {isOffline && (
              <div className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800 shadow-sm border border-amber-200 flex items-center gap-2">
                <i className="fa-solid fa-wifi-slash"></i>
                You are offline. Reconnect to create your account.
              </div>
            )}

            <Link to="/" className="mb-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700">
              <FaArrowLeft />
              <span>Back</span>
            </Link>

            <div className="mb-5 text-center">
              <img src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/CT-Merchant.jpg" alt="CTMerchant Logo" className="mx-auto h-24 w-auto rounded-xl object-contain" />
            </div>

            <div className="rounded-[28px] border border-pink-100 bg-white p-6 shadow-xl md:p-8">
              <h1 className="text-2xl font-extrabold text-slate-900">Create Account</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Join the professional merchant network.</p>

              <div className="mt-5 space-y-3">
                {/* CUSTOM GOOGLE BUTTON (Intercepts click to show terms) */}
                <button
                  type="button"
                  disabled={!googleReady || googleLoading}
                  onClick={handleGoogleStart}
                  className="flex h-[44px] w-full items-center justify-center gap-3 rounded-lg border border-[#747775] bg-white px-4 font-medium text-[#1f1f1f] shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  {googleLoading ? "Connecting..." : "Continue with Google"}
                </button>
              </div>

              <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                <div className="h-px flex-1 bg-slate-200" />
                <span>Or sign up with email</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <form className="space-y-4" onSubmit={handleSubmitStart}>
                <AuthInput id="signup-fullname" label="Full Name" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} placeholder="First and Last Name" error={errors.fullName} required icon={<FaUser />} minLength={2} />
                <AuthInput id="signup-phone" label="Phone Number" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="e.g. 08012345678" error={errors.phone} required icon={<FaPhone />} />
                <AuthInput id="signup-email" label="Work Email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="name@company.com" error={errors.email} required icon={<FaEnvelope />} autoComplete="email" />

                <div className="flex flex-col gap-2">
                  <label htmlFor="signup-city" className="text-sm font-bold text-slate-800">Select City <span className="ml-1 text-pink-600">*</span></label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><FaCity /></span>
                    <select id="signup-city" value={form.cityId} onChange={handleCityChange} disabled={loadingCities} className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100">
                      <option value="">{loadingCities ? "Loading cities..." : "Select your city"}</option>
                      {cities.map((city) => (<option key={city.id} value={city.id}>{city.name}</option>))}
                    </select>
                  </div>
                  {errors.cityId && <p className="text-xs font-semibold text-red-600">{errors.cityId}</p>}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="signup-area" className="text-sm font-bold text-slate-800">Select Area <span className="ml-1 text-pink-600">*</span></label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><FaMapPin /></span>
                    <select id="signup-area" value={form.areaId} onChange={(e) => setForm((prev) => ({ ...prev, areaId: e.target.value }))} disabled={!form.cityId || loadingAreas} className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100">
                      <option value="">{!form.cityId ? "Select city first" : loadingAreas ? "Loading areas..." : "Select your area"}</option>
                      {areas.map((area) => (<option key={area.id} value={area.id}>{area.name}</option>))}
                    </select>
                  </div>
                  {errors.areaId && <p className="text-xs font-semibold text-red-600">{errors.areaId}</p>}
                </div>

                <AuthInput id="signup-password" label="Password" type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="At least 6 characters" error={errors.password} required icon={<FaLock />} autoComplete="new-password" minLength={6} rightElement={<button type="button" onClick={() => setShowPassword((prev) => !prev)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-pink-600">{showPassword ? <FaEyeSlash /> : <FaEye />}</button>} />
                <AuthInput id="signup-confirm-password" label="Confirm Password" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Re-enter password" error={errors.confirmPassword} required icon={<FaLock />} autoComplete="new-password" minLength={6} rightElement={<button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-pink-600">{showConfirmPassword ? <FaEyeSlash /> : <FaEye />}</button>} />

                <AuthButton type="submit" loading={submitting && pendingAuthMethod === 'email'} disabled={isOffline}>Continue</AuthButton>
              </form>

              <AuthNotification visible={notice.visible} type={notice.type} title={notice.title} message={notice.message} />

              <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
                Already have an account? <button type="button" onClick={() => navigate("/")} className="font-extrabold text-pink-600 transition hover:text-pink-700 hover:underline">Sign In</button>
              </div>

              <div className="mt-3 text-center text-xs font-semibold text-slate-500">
                {currentErrorsCount > 0 ? `${currentErrorsCount} field${currentErrorsCount > 1 ? "s" : ""} still need attention.` : "Your details look good."}
              </div>
            </div>
          </div>
        </section>

        {termsOpen && (
          <TermsPrivacyModal
            pendingAuthMethod={pendingAuthMethod}
            onClose={() => setTermsOpen(false)}
            onConfirm={executeEmailSignup}
            confirmLoading={submitting}
            confirmDisabled={!termsScrolledBottom || isOffline}
            onScrolledBottom={() => setTermsScrolledBottom(true)}
          />
        )}

      </MainLayout>

      {showSuccess && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[350px] rounded-[20px] bg-white p-8 text-center shadow-2xl">
            <FaCircleCheck className="mx-auto mb-4 text-5xl text-green-600" />
            <div className="mb-2 text-xl font-extrabold text-slate-900">Account Created</div>
            <div className="mb-6 text-sm leading-6 text-slate-500">Your account has been created successfully. Continue to sign in with your email and password.</div>
            <button type="button" onClick={closeSuccess} className="w-full rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-900 transition hover:bg-slate-200">Go to Sign In</button>
          </div>
        </div>
      )}
    </>
  )
}

function TermsPrivacyModal({
  onClose,
  onConfirm,
  confirmLoading,
  confirmDisabled,
  onScrolledBottom,
  pendingAuthMethod,
}) {
  function handleScroll(event) {
    const el = event.currentTarget
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12
    if (atBottom) onScrolledBottom()
  }

  // Inject the actual Google button into the modal once they scroll to the bottom
  useEffect(() => {
    if (pendingAuthMethod === "google" && !confirmDisabled && window.google) {
      const btn = document.getElementById("modal-google-button")
      if (btn && btn.childNodes.length === 0) {
        window.google.accounts.id.renderButton(btn, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 320, // Forces the google button to fit the container
          text: "continue_with"
        })
      }
    }
  }, [pendingAuthMethod, confirmDisabled])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[28px] border border-pink-100 bg-white p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <FaFileContract className="text-pink-600" />
            Agreements & Policies
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Please read through and scroll to the bottom before creating your account.
          </p>
        </div>

        <div onScroll={handleScroll} className="min-h-[260px] flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700">
          <h3 className="mb-3 text-lg font-extrabold text-slate-900">Privacy Policy</h3>
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Last Updated: March 2026</p>

          <p>This policy explains how CTMerchant collects, uses, and protects personal information in compliance with the Nigeria Data Protection Regulation and platform rules.</p>
          <p className="mt-3">CTMerchant operates a digital repository that lists physical shops, products, and locations for discovery and informational purposes only.</p>
          <p className="mt-3">We collect limited information necessary to operate the platform, including account details, business listing information, general location information, and technical usage data needed for security and performance.</p>
          <p className="mt-3">We use collected information to provide and secure the repository, display accurate listings, support communication between users and shops, and improve platform performance.</p>
          <p className="mt-3">CTMerchant does not sell personal data and does not process payments or financial transactions for merchants.</p>
          <p className="mt-3">Data may only be shared with trusted infrastructure providers, through user-initiated contact with merchants, or when required by law.</p>
          <p className="mt-3">You may request access, correction, or deletion of your data through CTMerchant support.</p>

          <hr className="my-6 border-slate-200" />

          <h3 className="mb-3 text-lg font-extrabold text-slate-900">Terms of Use</h3>
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">Effective Date: March 2026</p>

          <p>These terms govern access to and use of the CTMerchant digital repository platform.</p>
          <p className="mt-3">CTMerchant is not an online marketplace, broker, delivery service, escrow service, or seller. We do not facilitate payments, deliveries, or commercial transactions.</p>
          <p className="mt-3">Users and merchants are responsible for the accuracy of information they provide and must independently verify details, pricing, availability, and quality before engaging in any transaction.</p>
          <p className="mt-3">Listings are informational only and may change at any time. CTMerchant does not guarantee seller response times, stock availability, or transaction fulfillment.</p>
          <p className="mt-3">A verified status on CTMerchant relates to physical existence and location confirmation only. It does not constitute endorsement or a guarantee of product quality, legality, tax compliance, or business standing.</p>
          <p className="mt-3">To the maximum extent permitted by law, CTMerchant is not liable for losses, disputes, defective goods, or failed transactions between buyers and sellers discovered through the repository.</p>
          <p className="mt-3 font-semibold text-pink-700">By creating an account, you agree to these policies and platform conditions.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">
          Scroll to the bottom to unlock account creation.
        </div>

        <div className="mt-4 space-y-3">
          
          {/* DYNAMIC BUTTON LOGIC */}
          {pendingAuthMethod === "google" ? (
             confirmDisabled ? (
               <AuthButton disabled={true}>
                 <FaUserCheck />
                 <span>Scroll down to continue</span>
               </AuthButton>
             ) : (
               <div className="flex justify-center w-full min-h-[44px]">
                 <div id="modal-google-button" />
               </div>
             )
          ) : (
            <AuthButton onClick={onConfirm} loading={confirmLoading} disabled={confirmDisabled}>
              <FaUserCheck />
              <span>I Agree & Create Account</span>
            </AuthButton>
          )}

          <button type="button" onClick={onClose} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            Cancel Setup
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateAccount