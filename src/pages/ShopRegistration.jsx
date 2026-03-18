import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaAddressBook,
  FaArrowLeft,
  FaArrowRight,
  FaBriefcase,
  FaCheck,
  FaCity,
  FaFileContract,
  FaGlobe,
  FaLocationDot,
  FaMapPin,
  FaPhone,
  FaShieldHalved,
  FaShop,
  FaStore,
  FaTriangleExclamation,
} from "react-icons/fa6"
import MainLayout from "../layouts/MainLayout"
import AuthButton from "../components/auth/AuthButton"
import AuthNotification from "../components/auth/AuthNotification"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
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

// --- PROFESSIONAL SHIMMER COMPONENT ---
function ShopRegistrationShimmer() {
  return (
    <MainLayout>
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
    </MainLayout>
  )
}

function ShopRegistration() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const shopId = searchParams.get("id")
  const isEdit = Boolean(shopId)

  // 1. Unified Auth State (Suspended/Complete logic is handled by ProtectedDashboardRoute)
  const { loading: authLoading, user, profile, isOffline } = useAuthSession()

  // 2. Data Fetching Logic for Hook
  const fetchFormData = async () => {
    if (!profile?.city_id) throw new Error("Profile not fully configured.")

    const tasks = [
      supabase.from("categories").select("name").order("name"),
      supabase.from("areas").select("id, name").eq("city_id", profile.city_id).order("name"),
    ]

    let existingData = null

    if (isEdit && shopId) {
      tasks.push(
        supabase.from("shops").select("*").eq("id", shopId).maybeSingle()
      )
    }

    const results = await Promise.all(tasks)
    
    if (results[0].error) throw results[0].error
    if (results[1].error) throw results[1].error

    if (isEdit && shopId) {
      if (results[2].error) throw results[2].error
      existingData = results[2].data
      if (!existingData) throw new Error("Shop not found.")
    }

    return {
      categories: results[0].data || [],
      areas: results[1].data || [],
      shop: existingData,
    }
  }

  // 3. Smart Caching Hook
  const cacheKey = isEdit ? `shop_reg_edit_${shopId}` : `shop_reg_new_${profile?.city_id}`
  const { data, loading: dataLoading, error: dataError } = useCachedFetch(
    cacheKey,
    fetchFormData,
    { dependencies: [profile?.city_id, shopId, isEdit], ttl: 1000 * 60 * 60 } // Cache form data for 1 hour
  )

  const [submitting, setSubmitting] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [hasHydrated, setHasHydrated] = useState(false)

  const [categories, setCategories] = useState([])
  const [areas, setAreas] = useState([])
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

  const descWords = useMemo(() => countWords(form.desc), [form.desc])
  const addressWords = useMemo(() => countWords(form.address), [form.address])

  // 4. Hydrate Form State ONCE when data arrives
  useEffect(() => {
    if (data && !hasHydrated) {
      setCategories(data.categories)
      setAreas(data.areas)

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
          setNotice({
            visible: true,
            type: "warning",
            title: "Correction required",
            message: s.rejection_reason,
          })
        }
      }
      setHasHydrated(true)
    }
  }, [data, hasHydrated, isEdit])

  // Show data loading error
  useEffect(() => {
    if (dataError) {
      setNotice({
        visible: true,
        type: "error",
        title: "Could not load form",
        message: dataError,
      })
    }
  }, [dataError])

  function validateForm() {
    if (!form.name.trim() || form.name.trim().length < 3) {
      return "Business name must be at least 3 characters."
    }

    if (!form.category) {
      return "Please select a business category."
    }

    if (descWords < DESC_MIN_WORDS || descWords > DESC_MAX_WORDS) {
      return `Business description must be between ${DESC_MIN_WORDS} and ${DESC_MAX_WORDS} words.`
    }

    if (!form.areaId) {
      return "Please select an area."
    }

    if (addressWords < ADDR_MIN_WORDS || addressWords > ADDR_MAX_WORDS) {
      return `Street address must be between ${ADDR_MIN_WORDS} and ${ADDR_MAX_WORDS} words.`
    }

    if (!form.idNumber.trim()) {
      return "ID number is required."
    }

    if (!validPhone(form.phone)) {
      return "Enter a valid business phone number."
    }

    if (form.whatsapp && !validPhone(form.whatsapp)) {
      return "Enter a valid WhatsApp number."
    }

    if (!validUrl(form.website)) return "Enter a valid website URL."
    if (!validUrl(form.facebook)) return "Enter a valid Facebook URL."
    if (!validUrl(form.instagram)) return "Enter a valid Instagram URL."
    if (!validUrl(form.twitter)) return "Enter a valid X or Twitter URL."
    if (!validUrl(form.tiktok)) return "Enter a valid TikTok URL."

    if (!previews.storefront && !files.storefront) {
      return "Store front image is required."
    }

    if (!previews.idCard && !files.idCard) {
      return "ID document is required."
    }

    if (
      form.businessType === "Limited Liability (Ltd)" &&
      !form.cacNumber.trim()
    ) {
      return "RC Number is required for Limited Liability businesses."
    }

    if (
      form.businessType === "Limited Liability (Ltd)" &&
      !previews.cac &&
      !files.cac
    ) {
      return "CAC certificate is required for Limited Liability businesses."
    }

    return ""
  }

  function openReview(event) {
    event.preventDefault()
    const error = validateForm()

    if (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Form validation failed",
        message: error,
      })
      return
    }

    setNotice({
      visible: false,
      type: "info",
      title: "",
      message: "",
    })
    setReviewOpen(true)
  }

  function closeReview() {
    setReviewOpen(false)
  }

  function handleFileChange(event, key) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE) {
      setNotice({
        visible: true,
        type: "error",
        title: "File too large",
        message: "Maximum allowed file size is 500KB.",
      })
      return
    }

    const allowed =
      file.type.startsWith("image/") || file.type === "application/pdf"

    if (!allowed) {
      setNotice({
        visible: true,
        type: "error",
        title: "Invalid file type",
        message: "Please upload an image or PDF document.",
      })
      return
    }

    setFiles((prev) => ({ ...prev, [key]: file }))
    setFileMeta((prev) => ({
      ...prev,
      [key]: {
        name: file.name,
        type: file.type,
      },
    }))

    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file)
      setPreviews((prev) => ({ ...prev, [key]: url }))
    } else {
      setPreviews((prev) => ({ ...prev, [key]: file.name }))
    }
  }

  function renderPreview(key) {
    const meta = fileMeta[key]
    const value = previews[key]

    if (!value) return null

    const isPdf =
      meta?.type === "application/pdf" ||
      String(value).toLowerCase().endsWith(".pdf")

    if (isPdf) {
      return (
        <div className="flex h-full min-h-[140px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
          <div>
            <div className="mb-2 text-3xl">📄</div>
            <p className="text-xs font-bold text-slate-700">
              {meta?.name || "PDF Document"}
            </p>
          </div>
        </div>
      )
    }

    return (
      <img
        src={value}
        alt={key}
        className="h-full min-h-[140px] w-full rounded-2xl border border-slate-200 object-cover"
      />
    )
  }

  async function uploadFile(file, bucket, folder, oldUrl = "") {
    if (!file) return oldUrl || null

    const extension = file.name?.split(".").pop() || "jpg"
    const path = `${folder}/${user.id}_${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async function submitApplication() {
    if (isOffline) {
      setNotice({
        visible: true,
        type: "error",
        title: "Network Offline",
        message: "You cannot submit an application while offline.",
      })
      setReviewOpen(false)
      return
    }

    try {
      setSubmitting(true)

      const storefrontUrl = await uploadFile(
        files.storefront,
        "storefronts",
        "covers",
        existingShop?.storefront_url || previews.storefront
      )

      const idCardUrl = await uploadFile(
        files.idCard,
        "id-documents",
        "ids",
        existingShop?.id_card_url || previews.idCard
      )

      const cacUrl = await uploadFile(
        files.cac,
        "cac-documents",
        "cac",
        existingShop?.cac_certificate_url || previews.cac
      )

      const logoUrl = await uploadFile(
        files.logo,
        "brand-assets",
        "logos",
        existingShop?.image_url || previews.logo
      )

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
        const { error } = await supabase
          .from("shops")
          .update(payload)
          .eq("id", existingShop.id)

        if (error) throw error

        setNotice({
          visible: true,
          type: "success",
          title: "Correction submitted",
          message: "Your shop is pending approval again.",
        })
      } else {
        const { error } = await supabase.from("shops").insert(payload)
        if (error) throw error

        setNotice({
          visible: true,
          type: "success",
          title: "Application submitted",
          message: "You will be notified once your shop is approved.",
        })
      }

      setReviewOpen(false)

      // Invalidate dashboard cache manually so new shop shows up
      try {
        localStorage.removeItem("ctm_dashboard_cache")
      } catch(e) {}

      setTimeout(() => {
        navigate("/user-dashboard")
      }, 1200)
    } catch (error) {
      setNotice({
        visible: true,
        type: "error",
        title: "Submission failed",
        message: error.message || "Please try again.",
      })
      setReviewOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  // --- RENDERING LOGIC ---
  if (authLoading || (dataLoading && !data)) {
    return <ShopRegistrationShimmer />
  }

  if (dataError && !data) {
    return (
      <MainLayout>
        <div className="flex min-h-[70vh] items-center justify-center bg-pink-50 px-4">
          <div className="rounded-[28px] border border-pink-100 bg-white px-8 py-10 text-center shadow-xl">
            <FaTriangleExclamation className="mx-auto mb-4 text-5xl text-red-600" />
            <h3 className="mb-2 text-xl font-extrabold text-slate-800">Connection Error</h3>
            <p className="text-sm font-semibold text-slate-600 mb-6">{dataError}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-pink-600 px-6 py-2 font-bold text-white transition hover:bg-pink-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!user || !profile) return null

  return (
    <MainLayout>
      <section className="min-h-screen bg-gradient-to-br from-indigo-100 via-pink-100 to-purple-100 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          {/* Offline Notice */}
          {isOffline && (
            <div className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800 shadow-sm border border-amber-200 flex items-center gap-2">
              <i className="fa-solid fa-wifi-slash"></i>
              You are currently offline. You can view the form, but cannot submit until reconnected.
            </div>
          )}

          <div className="mb-6 flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/user-dashboard")}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700"
            >
              <FaArrowLeft />
            </button>

            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                {isEdit ? "Correct Application" : "Register Shop"}
              </h1>
              <p className="text-sm text-slate-500">
                Complete your merchant registration details.
              </p>
            </div>
          </div>

          <AuthNotification
            visible={notice.visible}
            type={notice.type}
            title={notice.title}
            message={notice.message}
          />

          <form
            onSubmit={openReview}
            className="rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl md:p-8"
          >
            <SectionTitle icon={<FaStore />} tone="purple" title="Store Front Image" />
            <p className="mb-4 text-center text-sm text-slate-500">
              Upload a clear, portrait-oriented photo of your shop exterior.
            </p>

            <UploadCard
              title="Cover Photo"
              subtitle="Required, Max 500KB"
              onChange={(e) => handleFileChange(e, "storefront")}
              accept="image/*"
              preview={renderPreview("storefront")}
            />

            <SectionTitle icon={<FaBriefcase />} tone="pink" title="Business Details" />

            <div className="grid gap-5">
              <FieldBlock label="Business Name">
                <InputWithIcon
                  icon={<FaShop />}
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Ade & Sons Enterprise"
                />
              </FieldBlock>

              <div className="grid gap-5 md:grid-cols-2">
                <FieldBlock label="Business Type">
                  <select
                    value={form.businessType}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        businessType: e.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  >
                    <option>Individual/Enterprise</option>
                    <option>Limited Liability (Ltd)</option>
                  </select>
                </FieldBlock>

                <FieldBlock label="Category">
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, category: e.target.value }))
                    }
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  >
                    <option value="">Select Category...</option>
                    {categories.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </FieldBlock>
              </div>

              <FieldBlock label="Description">
                <textarea
                  value={form.desc}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, desc: e.target.value }))
                  }
                  placeholder="Give detailed information about what you sell, the services you provide, and what makes your business unique..."
                  className="min-h-[150px] w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                />
                <WordCounter
                  count={descWords}
                  min={DESC_MIN_WORDS}
                  max={DESC_MAX_WORDS}
                />
              </FieldBlock>
            </div>

            <SectionTitle icon={<FaLocationDot />} tone="amber" title="Location" />

            <div className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <FieldBlock label="City (Fixed)">
                  <InputWithIcon
                    icon={<FaCity />}
                    value={profile?.cities?.name || ""}
                    disabled
                  />
                </FieldBlock>

                <FieldBlock label="Area">
                  <select
                    value={form.areaId}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, areaId: e.target.value }))
                    }
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  >
                    <option value="">Select Area...</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </FieldBlock>
              </div>

              <FieldBlock label="Detailed Street Address">
                <InputWithIcon
                  icon={<FaMapPin />}
                  value={form.address}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, address: e.target.value }))
                  }
                  placeholder="e.g. Shop 4, Ground Floor, Main Market Plaza..."
                />
                <WordCounter
                  count={addressWords}
                  min={ADDR_MIN_WORDS}
                  max={ADDR_MAX_WORDS}
                />
              </FieldBlock>

              <div className="grid gap-5 md:grid-cols-2">
                <FieldBlock label="Latitude (Optional)">
                  <input
                    type="number"
                    step="any"
                    value={form.lat}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, lat: e.target.value }))
                    }
                    placeholder="e.g. 9.08"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                </FieldBlock>

                <FieldBlock label="Longitude (Optional)">
                  <input
                    type="number"
                    step="any"
                    value={form.lng}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, lng: e.target.value }))
                    }
                    placeholder="e.g. 7.49"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                </FieldBlock>
              </div>
            </div>

            <SectionTitle
              icon={<FaShieldHalved />}
              tone="blue"
              title="Identity & Legal"
              rightText="Private"
            />

            <div className="grid gap-5">
              <FieldBlock
                label={
                  form.businessType === "Limited Liability (Ltd)"
                    ? "RC Number"
                    : "BN Number (Optional)"
                }
              >
                <InputWithIcon
                  icon={<FaFileContract />}
                  value={form.cacNumber}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, cacNumber: e.target.value }))
                  }
                  placeholder="If applicable"
                />
              </FieldBlock>

              <UploadCard
                title="CAC Certificate"
                subtitle="Optional for enterprise, required for Ltd. PDF/Image, Max 500KB"
                onChange={(e) => handleFileChange(e, "cac")}
                accept="image/*,application/pdf"
                preview={renderPreview("cac")}
              />

              <div className="grid gap-5 md:grid-cols-2">
                <FieldBlock label="ID Type">
                  <select
                    value={form.idType}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, idType: e.target.value }))
                    }
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  >
                    <option>National ID Card</option>
                    <option>Voters Card</option>
                    <option>Drivers License</option>
                    <option>Int. Passport</option>
                  </select>
                </FieldBlock>

                <FieldBlock label="ID Number">
                  <input
                    value={form.idNumber}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, idNumber: e.target.value }))
                    }
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                </FieldBlock>
              </div>

              <UploadCard
                title="Official ID Document"
                subtitle="Required. PDF/Image, Max 500KB"
                onChange={(e) => handleFileChange(e, "idCard")}
                accept="image/*,application/pdf"
                preview={renderPreview("idCard")}
              />

              <UploadCard
                title="Brand Logo"
                subtitle="Optional. Image only, Max 500KB"
                onChange={(e) => handleFileChange(e, "logo")}
                accept="image/*"
                preview={renderPreview("logo")}
              />
            </div>

            <SectionTitle
              icon={<FaAddressBook />}
              tone="green"
              title="Contacts & Socials"
            />

            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              Please provide links to your business profiles and website.
              Personal links may cause your application to be rejected.
            </div>

            <div className="grid gap-5">
              <FieldBlock label="Business Website (Optional)">
                <InputWithIcon
                  icon={<FaGlobe />}
                  value={form.website}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, website: e.target.value }))
                  }
                  placeholder="e.g. www.yourshop.com"
                />
              </FieldBlock>

              <div className="grid gap-5 md:grid-cols-2">
                <FieldBlock label="Business Phone">
                  <InputWithIcon
                    icon={<FaPhone />}
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    placeholder="e.g. 08012345678"
                  />
                </FieldBlock>

                <FieldBlock label="WhatsApp Number">
                  <InputWithIcon
                    icon={<FaPhone />}
                    value={form.whatsapp}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        whatsapp: e.target.value,
                      }))
                    }
                    placeholder="e.g. 08012345678"
                  />
                </FieldBlock>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <FieldBlock label="Facebook URL">
                  <input
                    value={form.facebook}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, facebook: e.target.value }))
                    }
                    placeholder="e.g. www.facebook.com/yourshop"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                </FieldBlock>

                <FieldBlock label="Instagram URL">
                  <input
                    value={form.instagram}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        instagram: e.target.value,
                      }))
                    }
                    placeholder="e.g. www.instagram.com/yourshop"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                </FieldBlock>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <FieldBlock label="X (Twitter) URL">
                  <input
                    value={form.twitter}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, twitter: e.target.value }))
                    }
                    placeholder="e.g. x.com/yourshop"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
                </FieldBlock>

                <FieldBlock label="TikTok URL">
                  <input
                    value={form.tiktok}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, tiktok: e.target.value }))
                    }
                    placeholder="e.g. www.tiktok.com/@yourshop"
                    className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100"
                  />
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
        </div>
      </section>

      {reviewOpen ? (
        <ReviewModal
          form={form}
          cityName={profile?.cities?.name || ""}
          areaName={areas.find((a) => String(a.id) === form.areaId)?.name || ""}
          storefrontPreview={renderPreview("storefront")}
          idPreview={renderPreview("idCard")}
          cacPreview={renderPreview("cac")}
          showCac={
            form.businessType === "Limited Liability (Ltd)" &&
            Boolean(previews.cac || files.cac)
          }
          onClose={closeReview}
          onConfirm={submitApplication}
          loading={submitting}
          isEdit={isEdit}
        />
      ) : null}
    </MainLayout>
  )
}

function SectionTitle({ icon, title, tone = "purple", rightText = "" }) {
  const tones = {
    purple: "text-violet-600",
    pink: "text-pink-600",
    amber: "text-amber-500",
    blue: "text-sky-600",
    green: "text-emerald-600",
  }

  return (
    <div className="mb-5 mt-8 flex items-center justify-between border-b-2 border-slate-100 pb-3">
      <div className="flex items-center gap-3">
        <div className={`rounded-xl bg-slate-50 p-2 text-lg ${tones[tone]}`}>
          {icon}
        </div>
        <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-700">
          {title}
        </h2>
      </div>
      {rightText ? (
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">
          {rightText}
        </span>
      ) : null}
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

function InputWithIcon({ icon, value, onChange, placeholder, disabled = false }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        {icon}
      </span>
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm text-slate-800 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
    </div>
  )
}

function WordCounter({ count, min, max }) {
  const valid = count >= min && count <= max
  return (
    <div
      className={`text-right text-xs font-bold ${
        valid ? "text-emerald-600" : "text-red-500"
      }`}
    >
      {count} words (Min: {min}, Max: {max})
    </div>
  )
}

function UploadCard({ title, subtitle, onChange, accept, preview }) {
  return (
    <label className="block cursor-pointer">
      <input type="file" className="hidden" onChange={onChange} accept={accept} />
      <div className="rounded-[24px] border-2 border-dashed border-slate-300 bg-slate-50 p-5 transition hover:border-pink-300 hover:bg-pink-50">
        {preview ? (
          <div className="mb-4">{preview}</div>
        ) : (
          <div className="mb-4 flex min-h-[140px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-4xl">
            📤
          </div>
        )}

        <div className="text-center">
          <p className="text-sm font-extrabold text-slate-800">{title}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
      </div>
    </label>
  )
}

function ReviewModal({
  form,
  cityName,
  areaName,
  storefrontPreview,
  idPreview,
  cacPreview,
  showCac,
  onClose,
  onConfirm,
  loading,
  isEdit,
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-[32px] border border-white/60 bg-white p-6 shadow-2xl">
        <h2 className="text-2xl font-extrabold text-slate-900">
          Review Application
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Please ensure all details are correct before submitting.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <ReviewThumb label="Store Front" content={storefrontPreview} />
          <ReviewThumb label="ID Document" content={idPreview} />
          {showCac ? <ReviewThumb label="CAC Certificate" content={cacPreview} /> : null}
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <DetailRow label="Business Name" value={form.name} />
          <DetailRow label="Type" value={form.businessType} />
          <DetailRow label="Category" value={form.category} />
          <DetailRow label="Location" value={`${areaName}, ${cityName}`} />
          {form.website ? (
            <DetailRow label="Website" value={formatUrl(form.website)} />
          ) : null}
        </div>

        <div className="mt-6 space-y-3">
          <AuthButton onClick={onConfirm} loading={loading}>
            <FaCheck />
            <span>{isEdit ? "Confirm Correction" : "Confirm & Submit"}</span>
          </AuthButton>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
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
        {content || (
          <div className="flex min-h-[140px] items-center justify-center text-3xl">
            📄
          </div>
        )}
      </div>
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="flex gap-4 border-b border-slate-200 py-3 last:border-b-0">
      <div className="w-32 text-sm font-semibold text-slate-500">{label}</div>
      <div className="flex-1 text-sm font-extrabold text-slate-900 break-words">
        {value}
      </div>
    </div>
  )
}

export default ShopRegistration