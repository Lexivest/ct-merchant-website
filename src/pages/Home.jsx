import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  FaArrowRight,
  FaCalendarDays,
  FaClock,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaFacebookF,
  FaHashtag,
  FaLock,
  FaMagnifyingGlass,
  FaTelegram,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6"
import MainLayout from "../layouts/MainLayout"
import AuthInput from "../components/auth/AuthInput"
import AuthButton from "../components/auth/AuthButton"
import PageSeo from "../components/common/PageSeo"
import PwaAddToHomePrompt from "../components/common/PwaAddToHomePrompt"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import BrandText from "../components/common/BrandText"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import {
  sendPasswordResetCode,
  signInWithGoogleIdToken,
  signInWithPassword,
  verifyRecoveryCodeAndResetPassword,
} from "../lib/auth"
import { supabase } from "../lib/supabase"
import {
  isValidEmail,
  validateResetPasswordForm,
  validateResetRequestForm,
} from "../lib/validators"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import StableImage from "../components/common/StableImage"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import {
  buildRepoSearchQuerySuffix,
  buildShopDetailPrefetchFromRepoSearch,
  extractRepoSearchDigits,
  fetchPublicRepoShopDetail,
  getRepoSearchCooldownMessage,
  invokeRepoSearch,
  normalizeRepoSearchId,
  REPO_SEARCH_INTENT_PARAM,
  REPO_SEARCH_INVALID_MESSAGE,
} from "../lib/repoSearch"
import { clampWords, getWordLimitError } from "../lib/textLimits"
import WordLimitCounter from "../components/common/WordLimitCounter"
import {
  fetchHomeHighlights,
} from "../lib/dashboardData"
import {
  getAuthScreenTransitionMessage,
  preloadCreateAccountScreen,
  preloadDashboardScreen,
} from "../lib/authScreenTransitions"
import { createRepoSearchIntent } from "../lib/routeIntents"
import { isServiceCategory, isServiceShop } from "../lib/serviceCategories"

// --- LOCAL ASSET IMPORT ---
import banner from "../assets/images/banner.jpg"

const CONTACT_MESSAGE_WORD_LIMIT = 300

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
  {
    label: "Telegram",
    href: "https://t.me/CTMerchant",
    icon: FaTelegram,
    accent: "bg-[#24A1DE]",
  },
]

const editorialTexture = {
  backgroundImage:
    "radial-gradient(circle at 18% 18%, rgba(201,168,76,0.16), transparent 30%), radial-gradient(circle at 86% 8%, rgba(219,39,119,0.10), transparent 28%), linear-gradient(180deg, #0D0800 0%, #150C04 48%, #090600 100%)",
}

const lightFieldClass =
  "w-full rounded-2xl border border-[#C9A84C]/35 bg-white/80 px-5 py-3 text-sm font-semibold text-[#1B1208] outline-none transition placeholder:text-[#8A6A2A]/55 focus:border-[#9B7A25] focus:bg-white focus:ring-4 focus:ring-[#C9A84C]/15"

function GoldDivider({ label = "City commerce" }) {
  return (
    <div className="flex items-center gap-4">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#C9A84C]/70 to-[#C9A84C]/20" />
      <span className="font-serif text-[0.68rem] uppercase tracking-[0.42em] text-[#8A6A2A]">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#C9A84C]/70 to-[#C9A84C]/20" />
    </div>
  )
}

function HomeCardShell({ children, className = "" }) {
  return (
    <div className={`rounded-[26px] border border-[#C9A84C]/30 bg-[#F7EED8] p-5 text-[#1B1208] shadow-[0_22px_60px_rgba(27,18,8,0.18)] ${className}`}>
      <div className="mb-4 h-1 w-16 rounded-full bg-pink-600" />
      {children}
    </div>
  )
}

