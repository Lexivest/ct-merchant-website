import { useEffect, useMemo, useState } from "react"
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

const phrases = [
  "Verified Merchants",
  "Safe and Secure",
  "Boost Your Business",
]

function Home() {
  const navigate = useNavigate()

  // 1. Hook into global auth state to solve the logout/login race condition
  const { user, isOffline } = useAuthSession()

  // Auto-redirect logged-in users to dashboard.
  // This guarantees we only navigate AFTER the global memory knows the user is logged in.
  useEffect(() => {
    if (user) {
      navigate("/user-dashboard", { replace: true })
    }
  }, [user, navigate])

  const [bannerLoaded, setBannerLoaded] = useState(false)
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

  useEffect(() => {
    const clientId =
      "237791711830-h0kb3jmuq122l276e64dc6jbl5tluesu.apps.googleusercontent.com"

    function initializeGoogle() {
      if (!window.google?.accounts?.id) return

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      const button = document.getElementById("google-signin-home")
      if (button && button.childNodes.length === 0) {
        window.google.accounts.id.renderButton(button, {
          type: "standard",
          theme: "outline",
          text: "continue_with",
          size: "large",
          shape: "rectangular",
          logo_alignment: "left",
          width: "100%",
        })
      }

      setGoogleReady(true)
    }

    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        initializeGoogle()
        clearInterval(timer)
      }
    }, 300)

    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Navigation is now handled smoothly by the useEffect
      
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

  async function handleGoogleCredentialResponse(response) {
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
      // Navigation is now handled smoothly by the useEffect
      
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
          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm lg:col-start-1 lg:row-start-1">
            <div className="relative min-h-[260px] overflow-hidden rounded-[24px] border border-pink-100 bg-slate-900 shadow-lg md:min-h-[420px]">
              <img 
                src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/ct%20web%20banner%20opt.jpg" 
                alt="Commerce Banner" 
                fetchpriority="high"
                onLoad={() => setBannerLoaded(true)}
                className={`absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700 ease-in-out ${
                  bannerLoaded ? "opacity-100" : "opacity-0"
                }`}
              />
              
              <div className="relative z-10 flex h-full min-h-[260px] flex-col justify-end md:min-h-[420px]">
                <div className="flex w-full flex-wrap justify-center gap-3 border-t border-white/20 bg-slate-900/55 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-sm md:gap-4 md:py-4 md:text-sm">
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
                    <div
                      id="google-signin-home"
                      className="flex min-h-[44px] w-full overflow-hidden items-center justify-center"
                    />
                    {!googleReady || googleLoading ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-500">
                        {googleLoading
                          ? "Signing in with Google..."
                          : "Loading Google sign-in..."}
                      </div>
                    ) : null}
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

export default Home