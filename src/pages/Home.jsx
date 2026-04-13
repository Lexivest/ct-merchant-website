import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  FaArrowRight,
  FaInfoCircle,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaHashtag,
  FaLock,
  FaSearch,
} from "react-icons/fa"
import { FaFacebookF, FaXTwitter, FaYoutube } from "react-icons/fa6"
import MainLayout from "../layouts/MainLayout"
import AuthInput from "../components/auth/AuthInput"
import AuthButton from "../components/auth/AuthButton"
import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
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
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import {
  buildShopDetailPrefetchFromRepoSearch,
  getRepoSearchCooldownMessage,
  invokeRepoSearch,
} from "../lib/repoSearch"
import {
  getAuthScreenTransitionMessage,
  preloadCreateAccountScreen,
  preloadDashboardScreen,
} from "../lib/authScreenTransitions"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"

// --- LOCAL ASSET IMPORTS FOR CAROUSEL ---
import banner2 from "../assets/images/banner2.jpg"
import banner3 from "../assets/images/banner3.jpg"

const bannerImages = [banner2, banner3]

const phrases = [
  "Verified Merchants",
  "Safe and Secure",
  "Boost Your Business",
]

const socialLinks = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/share/17V9mqeTkv/",
    icon: FaFacebookF,
    accent: "bg-[#1877F2]",
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@CTMerchantNG",
    icon: FaYoutube,
    accent: "bg-[#FF0000]",
  },
  {
    label: "X",
    href: "https://x.com/CTMerchantNG",
    icon: FaXTwitter,
    accent: "bg-slate-900",
  },
]

const testimonials = [
  {
    type: "Merchant",
    quote:
      "Placeholder testimonial: CTMerchant helped more customers discover my shop and ask for products before visiting.",
    author: "Merchant Name",
    detail: "Fashion Retailer, Jos",
  },
  {
    type: "User",
    quote:
      "Placeholder testimonial: I was able to compare options quickly and confirm the shop location before stepping out.",
    author: "Customer Name",
    detail: "Marketplace User, Kaduna",
  },
  {
    type: "Merchant",
    quote:
      "Placeholder testimonial: Sharing my CTMerchant ID and storefront made my business look more organized and trustworthy.",
    author: "Business Owner",
    detail: "Home Essentials Store, Plateau",
  },
]

