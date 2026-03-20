import { useEffect, useState } from "react"
import { FaCity, FaMapPin, FaPhone, FaTimes, FaFileContract, FaUserCheck } from "react-icons/fa"
import AuthInput from "./AuthInput"
import AuthButton from "./AuthButton"
import AuthNotification from "./AuthNotification"
import {
  fetchOpenCities,
  fetchAreasByCity,
  completeProfileSetup,
} from "../../lib/auth"
import { validateCompleteProfileForm } from "../../lib/validators"

function CompleteProfileModal({
  open,
  onClose,
  userId,
  fullName,
  onCompleted,
}) {
  const [form, setForm] = useState({
    phone: "",
    cityId: "",
    areaId: "",
  })
  const [errors, setErrors] = useState({})
  const [cities, setCities] = useState([])
  const [areas, setAreas] = useState([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [loadingAreas, setLoadingAreas] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  // --- Terms & Conditions State ---
  const [termsScrolledBottom, setTermsScrolledBottom] = useState(false)

  useEffect(() => {
    if (!open) return

    // Reset terms scroll state when modal opens
    setTermsScrolledBottom(false)

    async function loadCities() {
      try {
        setLoadingCities(true)
        setNotice({ visible: false, type: "info", title: "", message: "" })
        const data = await fetchOpenCities()
        setCities(data)
      } catch (error) {
        setNotice({
          visible: true,
          type: "error",
          title: "Could not load cities",
          message: error.message || "Please try again.",
        })
      } finally {
        setLoadingCities(false)
      }
    }

    loadCities()
  }, [open])

  async function handleCityChange(event) {
    const cityId = event.target.value
    setForm((prev) => ({ ...prev, cityId, areaId: "" }))
    setAreas([])

    if (!cityId) return

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

  function handleScroll(event) {
    const el = event.currentTarget
    // Add a tiny buffer (12px) to make it easier to trigger on mobile
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 12
    if (atBottom) setTermsScrolledBottom(true)
  }

  function handleSubmitErrorMap() {
    const nextErrors = validateCompleteProfileForm(form)
    setErrors(nextErrors)
    return nextErrors
  }

  async function handleSubmit() {
    const nextErrors = handleSubmitErrorMap()
    if (Object.keys(nextErrors).length > 0) return

    try {
      setSaving(true)
      setNotice({ visible: false, type: "info", title: "", message: "" })

      await completeProfileSetup({
        userId,
        fullName,
        phone: form.phone,
        cityId: form.cityId,
        areaId: form.areaId,
      })

      setNotice({
        visible: true,
        type: "success",
        title: "Profile completed",
        message: "Your account setup is complete.",
      })

      if (onCompleted) onCompleted()
    } catch (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Setup failed",
        message: error.message || "Please try again.",
      })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md my-auto rounded-[28px] border border-pink-100 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">
              Complete your profile
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              We need a few more details to finalize your account.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className="space-y-4">
          <AuthInput
            id="complete-phone"
            label="Phone number"
            value={form.phone}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, phone: e.target.value }))
            }
            placeholder="08012345678"
            error={errors.phone}
            required
            icon={<FaPhone />}
          />

          <div className="flex flex-col gap-2">
            <label
              htmlFor="complete-city"
              className="text-sm font-bold text-slate-800"
            >
              City <span className="ml-1 text-pink-600">*</span>
            </label>

            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <FaCity />
              </span>

              <select
                id="complete-city"
                value={form.cityId}
                onChange={handleCityChange}
                disabled={loadingCities}
                className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {loadingCities ? "Loading cities..." : "Select city"}
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
              htmlFor="complete-area"
              className="text-sm font-bold text-slate-800"
            >
              Area <span className="ml-1 text-pink-600">*</span>
            </label>

            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <FaMapPin />
              </span>

              <select
                id="complete-area"
                value={form.areaId}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, areaId: e.target.value }))
                }
                disabled={!form.cityId || loadingAreas}
                className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-4 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                <option value="">
                  {!form.cityId
                    ? "Select city first"
                    : loadingAreas
                    ? "Loading areas..."
                    : "Select area"}
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

          {/* --- TERMS AND CONDITIONS BLOCK --- */}
          <div className="pt-2">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
              <FaFileContract className="text-pink-600" />
              Agreements & Policies
            </h3>
            <div
              onScroll={handleScroll}
              className="h-40 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-700"
            >
              <h4 className="mb-2 text-sm font-bold text-slate-900">Privacy Policy</h4>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Last Updated: March 2026</p>
              <p>This policy explains how CTMerchant collects, uses, and protects personal information in compliance with the Nigeria Data Protection Regulation and platform rules.</p>
              <p className="mt-2">CTMerchant operates a digital repository that lists physical shops, products, and locations for discovery and informational purposes only.</p>
              <p className="mt-2">We collect limited information necessary to operate the platform, including account details, business listing information, general location information, and technical usage data needed for security and performance.</p>
              <p className="mt-2">We use collected information to provide and secure the repository, display accurate listings, support communication between users and shops, and improve platform performance.</p>
              <p className="mt-2">CTMerchant does not sell personal data and does not process payments or financial transactions for merchants.</p>
              
              <hr className="my-4 border-slate-200" />

              <h4 className="mb-2 text-sm font-bold text-slate-900">Terms of Use</h4>
              <p>These terms govern access to and use of the CTMerchant digital repository platform.</p>
              <p className="mt-2">CTMerchant is not an online marketplace, broker, delivery service, escrow service, or seller. We do not facilitate payments, deliveries, or commercial transactions.</p>
              <p className="mt-2">Users and merchants are responsible for the accuracy of information they provide and must independently verify details, pricing, availability, and quality before engaging in any transaction.</p>
              <p className="mt-2">Listings are informational only and may change at any time. CTMerchant does not guarantee seller response times, stock availability, or transaction fulfillment.</p>
              <p className="mt-2 font-semibold text-pink-700">By completing your profile, you agree to these policies and platform conditions.</p>
            </div>
            
            {!termsScrolledBottom && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-800">
                Scroll to the bottom of the terms to unlock setup.
              </div>
            )}
          </div>

          <AuthNotification
            visible={notice.visible}
            type={notice.type}
            title={notice.title}
            message={notice.message}
          />

          <div className="pt-2">
            <AuthButton 
              onClick={handleSubmit} 
              loading={saving}
              disabled={!termsScrolledBottom}
            >
              {termsScrolledBottom ? (
                <>
                  <FaUserCheck />
                  <span>I Agree & Finish Setup</span>
                </>
              ) : (
                <span>Scroll down to continue</span>
              )}
            </AuthButton>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CompleteProfileModal