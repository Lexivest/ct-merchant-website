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
  FaTriangleExclamation,
  FaXmark,
} from "react-icons/fa6"
import Cropper from "react-cropper"
import "cropperjs/dist/cropper.css"

import AuthButton from "../components/auth/AuthButton"
import AuthNotification from "../components/auth/AuthNotification"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { supabase } from "../lib/supabase"
import { ShimmerBlock } from "../components/common/Shimmers"

const MAX_FILE_SIZE = 512000
const DESC_MIN_WORDS = 30
const DESC_MAX_WORDS = 150
const ADDR_MIN_WORDS = 5
const ADDR_MAX_WORDS = 50

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

// --- PROFESSIONAL SHIMMER COMPONENT ---
function ShopRegistrationShimmer() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-pink-100 to-purple-100 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-4">
          <ShimmerBlock className="h-12 w-12 rounded-2xl" />
          <div>
            <ShimmerBlock className="mb-2 h-8 w-48 rounded" />
            <ShimmerBlock className="h-4 w-64 rounded" />
          </div>
        </div>
        <div className="rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl md:p-8">
          <ShimmerBlock className="mb-6 h-6 w-48 rounded" />
          <ShimmerBlock className="mb-8 h-[140px] w-full rounded-2xl" />
          <ShimmerBlock className="mb-6 h-6 w-48 rounded" />
          <ShimmerBlock className="mb-5 h-14 w-full rounded-2xl" />
          <div className="mb-5 grid grid-cols-2 gap-5">
            <ShimmerBlock className="h-14 w-full rounded-2xl" />
            <ShimmerBlock className="h-14 w-full rounded-2xl" />
          </div>
          <ShimmerBlock className="mb-8 h-[150px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

