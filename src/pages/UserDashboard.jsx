import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import Cropper from "cropperjs"
import "cropperjs/dist/cropper.css"

import AuthNotification from "../components/auth/AuthNotification"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import useMyShop from "../hooks/useMyShop" // <-- Import our new logic file
import { signOutUser } from "../lib/auth"
import { supabase } from "../lib/supabase"
import { UPLOAD_RULES, formatBytes } from "../lib/uploadRules"

import DashboardHeader from "../components/dashboard/layout/DashboardHeader"
import MarketSection from "../components/dashboard/sections/MarketSection"
import ServicesProfileSection from "../components/dashboard/sections/ServicesProfileSection"
import NotificationsSection from "../components/dashboard/sections/NotificationsSection"

const AVATAR_RULE = UPLOAD_RULES.avatars
const MAX_FILE_SIZE = AVATAR_RULE.maxBytes
const MAX_SOURCE_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_AVATAR_MIME_TYPES = new Set(AVATAR_RULE.allowedMime)
const AVATAR_BUCKET = AVATAR_RULE.bucket
const AVATAR_WIDTH_STEPS = [900, 760, 640, 520, 420, 360]
const AVATAR_QUALITY_STEPS = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56]

const EMPTY_DASHBOARD_DATA = {
  profile: null,
  promos: [],
  announcements: [],
  categories: [],
  areas: [],
  shops: [],
  products: [],
  notifications: [],
  wishlistCount: 0,
  unread: 0,
}

const ALLOWED_TABS = new Set(["market", "services", "profile", "notifications"])
const ALLOWED_SERVICE_VIEWS = new Set([
  "menu",
  "about",
  "services-info",
  "careers",
  "support",
  "faq",
  "report-abuse",
  "wishlist",
])

function DashboardShimmer({ label = "Loading dashboard..." }) {
  return (
    <section className="min-h-screen bg-[#E3E6E6] px-4 py-4">
      <div className="mx-auto max-w-[1600px] animate-pulse">
        <div className="mb-4 rounded-md bg-[#131921] px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded bg-white/20" />
            <div className="h-10 flex-1 rounded bg-white/15" />
            <div className="h-10 w-24 rounded bg-white/15" />
            <div className="h-10 w-24 rounded bg-white/15" />
            <div className="h-10 w-10 rounded-full bg-white/20" />
          </div>
          <div className="mt-3 h-10 rounded bg-white/10" />
        </div>

        <div className="mb-4 h-[180px] rounded-lg bg-white" />

        <div className="mb-4 rounded-lg bg-white p-4">
          <div className="mb-4 h-6 w-56 rounded bg-slate-200" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="min-w-[280px] max-w-[340px] flex-1 rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="mb-4 h-5 w-3/4 rounded bg-slate-200" />
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((__, i) => (
                    <div key={i}>
                      <div className="aspect-square rounded bg-slate-200" />
                      <div className="mt-2 h-3 rounded bg-slate-200" />
                      <div className="mt-2 h-3 w-2/3 rounded bg-slate-200" />
                    </div>
                  ))}
                </div>
                <div className="mt-4 h-4 w-24 rounded bg-slate-200" />
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-sm font-semibold text-[#565959]">
          {label}
        </p>
      </div>
    </section>
  )
}

function UserDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const { loading: authLoading, user, profile, suspended } = useAuthSession()
  
  // Use our new isolated tracking logic for the shop card
  const { shopData, shopMeta, canRegisterShop, loading: shopLoading } = useMyShop()

  const fetchDashboardData = async () => {
    if (!user?.id) throw new Error("Authentication required")

    let currentProfile = profile
    if (!currentProfile?.city_id) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, cities(name)")
        .eq("id", user.id)
        .single()
      if (error) throw error
      currentProfile = data
    }

    if (!currentProfile?.city_id) throw new Error("Profile not completed")
    if (currentProfile.is_suspended) throw new Error("Account restricted")

    const cityId = currentProfile.city_id

    const [
      promosRes,
      announcementsRes,
      categoriesRes,
      areasRes,
      shopsRes,
      notificationsRes,
      wishlistRes,
    ] = await Promise.all([
      supabase.from("promo_banners").select("*").order("created_at", { ascending: false }),
      supabase.from("announcements").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("name"),
      supabase.from("areas").select("*").eq("city_id", cityId).order("name"),
      supabase.from("shops").select("*").eq("city_id", cityId).order("is_verified", { ascending: false }).order("id", { ascending: true }),
      supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("wishlist").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    ])

    let products = []
    const shopIds = (shopsRes.data || []).map((shop) => shop.id)

    if (shopIds.length > 0) {
      const productsRes = await supabase
        .from("products")
        .select("*")
        .in("shop_id", shopIds)
        .eq("is_available", true)
        .limit(500)
        .order("id", { ascending: true })

      if (!productsRes.error) products = productsRes.data || []
    }

    return {
      profile: currentProfile,
      promos: promosRes.data || [],
      announcements: announcementsRes.data || [],
      categories: categoriesRes.data || [],
      areas: areasRes.data || [],
      shops: shopsRes.data || [],
      products,
      notifications: notificationsRes.data || [],
      wishlistCount: wishlistRes.count || 0,
      unread: (notificationsRes.data || []).filter((item) => !item.is_read).length,
    }
  }

  const dashboardCacheKey = `dashboard_cache_${user?.id || "guest"}_${profile?.city_id || "none"}`
  const { data: fetchedData, loading: dataLoading, error: dataError } = useCachedFetch(
    dashboardCacheKey,
    fetchDashboardData,
    { dependencies: [user?.id, profile?.city_id], ttl: 1000 * 60 * 15 }
  )

  const [localData, setLocalData] = useState(EMPTY_DASHBOARD_DATA)

  useEffect(() => {
    if (fetchedData) {
      setLocalData(fetchedData)
    }
  }, [fetchedData])

  const tabParam = searchParams.get("tab")
  const activeTab = ALLOWED_TABS.has(tabParam) ? tabParam : "market"
  const viewParam = searchParams.get("view")
  const serviceView =
    activeTab === "services" && ALLOWED_SERVICE_VIEWS.has(viewParam)
      ? viewParam
      : "menu"

  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [searchInputDesktop, setSearchInputDesktop] = useState("")
  const [searchInputMobile, setSearchInputMobile] = useState("")
  const [searchSuggestionsDesktop, setSearchSuggestionsDesktop] = useState([])
  const [searchSuggestionsMobile, setSearchSuggestionsMobile] = useState([])

  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [profileEditForm, setProfileEditForm] = useState({
    full_name: "",
    phone: "",
    city_id: "",
    area_id: "",
  })
  const [profileEditAreas, setProfileEditAreas] = useState([])
  const [profileEditCities, setProfileEditCities] = useState([])
  const [profileEditError, setProfileEditError] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)

  const [avatarBlob, setAvatarBlob] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState("")
  const [cropModalOpen, setCropModalOpen] = useState(false)

  const cropImageRef = useRef(null)
  const cropperRef = useRef(null)
  const fileInputRef = useRef(null)
  const generatedAvatarPreviewRef = useRef("")

  function clearGeneratedAvatarPreview() {
    if (generatedAvatarPreviewRef.current) {
      URL.revokeObjectURL(generatedAvatarPreviewRef.current)
      generatedAvatarPreviewRef.current = ""
    }
  }

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/", { replace: true })
    }
    if (suspended) {
      setNotice({
        visible: true,
        type: "error",
        title: "Account restricted",
        message: "Your account has been restricted. Please contact support.",
      })
    }
  }, [authLoading, user, suspended, navigate])

  useEffect(() => {
    if (!notice.visible) return undefined

    const timerId = window.setTimeout(() => {
      setNotice((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    }, 6500)

    return () => window.clearTimeout(timerId)
  }, [notice.visible, notice.title, notice.message, notice.type])

  useEffect(() => {
    function handleDocumentClick(event) {
      const target = event.target
      if (!(target instanceof Element)) return

      if (!target.closest(".desktop-search-wrap")) {
        setSearchSuggestionsDesktop([])
      }
      if (!target.closest(".mobile-search-wrap")) {
        setSearchSuggestionsMobile([])
      }
    }

    document.addEventListener("click", handleDocumentClick)
    return () => document.removeEventListener("click", handleDocumentClick)
  }, [])

  useEffect(() => {
    if (!cropModalOpen || !cropImageRef.current) return

    if (cropperRef.current) {
      cropperRef.current.destroy()
    }

    cropperRef.current = new Cropper(cropImageRef.current, {
      aspectRatio: 1,
      viewMode: 2,
      background: false,
      autoCropArea: 0.9,
      responsive: true,
      dragMode: "move",
      guides: true,
      highlight: true,
      cropBoxMovable: true,
      cropBoxResizable: true,
      movable: true,
      zoomOnTouch: true,
      zoomOnWheel: true,
      minCropBoxWidth: 120,
      minCropBoxHeight: 120,
      toggleDragModeOnDblclick: false,
    })

    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy()
        cropperRef.current = null
      }
    }
  }, [cropModalOpen])

  useEffect(() => {
    return () => {
      clearGeneratedAvatarPreview()
    }
  }, [])

  async function handleLogout() {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("ctm_")) localStorage.removeItem(key)
    })
    await signOutUser()
    navigate("/", { replace: true })
  }

  async function markNotificationsRead() {
    if (!user || localData.unread === 0) return

    setLocalData((prev) => ({
      ...prev,
      unread: 0,
      notifications: prev.notifications.map((item) => ({
        ...item,
        is_read: true,
      })),
    }))

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
  }

  function updateDashboardLocation({ tab, view }, { replace = false } = {}) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab) next.set("tab", tab)
        else next.delete("tab")

        if (view) next.set("view", view)
        else next.delete("view")

        return next
      },
      { replace }
    )
  }

  function handleServiceViewChange(nextView) {
    updateDashboardLocation({
      tab: "services",
      view: nextView === "menu" ? null : nextView,
    })
  }

  function switchScreen(tab) {
    if (tab === "services") {
      updateDashboardLocation({ tab: "services", view: null })
    } else {
      updateDashboardLocation({ tab, view: null })
    }

    if (tab === "notifications") {
      markNotificationsRead()
    }
  }

  useEffect(() => {
    setNotice((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    setProfileEditError("")
  }, [activeTab, serviceView, user?.id])

  // Updated purely to rely on our new isolated shopData hook
  function handleShopClick() {
    if (!shopData) {
      if (!canRegisterShop || shopLoading || shopMeta.status === "locked") {
        setNotice({
          visible: true,
          type: "warning",
          title: "Status still syncing",
          message: "We could not confirm your shop status yet. Please check your connection and try again.",
        })
        return
      }
      navigate("/shop-registration")
      return
    }

    if (shopData.is_open === false) {
      setNotice({
        visible: true,
        type: "error",
        title: "Shop access restricted",
        message: "Your shop access has been restricted. Please contact support.",
      })
      return
    }

    if (shopData.status === "pending") {
      setNotice({
        visible: true,
        type: "warning",
        title: "Application pending",
        message: "Your shop application is currently being reviewed. Please check back later.",
      })
      return
    }

    if (shopData.status === "rejected") {
      setNotice({
        visible: true,
        type: "warning",
        title: "Correction required",
        message: shopData.rejection_reason || "Please update your details and resubmit.",
      })
      navigate(`/shop-registration?id=${shopData.id}`)
      return
    }

    if (shopData.status === "approved") {
      navigate("/vendor-panel")
      return
    }

    navigate("/shop-registration")
  }

  const currentProfile = localData.profile || profile
  const dashboardDataError = activeTab === "market" && !fetchedData ? dataError : ""

  const sortedAreas = useMemo(() => {
    const areas = [...(localData.areas || [])]
    const userAreaId = currentProfile?.area_id

    return areas.sort((a, b) => {
      if (a.id === userAreaId) return -1
      if (b.id === userAreaId) return 1
      return a.name.localeCompare(b.name)
    })
  }, [localData.areas, currentProfile?.area_id])

  const featuredShops = useMemo(
    () => (localData.shops || []).filter((shop) => shop.is_featured),
    [localData.shops]
  )

  const groupedShopsByArea = useMemo(() => {
    return sortedAreas
      .map((area) => ({
        area,
        shops: (localData.shops || []).filter((shop) => shop.area_id === area.id),
      }))
      .filter((group) => group.shops.length > 0)
  }, [sortedAreas, localData.shops])

  const tickerText = useMemo(() => {
    if (!localData.announcements?.length) return ""
    return localData.announcements.map((item) => item.message).join(" • ")
  }, [localData.announcements])

  function updateSuggestions(value, mode) {
    const q = value.trim().toLowerCase()

    if (q.length < 2) {
      if (mode === "desktop") setSearchSuggestionsDesktop([])
      else setSearchSuggestionsMobile([])
      return
    }

    const suggestions = []

    ;(localData.shops || []).forEach((shop) => {
      if (shop.name?.toLowerCase().includes(q)) {
        suggestions.push({
          text: shop.name,
          type: "Shop",
          icon: "shop",
        })
      }
    })

    ;(localData.products || []).forEach((product) => {
      const productName = product.name || product.product_name || product.title
      if (productName?.toLowerCase().includes(q)) {
        suggestions.push({
          text: productName,
          type: "Product",
          icon: "product",
        })
      }
    })

    const next = suggestions.slice(0, 6)

    if (mode === "desktop") setSearchSuggestionsDesktop(next)
    else setSearchSuggestionsMobile(next)
  }

  function executeSearch(mode) {
    const value =
      mode === "desktop" ? searchInputDesktop.trim() : searchInputMobile.trim()

    if (!value) return
    navigate(`/search?q=${encodeURIComponent(value)}`)
  }

  function applySuggestion(text, mode) {
    if (mode === "desktop") {
      setSearchInputDesktop(text)
      setSearchSuggestionsDesktop([])
    } else {
      setSearchInputMobile(text)
      setSearchSuggestionsMobile([])
    }

    navigate(`/search?q=${encodeURIComponent(text)}`)
  }

  function navigateArea(id) {
    if (id === "all") return
    navigate(`/area?id=${encodeURIComponent(id)}`)
  }

  function navigateCategory(name) {
    if (name === "all") return
    navigate(`/cat?name=${encodeURIComponent(name)}`)
  }

  async function openProfileEdit() {
    const p = localData.profile
    if (!p) return

    clearGeneratedAvatarPreview()
    setProfileEditForm({
      full_name: p.full_name || "",
      phone: p.phone || "",
      city_id: p.city_id ? String(p.city_id) : "",
      area_id: p.area_id ? String(p.area_id) : "",
    })

    setAvatarBlob(null)
    setAvatarPreview(
      p.avatar_url ||
        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          p.full_name || "User"
        )}`
    )

    setProfileEditError("")
    setProfileEditOpen(true)

    const citiesRes = await supabase
      .from("cities")
      .select("id, name")
      .or(`is_open.eq.true,id.eq.${p.city_id || 0}`)
      .order("name")

    if (!citiesRes.error) {
      setProfileEditCities(citiesRes.data || [])
    }

    const areasRes = await supabase
      .from("areas")
      .select("id, name")
      .eq("city_id", p.city_id)
      .order("name")

    if (!areasRes.error) {
      setProfileEditAreas(areasRes.data || [])
    }
  }

  function cancelProfileEdit() {
    clearGeneratedAvatarPreview()
    setProfileEditOpen(false)
    setProfileEditError("")
    setAvatarBlob(null)
  }

  async function handleProfileCityChange(cityId) {
    setProfileEditForm((prev) => ({
      ...prev,
      city_id: cityId,
      area_id: "",
    }))

    if (!cityId) {
      setProfileEditAreas([])
      return
    }

    const res = await supabase
      .from("areas")
      .select("id, name")
      .eq("city_id", cityId)
      .order("name")

    if (!res.error) {
      setProfileEditAreas(res.data || [])
    }
  }

  async function onAvatarSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setProfileEditError("")
    setAvatarBlob(null)

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
      setProfileEditError("Only JPG and PNG images are supported.")
      event.target.value = ""
      return
    }

    if (file.size > MAX_SOURCE_FILE_SIZE) {
      setProfileEditError("Image is too large. Please use a file under 10MB.")
      event.target.value = ""
      return
    }

    try {
      const fallbackBlob = await buildCompressedAvatarBlobFromFile(file)

      if (!fallbackBlob) {
        setProfileEditError("Could not process this image. Please try another JPG or PNG file.")
        event.target.value = ""
        return
      }

      if (fallbackBlob.size > MAX_FILE_SIZE) {
        setProfileEditError(
          `Image is too large (${Math.round(
            fallbackBlob.size / 1024
          )}KB). Maximum allowed size is ${formatBytes(MAX_FILE_SIZE)} for JPG/PNG avatars.`
        )
        event.target.value = ""
        return
      }

      // Keep an upload-ready blob even if the user closes the crop modal.
      setAvatarBlob(fallbackBlob)
    } catch (error) {
      setProfileEditError(error.message || "Could not process this image.")
      event.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onerror = () => {
      setProfileEditError("Could not read this file. Please try another JPG or PNG image.")
      event.target.value = ""
    }
    reader.onload = (e) => {
      if (e.target?.result) {
        setAvatarPreview(e.target.result)
        setCropModalOpen(true)
      }
      event.target.value = ""
    }
    reader.readAsDataURL(file)
  }

  function closeAvatarCropModal() {
    setCropModalOpen(false)
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not process the selected image."))
            return
          }
          resolve(blob)
        },
        type,
        quality
      )
    })
  }

  async function buildCompressedAvatarBlobFromFile(file) {
    const imageUrl = URL.createObjectURL(file)

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () =>
          reject(new Error("Could not load the selected image. Please try another file."))
        img.src = imageUrl
      })

      const longestEdge = Math.max(image.naturalWidth || 0, image.naturalHeight || 0)
      if (!longestEdge) {
        throw new Error("Selected image is invalid.")
      }

      let smallestBlob = null

      for (const targetLongestEdge of AVATAR_WIDTH_STEPS) {
        const ratio = Math.min(1, targetLongestEdge / longestEdge)
        const width = Math.max(1, Math.round(image.naturalWidth * ratio))
        const height = Math.max(1, Math.round(image.naturalHeight * ratio))

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height

        const context = canvas.getContext("2d")
        if (!context) continue

        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = "high"
        context.drawImage(image, 0, 0, width, height)

        for (const quality of AVATAR_QUALITY_STEPS) {
          const nextBlob = await canvasToBlob(canvas, "image/jpeg", quality)
          if (!smallestBlob || nextBlob.size < smallestBlob.size) {
            smallestBlob = nextBlob
          }

          if (nextBlob.size <= MAX_FILE_SIZE) {
            return nextBlob
          }
        }
      }

      return smallestBlob
    } finally {
      URL.revokeObjectURL(imageUrl)
    }
  }

  function setGeneratedAvatarPreview(blob) {
    if (generatedAvatarPreviewRef.current) {
      URL.revokeObjectURL(generatedAvatarPreviewRef.current)
    }

    const previewUrl = URL.createObjectURL(blob)
    generatedAvatarPreviewRef.current = previewUrl
    setAvatarPreview(previewUrl)
  }

  function isAvatarColumnMissingError(error) {
    const message = String(error?.message || "").toLowerCase()
    const details = String(error?.details || "").toLowerCase()
    const hint = String(error?.hint || "").toLowerCase()
    return (
      (message.includes("avatar_url") && message.includes("column")) ||
      (details.includes("avatar_url") && details.includes("column")) ||
      (hint.includes("avatar_url") && hint.includes("column"))
    )
  }

  function extractAvatarStoragePath(value) {
    if (!value || typeof value !== "string") return null
    const cleaned = value.split("?")[0]

    if (!cleaned.startsWith("http")) {
      return cleaned
    }

    const match = cleaned.match(
      /\/storage\/v1\/object\/(?:public|authenticated|sign)\/avatars\/(.+)$/i
    )

    return match?.[1] || null
  }

  function formatSupabaseError(error, fallback = "Unexpected error") {
    if (!error) return fallback
    if (typeof error === "string") return error

    const message = String(error.message || "").trim()
    const details = String(error.details || "").trim()
    const hint = String(error.hint || "").trim()
    const code = String(error.code || error.statusCode || error.status || "").trim()

    const parts = [message || fallback]
    if (details) parts.push(`details: ${details}`)
    if (hint) parts.push(`hint: ${hint}`)
    if (code) parts.push(`code: ${code}`)
    return parts.join(" | ")
  }

  async function hasAvatarColumnInProfiles() {
    if (!user?.id) return false

    const probe = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .eq("id", user.id)
      .maybeSingle()

    if (probe.error) {
      if (isAvatarColumnMissingError(probe.error)) {
        return false
      }

      const fromCurrentProfile = Boolean(
        currentProfile &&
          Object.prototype.hasOwnProperty.call(currentProfile, "avatar_url")
      )

      console.warn(
        "Could not verify profiles.avatar_url explicitly; falling back to loaded profile shape.",
        probe.error
      )
      return fromCurrentProfile
    }

    return Boolean(
      probe.data &&
        Object.prototype.hasOwnProperty.call(probe.data, "avatar_url")
    )
  }

  function getAvatarUploadFailureMessage(uploadErrors) {
    const combined = uploadErrors
      .map(({ filePath, error, stage }) => {
        const label = stage ? `${stage} ${filePath}` : filePath
        return `${label}: ${formatSupabaseError(error, "Upload failed")}`
      })
      .join(" | ")

    const normalized = combined.toLowerCase()

    if (
      normalized.includes("row-level security") ||
      normalized.includes("not allowed") ||
      normalized.includes("permission denied")
    ) {
      return `Avatar upload was blocked by storage permissions (RLS). Please allow authenticated users to upload into their folder in the '${AVATAR_BUCKET}' bucket. ${combined}`
    }

    if (normalized.includes("bucket") && normalized.includes("not found")) {
      return `Avatar upload failed because the '${AVATAR_BUCKET}' bucket was not found.`
    }

    return `Could not upload avatar. ${combined}`
  }

  async function buildCompressedAvatarBlob() {
    const cropper = cropperRef.current
    if (!cropper) return null

    let smallestBlob = null

    for (const width of AVATAR_WIDTH_STEPS) {
      const canvas = cropper.getCroppedCanvas({
        width,
        height: width,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      })

      if (!canvas) continue

      for (const quality of AVATAR_QUALITY_STEPS) {
        const nextBlob = await canvasToBlob(canvas, "image/jpeg", quality)
        if (!smallestBlob || nextBlob.size < smallestBlob.size) {
          smallestBlob = nextBlob
        }

        if (nextBlob.size <= MAX_FILE_SIZE) {
          return nextBlob
        }
      }
    }

    return smallestBlob
  }

  async function applyAvatarCrop() {
    if (!cropperRef.current) return

    try {
      const blob = await buildCompressedAvatarBlob()
      if (!blob) {
        setProfileEditError("Could not process this image. Please try another JPG or PNG file.")
        return
      }

      if (blob.size > MAX_FILE_SIZE) {
        setProfileEditError(
          `Image is too large (${Math.round(
            blob.size / 1024
          )}KB). Maximum allowed size is ${formatBytes(MAX_FILE_SIZE)} for JPG/PNG avatars.`
        )
        return
      }

      setAvatarBlob(blob)
      setGeneratedAvatarPreview(blob)
      setCropModalOpen(false)
      setProfileEditError("")
    } catch (error) {
      setProfileEditError(error.message || "Could not process the selected image.")
    }
  }

  async function uploadAvatarProcess() {
    if (!avatarBlob || !user) {
      return {
        avatarUrl: localData.profile?.avatar_url || null,
        uploadedPath: null,
        oldPath: extractAvatarStoragePath(localData.profile?.avatar_url),
      }
    }

    const oldPath = extractAvatarStoragePath(localData.profile?.avatar_url)

    const timestamp = Date.now()
    const uploadPaths = [
      `${user.id}/avatar_${timestamp}.jpg`,
      `${user.id}/avatar.jpg`,
      `${user.id}_avatar_${timestamp}.jpg`,
    ]
    const uploadErrors = []

    for (const filePath of uploadPaths) {
      let uploadRes
      try {
        uploadRes = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(filePath, avatarBlob, {
            contentType: "image/jpeg",
            upsert: true,
            cacheControl: "3600",
          })
      } catch (error) {
        uploadErrors.push({
          filePath,
          stage: "upload",
          error,
        })
        continue
      }

      if (!uploadRes.error) {
        const publicUrl = supabase.storage
          .from(AVATAR_BUCKET)
          .getPublicUrl(filePath).data.publicUrl

        if (!publicUrl) {
          uploadErrors.push({
            filePath,
            stage: "url",
            error: new Error("Upload succeeded but public URL could not be generated."),
          })
          continue
        }

        return {
          avatarUrl: publicUrl,
          uploadedPath: filePath,
          oldPath,
        }
      }

      uploadErrors.push({
        filePath,
        stage: "upload",
        error: uploadRes.error,
      })
    }

    throw new Error(getAvatarUploadFailureMessage(uploadErrors))
  }

  async function saveProfile() {
    if (!user) return

    const fullName = profileEditForm.full_name.trim()
    const phone = profileEditForm.phone.trim()

    if (!fullName) {
      setProfileEditError("Full name is required.")
      return
    }

    if (!profileEditForm.city_id || !profileEditForm.area_id) {
      setProfileEditError("Please select both city and area.")
      return
    }

    try {
      setProfileSaving(true)
      setProfileEditError("")

      const avatarColumnExists = await hasAvatarColumnInProfiles()

      if (avatarBlob && !avatarColumnExists) {
        throw new Error(
          "Schema mismatch detected: profiles.avatar_url column is missing, so avatar uploads cannot be saved to profile records."
        )
      }

      const uploadResult = avatarBlob
        ? await uploadAvatarProcess()
        : {
            avatarUrl: localData.profile?.avatar_url || null,
            uploadedPath: null,
            oldPath: extractAvatarStoragePath(localData.profile?.avatar_url),
          }
      const avatarUrl = uploadResult.avatarUrl

      const updatePayload = {
        full_name: fullName,
        phone,
        city_id: parseInt(profileEditForm.city_id, 10),
        area_id: parseInt(profileEditForm.area_id, 10),
      }

      if (avatarColumnExists) {
        updatePayload.avatar_url = avatarUrl
      }

      const res = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", user.id)

      if (res.error) throw res.error

      if (
        uploadResult.oldPath &&
        uploadResult.uploadedPath &&
        uploadResult.oldPath !== uploadResult.uploadedPath
      ) {
        const cleanupRes = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([uploadResult.oldPath])

        if (cleanupRes.error) {
          console.warn("Old avatar cleanup failed:", cleanupRes.error)
        }
      }

      localStorage.removeItem("ctm_dashboard_cache")

      const refreshedProfileRes = await supabase
        .from("profiles")
        .select("*, cities(name)")
        .eq("id", user.id)
        .maybeSingle()

      const refreshedProfile =
        refreshedProfileRes.data ||
        {
          ...(localData.profile || {}),
          full_name: fullName,
          phone,
          city_id: parseInt(profileEditForm.city_id, 10),
          area_id: parseInt(profileEditForm.area_id, 10),
          avatar_url: avatarUrl,
        }

      setLocalData((prev) => ({
        ...prev,
        profile: refreshedProfile,
      }))

      setNotice({
        visible: true,
        type: "success",
        title: "Profile updated",
        message: "Your changes have been saved successfully.",
      })
      setProfileEditOpen(false)
      clearGeneratedAvatarPreview()
      setAvatarBlob(null)
      
    } catch (err) {
      const message = formatSupabaseError(err, "Error updating profile.")
      console.error("Profile save failed:", err)
      setProfileEditError(message)
      setNotice({
        visible: true,
        type: "error",
        title: "Profile update failed",
        message,
      })
    } finally {
      setProfileSaving(false)
    }
  }

  if (authLoading || (dataLoading && !fetchedData)) {
    return <DashboardShimmer label="Loading marketplace..." />
  }

  return (
    <div className="bg-[#E3E6E6] text-[#0F1111]">
      <DashboardHeader
        activeTab={activeTab}
        currentProfile={currentProfile}
        user={user}
        sortedAreas={sortedAreas}
        categories={localData.categories}
        searchArea="all"
        setSearchArea={navigateArea}
        categoryFilter="all"
        setCategoryFilter={navigateCategory}
        tickerText={tickerText}
        searchInputDesktop={searchInputDesktop}
        setSearchInputDesktop={setSearchInputDesktop}
        searchInputMobile={searchInputMobile}
        setSearchInputMobile={setSearchInputMobile}
        searchSuggestionsDesktop={searchSuggestionsDesktop}
        searchSuggestionsMobile={searchSuggestionsMobile}
        updateSuggestions={updateSuggestions}
        executeSearch={executeSearch}
        applySuggestion={applySuggestion}
        switchScreen={switchScreen}
        unread={localData.unread}
        onShopIndex={() => navigate("/shop-index")}
        onLogoClick={() => switchScreen("market")}
      />

      <main className="content-body mx-auto w-full max-w-[1600px] pb-10">
        <AuthNotification
          visible={Boolean(dashboardDataError || notice.visible)}
          type={dashboardDataError ? "error" : notice.type}
          title={dashboardDataError ? "Session Issue" : notice.title}
          message={dashboardDataError || notice.message}
        />
        {activeTab === "market" && (
          <MarketSection
            dashboardData={localData}
            featuredShops={featuredShops}
            groupedShopsByArea={groupedShopsByArea}
            navigateCategory={navigateCategory}
            loading={dataLoading} 
            error={dataError} 
          />
        )}

        {activeTab === "services" && (
          <ServicesProfileSection
            mode="services"
            serviceView={serviceView}
            setServiceView={handleServiceViewChange}
            user={user}
            currentProfile={currentProfile}
            profileEditOpen={profileEditOpen}
            openProfileEdit={openProfileEdit}
            cancelProfileEdit={cancelProfileEdit}
            handleLogout={handleLogout}
            handleShopClick={handleShopClick}
            shopCardMeta={shopMeta} /* PASSED THE ISOLATED META HERE */
            wishlistCount={localData.wishlistCount}
            onNavigate={navigate}
            profileEditForm={profileEditForm}
            setProfileEditForm={setProfileEditForm}
            profileEditCities={profileEditCities}
            profileEditAreas={profileEditAreas}
            profileEditError={profileEditError}
            profileSaving={profileSaving}
            handleProfileCityChange={handleProfileCityChange}
            saveProfile={saveProfile}
            fileInputRef={fileInputRef}
            avatarPreview={avatarPreview}
            onAvatarSelect={onAvatarSelect}
            cropModalOpen={cropModalOpen}
            cropImageRef={cropImageRef}
            closeAvatarCropModal={closeAvatarCropModal}
            applyAvatarCrop={applyAvatarCrop}
          />
        )}

        {activeTab === "profile" && (
          <ServicesProfileSection
            mode="profile"
            serviceView={serviceView}
            setServiceView={handleServiceViewChange}
            user={user}
            currentProfile={currentProfile}
            profileEditOpen={profileEditOpen}
            openProfileEdit={openProfileEdit}
            cancelProfileEdit={cancelProfileEdit}
            handleLogout={handleLogout}
            handleShopClick={handleShopClick}
            shopCardMeta={shopMeta} /* PASSED THE ISOLATED META HERE */
            wishlistCount={localData.wishlistCount}
            onNavigate={navigate}
            profileEditForm={profileEditForm}
            setProfileEditForm={setProfileEditForm}
            profileEditCities={profileEditCities}
            profileEditAreas={profileEditAreas}
            profileEditError={profileEditError}
            profileSaving={profileSaving}
            handleProfileCityChange={handleProfileCityChange}
            saveProfile={saveProfile}
            fileInputRef={fileInputRef}
            avatarPreview={avatarPreview}
            onAvatarSelect={onAvatarSelect}
            cropModalOpen={cropModalOpen}
            cropImageRef={cropImageRef}
            closeAvatarCropModal={closeAvatarCropModal}
            applyAvatarCrop={applyAvatarCrop}
          />
        )}

        {activeTab === "notifications" && (
          <NotificationsSection notifications={localData.notifications} />
        )}
      </main>
    </div>
  )
}

export default UserDashboard
