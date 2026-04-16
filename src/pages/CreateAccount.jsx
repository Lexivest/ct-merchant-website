import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  FaArrowLeft,
  FaCity,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaMapPin,
  FaPhone,
  FaUser,
} from "react-icons/fa"
import { FaCircleCheck } from "react-icons/fa6"
import AuthButton from "../components/auth/AuthButton"
import AuthInput from "../components/auth/AuthInput"
import AuthNotification from "../components/auth/AuthNotification"
import MainLayout from "../layouts/MainLayout"
import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import {
  fetchAreasByCity,
  fetchOpenCities,
  signInWithGoogleIdToken,
  signUpWithEmail,
  updateLastActiveIp,
} from "../lib/auth"
import { supabase } from "../lib/supabase"
import { validateSignupForm } from "../lib/validators"
import useCachedFetch from "../hooks/useCachedFetch"
import useAuthSession from "../hooks/useAuthSession"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import {
  getAuthScreenTransitionMessage,
  preloadDashboardScreen,
} from "../lib/authScreenTransitions"

function CreateAccount() {
  const navigate = useNavigate()

  // 1. Unified Auth & Network State
  const {
    session,
    user,
    profile,
    suspended,
    loading: authLoading,
    isOffline,
  } = useAuthSession()
  const shouldRedirectToDashboard = Boolean(user) && !suspended && !isOffline
  const holdForExistingSession = shouldRedirectToDashboard && authLoading
  const transitionRetryRef = useRef(null)
  const [transitionState, setTransitionState] = useState({
    pending: false,
    error: "",
  })

  const openDashboardWithTransition = useCallback(
    async function openDashboard(authState, options = {}) {
      const { replace = false } = options
      const retryAction = () => openDashboard(authState, options)
      transitionRetryRef.current = retryAction
      setTransitionState({
        pending: true,
        error: "",
      })

      try {
        const prefetchedDashboardData = await preloadDashboardScreen(authState)
        navigate("/user-dashboard", {
          replace,
          state: {
            fromAuthTransition: true,
            prefetchedDashboardData,
          },
        })
        return true
      } catch (error) {
        transitionRetryRef.current = retryAction
        setTransitionState({
          pending: false,
          error: getAuthScreenTransitionMessage(
            error,
            "We could not open your dashboard right now. Please try again."
          ),
        })
        return false
      }
    },
    [navigate]
  )

  const [form, setForm] = useState({
    surname: "",
    middleName: "",
    firstName: "",
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
    {
      ttl: 1000 * 60 * 60 * 24,
      persist: "session",
    }
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
    {
      dependencies: [form.cityId],
      ttl: 1000 * 60 * 60 * 24,
      persist: "session",
    }
  )
  const areas = areasData || []

  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  
  const [googleLoading, setGoogleLoading] = useState(false)
  const googleButtonRef = useRef(null)

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (
      !authLoading &&
      shouldRedirectToDashboard &&
      !submitting &&
      !googleLoading &&
      !transitionState.pending &&
      !transitionState.error
    ) {
      void openDashboardWithTransition(
        {
          session,
          user,
          profile,
          suspended,
          profileLoaded: true,
        },
        { replace: true }
      )
    }
  }, [
    authLoading,
    googleLoading,
    profile,
    session,
    shouldRedirectToDashboard,
    submitting,
    suspended,
    transitionState.error,
    transitionState.pending,
    user,
    openDashboardWithTransition,
  ])

  // --- GOOGLE CALLBACK ---
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

    try {
      let didOpenDashboard = false
      setGoogleLoading(true)
      setNotice({ visible: false, type: "info", title: "", message: "" })

      const result = await signInWithGoogleIdToken(response.credential)
      const signedInUser = result.auth?.user || result.auth?.session?.user

      if (!signedInUser) throw new Error("Google sign-up did not return a valid user.")

      const currentProfile = await supabase
        .from("profiles")
        .select("*")
        .eq("id", signedInUser.id)
        .maybeSingle()

      if (currentProfile.error) {
        throw new Error("Could not verify your profile. Please try again.")
      }

      await updateLastActiveIp(signedInUser.id, result.ipData.ip)

      didOpenDashboard = await openDashboardWithTransition({
        session: result.auth?.session || null,
        user: signedInUser,
        profile: currentProfile.data || null,
        suspended: false,
        profileLoaded: true,
      })

      if (!didOpenDashboard) {
        setGoogleLoading(false)
      }
      
    } catch (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Google sign-up failed",
        message: getFriendlyErrorMessage(error, "Please try again."),
      })
      setGoogleLoading(false)
    }
  }

  // --- Initialize Standard Google Sign-in ---
  useEffect(() => {
    if (authLoading) return

    const clientId = "504776303212-4s0mgf9qd3hlpfhld5fdgpore65m6tfl.apps.googleusercontent.com"

    function mountGoogleButton() {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return false

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => googleCallbackRef.current(res),
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      const isMobile = window.matchMedia("(max-width: 640px)").matches
      googleButtonRef.current.innerHTML = ""
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        text: "continue_with",
        size: isMobile ? "medium" : "large",
        shape: "rectangular",
        logo_alignment: "left",
        width: isMobile ? 280 : 340,
      })

      return true
    }

    const mounted = mountGoogleButton()
    const timer = mounted
      ? null
      : setInterval(() => {
          if (mountGoogleButton()) {
            clearInterval(timer)
          }
        }, 250)

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [authLoading])

  const currentErrorsCount = useMemo(() => Object.keys(errors).length, [errors])
  
  const isFormEmpty = !form.surname && !form.firstName && !form.phone && !form.email && !form.cityId && !form.areaId && !form.password && !form.confirmPassword;

  function handleCityChange(event) {
    const cityId = event.target.value
    setForm((prev) => ({ ...prev, cityId, areaId: "" }))
    setErrors((prev) => ({ ...prev, cityId: "", areaId: "" }))
  }

  // --- DIRECT EMAIL SIGNUP EXECUTION ---
  async function handleEmailSignup(event) {
    event.preventDefault()

    if (isOffline) {
      setNotice({ visible: true, type: "error", title: "Network Offline", message: "Please connect to the internet to create your account." })
      return
    }

    let localErrors = {}
    if (!form.surname.trim() || form.surname.trim().length < 2) {
      localErrors.surname = "Surname must be at least 2 characters."
    }
    if (!form.firstName.trim() || form.firstName.trim().length < 2) {
      localErrors.firstName = "First name must be at least 2 characters."
    }

    const combinedFullName = [form.surname.trim(), form.middleName.trim(), form.firstName.trim()].filter(Boolean).join(" ")
    const validationPayload = { ...form, fullName: combinedFullName }
    
    const externalErrors = validateSignupForm(validationPayload)
    delete externalErrors.fullName // Handled locally

    const nextErrors = { ...localErrors, ...externalErrors }
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setNotice({ visible: true, type: "error", title: "Please fix the highlighted fields", message: "Your account cannot be created until the form is valid." })
      return
    }

    try {
      setSubmitting(true)
      setNotice({ visible: false, type: "info", title: "", message: "" })

      await signUpWithEmail({
        fullName: combinedFullName,
        phone: form.phone,
        email: form.email,
        password: form.password,
        cityId: form.cityId,
        areaId: form.areaId,
      })

      setShowSuccess(true)
    } catch (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Registration failed",
        message: getFriendlyErrorMessage(error, "Please try again."),
      })
    } finally {
      setSubmitting(false)
    }
  }

  function closeSuccess() {
    setShowSuccess(false)
    navigate("/", { state: { prefillEmail: form.email } })
  }

  return (
    <>
      <PageTransitionOverlay
        visible={transitionState.pending}
        error={transitionState.error}
        onRetry={() => {
          if (typeof transitionRetryRef.current === "function") {
            void transitionRetryRef.current()
          }
        }}
        onDismiss={() =>
          setTransitionState({
            pending: false,
            error: "",
          })
        }
      />
      <div
        className={
          transitionState.pending || holdForExistingSession
            ? "pointer-events-none select-none"
            : ""
        }
      >
        <MainLayout>
          <PageSeo
            title="Create Account | CTMerchant"
            description="Create a CTMerchant account to discover verified shops, manage your profile, and access merchant tools."
            canonicalPath="/create-account"
            noindex
          />
          <section className="min-h-screen bg-pink-50 px-4 py-0">
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

            <div className="rounded-[28px] border border-pink-100 bg-white p-6 shadow-xl md:p-8">
              <h1 className="text-2xl font-extrabold text-slate-900">Create Account</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Join the professional merchant network.</p>

              <div className="mt-5 space-y-3 flex flex-col items-center">
                {/* --- IMPLICIT GOOGLE CONSENT --- */}
                <div className="w-full flex justify-center min-h-[44px] relative">
                  {googleLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
                      <span className="text-sm font-bold text-slate-600 animate-pulse">Setting up your account...</span>
                    </div>
                  )}
                  <div ref={googleButtonRef}></div>
                </div>
                
                <p className="mt-1 px-2 text-center text-[0.75rem] leading-relaxed text-slate-500">
                  By continuing with Google, you agree to CTMerchant's <br className="hidden sm:block"/>
                  <a href="/terms" target="_blank" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Terms of Use</a> and <a href="/privacy" target="_blank" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Privacy Policy</a>.
                </p>
              </div>

              <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                <div className="h-px flex-1 bg-slate-200" />
                <span>Or sign up with email</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <form className="space-y-4" onSubmit={handleEmailSignup}>
                <div className="grid gap-4 md:grid-cols-2">
                  <AuthInput id="signup-surname" label="Surname" value={form.surname} onChange={(e) => setForm((prev) => ({ ...prev, surname: e.target.value }))} placeholder="e.g. Adebayo" error={errors.surname} required icon={<FaUser />} minLength={2} />
                  <AuthInput id="signup-firstname" label="First Name" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} placeholder="e.g. John" error={errors.firstName} required icon={<FaUser />} minLength={2} />
                </div>
                
                <AuthInput id="signup-middlename" label="Middle Name (Optional)" value={form.middleName} onChange={(e) => setForm((prev) => ({ ...prev, middleName: e.target.value }))} placeholder="e.g. Olamide" error={errors.middleName} icon={<FaUser />} />
                <AuthInput id="signup-phone" label="Phone Number" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="e.g. 08012345678" error={errors.phone} required icon={<FaPhone />} />
                <AuthInput id="signup-email" label="Email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="example@email.com" error={errors.email} required icon={<FaEnvelope />} autoComplete="email" />

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

                <div className="pt-2">
                  <AuthButton
                    type="submit"
                    loading={submitting}
                    disabled={isOffline || transitionState.pending}
                  >
                    Create Account
                  </AuthButton>
                  <p className="mt-3 text-center text-[0.75rem] leading-relaxed text-slate-500">
                    By clicking Create Account, you agree to our <br className="hidden sm:block"/>
                    <a href="/terms" target="_blank" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Terms of Use</a> and <a href="/privacy" target="_blank" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Privacy Policy</a>.
                  </p>
                </div>
              </form>

              <AuthNotification visible={notice.visible} type={notice.type} title={notice.title} message={notice.message} />

              <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
                Already have an account? <button type="button" onClick={() => navigate("/")} className="font-extrabold text-pink-600 transition hover:text-pink-700 hover:underline">Sign In</button>
              </div>

              <div className="mt-3 text-center text-xs font-semibold text-slate-500">
                {isFormEmpty 
                  ? "Please fill in your details to continue." 
                  : currentErrorsCount > 0 
                  ? `${currentErrorsCount} field${currentErrorsCount > 1 ? "s" : ""} still need attention.` 
                  : "Your details look good."}
              </div>
            </div>
          </div>
          </section>
        </MainLayout>
      </div>

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

export default CreateAccount