function ShopRegistration() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const shopId = searchParams.get("id")
  const isEdit = Boolean(shopId)

  usePreventPullToRefresh()

  const { loading: authLoading, user, profile, isOffline } = useAuthSession()

  const fetchFormData = async () => {
    if (!profile?.city_id) throw new Error("Profile not fully configured.")

    const tasks = [
      supabase.from("categories").select("name").order("name"),
      supabase.from("areas").select("id, name").eq("city_id", profile.city_id).order("name"),
      supabase.from("cities").select("id, name, is_open").eq("id", profile.city_id).maybeSingle()
    ]

    let existingData = null

    if (isEdit && shopId) {
      tasks.push(supabase.from("shops").select("*").eq("id", shopId).maybeSingle())
    }

    const results = await Promise.all(tasks)
    
    if (results[0].error) throw results[0].error
    if (results[1].error) throw results[1].error
    if (results[2].error) throw results[2].error

    if (isEdit && shopId) {
      if (results[3].error) throw results[3].error
      existingData = results[3].data
      if (!existingData) throw new Error("Shop not found.")
    }

    return {
      categories: results[0].data || [],
      areas: results[1].data || [],
      cityData: results[2].data || null,
      shop: existingData,
    }
  }

  const cacheKey = isEdit ? `shop_reg_edit_${shopId}` : `shop_reg_new_${profile?.city_id}`
  const { data, loading: dataLoading, error: dataError } = useCachedFetch(
    cacheKey,
    fetchFormData,
    { dependencies: [profile?.city_id, shopId, isEdit], ttl: 1000 * 60 * 60 }
  )

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
  const [actionSheet, setActionSheet] = useState({ isOpen: false, targetId: null, acceptsPdf: false, ratio: null })
  const [cropConfig, setCropConfig] = useState({ isOpen: false, targetId: null, src: "", ratio: null })

  const descWords = useMemo(() => countWords(form.desc), [form.desc])
  const addressWords = useMemo(() => countWords(form.address), [form.address])

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

  function validateForm() {
    if (!form.name.trim() || form.name.trim().length < 3) return "Business name must be at least 3 characters."
    if (!form.category) return "Please select a business category."
    if (descWords < DESC_MIN_WORDS || descWords > DESC_MAX_WORDS) return `Business description must be between ${DESC_MIN_WORDS} and ${DESC_MAX_WORDS} words.`
    if (!form.areaId) return "Please select an area."
    if (addressWords < ADDR_MIN_WORDS || addressWords > ADDR_MAX_WORDS) return `Street address must be between ${ADDR_MIN_WORDS} and ${ADDR_MAX_WORDS} words.`
    
    if (!validPhone(form.phone)) return "Enter a valid business phone number."
    if (form.whatsapp && !validPhone(form.whatsapp)) return "Enter a valid WhatsApp number."
    
    if (!form.idNumber.trim()) return "ID number is required."

    if (!validUrl(form.website)) return "Enter a valid website URL."
    if (!validUrl(form.facebook)) return "Enter a valid Facebook URL."
    if (!validUrl(form.instagram)) return "Enter a valid Instagram URL."
    if (!validUrl(form.twitter)) return "Enter a valid X or Twitter URL."
    if (!validUrl(form.tiktok)) return "Enter a valid TikTok URL."

    if (!previews.storefront && !files.storefront) return "Store front image is required."
    if (!previews.idCard && !files.idCard) return "ID document is required."
    
    if (form.businessType === "Limited Liability (Ltd)" && !form.cacNumber.trim()) return "RC Number is required for Limited Liability businesses."
    if (form.businessType === "Limited Liability (Ltd)" && !previews.cac && !files.cac) return "CAC certificate is required for Limited Liability businesses."

    return ""
  }

  function openReview(event) {
    event.preventDefault()
    const error = validateForm()
    if (error) {
      setNotice({ visible: true, type: "error", title: "Form validation failed", message: error })
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setNotice({ visible: false, type: "info", title: "", message: "" })
    setReviewOpen(true)
  }

  // --- CT STUDIO FILE PIPELINE ---
  const triggerActionSheet = (targetId, acceptsPdf, ratio) => {
    setActionSheet({ isOpen: true, targetId, acceptsPdf, ratio })
  }

  const handleActionSelection = (mode) => {
    const input = hiddenInputRef.current
    if (!input) return

    input.value = "" 
    if (mode === "camera") {
      input.setAttribute("accept", "image/*")
      input.setAttribute("capture", "environment")
    } else if (mode === "gallery") {
      input.setAttribute("accept", "image/*")
      input.removeAttribute("capture")
    } else if (mode === "pdf") {
      input.setAttribute("accept", "application/pdf")
      input.removeAttribute("capture")
    }

    setActionSheet({ ...actionSheet, isOpen: false })
    input.click()
  }

  const handleHiddenFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const { targetId, ratio } = actionSheet

    if (file.type === "application/pdf") {
      if (file.size > MAX_FILE_SIZE) {
        setNotice({ visible: true, type: "error", title: "PDF too large", message: "Maximum allowed PDF size is 500KB." })
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
          if (compressedBlob.size > MAX_FILE_SIZE) {
            setNotice({ visible: true, type: "error", title: "Image too detailed", message: "Could not compress image enough. Try a lower resolution photo." })
            window.scrollTo({ top: 0, behavior: "smooth" })
            return
          }
          saveFileState(targetId, compressedBlob, URL.createObjectURL(compressedBlob), "image/jpeg")
        } catch (e) {
          setNotice({ visible: true, type: "error", title: "Compression Failed", message: "Failed to process the image." })
          window.scrollTo({ top: 0, behavior: "smooth" })
        }
      }
    }
  }

  const onCropComplete = (blob) => {
    if (blob.size > MAX_FILE_SIZE) {
      setNotice({ visible: true, type: "error", title: "Crop too large", message: "Try cropping a smaller area to reduce file size." })
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

  async function uploadFile(fileOrBlob, bucket, folder, oldUrl = "") {
    if (!fileOrBlob) return oldUrl || null

    if (oldUrl) {
      try {
        const match = oldUrl.match(new RegExp(`/(?:public|authenticated)/${bucket}/(.+)`))
        if (match && match[1]) {
          const oldPath = match[1].split('?')[0]
          await supabase.storage.from(bucket).remove([oldPath])
        }
      } catch (e) {
        console.warn("Failed to delete orphaned file from storage:", e)
      }
    }

    const extension = fileOrBlob.name?.split(".").pop() || "jpg"
    const path = `${folder}/${user.id}_${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, fileOrBlob, {
        upsert: false,
        contentType: fileOrBlob.type || "image/jpeg",
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    
    if (bucket === 'id-documents' || bucket === 'cac-documents') {
        return data.publicUrl.replace('/public/', '/authenticated/')
    }
    
    return data.publicUrl
  }

  async function submitApplication() {
    if (isOffline) {
      setNotice({ visible: true, type: "error", title: "Network Offline", message: "You cannot submit an application while offline." })
      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    try {
      setSubmitting(true)

      const storefrontUrl = await uploadFile(files.storefront, "storefronts", "covers", existingShop?.storefront_url)
      const idCardUrl = await uploadFile(files.idCard, "id-documents", "ids", existingShop?.id_card_url)
      const cacUrl = await uploadFile(files.cac, "cac-documents", "cac", existingShop?.cac_certificate_url)
      const logoUrl = await uploadFile(files.logo, "brand-assets", "logos", existingShop?.image_url)

      const payload = {
        owner_id: user.id,
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
        image_url: logoUrl,
        storefront_url: storefrontUrl,
        id_card_url: idCardUrl,
        cac_certificate_url: cacUrl,
        facebook_url: form.facebook ? formatUrl(form.facebook) : null,
        instagram_url: form.instagram ? formatUrl(form.instagram) : null,
        twitter_url: form.twitter ? formatUrl(form.twitter) : null,
        tiktok_url: form.tiktok ? formatUrl(form.tiktok) : null,
        website_url: form.website ? formatUrl(form.website) : null,
        status: "pending",
        rejection_reason: null,
      }

      if (isEdit && existingShop?.id) {
        const { error } = await supabase.from("shops").update(payload).eq("id", existingShop.id)
        if (error) throw error

        setNotice({ visible: true, type: "success", title: "Correction submitted", message: "Your shop is pending approval again." })
      } else {
        const { error } = await supabase.from("shops").insert(payload)
        if (error) throw error

        setNotice({ visible: true, type: "success", title: "Application submitted", message: "You will be notified once your shop is approved." })
      }

      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })

      try { localStorage.removeItem("ctm_dashboard_cache") } catch (e) {}

      setTimeout(() => navigate("/user-dashboard"), 1200)
    } catch (error) {
      setNotice({ visible: true, type: "error", title: "Submission failed", message: error.message || "Please try again." })
      setReviewOpen(false)
      window.scrollTo({ top: 0, behavior: "smooth" })
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading || (dataLoading && !data)) return <ShopRegistrationShimmer />

  if (dataError && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-100 via-pink-100 to-purple-100 px-4">
        <div className="w-full max-w-md rounded-[28px] border border-pink-100 bg-white px-8 py-10 text-center shadow-xl">
          <FaTriangleExclamation className="mx-auto mb-4 text-5xl text-red-600" />
          <h3 className="mb-2 text-xl font-extrabold text-slate-800">Connection Error</h3>
          <p className="mb-6 text-sm font-semibold text-slate-600">{dataError}</p>
          <button onClick={() => navigate(-1)} className="rounded-xl border border-slate-200 bg-white px-8 py-3 font-bold text-slate-700 transition hover:bg-slate-50">Go Back</button>
        </div>
      </div>
    )
  }

  if (!user || !profile) return null

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-indigo-100 via-pink-100 to-purple-100 pb-12">
      
      <input ref={hiddenInputRef} type="file" className="hidden" onChange={handleHiddenFileChange} />

      <section className="px-4 py-6 md:py-8">
        <div className="mx-auto max-w-3xl">
          {isOffline && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800 shadow-sm">
              <i className="fa-solid fa-wifi-slash"></i> You are currently offline. You can view the form, but cannot submit until reconnected.
            </div>
          )}

          <div className="mb-6 flex items-center gap-4">
            <button onClick={() => navigate("/user-dashboard")} className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700">
              <FaArrowLeft />
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">{isEdit ? "Correct Application" : "Register Shop"}</h1>
              <p className="text-sm font-medium text-slate-600">Complete your merchant registration details.</p>
            </div>
          </div>

          <AuthNotification visible={notice.visible} type={notice.type} title={notice.title} message={notice.message} />

          {cityData && cityData.is_open === false ? (
            <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-xl md:p-8 text-center">
              <FaCity className="mx-auto mb-4 text-5xl text-amber-500" />
              <h2 className="text-xl font-extrabold text-slate-900 mb-2">City Operations Paused</h2>
              <p className="text-sm font-medium text-slate-700 leading-relaxed">
                We are not currently accepting or processing merchant registrations in <strong>{cityData.name}</strong>. Please check back later or contact support.
              </p>
            </div>
          ) : (
            <form onSubmit={openReview} className="rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl md:p-8">
              
              <SectionTitle icon={<FaStore />} tone="purple" title="Store Front Image" />
              <p className="mb-4 text-center text-sm font-medium text-slate-500">Upload a clear, portrait-oriented photo of your shop exterior.</p>

              <UploadCard
                title="Cover Photo"
                subtitle="Required, Max 500KB"
                onClick={() => triggerActionSheet("storefront", false, 3 / 4)}
                preview={renderPreview("storefront")}
                isPortrait
              />

              <SectionTitle icon={<FaBriefcase />} tone="pink" title="Business Details" />

              <div className="grid gap-5">
                <FieldBlock label="Business Name">
                  <InputWithIcon icon={<FaShop />} value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="e.g. Ade & Sons Enterprise" />
                </FieldBlock>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldBlock label="Business Type">
                    <select value={form.businessType} onChange={(e) => setForm((prev) => ({ ...prev, businessType: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100">
                      <option>Individual/Enterprise</option>
                      <option>Limited Liability (Ltd)</option>
                    </select>
                  </FieldBlock>

                  <FieldBlock label="Category">
                    <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100">
                      <option value="">Select Category...</option>
                      {categories.map((item) => (<option key={item.name} value={item.name}>{item.name}</option>))}
                    </select>
                  </FieldBlock>
                </div>

                <FieldBlock label={<span>Description <span className="ml-1 text-pink-600">*</span></span>}>
                  <textarea value={form.desc} onChange={(e) => setForm((prev) => ({ ...prev, desc: e.target.value }))} placeholder="Give detailed information about what you sell, the services you provide, and what makes your business unique..." className="min-h-[150px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  <WordCounter count={descWords} min={DESC_MIN_WORDS} max={DESC_MAX_WORDS} />
                </FieldBlock>
              </div>

              <SectionTitle icon={<FaLocationDot />} tone="amber" title="Location" />

              <div className="grid gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <FieldBlock label="City (Fixed)">
                    <InputWithIcon icon={<FaCity />} value={profile?.cities?.name || ""} disabled />
                  </FieldBlock>

                  <FieldBlock label="Area">
                    <select value={form.areaId} onChange={(e) => setForm((prev) => ({ ...prev, areaId: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100">
                      <option value="">Select Area...</option>
                      {areas.map((area) => (<option key={area.id} value={area.id}>{area.name}</option>))}
                    </select>
                  </FieldBlock>
                </div>

                <FieldBlock label={<span>Detailed Street Address <span className="ml-1 text-pink-600">*</span></span>}>
                  <InputWithIcon icon={<FaMapPin />} value={form.address} onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))} placeholder="e.g. Shop 4, Ground Floor, Main Market Plaza..." />
                  <WordCounter count={addressWords} min={ADDR_MIN_WORDS} max={ADDR_MAX_WORDS} />
                </FieldBlock>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldBlock label="Latitude (Optional)">
                    <input type="number" step="any" value={form.lat} onChange={(e) => setForm((prev) => ({ ...prev, lat: e.target.value }))} placeholder="e.g. 9.08" className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  </FieldBlock>

                  <FieldBlock label="Longitude (Optional)">
                    <input type="number" step="any" value={form.lng} onChange={(e) => setForm((prev) => ({ ...prev, lng: e.target.value }))} placeholder="e.g. 7.49" className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  </FieldBlock>
                </div>
              </div>

              <SectionTitle icon={<FaShieldHalved />} tone="blue" title="Identity & Legal" rightText="Private" />

              <div className="grid gap-5">
                <FieldBlock label={form.businessType === "Limited Liability (Ltd)" ? <span>RC Number <span className="ml-1 text-pink-600">*</span></span> : "BN Number (Optional)"}>
                  <InputWithIcon icon={<FaFileContract />} value={form.cacNumber} onChange={(e) => setForm((prev) => ({ ...prev, cacNumber: e.target.value }))} placeholder="If applicable" />
                </FieldBlock>

                <UploadCard
                  title={form.businessType === "Limited Liability (Ltd)" ? <span>CAC Certificate <span className="ml-1 text-pink-600">*</span></span> : "CAC Certificate"}
                  subtitle={form.businessType === "Limited Liability (Ltd)" ? "Required for Ltd. PDF/Image, Max 500KB" : "Optional for enterprise. PDF/Image, Max 500KB"}
                  onClick={() => triggerActionSheet("cac", true, null)}
                  preview={renderPreview("cac")}
                />

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldBlock label="ID Type">
                    <select value={form.idType} onChange={(e) => setForm((prev) => ({ ...prev, idType: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100">
                      <option>National ID Card</option>
                      <option>Voters Card</option>
                      <option>Drivers License</option>
                      <option>Int. Passport</option>
                    </select>
                  </FieldBlock>

                  <FieldBlock label="ID Number">
                    <input value={form.idNumber} onChange={(e) => setForm((prev) => ({ ...prev, idNumber: e.target.value }))} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  </FieldBlock>
                </div>

                <UploadCard
                  title={<span>Official ID Document <span className="ml-1 text-pink-600">*</span></span>}
                  subtitle="Required. PDF/Image, Max 500KB"
                  onClick={() => triggerActionSheet("idCard", true, null)}
                  preview={renderPreview("idCard")}
                />

                <UploadCard
                  title="Brand Logo"
                  subtitle="Optional. Square Image only, Max 500KB"
                  onClick={() => triggerActionSheet("logo", false, 1)}
                  preview={renderPreview("logo")}
                  isSquare
                />
              </div>

              <SectionTitle icon={<FaAddressBook />} tone="green" title="Contacts & Socials" />

              <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Please provide links to your business profiles and website. Personal links may cause your application to be rejected.
              </div>

              <div className="grid gap-5">
                <FieldBlock label="Business Website (Optional)">
                  <InputWithIcon icon={<FaGlobe />} value={form.website} onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))} onBlur={handleUrlBlur("website")} placeholder="e.g. www.yourshop.com" />
                </FieldBlock>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldBlock label="Business Phone">
                    <InputWithIcon icon={<FaPhone />} value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="e.g. 08012345678" />
                  </FieldBlock>
                  <FieldBlock label="WhatsApp Number">
                    <InputWithIcon icon={<FaPhone />} value={form.whatsapp} onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))} placeholder="e.g. 08012345678" />
                  </FieldBlock>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldBlock label="Facebook URL">
                    <input value={form.facebook} onChange={(e) => setForm((prev) => ({ ...prev, facebook: e.target.value }))} onBlur={handleUrlBlur("facebook")} placeholder="e.g. www.facebook.com/yourshop" className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  </FieldBlock>
                  <FieldBlock label="Instagram URL">
                    <input value={form.instagram} onChange={(e) => setForm((prev) => ({ ...prev, instagram: e.target.value }))} onBlur={handleUrlBlur("instagram")} placeholder="e.g. www.instagram.com/yourshop" className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  </FieldBlock>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <FieldBlock label="X (Twitter) URL">
                    <input value={form.twitter} onChange={(e) => setForm((prev) => ({ ...prev, twitter: e.target.value }))} onBlur={handleUrlBlur("twitter")} placeholder="e.g. x.com/yourshop" className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  </FieldBlock>
                  <FieldBlock label="TikTok URL">
                    <input value={form.tiktok} onChange={(e) => setForm((prev) => ({ ...prev, tiktok: e.target.value }))} onBlur={handleUrlBlur("tiktok")} placeholder="e.g. www.tiktok.com/@yourshop" className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100" />
                  </FieldBlock>
                </div>
              </div>

              <div className="mt-8">
                <AuthButton type="submit" loading={false}>
                  <span>Review Application</span>
                  <FaArrowRight />
                </AuthButton>
              </div>
            </form>
          )}
        </div>
      </section>

      <ActionSheet sheet={actionSheet} onClose={() => setActionSheet({ ...actionSheet, isOpen: false })} onSelect={handleActionSelection} />
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

// --- SUB COMPONENTS ---

function SectionTitle({ icon, title, tone = "purple", rightText = "" }) {
  const tones = { purple: "text-violet-600", pink: "text-pink-600", amber: "text-amber-500", blue: "text-sky-600", green: "text-emerald-600" }
  return (
    <div className="mb-5 mt-8 flex items-center justify-between border-b-2 border-slate-100 pb-3">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl bg-slate-50 p-2 text-lg ${tones[tone]}`}>{icon}</div>
        <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-700">{title}</h2>
      </div>
      {rightText && <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{rightText}</span>}
    </div>
  )
}