function ActivityCalendar() {
  const calendarEvents = [
    { date: "APR 20", title: "Merchant Training Webinar", type: "Virtual" },
    { date: "APR 25", title: "Kaduna Business Meetup", type: "Offline" },
    { date: "MAY 05", title: "New Feature Launch", type: "System" },
  ]

  return (
    <div className="flex w-full flex-col">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C9A84C] text-[#140D05] shadow-sm">
          <FaCalendarDays className="text-xs" />
        </div>
        <h3 className="text-xs font-black tracking-tight text-[#1B1208] uppercase">Activity Calendar</h3>
      </div>

      <div className="w-full divide-y divide-[#C9A84C]/20 overflow-hidden rounded-2xl border border-[#C9A84C]/25 bg-white/80 p-1 shadow-sm">
        {calendarEvents.map((ev, idx) => (
          <div key={idx} className="flex items-center gap-2.5 p-2.5 transition hover:bg-[#F2DCA4]/35">
            <div className="flex h-10 w-10 flex-col items-center justify-center rounded-lg bg-[#C9A84C]/15 text-center shrink-0">
              <span className="text-[8px] font-black text-[#8A6A2A] uppercase tracking-tighter">{ev.date.split(" ")[0]}</span>
              <span className="text-sm font-black text-[#1B1208]">{ev.date.split(" ")[1]}</span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[11px] font-bold leading-tight text-[#1B1208]">{ev.title}</div>
              <div className="mt-0.5 inline-flex rounded-full bg-[#C9A84C]/15 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-[#6A5422]">
                {ev.type}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OfficeSupportCard() {
  return (
    <div className="flex w-full flex-col">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C9A84C] text-[#140D05] shadow-sm">
          <FaClock className="text-xs" />
        </div>
        <h3 className="text-xs font-black tracking-tight text-[#1B1208] uppercase">Office & Support</h3>
      </div>

      <div className="w-full rounded-2xl border border-[#C9A84C]/25 bg-white/80 p-4 text-center shadow-sm">
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs text-[#8A6A2A]"><FaClock /></div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-tighter text-[#1B1208]">Opening Hours</div>
            <p className="mt-0.5 text-[10px] font-medium leading-relaxed text-[#6A5422]">
              Mon - Fri: 8:00 AM - 6:00 PM
            </p>
          </div>
        </div>
        <Link
          to="/contact"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B1208] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#F7EED8] transition hover:bg-pink-600"
        >
          Contact support
          <FaArrowRight />
        </Link>
      </div>
    </div>
  )
}

function HomeFeedbackSection() {
  const { notify } = useGlobalFeedback()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    subject: "General Inquiry",
    message: "",
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === "message" ? clampWords(value, CONTACT_MESSAGE_WORD_LIMIT) : value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.message.trim()) {
      notify({ type: "error", title: "Missing Fields", message: "Please fill in all required details." })
      return
    }

    const messageLimitError = getWordLimitError("Message", formData.message, CONTACT_MESSAGE_WORD_LIMIT)
    if (messageLimitError) {
      notify({ type: "error", title: "Message too long", message: messageLimitError })
      return
    }

    try {
      setIsSubmitting(true)
      const { error } = await supabase.from("contact_messages").insert([{
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        subject: formData.subject,
        message: formData.message.trim(),
      }])
      if (error) throw error
      setFormData({ fullName: "", email: "", subject: "General Inquiry", message: "" })
      notify({ type: "success", title: "Feedback Received", message: "Thank you! Your message has been sent to our team." })
    } catch (err) {
      notify({ type: "error", title: "Submission Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-full rounded-[28px] border border-[#C9A84C]/30 bg-[#F7EED8] p-5 text-[#1B1208] shadow-[0_22px_60px_rgba(27,18,8,0.18)] md:p-7">
      <div className="mb-4">
        <span className="inline-block rounded-full border border-[#C9A84C]/45 bg-[#C9A84C]/15 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-[#6A5422]">
          Share Your Feedback
        </span>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-[#1B1208] md:text-3xl">
          Help Us Improve Your Experience
        </h2>
        <p className="mt-1 text-sm font-medium text-[#6A5422]">
          Have a suggestion or encountered an issue? We'd love to hear from you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[#8A6A2A]">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="e.g. John Doe"
              className={lightFieldClass}
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[#8A6A2A]">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@example.com"
              className={lightFieldClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[#8A6A2A]">Subject</label>
          <select
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            className={lightFieldClass}
          >
            <option>General Inquiry</option>
            <option>Merchant Feedback</option>
            <option>Feature Request</option>
            <option>Technical Issue</option>
          </select>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-[#8A6A2A]">Message</label>
            <WordLimitCounter value={formData.message} limit={CONTACT_MESSAGE_WORD_LIMIT} className="text-[#8A6A2A]" />
          </div>
          <textarea
            name="message"
            rows="4"
            value={formData.message}
            onChange={handleChange}
            placeholder="Tell us what's on your mind..."
            className={`${lightFieldClass} resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#C9A84C] px-6 py-4 text-sm font-black text-[#140D05] transition hover:bg-[#F2DCA4] disabled:opacity-70"
        >
          {isSubmitting ? "Sending Message..." : "Submit Feedback"}
          {!isSubmitting && <FaArrowRight />}
        </button>
      </form>
    </div>
  )
}

function NewsletterSection() {
  const { notify } = useGlobalFeedback()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({ fullName: "", email: "" })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.fullName.trim() || !formData.email.trim()) {
      notify({ type: "error", title: "Required", message: "Please provide your name and email." })
      return
    }

    try {
      setIsSubmitting(true)
      const { error } = await supabase.from("newsletter_subscriptions").insert([{
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
      }])

      if (error) {
        if (error.code === '23505') {
          throw new Error("You are already subscribed to our newsletter.")
        }
        throw error
      }

      setFormData({ fullName: "", email: "" })
      notify({ type: "success", title: "Subscribed!", message: "Welcome to the CTMerchant newsletter." })
    } catch (err) {
      notify({ type: "error", title: "Subscription Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="border-y border-[#C9A84C]/25 bg-[#F7EED8] py-10 text-[#1B1208] md:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <GoldDivider label="Market brief" />
            <div className="mt-6 inline-flex items-center gap-1 rounded-full bg-[#C9A84C]/15 px-4 py-2 text-xs font-black uppercase tracking-widest text-[#6A5422] ring-1 ring-[#C9A84C]/35">
              <BrandText />
              <span>Insider</span>
            </div>
            <h2 className="mt-4 font-serif text-4xl font-semibold tracking-tight md:text-5xl">
              Stay Ahead of the <br />
              <span className="text-[#8A6A2A]">Market Pulse</span>
            </h2>
            <p className="mt-4 max-w-md text-lg font-medium leading-relaxed text-[#6A5422]">
              Join our newsletter to receive weekly insights, new merchant alerts, and exclusive community updates directly in your inbox.
            </p>
          </div>

          <div className="rounded-[32px] border border-[#C9A84C]/30 bg-white/75 p-6 shadow-[0_22px_60px_rgba(27,18,8,0.16)] md:p-8 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A6A2A]">Full Name</label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full rounded-2xl border border-[#C9A84C]/35 bg-white px-6 py-4 text-base font-bold text-[#1B1208] outline-none transition placeholder:text-[#8A6A2A]/55 focus:border-[#9B7A25] focus:ring-2 focus:ring-[#C9A84C]/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8A6A2A]">Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="w-full rounded-2xl border border-[#C9A84C]/35 bg-white px-6 py-4 text-base font-bold text-[#1B1208] outline-none transition placeholder:text-[#8A6A2A]/55 focus:border-[#9B7A25] focus:ring-2 focus:ring-[#C9A84C]/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#C9A84C] px-8 py-4 text-base font-black text-[#140D05] transition hover:bg-[#F2DCA4] disabled:opacity-70"
              >
                {isSubmitting ? "Joining..." : "Join Newsletter"}
                {!isSubmitting && <FaArrowRight />}
              </button>
              
              <p className="text-center text-[10px] font-medium text-[#8A6A2A]">
                We respect your privacy. Unsubscribe at any time.
              </p>
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}

function Home() {
  const location = useLocation()
  const navigate = useNavigate()

  // 1. Hook into global auth state
  const { session, user, profile, suspended, isOffline, loading: authLoading } = useAuthSession()
  const { notify } = useGlobalFeedback()
  const shouldRedirectToDashboard = Boolean(user) && !suspended && !isOffline && profile?.role === "user"
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

  // 1.5. Fetch Highlights (News/Announcements)
  useCachedFetch("home_highlights_v1", fetchHomeHighlights, {
    ttl: 1000 * 60 * 30, // 30 minutes
  })

  // 2. Smooth Auto-Redirect
  useEffect(() => {
    if (
      !authLoading &&
      shouldRedirectToDashboard &&
      profile?.role === "user" &&
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
        .from("vw_user_profiles")
        .select("*")
        .eq("id", signedInUser.id)
        .maybeSingle()

      if (currentProfile.error) {
        throw new Error("Could not verify your profile. Please try again.")
      }

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

  const homeStructuredData = useMemo(() => {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "CTMerchant",
      "url": "https://ctmerchant.com.ng",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "https://ctmerchant.com.ng/search?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    }
  }, [])

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
        .from("vw_user_profiles")
        .select("*")
        .eq("id", signedInUser.id)
        .maybeSingle()

      if (currentProfile.error) {
        throw new Error("Could not verify your profile. Please try again.")
      }

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
    const normalizedRepoId = normalizeRepoSearchId(repoSearchValue)
    if (repoSearchLoading) return

    if (!normalizedRepoId) {
      if (repoSearchValue.trim()) {
        notify({
          type: "info",
          title: "Enter repository ID",
          message: REPO_SEARCH_INVALID_MESSAGE,
        })
      }
      return
    }

    const value = normalizedRepoId
    const repoSearchIntent = createRepoSearchIntent(value)
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
        const repoRef = data.shop.unique_id || value
        let prefetchedShopData = buildShopDetailPrefetchFromRepoSearch(data)

        if (!prefetchedShopData) {
          try {
            prefetchedShopData = await fetchPublicRepoShopDetail({
              repoRef,
              shopId,
            })
          } catch (prefetchError) {
            console.warn("Public repo shop prefetch failed; continuing with route fetch.", prefetchError)
          }
        }

        const repoShop = prefetchedShopData?.shop || data.shop
        const isServiceResult =
          isServiceShop(repoShop) ||
          isServiceCategory(repoShop?.category)
        const targetPath = isServiceResult
          ? `/service-provider?id=${shopId}&service=${encodeURIComponent(repoShop?.category || "")}${buildRepoSearchQuerySuffix(repoRef, repoSearchIntent)}`
          : `/shop-detail?id=${shopId}${buildRepoSearchQuerySuffix(repoRef, repoSearchIntent)}`

        navigate(targetPath, {
          state: {
            fromDiscoveryTransition: true,
            fromRepoSearch: true,
            repoSearchConfirmed: true,
            repoSearchIntent,
            ...(prefetchedShopData
              ? isServiceResult
                ? { prefetchedServiceProviderData: prefetchedShopData }
                : { prefetchedShopData }
              : {}),
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

      navigate(
        `/reposearch?merchantId=${encodeURIComponent(value)}${repoSearchIntent ? `&${REPO_SEARCH_INTENT_PARAM}=${encodeURIComponent(repoSearchIntent)}` : ""}`,
        {
          state: {
            fromRepoSearch: true,
            repoSearchConfirmed: true,
            repoSearchIntent,
          },
        }
      )
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
            structuredData={homeStructuredData}
          />
          <PwaAddToHomePrompt />
          <section className="relative overflow-x-hidden bg-[#0D0800] px-4 py-4 text-[#F7EED8] md:py-8" style={editorialTexture}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(242,220,164,0.13),transparent_34%)]" />
            <div className="relative mx-auto mb-4 w-full max-w-7xl lg:hidden">
              <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-[#F2DCA4]">Verified Shops and Services</p>
              <div className="overflow-hidden rounded-[22px] border border-[#C9A84C]/25 bg-[#140D05]/90 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
                <div className="flex h-[48px] w-full overflow-hidden rounded-[16px] border-[3px] border-[#C9A84C] bg-[#0D0800]/90 shadow-[0_0_0_4px_rgba(201,168,76,0.14)] transition focus-within:border-pink-500 focus-within:shadow-[0_0_0_4px_rgba(219,39,119,0.16)]">
                  <div className="flex items-center border-r border-[#C9A84C]/25 bg-[#F7EED8]/10 pl-4 pr-2 text-sm font-black tracking-[0.12em] text-[#F2DCA4]">
                    CT-
                  </div>
                  <input
                    type="text"
                    value={repoSearchValue}
                    onChange={(e) => setRepoSearchValue(extractRepoSearchDigits(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRepoSearch()
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter Merchant ID"
                    className="min-w-0 flex-1 border-none bg-transparent px-3 text-base font-medium text-[#F7EED8] outline-none placeholder:text-[#F0E4C8]/45"
                  />
                  <button
                    type="button"
                    onClick={handleRepoSearch}
                    disabled={repoSearchLoading || !repoSearchValue.trim()}
                    className="flex w-[56px] items-center justify-center bg-[#C9A84C] text-[#140D05] transition hover:bg-[#F2DCA4] disabled:opacity-60"
                    aria-label="Search repository"
                  >
                    {repoSearchLoading ? "..." : <FaMagnifyingGlass />}
                  </button>
                </div>
              </div>
            </div>

            <div className="relative mx-auto flex flex-col gap-4 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:items-start lg:gap-6">
              <div className="w-full lg:col-start-1 lg:flex lg:flex-col lg:gap-4">
                <div className="overflow-hidden rounded-[30px] border border-[#C9A84C]/25 bg-[#140D05] shadow-[0_30px_90px_rgba(0,0,0,0.38)]">
                  {/* The deep fallback colour keeps the hero stable while the
                      bundled banner.jpg is still downloading on slow networks.
                      StableImage's inner shimmer layer covers it once mounted. */}
                  <div className="relative h-[260px] w-full overflow-hidden bg-[#140D05] sm:h-[340px] md:h-[440px]">
                    <StableImage
                      src={banner}
                      alt="Commerce Banner"
                      containerClassName="absolute inset-0 h-full w-full"
                      className="h-full w-full object-cover object-center"
                      loading="eager"
                      fetchPriority="high"
                      placeholderClassName="bg-gradient-to-br from-[#0D0800] via-[#2B1A08] to-[#140D05]"
                    />
                  </div>
                </div>

                <div className="hidden rounded-[32px] bg-[#C9A84C]/20 p-1 shadow-sm lg:block">
                  <HomeFeedbackSection />
                </div>
              </div>

              <div className="w-full lg:col-start-2">
                <div className="space-y-4">
                  <div className="space-y-4">
                  <div className="hidden rounded-[24px] bg-[#C9A84C]/15 p-1 lg:block">
                    <div className="rounded-[20px] border border-[#C9A84C]/20 bg-[#0D0800]/80 p-4">
                      <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-[#F2DCA4]">Verified Shops and Services</p>
                      <div className="flex h-[44px] overflow-hidden rounded-2xl border-[3px] border-[#C9A84C] bg-[#140D05] shadow-[0_0_0_4px_rgba(201,168,76,0.14)] transition focus-within:border-pink-500 focus-within:shadow-[0_0_0_4px_rgba(219,39,119,0.16)]">
                        <div className="flex items-center border-r border-[#C9A84C]/25 bg-[#F7EED8]/10 pl-4 pr-2 text-sm font-black tracking-[0.12em] text-[#F2DCA4]">
                          CT-
                        </div>
                        <input
                          type="text"
                          value={repoSearchValue}
                          onChange={(e) => setRepoSearchValue(extractRepoSearchDigits(e.target.value))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRepoSearch()
                          }}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="Enter Merchant ID"
                          className="min-w-0 flex-1 border-none bg-transparent px-3 text-base text-[#F7EED8] outline-none placeholder:text-[#F0E4C8]/45"
                        />
                        <button
                          type="button"
                          onClick={handleRepoSearch}
                          disabled={repoSearchLoading || !repoSearchValue.trim()}
                          className="flex w-[52px] items-center justify-center bg-[#C9A84C] text-[#140D05] transition hover:bg-[#F2DCA4] disabled:opacity-60"
                          aria-label="Search repository"
                        >
                          {repoSearchLoading ? "..." : <FaMagnifyingGlass />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[26px] bg-[#C9A84C]/25 p-1">
                    <div className="rounded-[22px] border border-[#C9A84C]/35 bg-[#F7EED8] p-6 text-[#1B1208] shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
                      <div className="mb-4 h-1 w-16 rounded-full bg-pink-600" />
                      <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-[#1B1208]">
                        <FaLock className="text-[#9B7A25]" />
                        <span>Users Login</span>
                      </h2>

                      <form className="mt-4 space-y-3" onSubmit={handleEmailLogin}>
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
                              className="rounded-full p-2 text-slate-400 transition hover:bg-white hover:text-[#9B7A25]"
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
                            className="text-sm font-semibold text-[#6A5422] transition hover:text-[#1B1208]"
                          >
                            Forgot password?
                          </button>
                        </div>

                        <AuthButton type="submit" loading={loginLoading} className="!bg-[#1B1208] !text-[#F7EED8] hover:!bg-[#2D1D0D]">
                          <span>Secure Sign In</span>
                          <FaArrowRight />
                        </AuthButton>
                      </form>

                      <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-[#8A6A2A]">
                        <div className="h-px flex-1 bg-[#C9A84C]/35" />
                        <span>New to <BrandText className="normal-case" />?</span>
                        <div className="h-px flex-1 bg-[#C9A84C]/35" />
                      </div>

                      <button
                        type="button"
                        onClick={openCreateAccountWithTransition}
                        className="w-full rounded-xl border-2 border-[#C9A84C]/40 bg-white/70 px-4 py-3 text-base font-bold text-[#1B1208] transition hover:bg-[#F2DCA4]/55"
                      >
                        Create Account
                      </button>

                      <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-[#8A6A2A]">
                        <div className="h-px flex-1 bg-[#C9A84C]/35" />
                        <span>Or continue with</span>
                        <div className="h-px flex-1 bg-[#C9A84C]/35" />
                      </div>

                      <div className="space-y-2">
                        <div className="relative flex min-h-[44px] w-full items-center justify-center">
                          <div ref={googleButtonRef} className="flex justify-center w-full" />
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

                        <p className="px-2 text-center text-[0.75rem] leading-relaxed text-[#6A5422]">
                          By continuing with Google, you agree to <BrandText />'s{' '}
                          <Link to="/terms" className="font-semibold text-[#1B1208] underline transition hover:text-[#9B7A25]">
                            Terms of Use
                          </Link>{' '}
                          and{' '}
                          <Link to="/privacy" className="font-semibold text-[#1B1208] underline transition hover:text-[#9B7A25]">
                            Privacy Policy
                          </Link>
                          .
                        </p>

                      </div>
                    </div>
                  </div>

                  <HomeCardShell>
                    <h3 className="font-serif text-xl font-semibold text-[#1B1208]">Social Channels</h3>
                    <div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-3">
                      {socialLinks.map((item) => {
                        const Icon = item.icon
                        return (
                          <a
                            key={item.label}
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[#C9A84C]/30 bg-white/80 p-2 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-md"
                          >
                            <span
                              className={`flex h-8 w-8 items-center justify-center rounded-lg text-base text-white sm:h-10 sm:w-10 sm:rounded-xl ${item.accent}`}
                            >
                              <Icon />
                            </span>
                            <span className="block text-[8px] font-extrabold text-[#1B1208] sm:text-[10px]">
                              {item.label}
                            </span>
                          </a>
                        )
                      })}
                    </div>
                  </HomeCardShell>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <HomeCardShell>
                      <ActivityCalendar />
                    </HomeCardShell>
                    <HomeCardShell>
                      <OfficeSupportCard />
                    </HomeCardShell>
                  </div>
                </div>
              </div>
            </div>

              <div className="w-full lg:hidden">
                <div className="rounded-[32px] bg-[#C9A84C]/20 p-1 shadow-sm h-full">
                  <HomeFeedbackSection />
                </div>
              </div>
            </div>
          </section>

          <NewsletterSection />
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

                <div className="flex flex-col gap-1">
                  <AuthInput
                    id="reset-new-password"
                    label="New password"
                    type={showPassword ? "text" : "password"}
                    value={resetPasswordForm.newPassword}
                    onChange={(e) =>
                      setResetPasswordForm((prev) => ({
                        ...prev,
                        newPassword: e.target.value,
                      }))
                    }
                    placeholder="8+ chars, mixed case, symbols"
                    error={resetPasswordErrors.newPassword}
                    required
                    icon={<FaLock />}
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-pink-600"
                      >
                        {showPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    }
                  />
                  {resetPasswordForm.newPassword && (
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 px-1">
                      {[
                        { label: "8+ characters", met: resetPasswordForm.newPassword.length >= 8 },
                        { label: "Lower case", met: /[a-z]/.test(resetPasswordForm.newPassword) },
                        { label: "Upper case", met: /[A-Z]/.test(resetPasswordForm.newPassword) },
                        { label: "Number", met: /[0-9]/.test(resetPasswordForm.newPassword) },
                        { label: "Symbol", met: /[^a-zA-Z0-9]/.test(resetPasswordForm.newPassword) },
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
