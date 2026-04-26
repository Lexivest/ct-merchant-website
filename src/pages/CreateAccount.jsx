import { useCallback, useEffect, useRef, useState } from "react"
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

// --- NIGERIA PHONE INPUT ---
function NigeriaPhoneInput({ value, onChange, placeholder, disabled = false, error }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-slate-800">
        Phone Number <span className="ml-1 text-pink-600">*</span>
      </label>
      <div className="relative flex items-center">
        <div className="absolute left-3 flex items-center gap-2 border-r border-slate-200 pr-2.5">
          <div className="flex h-4 w-6 flex-col overflow-hidden rounded-sm border border-slate-100 shadow-sm">
            <div className="flex-1 bg-[#008751]" />
            <div className="flex-1 bg-white" />
            <div className="flex-1 bg-[#008751]" />
          </div>
          <span className="text-sm font-bold text-slate-500">+234</span>
        </div>
        <input
          type="tel"
          value={value}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 10)
            onChange(val)
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-2xl border bg-white py-3 pl-[104px] pr-4 text-sm font-medium text-slate-900 outline-none transition ${
            disabled
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : error
              ? "border-red-300 focus:border-red-400 focus:ring-4 focus:ring-red-100"
              : "border-slate-300 focus:border-pink-500 focus:ring-4 focus:ring-pink-100"
          }`}
        />
      </div>
      {error ? (
        <p className="text-xs font-semibold text-red-600">{error}</p>
      ) : null}
    </div>
  )
}

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
  const cityRetryTimerRef = useRef(null)
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
  const { data: citiesData, loading: loadingCities, error: cityError, mutate: mutateCities } = useCachedFetch(
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
  const { data: areasData, loading: loadingAreas, error: areaError, mutate: mutateAreas } = useCachedFetch(
    areaCacheKey,
    async () => {
      if (!form.cityId) return []
      return await fetchAreasByCity(form.cityId)
    },
    {
      dependencies: [form.cityId],
      ttl: 1000 * 60 * 60 * 24,
      persist: "session",
      skip: !form.cityId
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

  // Sync network or fetch errors to the notification area
  useEffect(() => {
    if (cityError) {
      setNotice({
        visible: true,
        type: "error",
        title: "Could not load cities",
        message: cityError
      })
    } else if (areaError) {
      setNotice({
        visible: true,
        type: "error",
        title: "Could not load areas",
        message: areaError
      })
    }
  }, [cityError, areaError])

  useEffect(() => {
    if (!loadingCities || cities.length > 0 || cityError) {
      if (cityRetryTimerRef.current) {
        window.clearTimeout(cityRetryTimerRef.current)
        cityRetryTimerRef.current = null
      }
      return undefined
    }

    cityRetryTimerRef.current = window.setTimeout(() => {
      mutateCities()
    }, 4500)

    return () => {
      if (cityRetryTimerRef.current) {
        window.clearTimeout(cityRetryTimerRef.current)
        cityRetryTimerRef.current = null
      }
    }
  }, [cityError, cities.length, loadingCities, mutateCities])

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

  function handleCityChange(event) {
    const cityId = event.target.value
    setForm((prev) => ({ ...prev, cityId, areaId: "" }))
    setErrors((prev) => ({ ...prev, cityId: "", areaId: "" }))
  }

  async function resolveFreshProfile(userId, fallbackProfile) {
    if (!userId) return fallbackProfile || null

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const currentProfile = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle()

      if (currentProfile.data) {
        return currentProfile.data
      }

      if (attempt < 3) {
        await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)))
      }
    }

    return fallbackProfile || null
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

      const rawPhone = form.phone.trim().replace(/\s+/g, "")
      let finalPhone = rawPhone
      if (!rawPhone.startsWith("+")) {
        const stripped = rawPhone.startsWith("0") ? rawPhone.substring(1) : rawPhone
        finalPhone = `+234${stripped}`
      }

      const result = await signUpWithEmail({
        fullName: combinedFullName,
        phone: finalPhone,
        email: form.email,
        password: form.password,
        cityId: form.cityId,
        areaId: form.areaId,
      })
      const signedInUser = result.auth?.user || result.auth?.session?.user || result.user

      if (!signedInUser) {
        throw new Error("Account was created, but we could not start your session.")
      }

      const hydratedProfile = await resolveFreshProfile(signedInUser.id, {
        id: signedInUser.id,
        full_name: combinedFullName,
        phone: finalPhone,
        city_id: Number(form.cityId),
        area_id: Number(form.areaId),
      })

      const didOpenDashboard = await openDashboardWithTransition({
        session: result.auth?.session || null,
        user: signedInUser,
        profile: hydratedProfile,
        suspended: false,
        profileLoaded: true,
      })

      if (!didOpenDashboard) {
        setSubmitting(false)
      }
    } catch (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Registration failed",
        message: getFriendlyErrorMessage(error, "Please try again."),
      })
      setSubmitting(false)
    }
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
                  <Link to="/terms" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Terms of Use</Link> and <Link to="/privacy" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Privacy Policy</Link>.
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
                
                <NigeriaPhoneInput 
                  value={form.phone} 
                  onChange={(val) => setForm((prev) => ({ ...prev, phone: val }))} 
                  placeholder="801 234 5678" 
                  error={errors.phone} 
                  disabled={submitting}
                />

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
                  {cityError ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNotice((prev) => ({ ...prev, visible: false }))
                        mutateCities()
                      }}
                      className="self-start text-xs font-bold text-pink-600 transition hover:text-pink-700 hover:underline"
                    >
                      Retry loading cities
                    </button>
                  ) : null}
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
                  {areaError && form.cityId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNotice((prev) => ({ ...prev, visible: false }))
                        mutateAreas()
                      }}
                      className="self-start text-xs font-bold text-pink-600 transition hover:text-pink-700 hover:underline"
                    >
                      Retry loading areas
                    </button>
                  ) : null}
                  {errors.areaId && <p className="text-xs font-semibold text-red-600">{errors.areaId}</p>}
                </div>

                <div className="flex flex-col gap-1">
                  <AuthInput 
                    id="signup-password" 
                    label="Password" 
                    type={showPassword ? "text" : "password"} 
                    value={form.password} 
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} 
                    placeholder="8+ characters, mixed case, symbols" 
                    error={errors.password} 
                    required 
                    icon={<FaLock />} 
                    autoComplete="new-password" 
                    minLength={8} 
                    rightElement={
                      <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-pink-600">
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    } 
                  />
                  {form.password && (
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 px-1">
                      {[
                        { label: "8+ characters", met: form.password.length >= 8 },
                        { label: "Lower case", met: /[a-z]/.test(form.password) },
                        { label: "Upper case", met: /[A-Z]/.test(form.password) },
                        { label: "Number", met: /[0-9]/.test(form.password) },
                        { label: "Symbol", met: /[^a-zA-Z0-9]/.test(form.password) },
                      ].map((req, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className={`h-1 w-1 rounded-full transition-colors ${req.met ? 'bg-green-500' : 'bg-slate-300'}`} />
                          <span className={`text-[10px] font-bold transition-colors ${req.met ? 'text-green-600' : 'text-slate-400'}`}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <AuthInput id="signup-confirm-password" label="Confirm Password" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} placeholder="Re-enter password" error={errors.confirmPassword} required icon={<FaLock />} autoComplete="new-password" minLength={8} rightElement={<button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-pink-600">{showConfirmPassword ? <FaEyeSlash /> : <FaEye />}</button>} />

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
                    <Link to="/terms" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Terms of Use</Link> and <Link to="/privacy" className="font-semibold text-slate-600 underline transition hover:text-pink-600">Privacy Policy</Link>.
                  </p>
                </div>
              </form>

              <AuthNotification visible={notice.visible} type={notice.type} title={notice.title} message={notice.message} />

              <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
                Already have an account? <button type="button" onClick={() => navigate("/")} className="font-extrabold text-pink-600 transition hover:text-pink-700 hover:underline">Sign In</button>
              </div>
            </div>
          </div>
          </section>
        </MainLayout>
      </div>

    </>
  )
}

export default CreateAccount
