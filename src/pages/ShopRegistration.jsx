import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaAddressBook,
  FaArrowLeft,
  FaArrowRight,
  FaBoxOpen,
  FaBriefcase,
  FaCamera,
  FaCheck,
  FaCircleNotch,
  FaCity,
  FaCropSimple,
  FaFileContract,
  FaFilePdf,
  FaGlobe,
  FaImage,
  FaLocationDot,
  FaMapPin,
  FaPhone,
  FaShieldHalved,
  FaShop,
  FaStore,
  FaXmark,
} from "react-icons/fa6"
import Cropper from "react-cropper"
import "cropperjs/dist/cropper.css"

import AuthButton from "../components/auth/AuthButton"
import AuthNotification from "../components/auth/AuthNotification"
import CameraCaptureModal from "../components/common/CameraCaptureModal"
import CTMLoader from "../components/common/CTMLoader"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { supabase } from "../lib/supabase"
import { invokeEdgeFunctionAuthed } from "../lib/edgeFunctions"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import {
  clearPersistentDraft,
  loadPersistentDraft,
  savePersistentDraft,
} from "../lib/persistentDrafts"
import { buildShopRegistrationCacheKey } from "../lib/vendorRouteTransitions"
import { mergeServiceCategoriesForSelect } from "../lib/serviceCategories"
import {
  UPLOAD_RULES,
  formatBytes,
  getRuleLabel,
} from "../lib/uploadRules"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"

import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"

const STOREFRONT_RULE = UPLOAD_RULES.storefronts
const LOGO_RULE = UPLOAD_RULES.brandAssets
const ID_DOCUMENT_RULE = UPLOAD_RULES.idDocuments
const CAC_DOCUMENT_RULE = UPLOAD_RULES.cacDocuments
const STOREFRONT_BUCKET = STOREFRONT_RULE.bucket
const LOGO_BUCKET = LOGO_RULE.bucket
const ID_DOCUMENT_BUCKET = ID_DOCUMENT_RULE.bucket
const CAC_DOCUMENT_BUCKET = CAC_DOCUMENT_RULE.bucket
const MAX_FILE_SIZE = Math.max(ID_DOCUMENT_RULE.maxBytes, CAC_DOCUMENT_RULE.maxBytes)
const DESC_MIN_WORDS = 30
const DESC_MAX_WORDS = 150
const ADDR_MIN_WORDS = 5
const ADDR_MAX_WORDS = 50

const DEFAULT_CAMERA_RATIO = 3 / 4
const SHOP_DRAFT_SAVE_DELAY = 700
const SHOP_FILE_KEYS = ["storefront", "idCard", "cac", "logo"]
const REGISTRATION_VIEW_KEY = "view"
const FORM_SECTION_CLASS =
  "rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.08)] md:p-8"
const FORM_CONTROL_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-medium text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.9),0_12px_30px_rgba(15,23,42,0.06)] outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none disabled:opacity-70"
const FORM_CONTROL_WITH_ICON_CLASS =
  "w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-4 text-sm font-medium text-slate-800 shadow-[0_1px_0_rgba(255,255,255,0.9),0_12px_30px_rgba(15,23,42,0.06)] outline-none transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-100 disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none disabled:opacity-70"
const EMPTY_SHOP_FORM = {
  name: "",
  businessType: "Individual/Enterprise",
  category: "",
  desc: "",
  areaId: "",
  address: "",
  lat: "",
  lng: "",
  cacNumber: "",
  idType: "National ID Card",
  idNumber: "",
  website: "",
  phone: "",
  whatsapp: "",
  facebook: "",
  twitter: "",
  telegram: "",
}
const EMPTY_SHOP_FILES = {
  storefront: null,
  idCard: null,
  cac: null,
  logo: null,
}
const EMPTY_SHOP_PREVIEWS = {
  storefront: "",
  idCard: "",
  cac: "",
  logo: "",
}
const EMPTY_SIGNED_PREVIEWS = {
  idCard: "",
  cac: "",
}
const EMPTY_FILE_META = {
  storefront: null,
  idCard: null,
  cac: null,
  logo: null,
}

const SHOP_REGISTRATION_LOCK_COPY = {
  pending: {
    eyebrow: "Under Review",
    title: "Shop Application Submitted",
    heading: "Your shop application is already under review",
    message:
      "We already have your shop application. To prevent accidental overwrites, this registration form is locked while staff review it.",
    iconClass: "bg-pink-50 text-pink-600",
    buttonLabel: "Back to User Dashboard",
  },
  approved: {
    eyebrow: "Application Approved",
    title: "Shop Already Registered",
    heading: "Your shop has already been approved",
    message:
      "This registration flow is locked because your shop already exists. Use merchant settings for allowed profile updates.",
    iconClass: "bg-emerald-50 text-emerald-600",
    buttonLabel: "Back to User Dashboard",
  },
  rejected: {
    eyebrow: "Correction Required",
    title: "Shop Correction Needed",
    heading: "Open the correction form instead",
    message:
      "Your shop already exists and needs corrections. We will open the correction form so the existing row is updated deliberately.",
    iconClass: "bg-amber-50 text-amber-600",
    buttonLabel: "Open Correction Form",
  },
}

function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

async function extractFunctionErrorMessage(error, fallback = "Cleanup failed") {
  if (!error) return fallback
  const rawMessage = typeof error.message === "string" ? error.message : ""
  const context = error.context

  if (context && typeof context.clone === "function") {
    try {
      const asJson = await context.clone().json()
      if (asJson && typeof asJson.error === "string" && asJson.error.trim()) {
        return asJson.error
      }
    } catch {
      // Ignore non-JSON edge function error bodies.
    }

    try {
      const asText = await context.clone().text()
      if (asText && asText.trim()) return asText.trim()
    } catch {
      // Ignore non-text edge function error bodies.
    }
  }

  if (rawMessage && !rawMessage.includes("non-2xx")) return rawMessage
  return fallback
}

function formatUrl(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return `https://${raw}`
}

function validPhone(value) {
  // Simple check for 10-15 digits after cleaning
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 10 && digits.length <= 15
}

function validUrl(value) {
  if (!value) return true
  try {
    new URL(formatUrl(value))
    return true
  } catch {
    return false
  }
}

// --- NIGERIA PHONE INPUT ---
function NigeriaPhoneInput({ value, onChange, placeholder, disabled = false }) {
  return (
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
        className={`${FORM_CONTROL_CLASS} pl-[104px]`}
      />
    </div>
  )
}

// --- WHATSAPP VERIFIER (Removed per user request) ---

// --- CANVAS COMPRESSOR (Legacy Port) ---
const compressFullImage = (file) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const MAX_WIDTH = 1200
      const MAX_HEIGHT = 1200
      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width
          width = MAX_WIDTH
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height
          height = MAX_HEIGHT
        }
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      
      // Fill white to prevent black backgrounds on transparent PNGs
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          blob.name = file.name
          resolve(blob)
        },
        "image/jpeg",
        0.8
      )
    }
    img.onerror = () => reject(new Error("Failed to read image"))
    img.src = URL.createObjectURL(file)
  })
}

function buildCameraProfile(ratioInput) {
  const ratio = Number(ratioInput)
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_CAMERA_RATIO

  if (safeRatio >= 1) {
    const targetWidth = 1280
    return {
      aspectRatio: safeRatio,
      targetWidth,
      targetHeight: Math.round(targetWidth / safeRatio),
    }
  }

  const targetHeight = 1280
  return {
    aspectRatio: safeRatio,
    targetWidth: Math.round(targetHeight * safeRatio),
    targetHeight,
  }
}

// --- PROFESSIONAL SHIMMER COMPONENT ---
function ShopRegistrationShimmer() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-2xl bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-slate-100">
        <CTMLoader size="sm" />
      </div>
    </div>
  )
}

function ShopSubmissionLockedScreen({ onBack, lockState }) {
  const eyebrow = lockState?.eyebrow || "Under Review"
  const title = lockState?.title || "Shop Application Submitted"
  const heading = lockState?.heading || "Your form is locked for review"
  const message =
    lockState?.message ||
    "We have received your submission. You cannot edit this form while staff review is in progress."
  const iconClass = lockState?.iconClass || "bg-pink-50 text-pink-600"
  const Icon = lockState?.icon || FaShieldHalved
  const buttonLabel = lockState?.buttonLabel || "Back to User Dashboard"

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            aria-label="Back to dashboard"
          >
            <FaArrowLeft />
          </button>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-pink-600">
              {eyebrow}
            </p>
            <h1 className="text-lg font-black text-slate-950">
              {title}
            </h1>
          </div>
        </div>
      </div>

      <main className="mx-auto flex max-w-3xl px-4 py-12">
        <div className="w-full rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className={`mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] text-3xl ${iconClass}`}>
            <Icon />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">
            {heading}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm font-semibold leading-6 text-slate-500">
            {message}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-8 inline-flex h-12 items-center justify-center gap-3 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white shadow-xl shadow-slate-200 transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <FaArrowLeft className="text-xs" />
            {buttonLabel}
          </button>
        </div>
      </main>
    </div>
  )
}