function FieldBlock({ label, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-slate-800">{label}</label>
      {children}
    </div>
  )
}

function InputWithIcon({ icon, value, onChange, onBlur, placeholder, disabled = false }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
      <input value={value} onChange={onChange} onBlur={onBlur} placeholder={placeholder} disabled={disabled} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-medium text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100" />
    </div>
  )
}

function WordCounter({ count, min, max }) {
  const valid = count >= min && count <= max
  return <div className={`text-right text-xs font-bold ${valid ? "text-emerald-600" : "text-red-500"}`}>{count} words (Min: {min}, Max: {max})</div>
}

function UploadCard({ title, subtitle, onClick, preview, isPortrait, isSquare }) {
  return (
    <div onClick={onClick} className={`cursor-pointer mx-auto ${isPortrait ? 'w-full max-w-[240px]' : isSquare ? 'w-full max-w-[200px]' : 'w-full'}`}>
      <div className={`rounded-[24px] border-2 border-dashed border-slate-300 bg-slate-50 p-5 transition hover:border-pink-300 hover:bg-pink-50 ${isPortrait ? 'aspect-[3/4]' : isSquare ? 'aspect-square' : ''}`}>
        {preview ? (
          <div className="h-full w-full">{preview}</div>
        ) : (
          <div className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-center">
            <FaCamera className="mb-2 text-3xl text-slate-400" />
          </div>
        )}
      </div>
      <div className="mt-3 text-center">
        <p className="text-sm font-extrabold text-slate-800">{title}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}

// --- CUSTOM ACTION SHEET ---
function ActionSheet({ sheet, onClose, onSelect }) {
  if (!sheet.isOpen) return null
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/60 px-4 pb-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md animate-slide-up rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-6 text-lg font-extrabold text-slate-900">Choose File Source</h3>
        <div className="flex flex-col gap-3">
          <button onClick={() => onSelect("camera")} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 text-left font-bold text-slate-800 transition hover:bg-slate-100">
            <FaCamera className="text-xl text-blue-500" /> Take a Photo
          </button>
          <button onClick={() => onSelect("gallery")} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 text-left font-bold text-slate-800 transition hover:bg-slate-100">
            <FaImage className="text-xl text-emerald-500" /> Choose from Gallery
          </button>
          {sheet.acceptsPdf && (
            <button onClick={() => onSelect("pdf")} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 text-left font-bold text-slate-800 transition hover:bg-slate-100">
              <FaFilePdf className="text-xl text-red-500" /> Upload PDF Document
            </button>
          )}
          <button onClick={onClose} className="mt-2 rounded-2xl bg-slate-200 p-4 font-bold text-slate-600 transition hover:bg-slate-300">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// --- CROPPER MODAL ---
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