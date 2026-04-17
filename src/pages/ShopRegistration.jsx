import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaAddressBook,
  FaArrowLeft,
  FaArrowRight,
  FaBriefcase,
  FaCamera,
  FaCheck,
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
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { supabase } from "../lib/supabase"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import { buildShopRegistrationCacheKey } from "../lib/vendorRouteTransitions"
import {
  UPLOAD_RULES,
  formatBytes,
  getAcceptValue,
  getRuleLabel,
} from "../lib/uploadRules"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"

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

function countWords(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function formatUrl(value) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  return `https://${raw}`
}

function validPhone(value) {
  return /^(0\d{10}|\+\d{11,15})$/.test(String(value || "").trim())
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
    <PageLoadingScreen
      title="Opening shop registration"
      message="Please wait while we prepare your registration form."
    />
  )
}

const STEPS = [
  { id: "basics", label: "Basics", icon: <FaStore /> },
  { id: "profile", label: "Profile", icon: <FaLocationDot /> },
  { id: "legal", label: "Verification", icon: <FaShieldHalved /> },
  { id: "presence", label: "Presence", icon: <FaAddressBook /> },
]

function ShopRegistration() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const shopId = searchParams.get("id")
  const isEdit = Boolean(shopId)

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
    }

    const results = await Promise.all(tasks)
    
    if (results[0].error) throw results[0].error
    if (results[1].error) throw results[1].error
    if (results[2].error) throw results[2].error

    if (isEdit && shopId) {
      if (results[3].error) throw results[3].error
      existingData = results[3].data
      if (!existingData) throw new Error("Shop not found or access denied.")
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
  const [hasHydrated, setHasHydrated] = useState(false)

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

  const [form, setForm] = useState({
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
    instagram: "",
    twitter: "",
    tiktok: "",
  })

  const [files, setFiles] = useState({
    storefront: null,
    idCard: null,
    cac: null,
    logo: null,
  })

  const [previews, setPreviews] = useState({
    storefront: "",
    idCard: "",
    cac: "",
    logo: "",
  })

  const [fileMeta, setFileMeta] = useState({
    storefront: null,
    idCard: null,
    cac: null,
    logo: null,
  })

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

  useEffect(() => {
    if (data && !hasHydrated) {
      setCategories(data.categories)
      setAreas(data.areas)
      setCityData(data.cityData)

      if (isEdit && data.shop) {
        const s = data.shop
        setExistingShop(s)
        setForm({
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
          instagram: s.instagram_url || "",
          twitter: s.twitter_url || "",
          tiktok: s.tiktok_url || "",
        })

        setPreviews({
          storefront: s.storefront_url || "",
          idCard: s.id_card_url || "",
          cac: s.cac_certificate_url || "",
          logo: s.image_url || "",
        })

        if (s.status === "rejected" && s.rejection_reason) {
          setNotice({ visible: true, type: "warning", title: "Correction required", message: s.rejection_reason })
        }
      }
      setHasHydrated(true)
    }
  }, [data, hasHydrated, isEdit])

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
        if (!validUrl(form.instagram)) return "Enter a valid Instagram URL."
        if (!validUrl(form.twitter)) return "Enter a valid X or Twitter URL."
        if (!validUrl(form.tiktok)) return "Enter a valid TikTok URL."
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

    pickerContextRef.current = { targetId, ratio }
    input.value = ""
    input.setAttribute("accept", getAcceptValue(targetRule, "image/*"))
    input.removeAttribute("capture")
    input.click()
  }

  const openNativeCameraPicker = (targetId, ratio = null) => {
    const input = hiddenInputRef.current
    if (!input) return
    const targetRule = getRuleForTargetId(targetId)

    pickerContextRef.current = { targetId, ratio }
    input.value = ""
    input.setAttribute("accept", getAcceptValue(targetRule, "image/*"))
    input.setAttribute("capture", "environment")
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
    setPreviews((prev) => ({ ...prev, [key]: previewUrl }))
    setFileMeta((prev) => ({
      ...prev,
      [key]: { name: fileOrBlob.name || `${key}_upload.jpg`, type: type }
    }))
  }

  function renderPreview(key) {
    const meta = fileMeta[key]
    const value = previews[key]
    if (!value) return null

    const isPdf = meta?.type === "application/pdf" || String(value).toLowerCase().includes(".pdf")

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

    return <img src={value} alt={key} className="h-full min-h-[140px] w-full rounded-2xl object-cover" />
  }

  function getStoragePathFromUrl(url, bucket) {
    if (!url) return null
    try {
      const cleanUrl = String(url).split("?")[0]
      const escapedBucket = bucket.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
      const regex = new RegExp(`/storage/v1/object/(?:public|authenticated)/${escapedBucket}/(.+)$`)
      const match = cleanUrl.match(regex)
      return match?.[1] || null
    } catch {
      return null
    }
  }

  async function uploadFile(fileOrBlob, bucket, folder, oldUrl = "") {
    if (!fileOrBlob) {
      return {
        url: oldUrl || null,
        bucket,
        oldPath: null,
        newPath: null,
      }
    }

    const extension = fileOrBlob.name?.split(".").pop() || "jpg"
    const path = `${folder}/${user.id}_${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, fileOrBlob, {
        upsert: false,
        contentType: fileOrBlob.type || "image/jpeg",
        cacheControl: "31536000",
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    const publicUrl = data?.publicUrl || null
    const oldPath = getStoragePathFromUrl(oldUrl, bucket)
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
    if (submitting) return
    if (isOffline) {
      setNotice({ visible: true, type: "error", title: "Network Offline", message: "You cannot submit an application while offline." })
      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    const uploadedFiles = []

    try {
      setSubmitting(true)

      const storefrontUpload = await uploadFile(files.storefront, STOREFRONT_BUCKET, "covers", existingShop?.storefront_url)
      uploadedFiles.push(storefrontUpload)
      const idCardUpload = await uploadFile(files.idCard, ID_DOCUMENT_BUCKET, "ids", existingShop?.id_card_url)
      uploadedFiles.push(idCardUpload)
      const cacUpload = await uploadFile(files.cac, CAC_DOCUMENT_BUCKET, "cac", existingShop?.cac_certificate_url)
      uploadedFiles.push(cacUpload)
      const logoUpload = await uploadFile(files.logo, LOGO_BUCKET, "logos", existingShop?.image_url)
      uploadedFiles.push(logoUpload)

      const payload = {
        name: form.name.trim(),
        description: form.desc.trim(),
        business_type: form.businessType,
        category: form.category,
        city_id: profile.city_id,
        area_id: Number(form.areaId),
        address: form.address.trim(),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim() || null,
        latitude: form.lat ? Number(form.lat) : null,
        longitude: form.lng ? Number(form.lng) : null,
        id_type: form.idType,
        id_number: form.idNumber.trim(),
        cac_number: form.cacNumber.trim() || null,
        image_url: logoUpload.url,
        storefront_url: storefrontUpload.url,
        id_card_url: idCardUpload.url,
        cac_certificate_url: cacUpload.url,
        facebook_url: form.facebook ? formatUrl(form.facebook) : null,
        instagram_url: form.instagram ? formatUrl(form.instagram) : null,
        twitter_url: form.twitter ? formatUrl(form.twitter) : null,
        tiktok_url: form.tiktok ? formatUrl(form.tiktok) : null,
        website_url: form.website ? formatUrl(form.website) : null,
        status: "pending",
        rejection_reason: null,
      }

      if (isEdit && existingShop?.id) {
        const { error } = await supabase
          .from("shops")
          .update(payload)
          .eq("id", existingShop.id)
          .eq("owner_id", user.id)
        if (error) throw error

        setNotice({ visible: true, type: "success", title: "Correction submitted", message: "Your shop is pending approval again." })
      } else {
        const { error } = await supabase.from("shops").insert({
          ...payload,
          owner_id: user.id,
        })
        if (error) throw error

        setNotice({ visible: true, type: "success", title: "Application submitted", message: "You will be notified once your shop is approved." })
      }

      const oldFilesByBucket = new Map()
      uploadedFiles.forEach((item) => {
        if (!item?.bucket || !item.oldPath || !item.newPath || item.oldPath === item.newPath) return
        if (!oldFilesByBucket.has(item.bucket)) oldFilesByBucket.set(item.bucket, [])
        oldFilesByBucket.get(item.bucket).push(item.oldPath)
      })

      try {
        await Promise.all(
          Array.from(oldFilesByBucket.entries()).map(([bucket, paths]) =>
            supabase.storage.from(bucket).remove([...new Set(paths)])
          )
        )
      } catch (cleanupError) {
        console.warn("Old shop file cleanup failed:", cleanupError)
      }

      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })

      try { localStorage.removeItem("ctm_dashboard_cache") } catch {
        // Ignore cache cleanup failures
      }

      setTimeout(() => navigate("/user-dashboard"), 1200)
    } catch (error) {
      const uploadedPathsByBucket = new Map()
      uploadedFiles.forEach((item) => {
        if (!item?.bucket || !item.newPath) return
        if (!uploadedPathsByBucket.has(item.bucket)) uploadedPathsByBucket.set(item.bucket, [])
        uploadedPathsByBucket.get(item.bucket).push(item.newPath)
      })

      try {
        await Promise.all(
          Array.from(uploadedPathsByBucket.entries()).map(([bucket, paths]) =>
            supabase.storage.from(bucket).remove([...new Set(paths)])
          )
        )
      } catch (cleanupError) {
        console.warn("Rollback cleanup failed for new shop files:", cleanupError)
      }

      setNotice({
        visible: true,
        type: "error",
        title: "Submission failed",
        message: getFriendlyErrorMessage(error, "Please retry."),
      })
      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally {
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
        onBack={() => navigate("/vendor-panel")}
      />
    )
  }

  if (!user || !profile) return null

  return (
    <div className="relative min-h-screen bg-slate-50 pb-20">
      
      <input ref={hiddenInputRef} type="file" className="hidden" onChange={handleHiddenFileChange} />

      {/* Modern Header with Navigation */}
      <div className="sticky top-0 z-[10] border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/user-dashboard")} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200">
                <FaArrowLeft />
              </button>
              <div>
                <h1 className="text-lg font-bold text-slate-900">{isEdit ? "Correction" : "New Registration"}</h1>
                <p className="text-xs font-medium text-slate-500">Step {currentStep + 1} of {STEPS.length}</p>
              </div>
            </div>
            
            <div className="hidden items-center gap-1 md:flex">
              {STEPS.map((s, idx) => (
                <div key={s.id} className="flex items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-all duration-500 ${idx <= currentStep ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-100 text-slate-400'}`}>
                    {idx < currentStep ? <FaCheck className="text-xs" /> : s.icon}
                  </div>
                  {idx < STEPS.length - 1 && <div className={`h-1 w-6 rounded-full mx-1 transition-colors duration-500 ${idx < currentStep ? 'bg-indigo-600' : 'bg-slate-100'}`} />}
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
        <div className="mx-auto max-w-3xl">
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
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                  <SectionHeader icon={<FaStore />} title="Business Basics" subtitle="Tell us the core details of your shop." />
                  
                  <div className="space-y-6">
                    <FieldBlock label="What is your business name?">
                      <InputWithIcon icon={<FaShop />} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Ade & Sons Enterprise" />
                    </FieldBlock>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Business Structure">
                        <select value={form.businessType} onChange={(e) => setForm((prev) => ({ ...prev, businessType: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all">
                          <option>Individual/Enterprise</option>
                          <option>Limited Liability (Ltd)</option>
                        </select>
                      </FieldBlock>

                      <FieldBlock label="Primary Category">
                        <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all">
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
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                  <SectionHeader icon={<FaLocationDot />} title="Location & Description" subtitle="Where are you located and what do you do?" />

                  <div className="space-y-6">
                    <FieldBlock label="Business Description">
                      <textarea value={form.desc} onChange={(e) => setForm((prev) => ({ ...prev, desc: e.target.value }))} placeholder="Explain your services and products..." className="min-h-[140px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      <WordCounter count={descWords} min={DESC_MIN_WORDS} max={DESC_MAX_WORDS} />
                    </FieldBlock>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="City (Fixed)">
                        <InputWithIcon icon={<FaCity />} value={profile?.cities?.name || ""} disabled />
                      </FieldBlock>

                      <FieldBlock label="Business Area">
                        <select value={form.areaId} onChange={(e) => setForm((prev) => ({ ...prev, areaId: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all">
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
                        <input type="number" step="any" value={form.lat} onChange={(e) => setForm((prev) => ({ ...prev, lat: e.target.value }))} placeholder="9.08" className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      </FieldBlock>
                      <FieldBlock label="Longitude (Optional)">
                        <input type="number" step="any" value={form.lng} onChange={(e) => setForm((prev) => ({ ...prev, lng: e.target.value }))} placeholder="7.49" className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      </FieldBlock>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Legal */}
              {currentStep === 2 && (
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                  <SectionHeader icon={<FaShieldHalved />} title="Verification" subtitle="Verify your identity and business status." />

                  <div className="space-y-8">
                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Identification Type">
                        <select value={form.idType} onChange={(e) => setForm((prev) => ({ ...prev, idType: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all">
                          <option>National ID Card</option>
                          <option>Voters Card</option>
                          <option>Drivers License</option>
                          <option>Int. Passport</option>
                        </select>
                      </FieldBlock>
                      <FieldBlock label="ID Document Number">
                        <input value={form.idNumber} onChange={(e) => setForm((prev) => ({ ...prev, idNumber: e.target.value }))} placeholder="Enter number..." className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      </FieldBlock>
                    </div>

                    <UploadCard
                      title="Upload ID Document"
                      subtitle={`Clear photo or PDF | ${idRuleLabel}`}
                      onFileClick={() => openImagePicker("idCard", null)}
                      onCameraClick={() => openNativeCameraPicker("idCard", null)}
                      onPdfClick={() => openPdfPicker("idCard")}
                      preview={renderPreview("idCard")}
                    />

                    <div className="h-px bg-slate-100" />

                    <FieldBlock label={form.businessType === "Limited Liability (Ltd)" ? "RC Number *" : "Business Registration (Optional)"}>
                      <InputWithIcon icon={<FaFileContract />} value={form.cacNumber} onChange={(e) => setForm((prev) => ({ ...prev, cacNumber: e.target.value }))} placeholder="BN or RC Number" />
                    </FieldBlock>

                    <UploadCard
                      title="CAC Certificate"
                      subtitle={`Required for Ltd | ${cacRuleLabel}`}
                      onFileClick={() => openImagePicker("cac", null)}
                      onCameraClick={() => openNativeCameraPicker("cac", null)}
                      onPdfClick={() => openPdfPicker("cac")}
                      preview={renderPreview("cac")}
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
                <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                  <SectionHeader icon={<FaAddressBook />} title="Digital Presence" subtitle="How can customers find you online?" />

                  <div className="mb-8 rounded-2xl bg-indigo-50 p-4 text-xs font-bold text-indigo-700 leading-relaxed">
                    IMPORTANT: Link to your PROFESSIONAL business pages. Using personal profiles may delay your approval.
                  </div>

                  <div className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Business Phone">
                        <InputWithIcon icon={<FaPhone />} value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="080..." />
                      </FieldBlock>
                      <FieldBlock label="WhatsApp Presence">
                        <InputWithIcon icon={<FaPhone />} value={form.whatsapp} onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))} placeholder="080..." />
                      </FieldBlock>
                    </div>

                    <FieldBlock label="Official Website">
                      <InputWithIcon icon={<FaGlobe />} value={form.website} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} onBlur={handleUrlBlur("website")} placeholder="www.example.com" />
                    </FieldBlock>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="Facebook Page">
                        <input value={form.facebook} onChange={(e) => setForm((prev) => ({ ...prev, facebook: e.target.value }))} onBlur={handleUrlBlur("facebook")} placeholder="facebook.com/..." className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      </FieldBlock>
                      <FieldBlock label="Instagram Profile">
                        <input value={form.instagram} onChange={(e) => setForm((prev) => ({ ...prev, instagram: e.target.value }))} onBlur={handleUrlBlur("instagram")} placeholder="instagram.com/..." className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      </FieldBlock>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <FieldBlock label="X (Twitter)">
                        <input value={form.twitter} onChange={(e) => setForm((prev) => ({ ...prev, twitter: e.target.value }))} onBlur={handleUrlBlur("twitter")} placeholder="x.com/..." className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      </FieldBlock>
                      <FieldBlock label="TikTok Channel">
                        <input value={form.tiktok} onChange={(e) => setForm((prev) => ({ ...prev, tiktok: e.target.value }))} onBlur={handleUrlBlur("tiktok")} placeholder="tiktok.com/@..." className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all" />
                      </FieldBlock>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex items-center justify-between gap-4 pt-4">
                <button 
                  onClick={prevStep} 
                  disabled={currentStep === 0}
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-8 text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-30"
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
    <div className="mb-8 flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-xl text-indigo-600">
        {icon}
      </div>
      <div>
        <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
        <p className="text-sm font-medium text-slate-500 leading-tight">{subtitle}</p>
      </div>
    </div>
  )
}

function FieldBlock({ label, children }) {
  return (
    <div className="flex flex-col gap-2.5">
      <label className="text-[13px] font-extrabold uppercase tracking-wider text-slate-500">{label}</label>
      {children}
    </div>
  )
}

function InputWithIcon({ icon, value, onChange, onBlur, placeholder, disabled = false }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      <input value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} disabled={disabled} className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 py-3.5 pl-12 pr-4 text-sm font-medium text-slate-800 outline-none focus:border-indigo-600 focus:bg-white transition-all disabled:opacity-60" />
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
    <div className="flex flex-col items-center">
      <div className={`relative overflow-hidden rounded-[32px] border-4 border-white bg-slate-100 shadow-lg shadow-slate-200 ${isPortrait ? 'aspect-[3/4] w-48' : isSquare ? 'aspect-square w-40' : 'aspect-video w-full'}`}>
        {preview ? (
          <div className="h-full w-full">{preview}</div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-300">
              <FaCamera className="text-xl" />
            </div>
          </div>
        )}
        
        {preview && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
             <p className="text-[10px] font-bold uppercase tracking-widest text-white text-center px-2">Tap below to change</p>
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

function ReviewModal({ form, cityName, areaName, storefrontPreview, idPreview, cacPreview, showCac, onClose, onConfirm, loading, isEdit }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-[32px] border border-white/60 bg-white p-6 shadow-2xl animate-slide-up">
        <h2 className="text-2xl font-extrabold text-slate-900">Review Application</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">Please ensure all details are correct before submitting.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ReviewThumb label="Store Front" content={storefrontPreview} />
          <ReviewThumb label="ID Document" content={idPreview} />
          {showCac && <ReviewThumb label="CAC Certificate" content={cacPreview} />}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <DetailRow label="Business Name" value={form.name} />
          <DetailRow label="Type" value={form.businessType} />
          <DetailRow label="Category" value={form.category} />
          <DetailRow label="Location" value={`${areaName}, ${cityName}`} />
          {form.website && <DetailRow label="Website" value={formatUrl(form.website)} />}
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
