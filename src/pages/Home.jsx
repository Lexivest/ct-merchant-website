import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowRight,
  FaInfoCircle,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaHashtag,
  FaLock,
  FaSearch,
  FaFileContract,
  FaUserCheck,
} from "react-icons/fa"
import MainLayout from "../layouts/MainLayout"
import AuthInput from "../components/auth/AuthInput"
import AuthButton from "../components/auth/AuthButton"
import AuthNotification from "../components/auth/AuthNotification"
import {
  sendPasswordResetCode,
  signInWithGoogleIdToken,
  signInWithPassword,
  signOutUser,
  updateLastActiveIp,
  verifyRecoveryCodeAndResetPassword,
} from "../lib/auth"
import { supabase } from "../lib/supabase"
import {
  isValidEmail,
  validateResetPasswordForm,
  validateResetRequestForm,
} from "../lib/validators"
import useAuthSession from "../hooks/useAuthSession"

// --- LOCAL ASSET IMPORTS FOR CAROUSEL ---
import banner1 from "../assets/images/banner1.jpg"
import banner2 from "../assets/images/banner2.jpg"
import banner3 from "../assets/images/banner3.jpg"

const bannerImages = [banner1, banner2, banner3]

const phrases = [
  "Verified Merchants",
  "Safe and Secure",
  "Boost Your Business",
]