async function fetchOwnedShopSnapshot({ userId, shopId = null, select = "*" }) {
  if (!userId) throw new Error("Authentication required.")

  let query = supabase
    .from("shops")
    .select(select)
    .eq("owner_id", userId)

  if (shopId) {
    query = query.eq("id", shopId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data || null
}

const STEPS = [
  { id: "basics", label: "Basics", icon: <FaStore /> },
  { id: "profile", label: "Profile", icon: <FaLocationDot /> },
  { id: "legal", label: "Verification", icon: <FaShieldHalved /> },
  { id: "presence", label: "Presence", icon: <FaAddressBook /> },
]

function ShopRegistration() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const shopId = searchParams.get("id")
  const isEdit = Boolean(shopId)
  const { notify } = useGlobalFeedback()

  usePreventPullToRefresh()

  const { loading: authLoading, user, profile, isOffline } = useAuthSession()

  const fetchFormData = async () => {
    if (!profile?.city_id) throw new Error("Profile not fully configured.")
    if (!user?.id) throw new Error("Authentication required.")

    const tasks = [
      supabase.from("categories").select("name").order("name"),
      supabase.from("areas").select("id, name").eq("city_id", profile.city_id).order("name"),
      supabase.from("cities").select("id, name, is_open").eq("id", profile.city_id).maybeSingle()
    ]

    let existingData = null

    if (isEdit && shopId) {
      tasks.push(
        supabase
          .from("shops")
          .select("*")
          .eq("id", shopId)
          .eq("owner_id", user.id)
          .maybeSingle()
      )
    } else {
      tasks.push(
        supabase
          .from("shops")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle()
      )
    }

    const results = await Promise.all(tasks)
    
    if (results[0].error) throw results[0].error
    if (results[1].error) throw results[1].error
    if (results[2].error) throw results[2].error

    if (isEdit && shopId) {
      if (results[3].error) throw results[3].error
      existingData = results[3].data
      if (!existingData) throw new Error("Shop not found or access denied.")
    } else {
      if (results[3].error) throw results[3].error
      existingData = results[3].data || null
    }

    return {
      categories: results[0].data || [],
      areas: results[1].data || [],
      cityData: results[2].data || null,
      shop: existingData,
    }
  }

  const cacheKey = buildShopRegistrationCacheKey(
    user?.id || "guest",
    profile?.city_id,
    isEdit ? shopId : null,
  )
  const { data, loading: dataLoading, error: dataError } = useCachedFetch(
    cacheKey,
    fetchFormData,
    {
      dependencies: [user?.id, profile?.city_id, shopId, isEdit],
      ttl: 1000 * 60 * 60 * 24,
      persist: "session",
    }
  )

  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [submissionLocked, setSubmissionLocked] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)
  const registrationView = searchParams.get(REGISTRATION_VIEW_KEY)
  const hasExplicitRegistrationView = searchParams.has(REGISTRATION_VIEW_KEY)
  const [showOnboarding, setShowOnboarding] = useState(
    !isEdit && registrationView !== "form"
  )

  const [categories, setCategories] = useState([])
  const [areas, setAreas] = useState([])
  const [cityData, setCityData] = useState(null)
  const [existingShop, setExistingShop] = useState(null)

  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [form, setForm] = useState(EMPTY_SHOP_FORM)

  const [files, setFiles] = useState(EMPTY_SHOP_FILES)

  const [previews, setPreviews] = useState(EMPTY_SHOP_PREVIEWS)

  // Signed URLs for existing private assets
  const [signedPreviews, setSignedPreviews] = useState(EMPTY_SIGNED_PREVIEWS)

  const registrationLockState = useMemo(() => {
    if (submissionLocked) {
      return {
        eyebrow: "Under Review",
        title: isEdit ? "Correction Submitted" : "Shop Application Submitted",
        heading: "Your form is locked for review",
        message:
          "We have received your submission. You cannot edit this form while staff review is in progress.",
        icon: FaShieldHalved,
        iconClass: "bg-pink-50 text-pink-600",
        buttonLabel: "Back to User Dashboard",
      }
    }

    if (!existingShop) return null

    const status = String(existingShop.status || "").toLowerCase()

    if (!isEdit) {
      const lockCopy =
        SHOP_REGISTRATION_LOCK_COPY[status] ||
        SHOP_REGISTRATION_LOCK_COPY.pending

      return {
        ...lockCopy,
        icon: status === "approved" ? FaCheck : FaShieldHalved,
      }
    }

    if (status === "pending") {
      return {
        eyebrow: "Under Review",
        title: "Correction Submitted",
        heading: "This application is still under review",
        message:
          "Staff are reviewing your latest correction. The form is locked until the review is complete.",
        icon: FaShieldHalved,
        iconClass: "bg-pink-50 text-pink-600",
        buttonLabel: "Back to User Dashboard",
      }
    }

    if (status === "approved") {
      return {
        eyebrow: "Application Approved",
        title: "Shop Application Approved",
        heading: "This application has already been approved",
        message:
          "Your shop application is already approved, so this form is locked to prevent duplicate submissions. Continue from your dashboard.",
        icon: FaCheck,
        iconClass: "bg-emerald-50 text-emerald-600",
        buttonLabel: "Back to User Dashboard",
      }
    }

    return null
  }, [existingShop, isEdit, submissionLocked])

  useEffect(() => {
    let isCancelled = false

    async function signExisting() {
      const promises = []
      const keys = []
      const nextSigned = { ...EMPTY_SIGNED_PREVIEWS }

      if (previews.idCard && previews.idCard.startsWith("http")) {
        const path = getStoragePathFromUrl(previews.idCard, ID_DOCUMENT_BUCKET)
        if (path) {
          keys.push("idCard")
          promises.push(supabase.storage.from(ID_DOCUMENT_BUCKET).createSignedUrl(path, 3600))
        }
      }

      if (previews.cac && previews.cac.startsWith("http")) {
        const path = getStoragePathFromUrl(previews.cac, CAC_DOCUMENT_BUCKET)
        if (path) {
          keys.push("cac")
          promises.push(supabase.storage.from(CAC_DOCUMENT_BUCKET).createSignedUrl(path, 3600))
        }
      }

      if (promises.length > 0) {
        const results = await Promise.all(promises)
        results.forEach((res, idx) => {
          if (res.data?.signedUrl) {
            nextSigned[keys[idx]] = res.data.signedUrl
          }
        })
      }

      if (!isCancelled) {
        setSignedPreviews(nextSigned)
      }
    }

    signExisting()

    return () => {
      isCancelled = true
    }
  }, [previews.idCard, previews.cac])

  const [fileMeta, setFileMeta] = useState(EMPTY_FILE_META)

  const shopDraftKey = useMemo(() => {
    if (!user?.id) return ""
    return isEdit && shopId
      ? `shop-registration:${user.id}:edit:${shopId}`
      : `shop-registration:${user.id}:new`
  }, [isEdit, shopId, user?.id])
  const previewsRef = useRef(previews)
  const skipNextDraftSaveRef = useRef(false)
  const submitInFlightRef = useRef(false)

  useEffect(() => {
    setHasHydrated(false)
    setExistingShop(null)
    setReviewOpen(false)
    setSubmissionLocked(false)
  }, [cacheKey])

  useEffect(() => {
    if (isEdit || !existingShop?.id) return

    const status = String(existingShop.status || "").toLowerCase()
    if (status !== "rejected") return

    navigate(`/shop-registration?id=${encodeURIComponent(existingShop.id)}&${REGISTRATION_VIEW_KEY}=form`, {
      replace: true,
    })
  }, [existingShop, isEdit, navigate])

  // --- CT STUDIO UPLOAD & CROP STATE ---
  const hiddenInputRef = useRef(null)
  const pickerContextRef = useRef({ targetId: null, ratio: null })
  const [cropConfig, setCropConfig] = useState({ isOpen: false, targetId: null, src: "", ratio: null })
  const [cameraCapture, setCameraCapture] = useState({
    open: false,
    targetId: null,
    ratio: DEFAULT_CAMERA_RATIO,
  })

  const storefrontRuleLabel = getRuleLabel(STOREFRONT_RULE)
  const logoRuleLabel = getRuleLabel(LOGO_RULE)
  const idRuleLabel = getRuleLabel(ID_DOCUMENT_RULE)
  const cacRuleLabel = getRuleLabel(CAC_DOCUMENT_RULE)
  const onboardingAvatarUrl =
    profile?.avatar_url ||
    `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(
      profile?.full_name || "Merchant",
    )}`
  const hasUploadedProfileAvatar = Boolean(profile?.avatar_url)

  const updateRegistrationView = useCallback((nextView, { replace = false } = {}) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(REGISTRATION_VIEW_KEY, nextView)
    setSearchParams(nextParams, { replace })
  }, [searchParams, setSearchParams])

  function openOnboardingScreen() {
    setShowOnboarding(true)
    setCurrentStep(0)
    if (!isEdit) {
      updateRegistrationView("onboarding")
    }
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function startRegistrationFlow() {
    setShowOnboarding(false)
    if (!isEdit) {
      updateRegistrationView("form")
    }
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function returnToRegistrationOrigin() {
    if (isEdit) {
      navigate("/user-dashboard?tab=services", { replace: true })
      return
    }

    navigate("/user-dashboard?tab=services", { replace: true })
  }

  function handleLockedShopAction() {
    if (!isEdit && existingShop?.id) {
      const status = String(existingShop.status || "").toLowerCase()
      if (status === "rejected") {
        navigate(`/shop-registration?id=${encodeURIComponent(existingShop.id)}&${REGISTRATION_VIEW_KEY}=form`, {
          replace: true,
        })
        return
      }
    }

    returnToRegistrationOrigin()
  }

  function handleRegistrationBack() {
    if (currentStep > 0) {
      prevStep()
      return
    }

    if (!isEdit) {
      openOnboardingScreen()
      return
    }

    returnToRegistrationOrigin()
  }

  useEffect(() => {
    if (isEdit) return
    if (searchParams.has(REGISTRATION_VIEW_KEY)) return
    updateRegistrationView("onboarding", { replace: true })
  }, [isEdit, searchParams, updateRegistrationView])

  useEffect(() => {
    if (isEdit) return
    if (!hasExplicitRegistrationView) return

    const shouldShowOnboarding = registrationView !== "form"
    setShowOnboarding(shouldShowOnboarding)

    if (shouldShowOnboarding) {
      setCurrentStep(0)
    }
  }, [hasExplicitRegistrationView, isEdit, registrationView])

  function getRuleForTargetId(targetId) {
    if (targetId === "storefront") return STOREFRONT_RULE
    if (targetId === "logo") return LOGO_RULE
    if (targetId === "idCard") return ID_DOCUMENT_RULE
    if (targetId === "cac") return CAC_DOCUMENT_RULE
    return null
  }

  const descWords = useMemo(() => countWords(form.desc), [form.desc])
  const addressWords = useMemo(() => countWords(form.address), [form.address])
  const activeCameraProfile = useMemo(
    () => buildCameraProfile(cameraCapture.ratio),
    [cameraCapture.ratio],
  )
  const onboardingSteps = useMemo(
    () => [
      {
        step: "01",
        title: "Submit Application",
        desc: "Fill in your shop details, location, and verification documents.",
        icon: <FaFileContract />,
      },
      {
        step: "02",
        title: "Approval & Product Catalog",
        desc: "Once approved, upload at least 5 products to activate your storefront.",
        icon: <FaBoxOpen />,
      },
      {
        step: "03",
        title: "Verification Payment",
        desc: "Pay â‚¦5,000 verification fee or redeem a promo code for your badge.",
        icon: <FaShieldHalved />,
      },
      {
        step: "04",
        title: "Video Verification",
        desc: "Submit a 1-minute video showing your shop signboard, interior, and products.",
        icon: <FaCamera />,
      },
      {
        step: "05",
        title: "Final Activation",
        desc: "Get verified and start reaching thousands of customers in your city.",
        icon: <FaCheck />,
      },
    ],
    [],
  )

  useEffect(() => {
    if (!data || hasHydrated || !shopDraftKey) return

    let isCancelled = false

    async function hydrateRegistrationForm() {
      setCategories(mergeServiceCategoriesForSelect(data.categories))
      setAreas(data.areas)
      setCityData(data.cityData)

      let nextForm = { ...EMPTY_SHOP_FORM }
      let nextFiles = { ...EMPTY_SHOP_FILES }
      let nextPreviews = { ...EMPTY_SHOP_PREVIEWS }
      let nextFileMeta = { ...EMPTY_FILE_META }
      let nextCurrentStep = 0
      let nextShowOnboarding = !isEdit

      if (isEdit && data.shop) {
        const s = data.shop
        setExistingShop(s)
        nextForm = {
          name: s.name || "",
          businessType: s.business_type || "Individual/Enterprise",
          category: s.category || "",
          desc: s.description || "",
          areaId: s.area_id ? String(s.area_id) : "",
          address: s.address || "",
          lat: s.latitude ?? "",
          lng: s.longitude ?? "",
          cacNumber: s.cac_number || "",
          idType: s.id_type || "National ID Card",
          idNumber: s.id_number || "",
          website: s.website_url || "",
          phone: s.phone || "",
          whatsapp: s.whatsapp || "",
          facebook: s.facebook_url || "",
          twitter: s.twitter_url || "",
          telegram: s.telegram_url || "",
        }

        nextPreviews = {
          storefront: s.storefront_url || "",
          idCard: s.id_card_url || "",
          cac: s.cac_certificate_url || "",
          logo: s.image_url || "",
        }

        if (s.status === "rejected" && s.rejection_reason) {
          setNotice({ visible: true, type: "warning", title: "Correction required", message: s.rejection_reason })
        }
      } else {
        setExistingShop(data.shop || null)
      }

      const draft = await loadPersistentDraft(shopDraftKey)
      if (isCancelled) return

      if (draft?.data?.form) {
        nextForm = { ...nextForm, ...draft.data.form }
      }

      if (draft?.data?.previews) {
        // Only restore previews that have a value, to avoid overwriting 
        // existing server URLs with empty strings from a partial draft
        Object.keys(draft.data.previews).forEach((key) => {
          if (draft.data.previews[key]) {
            nextPreviews[key] = draft.data.previews[key]
          }
        })
      }

      if (Number.isInteger(draft?.data?.currentStep)) {
        nextCurrentStep = Math.max(0, Math.min(STEPS.length - 1, draft.data.currentStep))
      }

      if (typeof draft?.data?.showOnboarding === "boolean") {
        nextShowOnboarding = draft.data.showOnboarding
      }

      SHOP_FILE_KEYS.forEach((key) => {
        const storedFile = draft?.files?.[key]
        if (!storedFile) return

        const previewUrl = URL.createObjectURL(storedFile)
        nextFiles[key] = storedFile
        nextPreviews[key] = previewUrl
        nextFileMeta[key] = {
          name: storedFile.name || `${key}_upload`,
          type: storedFile.type || "application/octet-stream",
        }
      })

      setForm(nextForm)
      setFiles(nextFiles)
      setPreviews(nextPreviews)
      setSignedPreviews(EMPTY_SIGNED_PREVIEWS)
      setFileMeta(nextFileMeta)
      setCurrentStep(nextCurrentStep)
      setShowOnboarding(nextShowOnboarding)
      setHasHydrated(true)
    }

    hydrateRegistrationForm()

    return () => {
      isCancelled = true
    }
  }, [data, hasHydrated, isEdit, notify, shopDraftKey])

  useEffect(() => {
    previewsRef.current = previews
  }, [previews])

  useEffect(() => {
    return () => {
      Object.values(previewsRef.current).forEach((value) => {
        if (typeof value === "string" && value.startsWith("blob:")) {
          URL.revokeObjectURL(value)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated || !shopDraftKey) return

    const timeoutId = window.setTimeout(() => {
      if (skipNextDraftSaveRef.current) {
        skipNextDraftSaveRef.current = false
        return
      }

      const persistentFiles = Object.fromEntries(
        SHOP_FILE_KEYS.filter((key) => Boolean(files[key])).map((key) => [key, files[key]])
      )
      const persistentPreviews = Object.fromEntries(
        SHOP_FILE_KEYS.map((key) => {
          const val = previews[key]
          // If we have a local File object, we don't save a preview URL (the File itself is saved in IndexedDB)
          // If the preview is a blob URL, we don't save it (it's temporary and revoked on reload)
          // We ONLY save the preview if it's an existing server URL and there's no new file replacement
          const isServerUrl = typeof val === "string" && val.length > 0 && !val.startsWith("blob:")
          const hasNewFile = Boolean(files[key])
          return [key, (isServerUrl && !hasNewFile) ? val : ""]
        })
      )

      savePersistentDraft(shopDraftKey, {
        data: {
          form,
          previews: persistentPreviews,
          currentStep,
          showOnboarding,
        },
        files: persistentFiles,
      })
    }, SHOP_DRAFT_SAVE_DELAY)

    return () => window.clearTimeout(timeoutId)
  }, [currentStep, files, form, hasHydrated, previews, shopDraftKey, showOnboarding])

  useEffect(() => {
    if (dataError) {
      setNotice({ visible: true, type: "error", title: "Could not load form", message: dataError })
    }
  }, [dataError])

  // --- LEGACY HTML URL FORMATTER ---
  const handleUrlBlur = (field) => (e) => {
    let val = e.target.value.trim()
    if (val && !/^https?:\/\//i.test(val)) {
      setForm((prev) => ({ ...prev, [field]: "https://" + val }))
    }
  }

  function validateStep(stepIndex) {
    switch (stepIndex) {
      case 0: // Basics
        if (!form.name.trim() || form.name.trim().length < 3) return "Business name must be at least 3 characters."
        if (!form.category) return "Please select a business category."
        if (!previews.storefront && !files.storefront) return "Store front image is required."
        return ""
      case 1: // Profile
        if (descWords < DESC_MIN_WORDS || descWords > DESC_MAX_WORDS) return `Business description must be between ${DESC_MIN_WORDS} and ${DESC_MAX_WORDS} words.`
        if (!form.areaId) return "Please select an area."
        if (addressWords < ADDR_MIN_WORDS || addressWords > ADDR_MAX_WORDS) return `Street address must be between ${ADDR_MIN_WORDS} and ${ADDR_MAX_WORDS} words.`
        return ""
      case 2: // Legal
        if (!form.idNumber.trim()) return "ID number is required."
        if (!previews.idCard && !files.idCard) return "ID document is required."
        if (form.businessType === "Limited Liability (Ltd)") {
          if (!form.cacNumber.trim()) return "RC Number is required for Limited Liability businesses."
          if (!previews.cac && !files.cac) return "CAC certificate is required for Limited Liability businesses."
        }
        return ""
      case 3: // Presence
        if (!validPhone(form.phone)) return "Enter a valid business phone number."
        if (form.whatsapp && !validPhone(form.whatsapp)) return "Enter a valid WhatsApp number."
        if (!validUrl(form.website)) return "Enter a valid website URL."
        if (!validUrl(form.facebook)) return "Enter a valid Facebook URL."
        if (!validUrl(form.twitter)) return "Enter a valid X or Twitter URL."
        if (!validUrl(form.telegram)) return "Enter a valid Telegram URL."
        return ""
      default:
        return ""
    }
  }

  function nextStep() {
    const error = validateStep(currentStep)
    if (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Check Step Details",
        message: error,
      })
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setNotice({ visible: false, type: "info", title: "", message: "" })
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } else {
      setReviewOpen(true)
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  // --- CT STUDIO FILE PIPELINE ---
  const openImagePicker = (targetId, ratio = null) => {
    const input = hiddenInputRef.current
    if (!input) return
    const targetRule = getRuleForTargetId(targetId)
    const imageAccept =
      targetRule?.allowedMime?.filter((mime) => mime.startsWith("image/")).join(",") || "image/*"

    pickerContextRef.current = { targetId, ratio }
    input.value = ""
    input.setAttribute("accept", imageAccept)
    input.removeAttribute("capture")
    input.click()
  }

  const openPdfPicker = (targetId) => {
    const input = hiddenInputRef.current
    if (!input) return

    pickerContextRef.current = { targetId, ratio: null }
    input.value = ""
    input.setAttribute("accept", "application/pdf")
    input.removeAttribute("capture")
    input.click()
  }

  const openCustomCamera = (targetId, ratio) => {
    setCameraCapture({
      open: true,
      targetId,
      ratio: Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : DEFAULT_CAMERA_RATIO,
    })
  }

  const closeCustomCamera = () => {
    setCameraCapture({ open: false, targetId: null, ratio: DEFAULT_CAMERA_RATIO })
  }

  const handleHiddenFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const { targetId, ratio } = pickerContextRef.current
    if (!targetId) return
    const targetRule = getRuleForTargetId(targetId)

    if (file.type === "application/pdf") {
      const maxPdfBytes = targetRule?.maxBytes || MAX_FILE_SIZE
      if (file.size > maxPdfBytes) {
        setNotice({
          visible: true,
          type: "error",
          title: "PDF too large",
          message: `Maximum allowed PDF size is ${formatBytes(maxPdfBytes)}.`,
        })
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
      saveFileState(targetId, file, file.name, "application/pdf")
      return
    }

    if (file.type.startsWith("image/")) {
      if (ratio) {
        const reader = new FileReader()
        reader.onload = (e) => {
          setCropConfig({ isOpen: true, targetId, src: e.target.result, ratio })
        }
        reader.readAsDataURL(file)
      } else {
        try {
          const compressedBlob = await compressFullImage(file)
          const maxImageBytes = targetRule?.maxBytes || MAX_FILE_SIZE
          if (compressedBlob.size > maxImageBytes) {
            setNotice({
              visible: true,
              type: "error",
              title: "Image too detailed",
              message: `Could not compress image enough. Please keep it under ${formatBytes(maxImageBytes)}.`,
            })
            window.scrollTo({ top: 0, behavior: "smooth" })
            return
          }
          saveFileState(targetId, compressedBlob, URL.createObjectURL(compressedBlob), "image/jpeg")
        } catch (e) {
          setNotice({
            visible: true,
            type: "error",
            title: "Image unavailable",
            message: getFriendlyErrorMessage(e, "Could not process the image. Please retry."),
          })
          window.scrollTo({ top: 0, behavior: "smooth" })
        }
      }
    }
  }

  const handleCameraCapture = async ({ blob }) => {
    const { targetId } = cameraCapture
    closeCustomCamera()
    if (!blob || !targetId) return

    try {
      const targetRule = getRuleForTargetId(targetId)
      const maxImageBytes = targetRule?.maxBytes || MAX_FILE_SIZE
      const sourceFile = new File([blob], `${targetId}_camera_${Date.now()}.jpg`, { type: "image/jpeg" })
      const compressedBlob = await compressFullImage(sourceFile)

      if (compressedBlob.size > maxImageBytes) {
        setNotice({
          visible: true,
          type: "error",
          title: "Image too detailed",
          message: `Could not compress image enough. Please keep it under ${formatBytes(maxImageBytes)}.`,
        })
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }

      saveFileState(targetId, compressedBlob, URL.createObjectURL(compressedBlob), "image/jpeg")
    } catch {
      setNotice({
        visible: true,
        type: "error",
        title: "Image unavailable",
        message: "Could not process the captured image. Please retry.",
      })
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const onCropComplete = (blob) => {
    const targetRule = getRuleForTargetId(cropConfig.targetId)
    const maxCropBytes = targetRule?.maxBytes || MAX_FILE_SIZE
    if (blob.size > maxCropBytes) {
      setNotice({
        visible: true,
        type: "error",
        title: "Crop too large",
        message: `Try cropping a smaller area to reduce file size below ${formatBytes(maxCropBytes)}.`,
      })
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    saveFileState(cropConfig.targetId, blob, URL.createObjectURL(blob), "image/jpeg")
    setCropConfig({ isOpen: false, targetId: null, src: "", ratio: null })
  }

  const saveFileState = (key, fileOrBlob, previewUrl, type) => {
    setFiles((prev) => ({ ...prev, [key]: fileOrBlob }))
    setPreviews((prev) => {
      const previousValue = prev[key]
      if (
        previousValue &&
        previousValue !== previewUrl &&
        String(previousValue).startsWith("blob:")
      ) {
        URL.revokeObjectURL(previousValue)
      }

      return { ...prev, [key]: previewUrl }
    })
    if (key === "idCard" || key === "cac") {
      setSignedPreviews((prev) => ({ ...prev, [key]: "" }))
    }
    setFileMeta((prev) => ({
      ...prev,
      [key]: { name: fileOrBlob.name || `${key}_upload.jpg`, type: type }
    }))
  }

  function renderPreview(key) {
    const meta = fileMeta[key]
    const value = previews[key]
    if (!value) return null

    // Use signed preview if available for private docs (ID/CAC)
    const shouldUseSignedPreview =
      (key === "idCard" || key === "cac") &&
      typeof value === "string" &&
      value.startsWith("http")
    const displayValue = shouldUseSignedPreview ? (signedPreviews[key] || value) : value

    const isPdf = meta?.type === "application/pdf" || String(displayValue).toLowerCase().includes(".pdf")

    if (isPdf) {
      return (
        <div className="flex h-full min-h-[140px] items-center justify-center rounded-2xl bg-white p-4 text-center">
          <div>
            <FaFilePdf className="mx-auto mb-2 text-4xl text-red-500" />
            <p className="text-xs font-bold text-slate-700 line-clamp-2">
              {meta?.name || "PDF Document"}
            </p>
          </div>
        </div>
      )
    }

    return <img src={displayValue} alt={key} className="h-full min-h-[140px] w-full rounded-2xl object-cover" />
  }

  function getStoragePathFromUrl(url, bucket) {
    if (!url) return null
    if (!String(url).startsWith("http")) return String(url).replace(/^\/+/, "")
    try {
      const cleanUrl = String(url).split("?")[0]
      const escapedBucket = bucket.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
      const regex = new RegExp(`/storage/v1/object/(?:public|authenticated|sign)/${escapedBucket}/(.+)$`, "i")
      const match = cleanUrl.match(regex)
      return match?.[1] || null
    } catch {
      return null
    }
  }

  async function getUploadFingerprint(fileOrBlob) {
    try {
      if (
        globalThis.crypto?.subtle &&
        typeof fileOrBlob?.arrayBuffer === "function"
      ) {
        const digest = await globalThis.crypto.subtle.digest(
          "SHA-256",
          await fileOrBlob.arrayBuffer()
        )

        return Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("")
          .slice(0, 20)
      }
    } catch {
      // Fall back below if the browser blocks Web Crypto for any reason.
    }

    return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  }

  async function uploadFile(fileOrBlob, bucket, folder, oldUrl = "", slotKey = folder) {
    if (!fileOrBlob) {
      return {
        url: oldUrl || null,
        bucket,
        oldPath: null,
        newPath: null,
      }
    }

    const oldPath = getStoragePathFromUrl(oldUrl, bucket)
    const extension = fileOrBlob.name?.split(".").pop() || "jpg"
    const fingerprint = await getUploadFingerprint(fileOrBlob)
    const path = `${folder}/${user.id}_${slotKey}_${fingerprint}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, fileOrBlob, {
        upsert: true,
        contentType: fileOrBlob.type || "image/jpeg",
        cacheControl: "31536000",
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    const publicUrl = data?.publicUrl || null
    const finalUrl =
      bucket === ID_DOCUMENT_BUCKET || bucket === CAC_DOCUMENT_BUCKET
        ? publicUrl?.replace("/public/", "/authenticated/")
        : publicUrl

    return {
      url: finalUrl,
      bucket,
      oldPath,
      newPath: path,
    }
  }

  async function submitApplication() {
    if (submitting || submitInFlightRef.current) return
    if (isOffline) {
      setNotice({ visible: true, type: "error", title: "Network Offline", message: "You cannot submit an application while offline." })
      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    const uploadedFiles = []

    try {
      submitInFlightRef.current = true
      setSubmitting(true)
      let activeExistingShop = existingShop

      if (isEdit) {
        activeExistingShop = await fetchOwnedShopSnapshot({
          userId: user.id,
          shopId,
        })

        if (!activeExistingShop) {
          throw new Error("Shop not found or access denied.")
        }

        setExistingShop(activeExistingShop)

        if (String(activeExistingShop.status || "").toLowerCase() !== "rejected") {
          setReviewOpen(false)
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
      } else {
        activeExistingShop = await fetchOwnedShopSnapshot({
          userId: user.id,
        })

        if (activeExistingShop) {
          setExistingShop(activeExistingShop)
          setReviewOpen(false)

          try {
            skipNextDraftSaveRef.current = true
            await clearPersistentDraft(shopDraftKey)
          } catch (draftError) {
            console.warn("Could not clear stale shop registration draft:", draftError)
          }

          if (String(activeExistingShop.status || "").toLowerCase() === "rejected") {
            navigate(`/shop-registration?id=${encodeURIComponent(activeExistingShop.id)}&${REGISTRATION_VIEW_KEY}=form`, {
              replace: true,
            })
          } else {
            window.scrollTo({ top: 0, behavior: "smooth" })
          }

          return
        }
      }

      const storefrontUpload = await uploadFile(files.storefront, STOREFRONT_BUCKET, "covers", activeExistingShop?.storefront_url, "storefront")
      uploadedFiles.push(storefrontUpload)
      const idCardUpload = await uploadFile(files.idCard, ID_DOCUMENT_BUCKET, "ids", activeExistingShop?.id_card_url, "id-card")
      uploadedFiles.push(idCardUpload)
      const cacUpload = await uploadFile(files.cac, CAC_DOCUMENT_BUCKET, "cac", activeExistingShop?.cac_certificate_url, "cac")
      uploadedFiles.push(cacUpload)
      const logoUpload = await uploadFile(files.logo, LOGO_BUCKET, "logos", activeExistingShop?.image_url, "logo")
      uploadedFiles.push(logoUpload)

      const { data: rpcRes, error: rpcErr } = await supabase.rpc("register_or_update_shop", {
        p_name: form.name.trim(),
        p_description: form.desc.trim(),
        p_address: form.address.trim(),
        p_phone: form.phone.trim(),
        p_whatsapp: form.whatsapp.trim() || null,
        p_city_id: profile.city_id,
        p_area_id: Number(form.areaId),
        p_category: form.category,
        p_business_type: form.businessType,
        p_latitude: form.lat ? Number(form.lat) : null,
        p_longitude: form.lng ? Number(form.lng) : null,
        p_id_type: form.idType,
        p_id_number: form.idNumber.trim(),
        p_cac_number: form.cacNumber.trim() || null,
        p_image_url: logoUpload.url,
        p_storefront_url: storefrontUpload.url,
        p_id_card_url: idCardUpload.url,
        p_cac_certificate_url: cacUpload.url,
        p_kyc_video_url: null, // Handled separately or in a future step
        p_facebook_url: form.facebook ? formatUrl(form.facebook) : null,
        p_instagram_url: null,
        p_twitter_url: form.twitter ? formatUrl(form.twitter) : null,
        p_tiktok_url: null,
        p_website_url: form.website ? formatUrl(form.website) : null,
        p_shop_id: isEdit ? Number(activeExistingShop?.id || shopId) : null,
        p_telegram_url: form.telegram ? formatUrl(form.telegram) : null,
      })

      if (rpcErr) throw rpcErr

      if (rpcRes?.success === false) {
        setNotice({
          visible: true,
          type: "error",
          title: "Registration Issue",
          message: rpcRes.message || "An unexpected error occurred. Please check your details.",
        })
        setReviewOpen(false)
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }

      try {
        if (user?.id && rpcRes?.shop_id) {
          localStorage.setItem(
            `ctm_my_shop_${user.id}`,
            JSON.stringify({
              id: rpcRes.shop_id,
              status: "pending",
              rejection_reason: null,
              is_open: true,
              is_verified: false,
              kyc_status: "unsubmitted",
              kyc_video_url: null,
            })
          )
        }
      } catch {
        // Dashboard status will still refresh from Supabase when local storage is unavailable.
      }

      const cleanupAssets = uploadedFiles
        .filter((item) => item?.bucket && item?.oldPath && item?.newPath && item.oldPath !== item.newPath)
        .map((item) => ({
          bucket: item.bucket,
          path: item.oldPath,
        }))

      if (cleanupAssets.length && activeExistingShop?.id) {
        try {
          const { data: cleanupData, error: cleanupError } = await invokeEdgeFunctionAuthed(
            "cleanup-shop-registration-assets",
            {
              shopId: activeExistingShop.id,
              assets: cleanupAssets,
            },
          )

          if (cleanupError) {
            const detailedMessage = await extractFunctionErrorMessage(
              cleanupError,
              "Old asset cleanup failed.",
            )
            throw new Error(detailedMessage)
          }

          if (cleanupData?.error) {
            throw new Error(cleanupData.error)
          }
        } catch (cleanupError) {
          console.warn("Old shop file cleanup failed:", cleanupError)
        }
      }

      try {
        skipNextDraftSaveRef.current = true
        await clearPersistentDraft(shopDraftKey)
      } catch (draftError) {
        console.warn("Could not clear shop registration draft:", draftError)
      }

      setReviewOpen(false)
      setSubmissionLocked(true)
      window.scrollTo({ top: 0, behavior: "smooth" })

      try { localStorage.removeItem("ctm_dashboard_cache") } catch {
        // Ignore cache cleanup failures
      }
    } catch (error) {
      const uploadedPathsByBucket = new Map()
      uploadedFiles.forEach((item) => {
        if (!item?.bucket || !item.newPath) return
        if (!uploadedPathsByBucket.has(item.bucket)) uploadedPathsByBucket.set(item.bucket, [])
        uploadedPathsByBucket.get(item.bucket).push(item.newPath)
      })

      try {
        await Promise.all(
          Array.from(uploadedPathsByBucket.entries()).map(async ([bucket, paths]) => {
            const uniquePaths = [...new Set(paths)].filter(Boolean)
            if (!uniquePaths.length) return

            const { error: removeError } = await supabase.storage.from(bucket).remove(uniquePaths)
            if (removeError) {
              throw {
                ...removeError,
                bucket,
                paths: uniquePaths,
              }
            }
          })
        )
      } catch (cleanupError) {
        console.warn("Rollback cleanup failed for new shop files:", cleanupError)
      }

      notify({
        type: "error",
        title: "Submission Failed",
        message: getFriendlyErrorMessage(error, "Please retry or contact support."),
      })
      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally {
      submitInFlightRef.current = false
      setSubmitting(false)
    }
  }

  if (authLoading || (dataLoading && !data)) return <ShopRegistrationShimmer />

  if (dataError && !data) {
    return (
      <GlobalErrorScreen
        error={dataError}
        message={getFriendlyErrorMessage(dataError, "Please retry or go back.")}
        onRetry={() => window.location.reload()}
        onBack={returnToRegistrationOrigin}
      />
    )
  }

  if (!user || !profile) return null

  if (registrationLockState) {
    return (
      <ShopSubmissionLockedScreen
        lockState={registrationLockState}
        onBack={handleLockedShopAction}
      />
    )
  }

  if (showOnboarding) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eef2ff_0%,#f8fafc_34%,#fff7fb_100%)]">
        <div className="mx-auto max-w-4xl px-4 py-10 md:py-14">
          <div className="mb-10 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#4f46e5_0%,#db2777_100%)] text-3xl text-white shadow-[0_24px_60px_rgba(79,70,229,0.28)]">
              <FaBriefcase />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Merchant Onboarding</h1>
            <p className="mt-2 text-lg font-medium text-slate-600">
              Your journey to a professional digital presence starts here.
            </p>
          </div>

          <div className="mb-6 flex items-center gap-4 rounded-[32px] border border-white/80 bg-white/90 p-5 shadow-[0_20px_55px_rgba(15,23,42,0.09)] backdrop-blur md:p-6">
            <div className="rounded-[28px] border border-indigo-100 bg-[linear-gradient(180deg,#eef2ff_0%,#ffffff_100%)] p-1.5 shadow-sm">
              <img
                src={onboardingAvatarUrl}
                alt="Profile avatar"
                className="h-16 w-16 rounded-[22px] object-cover md:h-20 md:w-20"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-pink-600">
                {hasUploadedProfileAvatar ? "Profile Picture" : "Profile Picture Required"}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900">
                  {hasUploadedProfileAvatar ? "Ready" : "Required"}
                </h2>
                {hasUploadedProfileAvatar ? (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <FaCheck className="text-xs" />
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/user-dashboard?tab=profile")}
              className="shrink-0 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100"
            >
              {hasUploadedProfileAvatar ? "Update" : "Add"}
            </button>
          </div>

          <div className="space-y-4">
            {onboardingSteps.map((item) => (
              <div
                key={item.step}
                className="group relative flex items-start gap-5 rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_24px_60px_rgba(15,23,42,0.1)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-xl text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 group-hover:text-indigo-700">Step {item.step}</span>
                    <div className="h-1 w-1 rounded-full bg-slate-300" />
                    <h3 className="text-lg font-extrabold text-slate-900">{item.title}</h3>
                  </div>
                  <p className="mt-1 text-[15px] font-medium leading-relaxed text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
            {/*
              { 
                step: "04", 
                title: "Verification Payment", 
                desc: "Pay ₦5,000 verification fee or redeem a promo code for your badge.",
                icon: <FaShieldHalved />
              },
              { 
                step: "05", 
                title: "Video Verification", 
                desc: "Submit a 1-minute video showing your shop signboard, interior, and products.",
                icon: <FaCamera />
              },
              { 
                step: "06", 
                title: "Final Activation", 
                desc: "Get verified and start reaching thousands of customers in your city.",
                icon: <FaCheck />
              },
            ].map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (idx === 0) navigate("/user-dashboard?tab=profile")
                }}
                className={`group relative flex items-start gap-5 rounded-[32px] border border-white/80 bg-white/90 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.07)] transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_24px_60px_rgba(15,23,42,0.1)] ${idx === 0 ? "cursor-pointer active:scale-[0.98]" : ""}`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-xl text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                  {item.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 group-hover:text-indigo-700">Step {item.step}</span>
                    <div className="h-1 w-1 rounded-full bg-slate-300" />
                    <h3 className="text-lg font-extrabold text-slate-900">{item.title}</h3>
                    {idx === 0 && (
                      <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-tight text-indigo-600">Tap to Update</span>
                    )}
                  </div>
                  <p className="mt-1 text-[15px] font-medium leading-relaxed text-slate-500">{item.desc}</p>
                </div>
                {idx === 0 ? (
                  <div className="hidden shrink-0 items-center gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
                    <img
                      src={onboardingAvatarUrl}
                      alt="Current profile avatar"
                      className="h-12 w-12 rounded-2xl object-cover"
                    />
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">
                        {hasUploadedProfileAvatar ? "Avatar Ready" : "Needs Update"}
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        {hasUploadedProfileAvatar ? "Shown on your profile" : "Tap to add photo"}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            */}
          </div>

          <div className="mt-12 space-y-4">
            <button
              type="button"
              onClick={startRegistrationFlow}
              className="flex h-16 w-full items-center justify-center gap-3 rounded-[24px] bg-[linear-gradient(135deg,#111827_0%,#4f46e5_100%)] text-lg font-black text-white shadow-[0_24px_60px_rgba(79,70,229,0.24)] transition-all hover:brightness-[1.03] active:scale-[0.98]"
            >
              Start Registration
              <FaArrowRight className="text-sm" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/user-dashboard?tab=services")}
              className="h-14 w-full rounded-[22px] border border-white/80 bg-white/80 text-sm font-bold text-slate-500 shadow-sm transition-colors hover:text-slate-700"
            >
              Maybe later, go back to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,#eef2ff_0%,#f8fafc_38%,#fff7fb_100%)] pb-20">
      
      <input ref={hiddenInputRef} type="file" className="hidden" onChange={handleHiddenFileChange} />

      {/* Modern Header with Navigation */}
      <div className="sticky top-0 z-[10] border-b border-white/70 bg-white/90 shadow-[0_12px_35px_rgba(15,23,42,0.06)] backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={handleRegistrationBack}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FaArrowLeft />
              </button>
              <div>
                <h1 className="text-lg font-bold text-slate-900">{isEdit ? "Correction" : "New Registration"}</h1>
                <p className="text-xs font-medium text-slate-500">Step {currentStep + 1} of {STEPS.length}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1">
              {STEPS.map((s, idx) => (
                <div key={s.id} className="flex items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-all duration-500 ${idx <= currentStep ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-100 text-slate-400'}`}>
                    {idx < currentStep ? <FaCheck className="text-xs" /> : s.icon}
                  </div>
                  {idx < STEPS.length - 1 && <div className={`h-1 w-2 md:w-6 rounded-full mx-1 transition-colors duration-500 ${idx < currentStep ? 'bg-indigo-600' : 'bg-slate-100'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Progress Bar (Mobile Optimized) */}
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div 
              className="h-full bg-indigo-600 transition-all duration-500 ease-out" 
              style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <section className="px-4 py-6">
        <div className="mx-auto max-w-4xl">
          {isOffline && (
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
              <i className="fa-solid fa-wifi-slash"></i> Offline Mode: View only.
            </div>
          )}

          <AuthNotification visible={notice.visible} type={notice.type} title={notice.title} message={notice.message} />

          {cityData && cityData.is_open === false ? (
            <div className="rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
              <FaCity className="mx-auto mb-4 text-5xl text-amber-500" />
              <h2 className="text-xl font-bold text-slate-900 mb-2">Operations Paused</h2>
              <p className="text-sm font-medium text-slate-600">
                Merchant registrations in <strong>{cityData.name}</strong> are temporarily paused.
              </p>
            </div>
          ) : (
            <div className="animate-fade-in space-y-6">
              
              {/* Step 1: Basics */}
              {currentStep === 0 && (
                <div className={FORM_SECTION_CLASS}>
                  <SectionHeader icon={<FaStore />} title="Business Basics" subtitle="Tell us the core details of your shop." />
                  
                  <div className="space-y-6">
                    <FieldBlock label="What is your business name?">
                      <InputWithIcon icon={<FaShop />} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Ade & Sons Enterprise" />
                    </FieldBlock>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Business Structure">
                        <select value={form.businessType} onChange={(e) => setForm((prev) => ({ ...prev, businessType: e.target.value }))} className={FORM_CONTROL_CLASS}>
                          <option>Individual/Enterprise</option>
                          <option>Limited Liability (Ltd)</option>
                        </select>
                      </FieldBlock>

                      <FieldBlock label="Primary Category">
                        <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} className={FORM_CONTROL_CLASS}>
                          <option value="">Select...</option>
                          {categories.map((item) => (<option key={item.name} value={item.name}>{item.name}</option>))}
                        </select>
                      </FieldBlock>
                    </div>

                    <div className="pt-4">
                      <UploadCard
                        title="Store Front Photo"
                        subtitle={`Clear photo of shop exterior | ${storefrontRuleLabel}`}
                        onFileClick={() => openImagePicker("storefront", 3 / 4)}
                        onCameraClick={() => openCustomCamera("storefront", 3 / 4)}
                        preview={renderPreview("storefront")}
                        isPortrait
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Profile */}
              {currentStep === 1 && (
                <div className={FORM_SECTION_CLASS}>
                  <SectionHeader icon={<FaLocationDot />} title="Location & Description" subtitle="Where are you located and what do you do?" />

                  <div className="space-y-6">
                    <FieldBlock label="Business Description">
                      <textarea value={form.desc} onChange={(e) => setForm((prev) => ({ ...prev, desc: e.target.value }))} placeholder="Explain your services and products..." className={`${FORM_CONTROL_CLASS} min-h-[140px] py-4`} />
                      <WordCounter count={descWords} min={DESC_MIN_WORDS} max={DESC_MAX_WORDS} />
                    </FieldBlock>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="City (Fixed)">
                        <InputWithIcon icon={<FaCity />} value={profile?.cities?.name || ""} disabled />
                      </FieldBlock>

                      <FieldBlock label="Business Area">
                        <select value={form.areaId} onChange={(e) => setForm((prev) => ({ ...prev, areaId: e.target.value }))} className={FORM_CONTROL_CLASS}>
                          <option value="">Select Area...</option>
                          {areas.map((area) => (<option key={area.id} value={area.id}>{area.name}</option>))}
                        </select>
                      </FieldBlock>
                    </div>

                    <FieldBlock label="Detailed Street Address">
                      <InputWithIcon icon={<FaMapPin />} value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="e.g. Suite 5, Sky Plaza, Wuse 2" />
                      <WordCounter count={addressWords} min={ADDR_MIN_WORDS} max={ADDR_MAX_WORDS} />
                    </FieldBlock>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Latitude (Optional)">
                        <input type="number" step="any" value={form.lat} onChange={(e) => setForm((prev) => ({ ...prev, lat: e.target.value }))} placeholder="9.08" className={FORM_CONTROL_CLASS} />
                      </FieldBlock>
                      <FieldBlock label="Longitude (Optional)">
                        <input type="number" step="any" value={form.lng} onChange={(e) => setForm((prev) => ({ ...prev, lng: e.target.value }))} placeholder="7.49" className={FORM_CONTROL_CLASS} />
                      </FieldBlock>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Legal */}
              {currentStep === 2 && (
                <div className={FORM_SECTION_CLASS}>
                  <SectionHeader icon={<FaShieldHalved />} title="Verification" subtitle="Verify your identity and business status." />

                  <div className="space-y-8">
                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Identification Type">
                        <select value={form.idType} onChange={(e) => setForm((prev) => ({ ...prev, idType: e.target.value }))} className={FORM_CONTROL_CLASS}>
                          <option>National ID Card</option>
                          <option>Voters Card</option>
                          <option>Drivers License</option>
                          <option>Int. Passport</option>
                        </select>
                      </FieldBlock>
                      <FieldBlock label="ID Document Number">
                        <input value={form.idNumber} onChange={(e) => setForm((prev) => ({ ...prev, idNumber: e.target.value }))} placeholder="Enter number..." className={FORM_CONTROL_CLASS} />
                      </FieldBlock>
                    </div>

                    <UploadCard
                      title="Upload ID Document"
                      subtitle={`Clear photo or PDF | ${idRuleLabel}`}
                      onFileClick={() => openImagePicker("idCard", null)}
                      onCameraClick={() => openCustomCamera("idCard", 3 / 4)}
                      onPdfClick={() => openPdfPicker("idCard")}
                      preview={renderPreview("idCard")}
                      isPortrait
                    />

                    <div className="h-px bg-slate-100" />

                    <FieldBlock label={form.businessType === "Limited Liability (Ltd)" ? "RC Number *" : "Business Registration (Optional)"}>
                      <InputWithIcon icon={<FaFileContract />} value={form.cacNumber} onChange={(e) => setForm((prev) => ({ ...prev, cacNumber: e.target.value }))} placeholder="BN or RC Number" />
                    </FieldBlock>

                    <UploadCard
                      title="CAC Certificate"
                      subtitle={`Required for Ltd | ${cacRuleLabel}`}
                      onFileClick={() => openImagePicker("cac", null)}
                      onCameraClick={() => openCustomCamera("cac", 3 / 4)}
                      onPdfClick={() => openPdfPicker("cac")}
                      preview={renderPreview("cac")}
                      isPortrait
                    />

                    <div className="h-px bg-slate-100" />

                    <UploadCard
                      title="Shop Logo (Optional)"
                      subtitle={`Square image | ${logoRuleLabel}`}
                      onFileClick={() => openImagePicker("logo", 1)}
                      onCameraClick={() => openCustomCamera("logo", 1)}
                      preview={renderPreview("logo")}
                      isSquare
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Presence */}
              {currentStep === 3 && (
                <div className={FORM_SECTION_CLASS}>
                  <SectionHeader icon={<FaAddressBook />} title="Digital Presence" subtitle="How can customers find you online?" />

                  <div className="mb-8 rounded-2xl bg-indigo-50 p-4 text-xs font-bold text-indigo-700 leading-relaxed">
                    IMPORTANT: Link to your PROFESSIONAL business pages. Using personal profiles may delay your approval.
                  </div>

                  <div className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Business Phone">
                        <NigeriaPhoneInput value={form.phone} onChange={(val) => setForm((prev) => ({ ...prev, phone: val }))} placeholder="803 000 0000" />
                      </FieldBlock>
                      <FieldBlock label="WhatsApp Presence">
                        <NigeriaPhoneInput value={form.whatsapp} onChange={(val) => setForm((prev) => ({ ...prev, whatsapp: val }))} placeholder="803 000 0000" />
                        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          We may check to confirm your WhatsApp is active
                        </p>
                      </FieldBlock>
                    </div>

                    <FieldBlock label="Official Website">
                      <InputWithIcon icon={<FaGlobe />} value={form.website} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} onBlur={handleUrlBlur("website")} placeholder="www.example.com" />
                    </FieldBlock>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Facebook Page">
                        <input value={form.facebook} onChange={(e) => setForm((prev) => ({ ...prev, facebook: e.target.value }))} onBlur={handleUrlBlur("facebook")} placeholder="facebook.com/..." className={FORM_CONTROL_CLASS} />
                      </FieldBlock>
                      <FieldBlock label="Telegram Channel">
                        <input value={form.telegram} onChange={(e) => setForm((prev) => ({ ...prev, telegram: e.target.value }))} onBlur={handleUrlBlur("telegram")} placeholder="t.me/..." className={FORM_CONTROL_CLASS} />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="X (Twitter)">
                        <input value={form.twitter} onChange={(e) => setForm((prev) => ({ ...prev, twitter: e.target.value }))} onBlur={handleUrlBlur("twitter")} placeholder="x.com/..." className={FORM_CONTROL_CLASS} />
                      </FieldBlock>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => {
                    handleRegistrationBack()
                  }} 
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-8 text-sm font-bold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
                >
                  <FaArrowLeft className="text-xs" />
                  <span>Back</span>
                </button>

                <button 
                  onClick={nextStep}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-8 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 active:scale-95"
                >
                  <span>{currentStep === STEPS.length - 1 ? "Review & Finish" : "Next Step"}</span>
                  <FaArrowRight className="text-xs" />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <CameraCaptureModal
        open={cameraCapture.open}
        title="Capture Image"
        profile={activeCameraProfile}
        onClose={closeCustomCamera}
        onCapture={handleCameraCapture}
      />
      <CropModal config={cropConfig} onClose={() => setCropConfig({ isOpen: false, targetId: null, src: "", ratio: null })} onCrop={onCropComplete} />

      {reviewOpen && (
        <ReviewModal
          form={form}
          cityName={profile?.cities?.name || ""}
          areaName={areas.find((a) => String(a.id) === form.areaId)?.name || ""}
          logoPreview={renderPreview("logo")}
          storefrontPreview={renderPreview("storefront")}
          idPreview={renderPreview("idCard")}
          cacPreview={renderPreview("cac")}
          showCac={Boolean(previews.cac || files.cac)}
          onClose={() => setReviewOpen(false)}
          onConfirm={submitApplication}
          loading={submitting}
          isEdit={isEdit}
        />
      )}
    </div>
  )
}

// --- SUB-COMPONENTS ---

function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="mb-8 flex items-start gap-4 border-b border-slate-200/80 pb-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#eef2ff_0%,#fdf2f8_100%)] text-xl text-indigo-600 shadow-sm">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
        <p className="text-sm font-medium leading-tight text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}

function FieldBlock({ label, children }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <label className="text-[12px] font-extrabold uppercase tracking-[0.16em] text-slate-600">{label}</label>
      {children}
    </div>
  )
}

function InputWithIcon({ icon, value, onChange, onBlur, placeholder, disabled = false }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      <input value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} disabled={disabled} className={FORM_CONTROL_WITH_ICON_CLASS} />
    </div>
  )
}

function WordCounter({ count, min, max }) {
  const valid = count >= min && count <= max
  return <div className={`mt-1.5 text-right text-[10px] font-extrabold uppercase tracking-widest ${valid ? "text-emerald-600" : "text-rose-500"}`}>{count} / {max} words</div>
}

function UploadCard({
  title,
  subtitle,
  onFileClick,
  onCameraClick,
  onPdfClick,
  preview,
  isPortrait,
  isSquare,
}) {
  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col items-center">
        <div className={`relative overflow-hidden rounded-[32px] border-2 border-slate-200 bg-white shadow-lg shadow-slate-200/50 ${isPortrait ? 'aspect-[3/4] w-full max-w-[340px]' : isSquare ? 'aspect-square w-40' : 'aspect-video w-full'}`}>
          {preview ? (
            <div className="h-full w-full">{preview}</div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                <FaCamera className="text-xl" />
              </div>
            </div>
          )}
        
          {preview && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
               <p className="px-2 text-center text-[10px] font-bold uppercase tracking-widest text-white">Tap below to change</p>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          <p className="text-[11px] font-medium text-slate-500">{subtitle}</p>
        
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <UploadAction icon={<FaImage />} label="File" onClick={onFileClick} />
            <UploadAction icon={<FaCamera />} label="Camera" onClick={onCameraClick} primary />
            {onPdfClick && <UploadAction icon={<FaFilePdf />} label="PDF" onClick={onPdfClick} tone="red" />}
          </div>
        </div>
      </div>
    </div>
  )
}

function UploadAction({ icon, label, onClick, primary, tone }) {
  const base = "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
  const styles = primary 
    ? "bg-slate-900 text-white hover:bg-slate-800" 
    : tone === "red" 
      ? "bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100" 
      : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
  
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function CropModal({ config, onClose, onCrop }) {
  const cropperRef = useRef(null)
  
  if (!config.isOpen) return null

  const handleApply = () => {
    const cropper = cropperRef.current?.cropper
    if (!cropper) return
    cropper.getCroppedCanvas({
      width: 1000,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    }).toBlob((blob) => {
      onCrop(blob)
    }, "image/jpeg", 0.8)
  }

  return (
    <div className="fixed inset-0 z-[300] flex flex-col bg-slate-950">
      <div className="flex items-center justify-between bg-black/50 p-4 text-white">
        <h3 className="flex items-center gap-2 font-bold"><FaCropSimple /> Adjust Image</h3>
        <button onClick={onClose} className="text-2xl hover:text-pink-400"><FaXmark /></button>
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <Cropper
          ref={cropperRef}
          src={config.src}
          style={{ height: "100%", width: "100%" }}
          aspectRatio={config.ratio}
          viewMode={2}
          background={false}
          autoCropArea={1}
          responsive={true}
          guides={true}
        />
      </div>
      <div className="flex items-center justify-center gap-4 bg-black/50 p-4 pb-8">
        <button onClick={onClose} className="rounded-xl bg-slate-700 px-6 py-3 font-bold text-white transition hover:bg-slate-600">Cancel</button>
        <button onClick={handleApply} className="rounded-xl bg-pink-600 px-8 py-3 font-bold text-white transition hover:bg-pink-700">Apply Crop</button>
      </div>
    </div>
  )
}

function ReviewModal({ form, cityName, areaName, logoPreview, storefrontPreview, idPreview, cacPreview, showCac, onClose, onConfirm, loading, isEdit }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-[32px] border border-white/60 bg-white p-6 shadow-2xl animate-slide-up">
        <h2 className="text-2xl font-extrabold text-slate-900">Review Application</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Please ensure all details are correct before submitting.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ReviewThumb label="Shop Logo" content={logoPreview} />
          <ReviewThumb label="Store Front" content={storefrontPreview} />
          <ReviewThumb label="ID Document" content={idPreview} />
          {showCac && <ReviewThumb label="CAC Certificate" content={cacPreview} />}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <DetailRow label="Business Name" value={form.name} />
          <DetailRow label="Type" value={form.businessType} />
          <DetailRow label="Category" value={form.category} />
          <DetailRow label="Address" value={form.address} />
          <DetailRow label="Location" value={`${areaName}, ${cityName}`} />
          <DetailRow label="GPS" value={`${form.lat}, ${form.lng}`} />
          
          <div className="my-2 h-px bg-slate-200" />
          
          <DetailRow label="Phone" value={form.phone} />
          <DetailRow label="WhatsApp" value={form.whatsapp} />
          {form.website && <DetailRow label="Website" value={formatUrl(form.website)} />}
          
          {form.facebook && <DetailRow label="Facebook" value={form.facebook} />}
          {form.twitter && <DetailRow label="Twitter/X" value={form.twitter} />}
          {form.telegram && <DetailRow label="Telegram" value={form.telegram} />}

          <div className="my-2 h-px bg-slate-200" />
          
          <DetailRow label={form.idType || "ID Document"} value={form.idNumber} />
          {form.cacNumber && <DetailRow label="CAC Number" value={form.cacNumber} />}
        </div>

        <div className="mt-6 space-y-3">
          <AuthButton onClick={onConfirm} loading={loading}>
            <FaCheck />
            <span>{isEdit ? "Confirm Correction" : "Confirm & Submit"}</span>
          </AuthButton>
          <button type="button" onClick={onClose} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
            Back to Edit
          </button>
        </div>
      </div>
    </div>
  )
}

function ReviewThumb({ label, content }) {
  return (
    <div className="text-center">
      <div className="mb-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {content || <div className="flex min-h-[140px] items-center justify-center text-3xl">📄</div>}
      </div>
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex gap-4 border-b border-slate-200 py-3 last:border-b-0">
      <div className="w-32 text-sm font-semibold text-slate-500">{label}</div>
      <div className="flex-1 text-sm font-extrabold text-slate-900 break-words">{value}</div>
    </div>
  )
}

export default ShopRegistration
