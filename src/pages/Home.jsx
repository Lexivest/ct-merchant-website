import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  FaArrowDown,
  FaArrowRight,
  FaArrowUp,
  FaCalendarDays,
  FaChartLine,
  FaCircleInfo,
  FaClock,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaFacebookF,
  FaHashtag,
  FaLock,
  FaMagnifyingGlass,
  FaNewspaper,
  FaPhone,
  FaTelegram,
  FaWhatsapp,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6"
import MainLayout from "../layouts/MainLayout"
import ScrollingTicker from "../components/common/ScrollingTicker"
import AuthInput from "../components/auth/AuthInput"
import AuthButton from "../components/auth/AuthButton"
import PageSeo from "../components/common/PageSeo"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import PwaAddToHomePrompt from "../components/common/PwaAddToHomePrompt"
import HeaderMarquee from "../components/common/HeaderMarquee"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import BrandText from "../components/common/BrandText"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import {
  sendPasswordResetCode,
  signInWithGoogleIdToken,
  signInWithPassword,
  signOutUser,
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

const phrases = [
  "City Commerce",
  "Digital Convenience",
  "Physical Reality",
]

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

function ActivityCalendar() {
  const calendarEvents = [
    { date: "APR 20", title: "Merchant Training Webinar", type: "Virtual" },
    { date: "APR 25", title: "Kaduna Business Meetup", type: "Offline" },
    { date: "MAY 05", title: "New Feature Launch", type: "System" },
  ]

  return (
    <div className="flex flex-col items-center w-full max-w-[280px] mx-auto">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
          <FaCalendarDays className="text-xs" />
        </div>
        <h3 className="text-xs font-black tracking-tight text-slate-900 uppercase">Activity Calendar</h3>
      </div>

      <div className="w-full divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white p-1 shadow-sm overflow-hidden">
        {calendarEvents.map((ev, idx) => (
          <div key={idx} className="flex items-center gap-2.5 p-2.5 transition hover:bg-slate-50">
            <div className="flex h-10 w-10 flex-col items-center justify-center rounded-lg bg-pink-50 text-center shrink-0">
              <span className="text-[8px] font-black text-pink-600 uppercase tracking-tighter">{ev.date.split(" ")[0]}</span>
              <span className="text-sm font-black text-slate-900">{ev.date.split(" ")[1]}</span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-[11px] font-bold text-slate-900 truncate leading-tight">{ev.title}</div>
              <div className="mt-0.5 inline-flex rounded-full bg-slate-100 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-slate-500">
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
    <div className="flex flex-col items-center w-full max-w-[280px] mx-auto">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
          <FaClock className="text-xs" />
        </div>
        <h3 className="text-xs font-black tracking-tight text-slate-900 uppercase">Office & Support</h3>
      </div>

      <div className="w-full rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-1">
            <div className="text-amber-500 text-xs"><FaClock /></div>
            <div>
              <div className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Opening Hours</div>
              <p className="mt-0.5 text-[10px] font-medium leading-relaxed text-slate-500">
                Mon - Fri: 8:00 AM - 6:00 PM<br/>
                Sat: 9:00 AM - 4:00 PM
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 pt-2.5 border-t border-slate-50">
            <div className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">WhatsApp Support</div>
            <a 
              href="https://wa.me/2347042021230" 
              target="_blank" 
              rel="noreferrer"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-xs font-black text-white shadow-md transition-all hover:scale-[1.02] hover:bg-emerald-600 animate-pulse"
            >
              <FaWhatsapp className="text-base" />
              <span>+234 704 202 1230</span>
            </a>
          </div>

          <div className="flex flex-col items-center gap-1 pt-2.5 border-t border-slate-50">
            <div className="text-blue-500 text-xs"><FaEnvelope /></div>
            <div>
              <div className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Email Inquiry</div>
              <p className="mt-0.5 text-[10px] font-bold text-slate-500 underline truncate max-w-full">support@ctmerchant.com.ng</p>
            </div>
          </div>
        </div>
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
    <div className="h-full rounded-[24px] border border-pink-100 bg-white p-5 md:p-7">
      <div className="mb-4">
        <span className="inline-block rounded-full border border-pink-200 bg-pink-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-pink-700">
          Share Your Feedback
        </span>
        <h2 className="mt-2 text-2xl font-extrabold text-slate-900 md:text-3xl">
          Help Us Improve Your Experience
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Have a suggestion or encountered an issue? We'd love to hear from you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="e.g. John Doe"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Email Address</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@example.com"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Subject</label>
          <select
            name="subject"
            value={formData.subject}
            onChange={handleChange}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white"
          >
            <option>General Inquiry</option>
            <option>Merchant Feedback</option>
            <option>Feature Request</option>
            <option>Technical Issue</option>
          </select>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Message</label>
            <WordLimitCounter value={formData.message} limit={CONTACT_MESSAGE_WORD_LIMIT} />
          </div>
          <textarea
            name="message"
            rows="4"
            value={formData.message}
            onChange={handleChange}
            placeholder="Tell us what's on your mind..."
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#0F1111] px-6 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-70"
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
    <section className="bg-slate-900 py-10 md:py-16 text-white">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <div className="inline-flex rounded-full bg-pink-600/20 px-4 py-2 text-xs font-black uppercase tracking-widest text-pink-400 ring-1 ring-pink-500/30">
              <BrandText /> Insider
            </div>
            <h2 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
              Stay Ahead of the <br />
              <span className="text-pink-500">Market Pulse</span>
            </h2>
            <p className="mt-4 max-w-md text-lg font-medium leading-relaxed text-slate-400">
              Join our newsletter to receive weekly insights, new merchant alerts, and exclusive community updates directly in your inbox.
            </p>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-white/5 p-6 md:p-8 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Full Name</label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-6 py-4 text-base font-bold text-white outline-none transition focus:bg-white/20 focus:ring-2 focus:ring-pink-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Email Address</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="john@example.com"
                    className="w-full rounded-2xl border border-white/10 bg-white/10 px-6 py-4 text-base font-bold text-white outline-none transition focus:bg-white/20 focus:ring-2 focus:ring-pink-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-pink-600 px-8 py-4 text-base font-black text-white transition hover:bg-pink-700 disabled:opacity-70"
              >
                {isSubmitting ? "Joining..." : "Join Newsletter"}
                {!isSubmitting && <FaArrowRight />}
              </button>
              
              <p className="text-center text-[10px] font-medium text-slate-500">
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
          <section className="overflow-x-hidden bg-pink-50 px-4 py-3 md:py-6">
            <div className="mx-auto mb-4 w-full max-w-7xl lg:hidden">
              <p className="mb-1.5 ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">view shops/store in your city/area</p>
              <div className="overflow-hidden rounded-[22px] border border-pink-100 bg-white p-2 shadow-sm">
                <div className="flex h-[48px] w-full overflow-hidden rounded-[16px] border-[3px] border-transparent bg-pink-50 transition focus-within:border-pink-600">
                  <div className="flex items-center border-r border-pink-100 bg-white/70 pl-4 pr-2 text-sm font-black tracking-[0.12em] text-pink-600">
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
                    placeholder="Enter Store ID"
                    className="min-w-0 flex-1 border-none bg-transparent px-3 text-base font-medium text-[#0F1111] outline-none placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={handleRepoSearch}
                    disabled={repoSearchLoading || !repoSearchValue.trim()}
                    className="flex w-[56px] items-center justify-center bg-pink-600 text-white transition hover:bg-pink-700"
                    aria-label="Search repository"
                  >
                    {repoSearchLoading ? "..." : <FaMagnifyingGlass />}
                  </button>
                </div>
              </div>
            </div>

            <div className="mx-auto flex flex-col gap-4 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:items-start lg:gap-6">
              <div className="w-full lg:col-start-1 lg:flex lg:flex-col lg:gap-4">
                <div className="overflow-hidden rounded-[24px] border border-pink-100 bg-white shadow-lg">
                  {/* bg-pink-100 is the branded fallback colour shown while the
                      bundled banner.jpg is still downloading on slow networks.
                      StableImage's inner shimmer layer covers it once mounted. */}
                  <div className="relative h-[220px] w-full overflow-hidden bg-pink-100 sm:h-[300px] md:h-[400px]">
                    <StableImage
                      src={banner}
                      alt="Commerce Banner"
                      containerClassName="absolute inset-0 h-full w-full"
                      className="h-full w-full object-cover object-center"
                      loading="eager"
                      fetchPriority="high"
                      placeholderClassName="bg-gradient-to-br from-pink-100 via-slate-100 to-pink-50"
                    />
                  </div>
                </div>

                <div className="hidden rounded-[28px] bg-pink-200 p-1 shadow-sm lg:block">
                  <HomeFeedbackSection />
                </div>
              </div>

              {/* Mobile Only Ticker - positioned just below the hero image */}
              <div className="lg:hidden w-full px-1">
                <div className="bg-white py-3 text-slate-900 border border-pink-100 rounded-[22px] shadow-sm px-2 overflow-hidden">
                  <HeaderMarquee />
                </div>
              </div>

              <div className="w-full lg:col-start-2">
                <div className="min-w-0 rounded-[28px] bg-pink-200 p-1 shadow-sm h-full">
                  <div className="flex h-full flex-col rounded-[24px] border border-pink-100 bg-white p-5 md:p-8">
                  <div className="hidden rounded-[22px] bg-pink-200 p-1 lg:block">
                    <div className="rounded-[18px] border border-pink-100 bg-slate-50 p-4">
                      <p className="mb-2 ml-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">view shops/store in your city/area</p>
                      <div className="flex h-[42px] overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
                        <div className="flex items-center border-r border-pink-100 bg-white pl-4 pr-2 text-sm font-black tracking-[0.12em] text-pink-600">
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
                          placeholder="Enter Store ID"
                          className="min-w-0 flex-1 border-none px-3 text-base text-[#0F1111] outline-none placeholder:text-slate-500"
                        />
                        <button
                          type="button"
                          onClick={handleRepoSearch}
                          disabled={repoSearchLoading || !repoSearchValue.trim()}
                          className="flex w-[52px] items-center justify-center bg-pink-600 text-white transition hover:bg-pink-700"
                          aria-label="Search repository"
                        >
                          {repoSearchLoading ? "..." : <FaMagnifyingGlass />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 min-h-[28px] text-lg font-extrabold leading-tight text-slate-900 md:min-h-[32px] md:text-2xl">
                    {currentPhraseText}
                    <span className="ml-1 inline-block animate-pulse text-pink-600">|</span>
                  </div>

                  <p className="mt-1 max-w-xl text-base font-medium leading-7 text-slate-600">
                    Discover business and offerings in your neighbourhood before you step out—bridging the gap between digital convenience and physical reality.
                  </p>

                  {/* Legacy install card retired for the shared PWA install flow.
                    <div className="mt-2 rounded-[22px] bg-pink-200 p-0.5">
                      <div className="rounded-[20px] border border-pink-200 bg-[linear-gradient(135deg,#fff7fb_0%,#fff1f2_48%,#fdf2f8_100%)] p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pink-600 text-white shadow-sm">
                              <FaMobileScreenButton className="text-lg" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[12px] font-black uppercase tracking-[0.16em] text-pink-700">
                                Install <BrandText />
                              </p>
                              <p className="mt-1 text-sm font-semibold leading-5 text-slate-700">
                                {renderBrandedText(canPromptInstall
                                  ? "Open CTMerchant faster from your home screen with a cleaner full-screen launch."
                                  : isAppleMobile
                                    ? "Save CTMerchant to your iPhone home screen for faster access and a cleaner web app experience."
                                    : "Use your browser menu to install CTMerchant or add it to your home screen.")}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => dismissInstallCard()}
                            className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 transition hover:bg-white hover:text-slate-600"
                          >
                            Later
                          </button>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            {canPromptInstall ? "Fast launch • Home screen access" : "Safari share menu • Add to Home Screen"}
                          </div>
                          <button
                            type="button"
                            onClick={handleInstallApp}
                            disabled={installingApp}
                            className="rounded-2xl bg-pink-600 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-pink-700 disabled:cursor-wait disabled:opacity-70"
                          >
                            {installingApp ? "Opening..." : canPromptInstall ? "Install now" : "How to install"}
                            Fast launch • Homescreen access
                          </span>
                        </button>
                      </div>
                    </div>
                  */}
                  <div className="mt-4 rounded-[22px] bg-pink-200 p-1">
                    <div className="rounded-[18px] border border-pink-200 bg-pink-50 p-6">
                      <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
                        <FaLock className="text-pink-600" />
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

                      <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <div className="h-px flex-1 bg-pink-200" />
                        <span>New to <BrandText />?</span>
                        <div className="h-px flex-1 bg-pink-200" />
                      </div>

                      <button
                        type="button"
                        onClick={openCreateAccountWithTransition}
                        className="w-full rounded-xl border-2 border-pink-200 bg-white px-4 py-3 text-base font-bold text-slate-900 transition hover:bg-pink-100"
                      >
                        Create Account
                      </button>

                      <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <div className="h-px flex-1 bg-pink-200" />
                        <span>Or continue with</span>
                        <div className="h-px flex-1 bg-pink-200" />
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

                        <p className="px-2 text-center text-[0.75rem] leading-relaxed text-slate-500">
                          By continuing with Google, you agree to <BrandText />'s{' '}
                          <Link to="/terms" className="font-semibold text-slate-600 underline transition hover:text-pink-600">
                            Terms of Use
                          </Link>{' '}
                          and{' '}
                          <Link to="/privacy" className="font-semibold text-slate-600 underline transition hover:text-pink-600">
                            Privacy Policy
                          </Link>
                          .
                        </p>

                        <div className="mt-4 grid grid-cols-4 gap-1.5 sm:gap-3">
                          {socialLinks.map((item) => {
                            const Icon = item.icon
                            return (
                              <a
                                key={item.label}
                                href={item.href}
                                target="_blank"
                                rel="noreferrer"
                                className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-pink-100 bg-white p-2 shadow-sm transition hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-md"
                              >
                                <span
                                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-base text-white sm:h-10 sm:w-10 sm:rounded-xl ${item.accent}`}
                                >
                                  <Icon />
                                </span>
                                <span className="block text-[8px] font-extrabold text-slate-900 sm:text-[10px]">
                                  {item.label}
                                </span>
                              </a>
                            )
                          })}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div className="flex justify-center w-full">
                          <ActivityCalendar />
                        </div>
                        <div className="flex justify-center w-full border-t border-slate-50 pt-4 sm:border-t-0 sm:pt-0">
                          <OfficeSupportCard />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              <div className="w-full lg:hidden">
                <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm h-full">
                  <HomeFeedbackSection />
                </div>
              </div>
            </div>
          </section>

          {/* Desktop Only Ticker */}
          <div className="hidden lg:block bg-white py-3 text-slate-900 border-y border-slate-100">
            <div className="mx-auto max-w-7xl px-4">
              <HeaderMarquee />
            </div>
          </div>

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