function Home() {
  const navigate = useNavigate()

  // 1. Hook into global auth state
  const { user, isOffline } = useAuthSession()

  // 2. Smooth Auto-Redirect
  useEffect(() => {
    if (user && !isOffline) {
      const timer = setTimeout(() => {
        navigate("/user-dashboard", { replace: true })
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [user, isOffline, navigate])

  // --- BANNER CAROUSEL STATE & TIMER ---
  const [currentBanner, setCurrentBanner] = useState(0)

  useEffect(() => {
    const bannerTimer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % bannerImages.length)
    }, 7500)
    return () => clearInterval(bannerTimer)
  }, [])

  const [phraseIndex, setPhraseIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  const [loginForm, setLoginForm] = useState({ email: "", password: "" })
  const [loginErrors, setLoginErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginNotice, setLoginNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [resetEmailOpen, setResetEmailOpen] = useState(false)
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false)
  const [resetEmailForm, setResetEmailForm] = useState({ email: "" })
  const [resetPasswordForm, setResetPasswordForm] = useState({
    token: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [resetEmailErrors, setResetEmailErrors] = useState({})
  const [resetPasswordErrors, setResetPasswordErrors] = useState({})
  const [sendingReset, setSendingReset] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [resetNotice, setResetNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [googleReady, setGoogleReady] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // --- TERMS & CONDITIONS STATE ---
  const [termsOpen, setTermsOpen] = useState(false)
  const [termsScrolledBottom, setTermsScrolledBottom] = useState(false)

  const [repoSearchValue, setRepoSearchValue] = useState("")

  useEffect(() => {
    const currentPhrase = phrases[phraseIndex]
    const timeout = isDeleting ? 50 : 100

    if (!isDeleting && charIndex === currentPhrase.length) {
      const timer = setTimeout(() => setIsDeleting(true), 1800)
      return () => clearTimeout(timer)
    }

    if (isDeleting && charIndex === 0) {
      const timer = setTimeout(() => {
        setIsDeleting(false)
        setPhraseIndex((prev) => (prev + 1) % phrases.length)
      }, 400)
      return () => clearTimeout(timer)
    }

    const timer = setTimeout(() => {
      setCharIndex((prev) => prev + (isDeleting ? -1 : 1))
    }, timeout)

    return () => clearTimeout(timer)
  }, [charIndex, isDeleting, phraseIndex])

  // --- GOOGLE CALLBACK ---
  const googleCallbackRef = useRef()
  googleCallbackRef.current = async (response) => {
    if (isOffline) {
      setLoginNotice({
        visible: true,
        type: "error",
        title: "Network Offline",
        message: "Please connect to the internet to sign in.",
      })
      return
    }

    if (!response?.credential) {
      setLoginNotice({
        visible: true,
        type: "error",
        title: "Google sign-in failed",
        message: "No Google credential was received.",
      })
      return
    }

    setTermsOpen(false) // Close modal upon success

    try {
      setGoogleLoading(true)
      setLoginNotice({ visible: false, type: "info", title: "", message: "" })

      const result = await signInWithGoogleIdToken(response.credential)
      const signedInUser = result.auth?.user || result.auth?.session?.user

      if (!signedInUser) {
        throw new Error("Google sign-in did not return a valid user.")
      }

      const currentProfile = await supabase
        .from("profiles")
        .select("*")
        .eq("id", signedInUser.id)
        .maybeSingle()

      if (currentProfile.error) {
        throw new Error("Could not verify your profile. Please try again.")
      }

      if (currentProfile.data?.is_suspended === true) {
        await signOutUser()
        throw new Error("Your account has been restricted. Please contact support.")
      }

      await updateLastActiveIp(signedInUser.id, result.ipData.ip)
      
      setLoginNotice({
        visible: true,
        type: "success",
        title: "Google sign-in successful",
        message: "Opening your dashboard...",
      })

    } catch (error) {
      setLoginNotice({
        visible: true,
        type: "error",
        title: "Google sign-in failed",
        message: error.message || "Please try again.",
      })
      setGoogleLoading(false)
    }
  }

  // Initialize Standard Google Sign-in
  useEffect(() => {
    const clientId =
      "237791711830-h0kb3jmuq122l276e64dc6jbl5tluesu.apps.googleusercontent.com"

    function initializeGoogle() {
      if (!window.google?.accounts?.id) return

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => googleCallbackRef.current(res),
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

  function handleStartGoogle() {
    setLoginNotice({ visible: false, type: "info", title: "", message: "" })
    setTermsScrolledBottom(false)
    setTermsOpen(true)
  }

  const currentPhraseText = useMemo(
    () => phrases[phraseIndex].slice(0, charIndex),
    [phraseIndex, charIndex]
  )

  function validateLogin() {
    const errors = {}
    if (!loginForm.email.trim()) {
      errors.email = "Email address is required."
    } else if (!isValidEmail(loginForm.email)) {
      errors.email = "Enter a valid email address."
    }
    if (!loginForm.password) {
      errors.password = "Password is required."
    }
    setLoginErrors(errors)
    return errors
  }

  async function handleEmailLogin(event) {
    event.preventDefault()

    if (isOffline) {
      setLoginNotice({
        visible: true,
        type: "error",
        title: "Network Offline",
        message: "Please connect to the internet to sign in.",
      })
      return
    }

    const errors = validateLogin()
    if (Object.keys(errors).length > 0) return

    try {
      setLoginLoading(true)
      setLoginNotice({ visible: false, type: "info", title: "", message: "" })

      const result = await signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      })

      const signedInUser = result.auth?.user || result.auth?.session?.user
      if (!signedInUser) {
        throw new Error("Login did not return a valid user session.")
      }

      const currentProfile = await supabase
        .from("profiles")
        .select("*")
        .eq("id", signedInUser.id)
        .maybeSingle()

      if (currentProfile.error) {
        throw new Error("Could not verify your profile. Please try again.")
      }

      if (currentProfile.data?.is_suspended === true) {
        await signOutUser()
        throw new Error("Your account has been restricted. Please contact support.")
      }

      await updateLastActiveIp(signedInUser.id, result.ipData.ip)
      
      setLoginNotice({
        visible: true,
        type: "success",
        title: "Login successful",
        message: "Opening your dashboard...",
      })
      
    } catch (error) {
      setLoginNotice({
        visible: true,
        type: "error",
        title: "Login failed",
        message: error.message || "We could not sign you in. Check your connection and try again.",
      })
      setLoginLoading(false)
    }
  }

  function openResetFlow() {
    setResetNotice({ visible: false, type: "info", title: "", message: "" })
    setResetEmailErrors({})
    setResetPasswordErrors({})
    setResetEmailForm({ email: loginForm.email || "" })
    setResetEmailOpen(true)
  }

  async function handleSendResetCode() {
    if (isOffline) {
      setResetNotice({
        visible: true,
        type: "error",
        title: "Network Offline",
        message: "Please connect to the internet to reset your password.",
      })
      return
    }

    const errors = validateResetRequestForm(resetEmailForm)
    setResetEmailErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      setSendingReset(true)
      setResetNotice({ visible: false, type: "info", title: "", message: "" })

      await sendPasswordResetCode(resetEmailForm.email)

      setResetNotice({
        visible: true,
        type: "success",
        title: "Recovery code sent",
        message: "Check your email for the 6-digit recovery code.",
      })

      setResetEmailOpen(false)
      setResetPasswordOpen(true)
    } catch (error) {
      setResetNotice({
        visible: true,
        type: "error",
        title: "Could not send code",
        message: error.message || "Please try again.",
      })
    } finally {
      setSendingReset(false)
    }
  }

  async function handleResetPassword() {
    if (isOffline) {
      setResetNotice({
        visible: true,
        type: "error",
        title: "Network Offline",
        message: "Please connect to the internet to confirm your new password.",
      })
      return
    }

    const errors = validateResetPasswordForm(resetPasswordForm)
    setResetPasswordErrors(errors)
    if (Object.keys(errors).length > 0) return

    try {
      setResettingPassword(true)
      setResetNotice({ visible: false, type: "info", title: "", message: "" })

      await verifyRecoveryCodeAndResetPassword({
        email: resetEmailForm.email,
        token: resetPasswordForm.token,
        newPassword: resetPasswordForm.newPassword,
      })

      setResetNotice({
        visible: true,
        type: "success",
        title: "Password updated",
        message: "You can now sign in with your new password.",
      })

      setResetPasswordOpen(false)
      setLoginForm((prev) => ({
        ...prev,
        email: resetEmailForm.email,
        password: "",
      }))
    } catch (error) {
      setResetNotice({
        visible: true,
        type: "error",
        title: "Reset failed",
        message: error.message || "Please try again.",
      })
    } finally {
      setResettingPassword(false)
    }
  }

  function handleRepoSearch() {
    const value = repoSearchValue.trim()
    if (!value) return
    navigate(`/reposearch?merchantId=${encodeURIComponent(value)}`)
  }

  return (
    <MainLayout>
      <section className="bg-pink-50 px-4 py-4 md:py-5">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
          
          {/* --- CAROUSEL CONTAINER (BALANCED FULL-BLEED) --- */}
          <div className="-mx-4 -mt-4 mb-2 bg-pink-200 p-0 shadow-sm md:m-0 md:rounded-[28px] md:p-1 lg:col-start-1 lg:row-start-1">
            <div className="relative min-h-[280px] sm:min-h-[320px] md:min-h-[420px] overflow-hidden rounded-none border-b border-pink-100 bg-slate-900 shadow-lg md:rounded-[24px] md:border">
              
              {/* --- DYNAMIC FADING CAROUSEL --- */}
              {bannerImages.map((imgSrc, index) => (
                <img 
                  key={index}
                  src={imgSrc} 
                  alt={`Commerce Banner ${index + 1}`} 
                  fetchpriority={index === 0 ? "high" : "auto"}
                  className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-[2500ms] ease-in-out ${
                    currentBanner === index ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
              
              {/* Gradient Overlay */}
              <div className="absolute inset-0 z-[5] bg-gradient-to-t from-slate-950/90 via-slate-900/20 to-transparent"></div>
              
              <div className="relative z-10 flex h-full min-h-[280px] sm:min-h-[320px] md:min-h-[420px] flex-col justify-end">
                <div className="flex w-full flex-wrap justify-center gap-3 border-t border-white/20 bg-slate-900/60 px-4 py-3 text-xs font-semibold text-white backdrop-blur-md md:gap-4 md:py-4 md:text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-emerald-400">●</span> Commerce
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-pink-400">●</span> Discover Locally
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-sky-400">●</span> Unique ID
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* --- END CAROUSEL CONTAINER --- */}

          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="flex h-full flex-col rounded-[24px] border border-pink-100 bg-white p-6 md:p-8">
              <div className="min-h-[34px] text-lg font-extrabold text-slate-900 md:text-2xl">
                {currentPhraseText}
                <span className="ml-1 inline-block animate-pulse text-pink-600">
                  |
                </span>
              </div>

              <p className="mt-4 max-w-xl text-base font-medium leading-7 text-slate-600">
                We provide a digital repository of physical shops, their
                products, and locations within a city.
              </p>

              <div className="mt-6 rounded-[22px] bg-pink-200 p-1">
                <div className="rounded-[18px] bg-slate-900 p-5 text-white">
                  <p className="mb-2 text-sm font-bold text-amber-300">
                    Search Repository
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      value={repoSearchValue}
                      onChange={(e) => setRepoSearchValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRepoSearch()
                      }}
                      placeholder="Enter Merchant ID..."
                      className="w-full rounded-full border border-white/20 bg-white/10 px-5 py-3 pr-12 text-sm text-white outline-none placeholder:text-white/50 focus:border-pink-400 focus:ring-4 focus:ring-pink-500/20"
                    />
                    <button
                      type="button"
                      onClick={handleRepoSearch}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 transition hover:text-pink-300"
                      aria-label="Search repository"
                    >
                      <FaSearch />
                    </button>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <FaInfoCircle />
                    Search by unique ID, for example 209234
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-[22px] bg-pink-200 p-1">
                <div className="rounded-[18px] border border-pink-200 bg-pink-50 p-6">
                  <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
                    <FaLock className="text-pink-600" />
                    <span>Users Login</span>
                  </h2>

                  <form className="mt-5 space-y-4" onSubmit={handleEmailLogin}>
                    <AuthInput
                      id="hero-email"
                      label="Email address"
                      type="email"
                      value={loginForm.email}
                      onChange={(e) =>
                        setLoginForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      placeholder="name@example.com"
                      error={loginErrors.email}
                      required
                      icon={<FaEnvelope />}
                      autoComplete="email"
                    />

                    <AuthInput
                      id="hero-password"
                      label="Password"
                      type={showPassword ? "text" : "password"}
                      value={loginForm.password}
                      onChange={(e) =>
                        setLoginForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      placeholder="Enter your password"
                      error={loginErrors.password}
                      required
                      icon={<FaLock />}
                      autoComplete="current-password"
                      rightElement={
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="rounded-full p-2 text-slate-400 transition hover:bg-white hover:text-pink-600"
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                        >
                          {showPassword ? <FaEyeSlash /> : <FaEye />}
                        </button>
                      }
                    />

                    <div className="text-right">
                      <button
                        type="button"
                        onClick={openResetFlow}
                        className="text-sm font-semibold text-slate-600 transition hover:text-pink-600"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <AuthButton type="submit" loading={loginLoading}>
                      <span>Secure Sign In</span>
                      <FaArrowRight />
                    </AuthButton>
                  </form>

                  <AuthNotification
                    visible={loginNotice.visible}
                    type={loginNotice.type}
                    title={loginNotice.title}
                    message={loginNotice.message}
                  />

                  <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <div className="h-px flex-1 bg-pink-200" />
                    <span>New to CTMerchant?</span>
                    <div className="h-px flex-1 bg-pink-200" />
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate("/create-account")}
                    className="w-full rounded-xl border-2 border-pink-200 bg-white px-4 py-3 text-base font-bold text-slate-900 transition hover:bg-pink-100"
                  >
                    Create Account
                  </button>

                  <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <div className="h-px flex-1 bg-pink-200" />
                    <span>Or continue with</span>
                    <div className="h-px flex-1 bg-pink-200" />
                  </div>

                  <div className="space-y-3">
                    {/* CUSTOM GOOGLE BUTTON TRIGGERS MODAL */}
                    <button
                      type="button"
                      disabled={!googleReady || googleLoading}
                      onClick={handleStartGoogle}
                      className="flex h-[44px] w-full items-center justify-center gap-3 rounded-lg border border-[#747775] bg-white px-4 font-medium text-[#1f1f1f] shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.7 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      </svg>
                      {googleLoading ? "Signing in..." : "Continue with Google"}
                    </button>
                  </div>

                  <AuthNotification
                    visible={resetNotice.visible}
                    type={resetNotice.type}
                    title={resetNotice.title}
                    message={resetNotice.message}
                  />
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[22px] bg-pink-200 p-1">
                  <div className="flex items-center gap-3 rounded-[18px] border border-pink-100 bg-slate-50 p-4">
                    <div className="text-2xl">🛡️</div>
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900">
                        100% Verified
                      </h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Physical Shops Only
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[22px] bg-pink-200 p-1">
                  <div className="flex items-center gap-3 rounded-[18px] border border-pink-100 bg-slate-50 p-4">
                    <div className="text-2xl">🤝</div>
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900">
                        Zero Fraud
                      </h3>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                        Secure Marketplace
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-1 lg:row-start-2">
            <div className="h-full rounded-[24px] border border-pink-100 bg-white p-6 md:p-8">
              <span className="inline-block rounded-full border border-pink-200 bg-pink-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-pink-700">
                Repository of Shops, Products and Services
              </span>

              <h2 className="mt-4 text-2xl font-extrabold text-slate-900 md:text-3xl">
                Grow Your Physical Shop Digitally
              </h2>

              <p className="mt-4 text-base leading-8 text-slate-600">
                CTMerchant is a structured repository of shops, products, and
                services within a city. We onboard and physically verify
                merchants to reduce fraudulent online claims and help customers
                discover real businesses around them.
              </p>

              <p className="mt-4 text-base leading-8 text-slate-600">
                Our platform helps consumers compare shops, products, and
                options before visiting a store, creating a better balance
                between digital convenience and physical marketplace reality.
              </p>

              <ul className="mt-6 space-y-3 text-sm font-semibold text-slate-700 md:text-base">
                <li>✓ Get a verified digital storefront</li>
                <li>✓ Unique CTMerchant ID to share</li>
                <li>✓ Be discovered in city repository search</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {resetEmailOpen ? (
        <SimpleModal
          title="Reset Password"
          subtitle="Enter your email address to receive a 6-digit recovery code."
          onClose={() => setResetEmailOpen(false)}
        >
          <div className="space-y-4">
            <AuthInput
              id="reset-email"
              label="Registered email"
              type="email"
              value={resetEmailForm.email}
              onChange={(e) => setResetEmailForm({ email: e.target.value })}
              placeholder="name@example.com"
              error={resetEmailErrors.email}
              required
              icon={<FaEnvelope />}
            />

            <AuthButton onClick={handleSendResetCode} loading={sendingReset}>
              Send Reset Code
            </AuthButton>

            <button
              type="button"
              onClick={() => setResetEmailOpen(false)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </SimpleModal>
      ) : null}

      {resetPasswordOpen ? (
        <SimpleModal
          title="Create New Password"
          subtitle="Enter the 6-digit code we sent to your email."
          onClose={() => setResetPasswordOpen(false)}
        >
          <div className="space-y-4">
            <AuthInput
              id="reset-token"
              label="6-digit recovery code"
              value={resetPasswordForm.token}
              onChange={(e) =>
                setResetPasswordForm((prev) => ({
                  ...prev,
                  token: e.target.value,
                }))
              }
              placeholder="123456"
              error={resetPasswordErrors.token}
              required
              icon={<FaHashtag />}
              maxLength={6}
            />

            <AuthInput
              id="reset-new-password"
              label="New password"
              type="password"
              value={resetPasswordForm.newPassword}
              onChange={(e) =>
                setResetPasswordForm((prev) => ({
                  ...prev,
                  newPassword: e.target.value,
                }))
              }
              placeholder="Enter new password"
              error={resetPasswordErrors.newPassword}
              required
              icon={<FaLock />}
            />

            <AuthInput
              id="reset-confirm-password"
              label="Confirm password"
              type="password"
              value={resetPasswordForm.confirmPassword}
              onChange={(e) =>
                setResetPasswordForm((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
              placeholder="Confirm new password"
              error={resetPasswordErrors.confirmPassword}
              required
              icon={<FaLock />}
            />

            <AuthButton onClick={handleResetPassword} loading={resettingPassword}>
              Confirm & Reset Password
            </AuthButton>

            <button
              type="button"
              onClick={() => setResetPasswordOpen(false)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </SimpleModal>
      ) : null}

      {/* --- TERMS & PRIVACY MODAL --- */}
      {termsOpen && (
        <TermsPrivacyModal
          onClose={() => setTermsOpen(false)}
          confirmDisabled={!termsScrolledBottom || isOffline}
          onScrolledBottom={() => setTermsScrolledBottom(true)}
        />
      )}

    </MainLayout>
  )
}

function SimpleModal({ title, subtitle, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-pink-100 bg-white p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        {children}

        <button
          type="button"
          onClick={onClose}
          className="absolute left-[-9999px]"
          aria-hidden="true"
          tabIndex={-1}
        />
      </div>
    </div>
  )
}

// --- EXTRACTED MODAL COMPONENT (Just like CreateAccount.jsx) ---
function TermsPrivacyModal({
  onClose,
  confirmDisabled,
  onScrolledBottom,
}) {
  const googleWrapperRef = useRef(null)

  function handleScroll(event) {
    const el = event.currentTarget
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12
    if (atBottom) onScrolledBottom()
  }

  useEffect(() => {
    // Only render the real Google button once they scroll to the bottom
    if (!confirmDisabled && window.google && googleWrapperRef.current) {
      try {
        window.google.accounts.id.renderButton(googleWrapperRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          width: 320,
          text: "continue_with"
        })
      } catch (err) {
        console.error("Google button render error:", err)
      }
    }
  }, [confirmDisabled])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[28px] border border-pink-100 bg-white p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <FaFileContract className="text-pink-600" />
            Agreements & Policies
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Please read through and scroll to the bottom before continuing.
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
          <p className="mt-3 font-semibold text-pink-700">By continuing, you agree to these policies and platform conditions.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">
          Scroll to the bottom to unlock Google Sign-in.
        </div>

        <div className="mt-4 space-y-3">
          
          {confirmDisabled ? (
            <button disabled={true} className="flex h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-slate-200 font-bold text-slate-400 opacity-70 cursor-not-allowed">
              <FaUserCheck />
              <span>Scroll down to unlock</span>
            </button>
          ) : (
            <div className="flex justify-center w-full min-h-[44px]">
              <div ref={googleWrapperRef} />
            </div>
          )}

          <button type="button" onClick={onClose} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            Cancel Sign-in
          </button>
        </div>
      </div>
    </div>
  )
}

export default Home