function Home() {
  const location = useLocation()
  const navigate = useNavigate()

  // 1. Hook into global auth state
  const { session, user, profile, suspended, isOffline, loading: authLoading } = useAuthSession()
  const { notify } = useGlobalFeedback()
  const shouldRedirectToDashboard = Boolean(user) && !suspended && !isOffline
  const holdForExistingSession = shouldRedirectToDashboard && authLoading
  const transitionRetryRef = useRef(null)
  const [transitionState, setTransitionState] = useState({
    pending: false,
    error: "",
  })

  function beginTransition(retryAction = null) {
    transitionRetryRef.current = retryAction
    setTransitionState({
      pending: true,
      error: "",
    })
  }

  function failTransition(message, retryAction = null, originalError = null) {
    transitionRetryRef.current = retryAction
    setTransitionState({
      pending: false,
      error: originalError || message,
    })
  }

  function dismissTransitionError() {
    transitionRetryRef.current = null
    setTransitionState({
      pending: false,
      error: "",
    })
  }

  async function openCreateAccountWithTransition() {
    beginTransition(openCreateAccountWithTransition)

    try {
      await preloadCreateAccountScreen()
      navigate("/create-account")
      return true
    } catch (error) {
      failTransition(
        getAuthScreenTransitionMessage(
          error,
          "We could not open create account right now. Please try again."
        ),
        openCreateAccountWithTransition
      )
      return false
    }
  }

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

  // --- BANNER CAROUSEL STATE & TIMER ---
  const [currentBanner, setCurrentBanner] = useState(0)

  useEffect(() => {
    const bannerTimer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % bannerImages.length)
    }, 7500)
    return () => clearInterval(bannerTimer)
  }, [])

  useEffect(() => {
    bannerImages.forEach((src) => {
      const preload = new Image()
      preload.src = src
    })
  }, [])

  const [phraseIndex, setPhraseIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  const [loginForm, setLoginForm] = useState({ email: "", password: "" })
  const [loginErrors, setLoginErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)

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

  const [googleReady, setGoogleReady] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const googleButtonRef = useRef(null)

  const [repoSearchValue, setRepoSearchValue] = useState("")
  const [repoSearchLoading, setRepoSearchLoading] = useState(false)

  // 2. Smooth Auto-Redirect
  useEffect(() => {
    if (
      !authLoading &&
      shouldRedirectToDashboard &&
      !loginLoading &&
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
    loginLoading,
    profile,
    session,
    shouldRedirectToDashboard,
    suspended,
    transitionState.error,
    transitionState.pending,
    user,
    openDashboardWithTransition,
  ])

  useEffect(() => {
    const prefillEmail = location.state?.prefillEmail
    if (!prefillEmail || typeof prefillEmail !== "string") return

    setLoginForm((prev) => ({
      ...prev,
      email: prev.email || prefillEmail,
    }))
  }, [location.state])

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
      notify({
        type: "error",
        title: "Network Offline",
        message: "Please connect to the internet to sign in.",
      })
      return
    }

    if (!response?.credential) {
      notify({
        type: "error",
        title: "Google sign-in failed",
        message: "No Google credential was received.",
      })
      return
    }

    try {
      setGoogleLoading(true)

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
        throw new Error("Your account is suspended. Please contact support.")
      }

      await updateLastActiveIp(signedInUser.id, result.ipData.ip)
      const didOpenDashboard = await openDashboardWithTransition({
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
      const message = getFriendlyErrorMessage(error, "Please try again.")
      
      let title = "Google sign-in failed"
      if (message.toLowerCase().includes("remaining before")) {
        title = "Warning"
      } else if (/suspended|restricted/i.test(message)) {
        title = "Account suspended"
      }

      notify({
        type: "error",
        title,
        message,
      })
      setGoogleLoading(false)
    }
  }

  // Initialize and render Google Sign-in button
  useEffect(() => {
    const clientId =
      "504776303212-4s0mgf9qd3hlpfhld5fdgpore65m6tfl.apps.googleusercontent.com"

      function mountGoogleButton() {
        if (!window.google?.accounts?.id || !googleButtonRef.current) return false

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (res) => googleCallbackRef.current(res),
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      googleButtonRef.current.innerHTML = ""
      const buttonWidth = Math.max(
        240,
        Math.min(340, googleButtonRef.current.parentElement?.clientWidth || 320)
      )
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: "standard",
        theme: "outline",
        text: "continue_with",
        size: "large",
        shape: "rectangular",
        logo_alignment: "left",
        width: buttonWidth,
      })

      setGoogleReady(true)
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
  }, [])

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
      notify({
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
        throw new Error("Your account is suspended. Please contact support.")
      }

      await updateLastActiveIp(signedInUser.id, result.ipData.ip)
      const didOpenDashboard = await openDashboardWithTransition({
        session: result.auth?.session || null,
        user: signedInUser,
        profile: currentProfile.data || null,
        suspended: false,
        profileLoaded: true,
      })

      if (!didOpenDashboard) {
        setLoginLoading(false)
      }

    } catch (error) {
      const message = getFriendlyErrorMessage(error, "We could not sign you in. Check your connection and try again.")
      
      let title = "Login failed"
      if (message.toLowerCase().includes("remaining before")) {
        title = "Warning"
      } else if (/suspended|restricted/i.test(message)) {
        title = "Account suspended"
      }

      notify({
        type: "error",
        title,
        message,
      })
      setLoginLoading(false)
    }
  }

  function openResetFlow() {
    setResetEmailErrors({})
    setResetPasswordErrors({})
    setResetEmailForm({ email: loginForm.email || "" })
    setResetEmailOpen(true)
  }

  async function handleSendResetCode() {
    if (isOffline) {
      notify({
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

      await sendPasswordResetCode(resetEmailForm.email)

      notify({
        type: "success",
        title: "Recovery code sent",
        message: "Check your email for the 6-digit recovery code.",
        autoCloseMs: 1400,
      })

      setResetEmailOpen(false)
      setResetPasswordOpen(true)
    } catch (error) {
      notify({
        type: "error",
        title: "Could not send code",
        message: getFriendlyErrorMessage(error, "Please try again."),
      })
    } finally {
      setSendingReset(false)
    }
  }

  async function handleResetPassword() {
    if (isOffline) {
      notify({
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

      await verifyRecoveryCodeAndResetPassword({
        email: resetEmailForm.email,
        token: resetPasswordForm.token,
        newPassword: resetPasswordForm.newPassword,
      })

      notify({
        type: "success",
        title: "Password updated",
        message: "You can now sign in with your new password.",
        autoCloseMs: 1400,
      })

      setResetPasswordOpen(false)
      setLoginForm((prev) => ({
        ...prev,
        email: resetEmailForm.email,
        password: "",
      }))
    } catch (error) {
      notify({
        type: "error",
        title: "Reset failed",
        message: getFriendlyErrorMessage(error, "Please try again."),
      })
    } finally {
      setResettingPassword(false)
    }
  }

  async function handleRepoSearch() {
    const value = repoSearchValue.trim()
    if (!value || repoSearchLoading) return
    const retryAction = () => handleRepoSearch()

    if (isOffline) {
      notify({
        type: "error",
        title: "Network Offline",
        message: "Please connect to the internet to search the repository.",
      })
      return
    }

    try {
      setRepoSearchLoading(true)
      beginTransition(retryAction)

      const { data, error } = await invokeRepoSearch(value)

      if (data?.rate_limited) {
        notify({
          type: "info",
          title: "Search cooling down",
          message: getRepoSearchCooldownMessage(data),
        })
        dismissTransitionError()
        return
      }

      if (error) {
        throw new Error("Service unavailable. Please try again.")
      }

      if (data?.shop?.id) {
        const shopId = data.shop.id
        const prefetchedShopData =
          buildShopDetailPrefetchFromRepoSearch(data) ||
          (await prepareShopDetailTransition({
            shopId,
            userId: user?.id || null,
          }))

        navigate(`/shop-detail?id=${shopId}`, {
          state: {
            fromDiscoveryTransition: true,
            prefetchedShopData,
          },
        })
        return
      }

      if (data?.error || data?.not_found || !data?.shop) {
        notify({
          type: "info",
          title: "Shop not found",
          message: "We could not find any shop with that repository ID.",
        })
        dismissTransitionError()
        return
      }

      navigate(`/reposearch?merchantId=${encodeURIComponent(value)}`)
    } catch (error) {
      notify({
        type: "error",
        title: "Repository search failed",
        message: getFriendlyErrorMessage(error, "Please try again."),
      })
      failTransition(
        getFriendlyErrorMessage(error, "Repository search failed. Please try again."),
        retryAction
      )
    } finally {
      setRepoSearchLoading(false)
    }
  }

  // --- RENDER ERROR STATE ---
  if (transitionState.error) {
    const errorObj = transitionState.error instanceof Error 
      ? transitionState.error 
      : new Error(String(transitionState.error))

    return (
      <GlobalErrorScreen
        error={errorObj}
        onRetry={() => {
          if (transitionRetryRef.current) {
            transitionRetryRef.current()
          } else {
            window.location.reload()
          }
        }}
        onBack={dismissTransitionError}
        backLabel="Back to home"
      />
    )
  }

  return (
    <>
      <div
        className={
          transitionState.pending || holdForExistingSession
            ? "pointer-events-none select-none"
            : ""
        }
      >
        <MainLayout>
          <PageSeo
            title="CTMerchant | Repository of Shops, Products and Services"
            description="Discover verified physical shops, browse local products, and connect with real merchants across your city."
            canonicalPath="/"
          />
          <section className="overflow-x-hidden bg-pink-50 px-4 py-4 md:py-5">
        <div className="mx-auto mb-4 w-full max-w-7xl lg:hidden">
          <div className="overflow-hidden rounded-[22px] border border-pink-100 bg-white p-2 shadow-sm">
            <div className="flex h-[48px] w-full overflow-hidden rounded-[16px] border-[3px] border-transparent bg-pink-50 transition focus-within:border-pink-600">
              <input
                type="text"
                value={repoSearchValue}
                onChange={(e) => setRepoSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRepoSearch()
                }}
                placeholder="Enter ID to view online stores"
                className="min-w-0 flex-1 border-none bg-transparent px-4 text-base font-medium text-[#0F1111] outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={handleRepoSearch}
                disabled={repoSearchLoading}
                className="flex w-[56px] items-center justify-center bg-pink-600 text-white transition hover:bg-pink-700"
                aria-label="Search repository"
              >
                {repoSearchLoading ? "..." : <FaSearch />}
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-6 lg:grid-cols-2 lg:grid-rows-[auto_1fr]">
          <div className="mb-2 min-w-0 bg-pink-200 p-0 shadow-sm md:rounded-[28px] md:p-1 lg:col-start-1 lg:row-start-1">
            <div className="overflow-hidden rounded-[24px] border border-pink-100 bg-white shadow-lg">
              <div className="relative aspect-video w-full max-h-[400px] overflow-hidden bg-white">
                <img
                  key={currentBanner}
                  src={bannerImages[currentBanner] || bannerImages[0]}
                  alt={`Commerce Banner ${currentBanner + 1}`}
                  fetchPriority={currentBanner === 0 ? "high" : "auto"}
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  loading={currentBanner === 0 ? "eager" : "lazy"}
                />
              </div>

              <div className="flex w-full flex-wrap justify-center gap-4 border-t border-white/20 bg-slate-900/60 px-4 py-3 text-xs font-semibold text-white backdrop-blur-md md:gap-5 md:py-4 md:text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Commerce
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-pink-400" />
                  Discover Locally
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                  Unique ID
                </span>
              </div>
            </div>
          </div>

          <div className="min-w-0 rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="flex h-full flex-col rounded-[24px] border border-pink-100 bg-white p-6 md:p-8">
              <div className="hidden rounded-[22px] bg-pink-200 p-1 lg:block">
                <div className="rounded-[18px] border border-pink-100 bg-slate-50 p-4">
                  <div className="flex h-[42px] overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
                    <input
                      type="text"
                      value={repoSearchValue}
                      onChange={(e) => setRepoSearchValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRepoSearch()
                      }}
                      placeholder="Enter ID to view online stores"
                      className="min-w-0 flex-1 border-none px-4 text-base text-[#0F1111] outline-none placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={handleRepoSearch}
                      disabled={repoSearchLoading}
                      className="flex w-[52px] items-center justify-center bg-pink-600 text-white transition hover:bg-pink-700"
                      aria-label="Search repository"
                    >
                      {repoSearchLoading ? "..." : <FaSearch />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 min-h-[28px] text-lg font-extrabold leading-tight text-slate-900 md:min-h-[32px] md:text-2xl">
                {currentPhraseText}
                <span className="ml-1 inline-block animate-pulse text-pink-600">|</span>
              </div>

              <p className="mt-2 max-w-xl text-base font-medium leading-7 text-slate-600">
                We provide a digital repository of physical shops, their products, and locations within a city.
              </p>

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
                          aria-label={showPassword ? "Hide password" : "Show password"}
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

                  <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <div className="h-px flex-1 bg-pink-200" />
                    <span>New to CTMerchant?</span>
                    <div className="h-px flex-1 bg-pink-200" />
                  </div>

                  <button
                    type="button"
                    onClick={openCreateAccountWithTransition}
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
                    <div className="relative flex min-h-[44px] w-full items-center justify-center">
                      <div ref={googleButtonRef} className="w-full" />
                      {!googleReady ? (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-[#DADCE0] bg-white text-xs font-semibold text-[#5F6368]">
                          Preparing Google sign-in...
                        </div>
                      ) : null}
                      {googleLoading ? (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/85 text-sm font-bold text-slate-700">
                          Signing in...
                        </div>
                      ) : null}
                    </div>

                    <p className="px-2 text-center text-[0.75rem] leading-relaxed text-slate-500">
                      By continuing with Google, you agree to CTMerchant's{' '}
                      <a href="/terms" target="_blank" className="font-semibold text-slate-600 underline transition hover:text-pink-600">
                        Terms of Use
                      </a>{' '}
                      and{' '}
                      <a href="/privacy" target="_blank" className="font-semibold text-slate-600 underline transition hover:text-pink-600">
                        Privacy Policy
                      </a>
                      .
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-1 lg:row-start-2">
            <div className="h-full rounded-[24px] border border-pink-100 bg-white p-6 md:p-8">
              <span className="inline-block rounded-full border border-pink-200 bg-pink-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-pink-700">
                Testimonials
              </span>

              <h2 className="mt-4 text-2xl font-extrabold text-slate-900 md:text-3xl">
                What Merchants And Users Are Saying
              </h2>

              <p className="mt-4 text-base leading-8 text-slate-600">
                Placeholder feedback from real merchants and customers will appear here as the platform continues to grow.
              </p>

              <div className="mt-6 space-y-4">
                {testimonials.map((item) => (
                  <div
                    key={`${item.type}-${item.author}`}
                    className="rounded-[22px] border border-pink-100 bg-pink-50 p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex rounded-full bg-white px-3 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.18em] text-pink-600">
                        {item.type}
                      </span>
                      <FaInfoCircle className="shrink-0 text-pink-400" />
                    </div>
                    <p className="mt-4 text-base font-medium leading-8 text-slate-700">
                      "{item.quote}"
                    </p>
                    <div className="mt-4">
                      <div className="text-sm font-extrabold text-slate-900">{item.author}</div>
                      <div className="text-sm text-slate-500">{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-[22px] border border-pink-100 bg-pink-50 p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-extrabold uppercase tracking-[0.2em] text-pink-600">
                      Follow CTMerchant
                    </p>
                    <h3 className="mt-1 text-lg font-extrabold text-slate-900">
                      Stay connected across our official channels
                    </h3>
                  </div>
                  <p className="text-sm text-slate-500">
                    News, updates, highlights, and marketplace stories.
                  </p>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {socialLinks.map((item) => {
                    const Icon = item.icon
                    return (
                      <a
                        key={item.label}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-md"
                      >
                        <span
                          className={`flex h-11 w-11 items-center justify-center rounded-2xl text-lg text-white ${item.accent}`}
                        >
                          <Icon />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-extrabold text-slate-900">
                            {item.label}
                          </span>
                          <span className="block truncate text-xs font-medium text-slate-500 group-hover:text-pink-600">
                            Open channel
                          </span>
                        </span>
                      </a>
                    )
                  })}
                </div>
              </div>
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

        </MainLayout>
      </div>
    </>
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

export default Home
