import { useEffect, useMemo, useState } from "react"
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
import CompleteProfileModal from "../components/auth/CompleteProfileModal"
import MainLayout from "../layouts/MainLayout"
import {
  fetchAreasByCity,
  fetchOpenCities,
  fetchProfileByUserId,
  signInWithGoogleIdToken,
  signOutUser,
  signUpWithEmail,
  updateLastActiveIp,
} from "../lib/auth"
import { validateSignupForm } from "../lib/validators"

function CreateAccount() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    email: "",
    cityId: "",
    areaId: "",
    password: "",
    confirmPassword: "",
  })

  const [errors, setErrors] = useState({})
  const [cities, setCities] = useState([])
  const [areas, setAreas] = useState([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)
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

  const [termsOpen, setTermsOpen] = useState(false)
  const [termsScrolledBottom, setTermsScrolledBottom] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [pendingProfileUser, setPendingProfileUser] = useState(null)

  useEffect(() => {
    async function loadCities() {
      try {
        setLoadingCities(true)
        const data = await fetchOpenCities()
        setCities(data)
      } catch (error) {
        setNotice({
          visible: true,
          type: "error",
          title: "Could not load cities",
          message: error.message || "Please refresh and try again.",
        })
      } finally {
        setLoadingCities(false)
      }
    }

    loadCities()
  }, [])

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

      const button = document.getElementById("google-signup-button")
      if (button && button.childNodes.length === 0) {
        window.google.accounts.id.renderButton(button, {
          type: "standard",
          theme: "outline",
          text: "continue_with",
          size: "large",
          shape: "rectangular",
          logo_alignment: "left",
          width: 340,
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
  }, [])

  const currentErrorsCount = useMemo(
    () => Object.keys(errors).length,
    [errors]
  )

  async function handleCityChange(event) {
    const cityId = event.target.value

    setForm((prev) => ({
      ...prev,
      cityId,
      areaId: "",
    }))

    setErrors((prev) => ({
      ...prev,
      cityId: "",
      areaId: "",
    }))

    if (!cityId) {
      setAreas([])
      return
    }

    try {
      setLoadingAreas(true)
      const data = await fetchAreasByCity(cityId)
      setAreas(data)
    } catch (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Could not load areas",
        message: error.message || "Please try again.",
      })
    } finally {
      setLoadingAreas(false)
    }
  }

  function handleSubmitStart(event) {
    event.preventDefault()

    const nextErrors = validateSignupForm(form)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      setNotice({
        visible: true,
        type: "error",
        title: "Please fix the highlighted fields",
        message: "Your account cannot be created until the form is valid.",
      })
      return
    }

    setNotice({
      visible: false,
      type: "info",
      title: "",
      message: "",
    })
    setTermsScrolledBottom(false)
    setTermsOpen(true)
  }

  async function executeEmailSignup() {
    try {
      setSubmitting(true)
      setNotice({
        visible: false,
        type: "info",
        title: "",
        message: "",
      })

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
      setNotice({
        visible: true,
        type: "error",
        title: "Registration failed",
        message: error.message || "Please try again.",
      })
    } finally {
      setSubmitting(false)
    }
  }

  function closeSuccess() {
    setShowSuccess(false)
    navigate("/", {
      state: {
        prefillEmail: form.email,
      },
    })
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response?.credential) {
      setNotice({
        visible: true,
        type: "error",
        title: "Google sign-up failed",
        message: "No Google credential was received.",
      })
      return
    }

    try {
      setGoogleLoading(true)
      setNotice({
        visible: false,
        type: "info",
        title: "",
        message: "",
      })

      const result = await signInWithGoogleIdToken(response.credential)
      const signedInUser = result.auth?.user || result.auth?.session?.user

      if (!signedInUser) {
        throw new Error("Google sign-up did not return a valid user.")
      }

      const profile = await fetchProfileByUserId(signedInUser.id)

      if (profile?.is_suspended === true) {
        await signOutUser()
        throw new Error(
          "Your account has been restricted. Please contact support."
        )
      }

      if (profile?.city_id && profile?.area_id) {
        await updateLastActiveIp(signedInUser.id, result.ipData.ip)
        setNotice({
          visible: true,
          type: "success",
          title: "Google sign-up successful",
          message: "Opening your dashboard...",
        })

        setTimeout(() => {
          navigate("/user-dashboard")
        }, 900)
      } else {
        setPendingProfileUser({
          id: signedInUser.id,
          fullName:
            profile?.full_name || signedInUser.user_metadata?.full_name || "",
        })
        setProfileModalOpen(true)
      }
    } catch (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Google sign-up failed",
        message: error.message || "Please try again.",
      })
    } finally {
      setGoogleLoading(false)
    }
  }

  async function handleProfileCompleted() {
    setProfileModalOpen(false)
    setNotice({
      visible: true,
      type: "success",
      title: "Profile completed",
      message: "Opening your dashboard...",
    })
    setTimeout(() => {
      navigate("/user-dashboard")
    }, 900)
  }

  async function handleProfileModalClose() {
    setProfileModalOpen(false)
    if (pendingProfileUser?.id) {
      await signOutUser()
      setPendingProfileUser(null)
      setNotice({
        visible: true,
        type: "warning",
        title: "Setup cancelled",
        message: "You were signed out because profile setup was not completed.",
      })
    }
  }

  return (
    <>
      <MainLayout>
        <section className="min-h-screen bg-pink-50 px-4 py-8">
          <div className="mx-auto max-w-md">
            <Link
              to="/"
              className="mb-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700"
            >
              <FaArrowLeft />
              <span>Back</span>
            </Link>

            <div className="mb-5 text-center">
              <img
                src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/CT-Merchant.jpg"
                alt="CTMerchant Logo"
                className="mx-auto h-24 w-auto rounded-xl object-contain"
              />
            </div>

            <div className="rounded-[28px] border border-pink-100 bg-white p-6 shadow-xl md:p-8">
              <h1 className="text-2xl font-extrabold text-slate-900">
                Create Account
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Join the professional merchant network.
              </p>

              <div className="mt-5 space-y-3">
                <div
                  id="google-signup-button"
                  className="flex min-h-[44px] items-center justify-center"
                />
                {!googleReady || googleLoading ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-500">
                    {googleLoading
                      ? "Signing up with Google..."
                      : "Loading Google sign-up..."}
                  </div>
                ) : null}
              </div>

              <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                <div className="h-px flex-1 bg-slate-200" />
                <span>Or sign up with email</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <form className="space-y-4" onSubmit={handleSubmitStart}>
                <AuthInput
                  id="signup-fullname"
                  label="Full Name"
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      fullName: e.target.value,
                    }))
                  }
                  placeholder="First and Last Name"
                  error={errors.fullName}
                  required
                  icon={<FaUser />}
                  minLength={2}
                />

                <AuthInput
                  id="signup-phone"
                  label="Phone Number"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  placeholder="e.g. 08012345678"
                  error={errors.phone}
                  required
                  icon={<FaPhone />}
                />

                <AuthInput
                  id="signup-email"
                  label="Work Email"
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder="name@company.com"
                  error={errors.email}
                  required
                  icon={<FaEnvelope />}
                  autoComplete="email"
                />

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="signup-city"
                    className="text-sm font-bold text-slate-800"
                  >
                    Select City <span className="ml-1 text-pink-600">*</span>
                  </label>

                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <FaCity />
                    </span>
                    <select
                      id="signup-city"
                      value={form.cityId}
                      onChange={handleCityChange}
                      disabled={loadingCities}
                      className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">
                        {loadingCities ? "Loading cities..." : "Select your city"}
                      </option>
                      {cities.map((city) => (
                        <option key={city.id} value={city.id}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {errors.cityId ? (
                    <p className="text-xs font-semibold text-red-600">
                      {errors.cityId}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="signup-area"
                    className="text-sm font-bold text-slate-800"
                  >
                    Select Area <span className="ml-1 text-pink-600">*</span>
                  </label>

                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                      <FaMapPin />
                    </span>
                    <select
                      id="signup-area"
                      value={form.areaId}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          areaId: e.target.value,
                        }))
                      }
                      disabled={!form.cityId || loadingAreas}
                      className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="">
                        {!form.cityId
                          ? "Select city first"
                          : loadingAreas
                          ? "Loading areas..."
                          : "Select your area"}
                      </option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {errors.areaId ? (
                    <p className="text-xs font-semibold text-red-600">
                      {errors.areaId}
                    </p>
                  ) : null}
                </div>

                <AuthInput
                  id="signup-password"
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      password: e.target.value,
                    }))
                  }
                  placeholder="At least 6 characters"
                  error={errors.password}
                  required
                  icon={<FaLock />}
                  autoComplete="new-password"
                  minLength={6}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-pink-600"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                    >
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  }
                />

                <AuthInput
                  id="signup-confirm-password"
                  label="Confirm Password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                  placeholder="Re-enter password"
                  error={errors.confirmPassword}
                  required
                  icon={<FaLock />}
                  autoComplete="new-password"
                  minLength={6}
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-pink-600"
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                    >
                      {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  }
                />

                <AuthButton type="submit" loading={submitting}>
                  Continue
                </AuthButton>
              </form>

              <AuthNotification
                visible={notice.visible}
                type={notice.type}
                title={notice.title}
                message={notice.message}
              />

              <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm text-slate-600">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="font-extrabold text-pink-600 transition hover:text-pink-700 hover:underline"
                >
                  Sign In
                </button>
              </div>

              <div className="mt-3 text-center text-xs font-semibold text-slate-500">
                {currentErrorsCount > 0
                  ? `${currentErrorsCount} field${
                      currentErrorsCount > 1 ? "s" : ""
                    } still need attention.`
                  : "Your details look good."}
              </div>
            </div>
          </div>
        </section>

        {termsOpen ? (
          <TermsPrivacyModal
            onClose={() => setTermsOpen(false)}
            onConfirm={executeEmailSignup}
            confirmLoading={submitting}
            confirmDisabled={!termsScrolledBottom}
            onScrolledBottom={() => setTermsScrolledBottom(true)}
          />
        ) : null}

        <CompleteProfileModal
          open={profileModalOpen}
          onClose={handleProfileModalClose}
          userId={pendingProfileUser?.id}
          fullName={pendingProfileUser?.fullName || ""}
          onCompleted={handleProfileCompleted}
        />
      </MainLayout>

      {showSuccess ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[350px] rounded-[20px] bg-white p-8 text-center shadow-2xl">
            <FaCircleCheck className="mx-auto mb-4 text-5xl text-green-600" />
            <div className="mb-2 text-xl font-extrabold text-slate-900">
              Account Created
            </div>
            <div className="mb-6 text-sm leading-6 text-slate-500">
              Your account has been created successfully. Continue to sign in
              with your email and password.
            </div>
            <button
              type="button"
              onClick={closeSuccess}
              className="w-full rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-900 transition hover:bg-slate-200"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function TermsPrivacyModal({
  onClose,
  onConfirm,
  confirmLoading,
  confirmDisabled,
  onScrolledBottom,
}) {
  function handleScroll(event) {
    const el = event.currentTarget
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12
    if (atBottom) onScrolledBottom()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[28px] border border-pink-100 bg-white p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <FaFileContract className="text-pink-600" />
            Agreements & Policies
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Please read through and scroll to the bottom before creating your
            account.
          </p>
        </div>

        <div
          onScroll={handleScroll}
          className="min-h-[260px] flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-700"
        >
          <h3 className="mb-3 text-lg font-extrabold text-slate-900">
            Privacy Policy
          </h3>
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">
            Last Updated: March 2026
          </p>

          <p>
            This policy explains how CTMerchant collects, uses, and protects
            personal information in compliance with the Nigeria Data Protection
            Regulation and platform rules.
          </p>
          <p className="mt-3">
            CTMerchant operates a digital repository that lists physical shops,
            products, and locations for discovery and informational purposes
            only.
          </p>
          <p className="mt-3">
            We collect limited information necessary to operate the platform,
            including account details, business listing information, general
            location information, and technical usage data needed for security
            and performance.
          </p>
          <p className="mt-3">
            We use collected information to provide and secure the repository,
            display accurate listings, support communication between users and
            shops, and improve platform performance.
          </p>
          <p className="mt-3">
            CTMerchant does not sell personal data and does not process payments
            or financial transactions for merchants.
          </p>
          <p className="mt-3">
            Data may only be shared with trusted infrastructure providers,
            through user-initiated contact with merchants, or when required by
            law.
          </p>
          <p className="mt-3">
            You may request access, correction, or deletion of your data through
            CTMerchant support.
          </p>

          <hr className="my-6 border-slate-200" />

          <h3 className="mb-3 text-lg font-extrabold text-slate-900">
            Terms of Use
          </h3>
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-500">
            Effective Date: March 2026
          </p>

          <p>
            These terms govern access to and use of the CTMerchant digital
            repository platform.
          </p>
          <p className="mt-3">
            CTMerchant is not an online marketplace, broker, delivery service,
            escrow service, or seller. We do not facilitate payments,
            deliveries, or commercial transactions.
          </p>
          <p className="mt-3">
            Users and merchants are responsible for the accuracy of information
            they provide and must independently verify details, pricing,
            availability, and quality before engaging in any transaction.
          </p>
          <p className="mt-3">
            Listings are informational only and may change at any time.
            CTMerchant does not guarantee seller response times, stock
            availability, or transaction fulfillment.
          </p>
          <p className="mt-3">
            A verified status on CTMerchant relates to physical existence and
            location confirmation only. It does not constitute endorsement or a
            guarantee of product quality, legality, tax compliance, or business
            standing.
          </p>
          <p className="mt-3">
            To the maximum extent permitted by law, CTMerchant is not liable for
            losses, disputes, defective goods, or failed transactions between
            buyers and sellers discovered through the repository.
          </p>
          <p className="mt-3 font-semibold text-pink-700">
            By creating an account, you agree to these policies and platform
            conditions.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">
          Scroll to the bottom to unlock account creation.
        </div>

        <div className="mt-4 space-y-3">
          <AuthButton
            onClick={onConfirm}
            loading={confirmLoading}
            disabled={confirmDisabled}
          >
            <FaUserCheck />
            <span>I Agree & Create Account</span>
          </AuthButton>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel Setup
          </button>
        </div>
      </div>
    </div>
  )
}

export default CreateAccount