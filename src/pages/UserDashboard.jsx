import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowDownAZ,
  FaBell,
  FaBriefcase,
  FaBuilding,
  FaCamera,
  FaChevronRight,
  FaCircleExclamation,
  FaCircleNotch,
  FaCircleQuestion,
  FaCropSimple,
  FaHeart,
  FaHeadset,
  FaHouse,
  FaImage,
  FaLayerGroup,
  FaLocationDot,
  FaLock,
  FaMagnifyingGlass,
  FaRightFromBracket,
  FaStore,
  FaTableCellsLarge,
  FaTriangleExclamation,
} from "react-icons/fa6"
import Cropper from "cropperjs"
import "cropperjs/dist/cropper.css"
import MainLayout from "../layouts/MainLayout"
import AuthNotification from "../components/auth/AuthNotification"
import CompleteProfileModal from "../components/auth/CompleteProfileModal"
import useAuthSession from "../hooks/useAuthSession"
import { fetchProfileByUserId, signOutUser } from "../lib/auth"
import { supabase } from "../lib/supabase"

const MAX_FILE_SIZE = 500000
const INACTIVITY_LIMIT = 15 * 60 * 1000

function UserDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { loading, user, profile, profileComplete, suspended, error } =
    useAuthSession()

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "market")
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState("")
  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [profileModalOpen, setProfileModalOpen] = useState(false)

  const [dashboardData, setDashboardData] = useState({
    profile: null,
    promos: [],
    announcements: [],
    categories: [],
    areas: [],
    shops: [],
    products: [],
    notifications: [],
    myShop: null,
    wishlistCount: 0,
    unread: 0,
  })

  const [searchInputDesktop, setSearchInputDesktop] = useState("")
  const [searchInputMobile, setSearchInputMobile] = useState("")
  const [searchSuggestionsDesktop, setSearchSuggestionsDesktop] = useState([])
  const [searchSuggestionsMobile, setSearchSuggestionsMobile] = useState([])
  const [searchArea, setSearchArea] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")

  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [profileEditForm, setProfileEditForm] = useState({
    full_name: "",
    phone: "",
    city_id: "",
    area_id: "",
  })
  const [profileEditAreas, setProfileEditAreas] = useState([])
  const [profileEditError, setProfileEditError] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)

  const [avatarBlob, setAvatarBlob] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState("")
  const [cropModalOpen, setCropModalOpen] = useState(false)

  const cropImageRef = useRef(null)
  const cropperRef = useRef(null)
  const inactivityTimerRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab) setActiveTab(tab)
  }, [searchParams])

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("tab", activeTab)
      return next
    })
  }, [activeTab, setSearchParams])

  useEffect(() => {
    if (loading) return

    if (!user) {
      navigate("/", { replace: true })
      return
    }

    if (suspended) {
      setDashboardLoading(false)
      setNotice({
        visible: true,
        type: "error",
        title: "Account restricted",
        message: "Your account has been restricted. Please contact support.",
      })
      return
    }

    if (!profile || !profileComplete) {
      setProfileModalOpen(true)
      setDashboardLoading(false)
      return
    }

    resetInactivityTimer()
    const events = ["mousemove", "keydown", "scroll", "click", "touchstart"]
    events.forEach((name) =>
      document.addEventListener(name, resetInactivityTimer, { passive: true })
    )

    loadDashboard()

    return () => {
      events.forEach((name) =>
        document.removeEventListener(name, resetInactivityTimer)
      )
      clearTimeout(inactivityTimerRef.current)
    }
  }, [loading, user, profile, profileComplete, suspended])

  useEffect(() => {
    if (!cropModalOpen || !cropImageRef.current) return

    if (cropperRef.current) {
      cropperRef.current.destroy()
    }

    cropperRef.current = new Cropper(cropImageRef.current, {
      aspectRatio: 1,
      viewMode: 2,
      background: false,
      autoCropArea: 1,
      responsive: true,
    })

    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy()
        cropperRef.current = null
      }
    }
  }, [cropModalOpen])

  function resetInactivityTimer() {
    clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(async () => {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("ctm_")) localStorage.removeItem(key)
      })
      await signOutUser()
      navigate("/", { replace: true })
    }, INACTIVITY_LIMIT)
  }

  async function loadDashboard() {
    if (!user) return

    try {
      setDashboardLoading(true)
      setDashboardError("")

      const profileRes = await supabase
        .from("profiles")
        .select("*, cities(name)")
        .eq("id", user.id)
        .maybeSingle()

      if (profileRes.error) throw profileRes.error

      if (!profileRes.data || !profileRes.data.city_id) {
        await signOutUser()
        navigate("/", { replace: true })
        return
      }

      if (profileRes.data.is_suspended === true) {
        await signOutUser()
        navigate("/", { replace: true })
        return
      }

      const cityId = profileRes.data.city_id

      const [
        promosRes,
        announcementsRes,
        categoriesRes,
        areasRes,
        shopsRes,
        notificationsRes,
        myShopRes,
        wishlistRes,
      ] = await Promise.all([
        supabase
          .from("promo_banners")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("announcements")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("categories").select("*").order("name"),
        supabase.from("areas").select("*").eq("city_id", cityId).order("name"),
        supabase
          .from("shops")
          .select("*")
          .eq("city_id", cityId)
          .order("is_verified", { ascending: false })
          .order("id", { ascending: true }),
        supabase
          .from("notifications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("shops")
          .select("id, status, rejection_reason, is_open")
          .eq("owner_id", user.id)
          .maybeSingle(),
        supabase
          .from("wishlist")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
      ])

      if (promosRes.error) throw promosRes.error
      if (announcementsRes.error) throw announcementsRes.error
      if (categoriesRes.error) throw categoriesRes.error
      if (areasRes.error) throw areasRes.error
      if (shopsRes.error) throw shopsRes.error
      if (notificationsRes.error) throw notificationsRes.error
      if (myShopRes.error) throw myShopRes.error
      if (wishlistRes.error) throw wishlistRes.error

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

        if (productsRes.error) throw productsRes.error
        products = productsRes.data || []
      }

      setDashboardData({
        profile: profileRes.data,
        promos: promosRes.data || [],
        announcements: announcementsRes.data || [],
        categories: categoriesRes.data || [],
        areas: areasRes.data || [],
        shops: shopsRes.data || [],
        products,
        notifications: notificationsRes.data || [],
        myShop: myShopRes.data || null,
        wishlistCount: wishlistRes.count || 0,
        unread: (notificationsRes.data || []).filter((item) => !item.is_read)
          .length,
      })
    } catch (err) {
      setDashboardError(
        err.message || "Could not load dashboard data. Please refresh."
      )
    } finally {
      setDashboardLoading(false)
    }
  }

  async function handleProfileCompleted() {
    try {
      if (!user) return

      const freshProfile = await fetchProfileByUserId(user.id)
      if (!freshProfile?.city_id || !freshProfile?.area_id) {
        throw new Error("Profile completion could not be verified.")
      }

      setProfileModalOpen(false)
      setNotice({
        visible: true,
        type: "success",
        title: "Profile completed",
        message: "Your dashboard is now ready.",
      })
      await loadDashboard()
    } catch (err) {
      setNotice({
        visible: true,
        type: "error",
        title: "Setup verification failed",
        message: err.message || "Please try again.",
      })
    }
  }

  async function handleProfileModalClose() {
    setProfileModalOpen(false)
    await signOutUser()
    navigate("/", { replace: true })
  }

  async function handleLogout() {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("ctm_")) localStorage.removeItem(key)
    })
    await signOutUser()
    navigate("/", { replace: true })
  }

  async function markNotificationsRead() {
    if (!user || dashboardData.unread === 0) return

    setDashboardData((prev) => ({
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

  function switchScreen(tab) {
    setActiveTab(tab)
    if (tab === "notifications") {
      markNotificationsRead()
    }
  }

  function handleShopClick() {
    const shop = dashboardData.myShop

    if (!shop) {
      navigate("/shop-registration")
      return
    }

    if (shop.is_open === false) {
      setNotice({
        visible: true,
        type: "error",
        title: "Shop access restricted",
        message:
          "Your shop access has been restricted. Please contact support.",
      })
      return
    }

    if (shop.status === "pending") {
      setNotice({
        visible: true,
        type: "warning",
        title: "Application pending",
        message:
          "Your shop application is currently being reviewed. Please check back later.",
      })
      return
    }

    if (shop.status === "rejected") {
      setNotice({
        visible: true,
        type: "warning",
        title: "Correction required",
        message:
          shop.rejection_reason || "Please update your details and resubmit.",
      })
      navigate(`/shop-registration?id=${shop.id}`)
      return
    }

    if (shop.status === "approved") {
      navigate("/merchant-dashboard")
      return
    }

    navigate("/shop-registration")
  }

  const currentProfile = dashboardData.profile
  const sortedAreas = useMemo(() => {
    const areas = [...(dashboardData.areas || [])]
    const userAreaId = dashboardData.profile?.area_id

    return areas.sort((a, b) => {
      if (a.id === userAreaId) return -1
      if (b.id === userAreaId) return 1
      return a.name.localeCompare(b.name)
    })
  }, [dashboardData.areas, dashboardData.profile?.area_id])

  const filteredShops = useMemo(() => {
    let shops = [...(dashboardData.shops || [])]

    if (searchArea !== "all") {
      shops = shops.filter((shop) => String(shop.area_id) === String(searchArea))
    }

    if (categoryFilter !== "all") {
      shops = shops.filter((shop) => shop.category === categoryFilter)
    }

    return shops
  }, [dashboardData.shops, searchArea, categoryFilter])

  const featuredShops = useMemo(
    () => filteredShops.filter((shop) => shop.is_featured),
    [filteredShops]
  )

  const groupedShopsByArea = useMemo(() => {
    return sortedAreas
      .map((area) => ({
        area,
        shops: filteredShops.filter((shop) => shop.area_id === area.id),
      }))
      .filter((group) => group.shops.length > 0)
  }, [sortedAreas, filteredShops])

  const tickerText = useMemo(() => {
    if (!dashboardData.announcements?.length) return ""
    return dashboardData.announcements.map((item) => item.message).join(" • ")
  }, [dashboardData.announcements])

  const shopCardMeta = useMemo(() => {
    const shop = dashboardData.myShop

    if (!shop) return { title: "Register Shop", icon: <FaStore /> }
    if (shop.is_open === false) return { title: "Locked", icon: <FaLock /> }
    if (shop.status === "pending") {
      return {
        title: "Pending",
        icon: <FaCircleNotch className="animate-spin" />,
      }
    }
    if (shop.status === "rejected") {
      return { title: "Rejected", icon: <FaCircleExclamation /> }
    }
    return { title: "My Shop", icon: <FaStore /> }
  }, [dashboardData.myShop])

  function updateSuggestions(value, mode) {
    const q = value.trim().toLowerCase()
    if (q.length < 2) {
      if (mode === "desktop") setSearchSuggestionsDesktop([])
      else setSearchSuggestionsMobile([])
      return
    }

    const suggestions = []

    ;(dashboardData.shops || []).forEach((shop) => {
      if (shop.name?.toLowerCase().includes(q)) {
        suggestions.push({
          text: shop.name,
          type: "Shop",
          icon: <FaStore />,
        })
      }
    })

    ;(dashboardData.products || []).forEach((product) => {
      const productName = product.name || product.product_name || product.title
      if (productName?.toLowerCase().includes(q)) {
        suggestions.push({
          text: productName,
          type: "Product",
          icon: <FaStore />,
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

  function navigateCategory(name) {
    if (name === "all") return
    navigate(`/cat?name=${encodeURIComponent(name)}`)
  }

  function openProfileEdit() {
    const p = dashboardData.profile
    if (!p) return

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

    setProfileEditAreas(dashboardData.areas || [])
    setProfileEditError("")
    setProfileEditOpen(true)
  }

  function cancelProfileEdit() {
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

  function onAvatarSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setProfileEditError("Please upload a valid image file.")
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      if (e.target?.result) {
        setAvatarPreview(e.target.result)
        setCropModalOpen(true)
      }
    }
    reader.readAsDataURL(file)
  }

  function closeAvatarCropModal() {
    setCropModalOpen(false)
  }

  function applyAvatarCrop() {
    if (!cropperRef.current) return

    cropperRef.current
      .getCroppedCanvas({
        width: 600,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high",
      })
      .toBlob(
        (blob) => {
          if (!blob) return
          if (blob.size > MAX_FILE_SIZE) {
            setProfileEditError(
              `Image is too large (${Math.round(
                blob.size / 1024
              )}KB). Maximum allowed size is 500KB.`
            )
            return
          }

          setAvatarBlob(blob)
          setAvatarPreview(URL.createObjectURL(blob))
          setCropModalOpen(false)
        },
        "image/jpeg",
        0.85
      )
  }

  async function uploadAvatarProcess() {
    if (!avatarBlob || !user) return dashboardData.profile?.avatar_url || null

    const oldUrl = dashboardData.profile?.avatar_url

    if (oldUrl && oldUrl.includes("/avatars/")) {
      try {
        const match = oldUrl.match(/(?:public|authenticated)\/avatars\/(.+)/)
        if (match?.[1]) {
          await supabase.storage
            .from("avatars")
            .remove([match[1].split("?")[0]])
        }
      } catch {
        // ignore cleanup failure
      }
    }

    const fileName = `${user.id}_${Date.now()}.jpg`
    const uploadRes = await supabase.storage
      .from("avatars")
      .upload(fileName, avatarBlob, {
        contentType: "image/jpeg",
        upsert: false,
      })

    if (uploadRes.error) throw uploadRes.error
    return supabase.storage.from("avatars").getPublicUrl(fileName).data.publicUrl
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

      const avatarUrl = await uploadAvatarProcess()

      const res = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          city_id: parseInt(profileEditForm.city_id, 10),
          area_id: parseInt(profileEditForm.area_id, 10),
          avatar_url: avatarUrl,
        })
        .eq("id", user.id)

      if (res.error) throw res.error

      await loadDashboard()
      setProfileEditOpen(false)
      setNotice({
        visible: true,
        type: "success",
        title: "Profile updated",
        message: "Your profile changes have been saved.",
      })
    } catch (err) {
      setProfileEditError(err.message || "Error updating profile.")
    } finally {
      setProfileSaving(false)
    }
  }

  function buildShopCard(shop) {
    const products = (dashboardData.products || [])
      .filter(
        (item) =>
          item.shop_id === shop.id &&
          item.image_url &&
          item.condition !== "Fairly Used"
      )
      .slice(0, 4)

    const cells = Array.from({ length: 4 }).map((_, index) => {
      const item = products[index]

      if (!item) {
        return (
          <div key={`empty-${index}`} className="shop-grid-item-wrap">
            <div className="shop-grid-item empty">
              <FaImage className="text-[1.2rem] text-slate-300" />
            </div>
            <div className="shop-grid-caption select-none text-transparent">
              <div className="sg-name">-</div>
              <div className="sg-price">-</div>
            </div>
          </div>
        )
      }

      const name = item.name || item.product_name || item.title || "Product"
      const price = item.price || item.product_price
      const discount = item.discount_price
      const discounted = discount && price && discount < price
      const discountPct =
        discounted && price ? Math.round(((price - discount) / price) * 100) : 0

      return (
        <div key={`${shop.id}-${item.id}-${index}`} className="shop-grid-item-wrap">
          <div className="shop-grid-item">
            <img src={item.image_url} alt={name} loading="lazy" />
            {discounted ? (
              <div className="grid-badge flash-offer">-{discountPct}%</div>
            ) : null}
          </div>
          <div className="shop-grid-caption">
            <div className="sg-name" title={name}>
              {name}
            </div>
            <div className={discounted ? "sg-price flash-price" : "sg-price"}>
              {discounted ? (
                <>
                  <span className="sg-price-old">₦{Number(price).toLocaleString()}</span>
                  ₦{Number(discount).toLocaleString()}
                </>
              ) : price ? (
                <>₦{Number(price).toLocaleString()}</>
              ) : (
                ""
              )}
            </div>
          </div>
        </div>
      )
    })

    return (
      <div key={shop.id} className="premium-shop-card-wrap">
        <div
          className="premium-shop-card"
          onClick={() => navigate(`/shop-detail?id=${shop.id}`)}
        >
          <div className="shop-card-title">{shop.name}</div>
          <div className="shop-image-grid">{cells}</div>
          <div className="shop-cta">
            Visit shop <FaChevronRight className="ml-1 text-[0.75rem]" />
          </div>
        </div>
      </div>
    )
  }

  if (loading || dashboardLoading || !dashboardData.profile) {
    return (
      <MainLayout>
        <section className="min-h-screen bg-[#E3E6E6] px-4 py-8">
          <div className="mx-auto max-w-[1600px]">
            <div className="bg-white px-4 py-16 text-center">
              <FaCircleNotch className="mx-auto animate-spin text-[2.5rem] text-pink-600" />
              <p className="mt-4 text-sm font-bold text-[#565959]">
                Loading marketplace...
              </p>
            </div>
          </div>
        </section>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="bg-[#E3E6E6] text-[#0F1111]">
        <header className="amz-header sticky top-0 z-[1000] flex flex-col bg-[#131921] text-white">
          <div className="amz-mobile-scroll-row mx-auto flex w-full max-w-[1600px] items-center gap-4 px-4 py-[10px] max-[1024px]:justify-between max-[1024px]:gap-2 max-[1024px]:px-3 max-[1024px]:py-2">
            <img
              src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/CT-Merchant.jpg"
              className="amz-logo h-[38px] cursor-pointer rounded object-contain"
              alt="Logo"
              onClick={() => window.location.reload()}
            />

            <div className="amz-location mobile-hide hidden items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white min-[1025px]:flex">
              <FaLocationDot />
              <span>{currentProfile?.cities?.name || "..."}</span>
            </div>

            <div className="desktop-search-wrap mobile-hide relative mx-4 hidden flex-1 min-[1025px]:block">
              <div className="amz-search-block flex h-[42px] w-full overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
                <select
                  className="amz-search-select max-w-[140px] cursor-pointer border-none border-r border-r-[#CDD2D3] bg-[#F3F4F6] px-3 text-[0.85rem] font-semibold text-[#555] outline-none hover:bg-[#DADADA] hover:text-[#0F1111]"
                  value={searchArea}
                  onChange={(e) => setSearchArea(e.target.value)}
                >
                  <option value="all">All Areas</option>
                  {sortedAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>

                <input
                  className="amz-search-input min-w-0 flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
                  placeholder="Search shops and products..."
                  value={searchInputDesktop}
                  onChange={(e) => {
                    setSearchInputDesktop(e.target.value)
                    updateSuggestions(e.target.value, "desktop")
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") executeSearch("desktop")
                  }}
                />

                <button
                  className="amz-search-btn flex w-[52px] items-center justify-center border-none bg-pink-600 text-[1.2rem] text-white transition hover:bg-pink-700"
                  onClick={() => executeSearch("desktop")}
                >
                  <FaMagnifyingGlass />
                </button>
              </div>

              {searchSuggestionsDesktop.length > 0 ? (
                <div className="search-suggestions absolute left-0 right-0 top-[calc(100%+4px)] z-[2000] flex flex-col overflow-hidden rounded-lg border border-[#D5D9D9] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
                  {searchSuggestionsDesktop.map((item, idx) => (
                    <div
                      key={`${item.text}-${idx}`}
                      className="suggestion-item flex cursor-pointer items-center gap-3 border-b border-b-[#F3F4F6] px-4 py-3 text-[0.95rem] text-[#0F1111] transition last:border-b-0 hover:bg-[#F7F7F7]"
                      onClick={() => applySuggestion(item.text, "desktop")}
                    >
                      <span className="sugg-icon w-5 text-center text-base text-[#888C8C]">
                        {item.icon}
                      </span>
                      <span className="sugg-text flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                        {item.text}
                      </span>
                      <span className="sugg-type rounded bg-pink-100 px-[6px] py-[2px] text-[0.7rem] font-bold text-pink-600">
                        {item.type}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              className={`amz-nav-item ${
                activeTab === "market" ? "active" : ""
              } flex cursor-pointer items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white`}
              onClick={() => switchScreen("market")}
              title="Repository"
            >
              <FaHouse className="text-[1.1rem]" />
              <span className="mobile-hide hidden min-[1025px]:inline">Repository</span>
            </div>

            <div
              className={`amz-nav-item ${
                activeTab === "services" ? "active" : ""
              } flex cursor-pointer items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white`}
              onClick={() => switchScreen("services")}
              title="Dashboard"
            >
              <FaTableCellsLarge className="text-[1.1rem]" />
              <span className="mobile-hide hidden min-[1025px]:inline">Dashboard</span>
            </div>

            <div
              className="amz-nav-item relative flex cursor-pointer items-center gap-[6px] rounded border border-transparent px-3 py-2 text-[0.95rem] font-bold text-white transition hover:border-white"
              onClick={() => switchScreen("notifications")}
            >
              <FaBell className="text-[1.2rem]" />
              <span className="mobile-hide ml-[6px] hidden min-[1025px]:inline">
                Alerts
              </span>
              {dashboardData.unread > 0 ? (
                <span className="notif-badge absolute -right-[6px] -top-[2px] block rounded-[10px] border-2 border-[#131921] bg-[#EF4444] px-[6px] py-[2px] text-[0.65rem] font-extrabold text-white">
                  {dashboardData.unread > 9 ? "9+" : dashboardData.unread}
                </span>
              ) : null}
            </div>

            <div
              className="amz-nav-item flex cursor-pointer items-center rounded border border-transparent px-2 py-1 text-white transition hover:border-white"
              onClick={() => switchScreen("profile")}
            >
              <img
                src={
                  currentProfile?.avatar_url ||
                  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                    currentProfile?.full_name || user.email || "User"
                  )}`
                }
                className="header-avatar ml-1 h-[34px] w-[34px] rounded-full bg-white object-cover"
                alt="Avatar"
              />
            </div>

            <div
              className="amz-nav-item flex cursor-pointer items-center rounded border border-transparent px-2 py-1 text-white transition hover:border-white"
              onClick={() => navigate("/shop-index")}
              title="Shop Index"
            >
              <FaArrowDownAZ className="text-[1.1rem]" />
            </div>
          </div>

          <div className="mobile-search-wrap relative mx-4 mb-[10px] block w-[calc(100%-32px)] min-[1025px]:hidden">
            <div className="amz-search-block flex h-[42px] w-full overflow-hidden rounded-md border-[3px] border-transparent bg-white transition focus-within:border-pink-600">
              <select
                className="amz-search-select max-w-[100px] cursor-pointer border-none border-r border-r-[#CDD2D3] bg-[#F3F4F6] px-2 text-[0.85rem] font-semibold text-[#555] outline-none"
                value={searchArea}
                onChange={(e) => setSearchArea(e.target.value)}
              >
                <option value="all">All Areas</option>
                {sortedAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>

              <input
                className="amz-search-input min-w-0 flex-1 border-none px-4 text-base text-[#0F1111] outline-none"
                placeholder="Search CTMerchant..."
                value={searchInputMobile}
                onChange={(e) => {
                  setSearchInputMobile(e.target.value)
                  updateSuggestions(e.target.value, "mobile")
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") executeSearch("mobile")
                }}
              />

              <button
                className="amz-search-btn flex w-[52px] items-center justify-center border-none bg-pink-600 text-[1.2rem] text-white transition hover:bg-pink-700"
                onClick={() => executeSearch("mobile")}
              >
                <FaMagnifyingGlass />
              </button>
            </div>

            {searchSuggestionsMobile.length > 0 ? (
              <div className="search-suggestions absolute left-0 right-0 top-[calc(100%+4px)] z-[2000] flex flex-col overflow-hidden rounded-lg border border-[#D5D9D9] bg-white shadow-[0_10px_25px_rgba(0,0,0,0.2)]">
                {searchSuggestionsMobile.map((item, idx) => (
                  <div
                    key={`${item.text}-${idx}`}
                    className="suggestion-item flex cursor-pointer items-center gap-3 border-b border-b-[#F3F4F6] px-4 py-3 text-[0.95rem] text-[#0F1111] transition last:border-b-0 hover:bg-[#F7F7F7]"
                    onClick={() => applySuggestion(item.text, "mobile")}
                  >
                    <span className="sugg-icon w-5 text-center text-base text-[#888C8C]">
                      {item.icon}
                    </span>
                    <span className="sugg-text flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                      {item.text}
                    </span>
                    <span className="sugg-type rounded bg-pink-100 px-[6px] py-[2px] text-[0.7rem] font-bold text-pink-600">
                      {item.type}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="amz-sub-header flex items-center bg-[#232F3E] px-4 py-2 text-[0.9rem] font-semibold text-white">
            <select
              className="amz-category-filter mr-3 max-w-[130px] cursor-pointer rounded border border-white/40 bg-transparent px-2 py-1 text-[0.85rem] font-semibold text-white outline-none hover:border-white"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {(dashboardData.categories || []).map((category) => (
                <option key={category.id || category.name} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>

            {tickerText ? (
              <div className="ticker-wrapper relative flex flex-1 items-center gap-3 overflow-hidden">
                <div
                  className="ticker-content whitespace-nowrap pl-[100%] text-white"
                  style={{
                    animation: `ticker ${Math.max(40, tickerText.length * 0.4)}s linear infinite`,
                  }}
                >
                  {tickerText}
                </div>
              </div>
            ) : null}
          </div>
        </header>

        <main className="content-body mx-auto w-full max-w-[1600px] pb-10">
          <AuthNotification
            visible={Boolean(error || dashboardError || notice.visible)}
            type={dashboardError || error ? "error" : notice.type}
            title={dashboardError || error ? "Dashboard issue" : notice.title}
            message={
              dashboardError || error
                ? dashboardError || error
                : notice.message
            }
          />

          {activeTab === "market" ? (
            <div className="screen active">
              {dashboardData.promos?.length > 0 ? (
                <PromoSlider promos={dashboardData.promos} />
              ) : null}

              {featuredShops.length > 0 ? (
                <div className="area-block-wrap mb-2 bg-white pt-4">
                  <h2 className="sec-title mb-3 flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 text-[1.35rem] font-extrabold text-[#0F1111]">
                    Featured Shops{" "}
                    <span className="text-[0.85em] font-bold text-pink-600">
                      (Top Rated)
                    </span>
                  </h2>
                  <div className="h-scroll flex gap-4 overflow-x-auto px-4 pb-5 pt-1">
                    {featuredShops.map((shop) => buildShopCard(shop))}
                  </div>
                </div>
              ) : null}

              {groupedShopsByArea.map(({ area, shops }) => (
                <div key={area.id} className="area-block-wrap mb-2 bg-white pt-4">
                  <h2 className="sec-title mb-3 flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 text-[1.35rem] font-extrabold text-[#0F1111]">
                    {area.id === dashboardData.profile?.area_id ? (
                      <>
                        Top stores in {area.name}{" "}
                        <span className="text-[0.85em] font-bold text-pink-600">
                          (Near You)
                        </span>
                      </>
                    ) : (
                      <>Explore stores in {area.name}</>
                    )}
                  </h2>

                  <div className="h-scroll flex gap-4 overflow-x-auto px-4 pb-5 pt-1">
                    {shops.map((shop) => buildShopCard(shop))}
                  </div>
                </div>
              ))}

              {(dashboardData.categories || []).length > 0 ? (
                <div className="cat-section-wrap mb-2 bg-white pt-4">
                  <h2 className="sec-title mb-3 flex items-center gap-[10px] overflow-x-auto whitespace-nowrap px-4 text-[1.35rem] font-extrabold text-[#0F1111]">
                    Browse Categories
                  </h2>
                  <div className="cat-grid flex flex-wrap gap-3 px-4 pb-6">
                    {(dashboardData.categories || []).map((category) => {
                      const matchingShopIds = (dashboardData.shops || [])
                        .filter((shop) => shop.category === category.name)
                        .map((shop) => shop.id)

                      const previewProduct = (dashboardData.products || []).find(
                        (product) =>
                          matchingShopIds.includes(product.shop_id) &&
                          product.image_url
                      )

                      const imageUrl =
                        previewProduct?.image_url ||
                        `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                          category.name
                        )}`

                      return (
                        <div
                          key={category.id || category.name}
                          className="cat-chip flex cursor-pointer items-center gap-[10px] rounded-[50px] border border-[#D5D9D9] bg-white px-4 py-[6px] pl-[6px] transition hover:-translate-y-[2px] hover:border-pink-600 hover:bg-[#F7F7F7]"
                          onClick={() => navigateCategory(category.name)}
                        >
                          <img
                            src={imageUrl}
                            alt={category.name}
                            className="h-8 w-8 rounded-full border border-[#E5E7EB] object-cover"
                          />
                          <span className="text-[0.85rem] font-bold text-[#0F1111]">
                            {category.name}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "services" ? (
            <div className="screen active">
              <div className="tool-block-wrap bg-white px-4 py-6">
                <h2 className="sec-title mb-5 flex items-center gap-[10px] p-0 text-[1.35rem] font-extrabold text-[#0F1111]">
                  Dashboard
                </h2>

                <div className="svc-grid grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
                  <SvcCard
                    icon={shopCardMeta.icon}
                    title={shopCardMeta.title}
                    onClick={handleShopClick}
                  />
                  <SvcCard
                    icon={<FaHeart style={{ color: "#db2777" }} />}
                    title="Wishlist"
                    subtitle={`${dashboardData.wishlistCount || 0} items`}
                    onClick={() => navigate("/wishlist")}
                  />
                  <SvcCard
                    icon={<FaHeadset style={{ color: "#007185" }} />}
                    title="Support"
                    onClick={() => navigate("/contact")}
                  />
                  <SvcCard
                    icon={<FaCircleQuestion style={{ color: "#007185" }} />}
                    title="FAQ"
                    onClick={() => navigate("/faq")}
                  />
                  <SvcCard
                    icon={<FaTriangleExclamation style={{ color: "#C40000" }} />}
                    title="Report Abuse"
                    onClick={() => navigate("/report-abuse")}
                  />
                  <SvcCard
                    icon={<FaBriefcase style={{ color: "#007185" }} />}
                    title="Careers"
                    onClick={() => navigate("/careers?src=dash")}
                  />
                  <SvcCard
                    icon={<FaBuilding style={{ color: "#007185" }} />}
                    title="About Us"
                    onClick={() => navigate("/about?src=dash")}
                  />
                  <SvcCard
                    icon={<FaLayerGroup style={{ color: "#007185" }} />}
                    title="Our Services"
                    onClick={() => navigate("/services?src=dash")}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "profile" ? (
            <div className="screen active">
              {!profileEditOpen ? (
                <div className="mx-auto my-5 max-w-[600px] rounded-lg border border-[#D5D9D9] bg-white p-10 text-center">
                  <img
                    src={
                      currentProfile?.avatar_url ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                        currentProfile?.full_name || "User"
                      )}`
                    }
                    alt="Avatar"
                    className="mx-auto mb-4 h-[120px] w-[120px] rounded-full border-2 border-[#D5D9D9] object-cover"
                  />
                  <h2 className="mb-2 text-[1.8rem] font-extrabold text-[#0F1111]">
                    {currentProfile?.full_name || "Loading..."}
                  </h2>
                  <p className="mb-1 font-medium text-[#565959]">
                    {currentProfile?.phone || ""}
                  </p>
                  <p className="mb-6 text-[0.95rem] text-[#565959]">{user.email}</p>
                  <div className="flex justify-center gap-3">
                    <button className="btn-brand" onClick={openProfileEdit}>
                      Edit Profile
                    </button>
                    <button className="btn-brand-alt" onClick={handleLogout}>
                      Sign Out
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto my-5 max-w-[600px] rounded-lg border border-[#D5D9D9] bg-white p-[30px]">
                  <h3 className="mb-6 text-[1.4rem] font-extrabold">
                    Edit Profile
                  </h3>

                  <div className="mb-6 text-center">
                    <div
                      className="avatar-edit-box relative mx-auto h-[110px] w-[110px] cursor-pointer overflow-hidden rounded-full border-2 border-[#D5D9D9]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <img
                        src={avatarPreview}
                        alt="Avatar Preview"
                        className="h-full w-full object-cover"
                      />
                      <div className="avatar-overlay absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition hover:opacity-100">
                        <FaCamera className="text-2xl" />
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={onAvatarSelect}
                    />

                    <p className="mt-2 text-[0.8rem] font-semibold text-[#565959]">
                      Tap photo to update (Max 500KB)
                    </p>
                  </div>

                  <div className="form-group mb-4 text-left">
                    <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                      Full Name
                    </label>
                    <input
                      className="form-input w-full rounded border border-[#888C8C] px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                      value={profileEditForm.full_name}
                      onChange={(e) =>
                        setProfileEditForm((prev) => ({
                          ...prev,
                          full_name: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="form-group mb-4 text-left">
                    <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                      Phone Number
                    </label>
                    <input
                      className="form-input w-full rounded border border-[#888C8C] px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                      value={profileEditForm.phone}
                      onChange={(e) =>
                        setProfileEditForm((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="form-group mb-4 text-left">
                    <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                      City
                    </label>
                    <select
                      className="form-input w-full rounded border border-[#888C8C] bg-white px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                      value={profileEditForm.city_id}
                      onChange={(e) => handleProfileCityChange(e.target.value)}
                    >
                      <option value="">Select City</option>
                      {currentProfile?.city_id && currentProfile?.cities?.name ? (
                        <option value={currentProfile.city_id}>
                          {currentProfile.cities.name}
                        </option>
                      ) : null}
                    </select>
                  </div>

                  <div className="form-group mb-6 text-left">
                    <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                      Area
                    </label>
                    <select
                      className="form-input w-full rounded border border-[#888C8C] bg-white px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                      value={profileEditForm.area_id}
                      onChange={(e) =>
                        setProfileEditForm((prev) => ({
                          ...prev,
                          area_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select Area</option>
                      {profileEditAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {profileEditError ? (
                    <p className="mb-4 text-[0.9rem] text-[#C40000]">
                      {profileEditError}
                    </p>
                  ) : null}

                  <div className="flex gap-3">
                    <button
                      className="btn-brand flex-1"
                      onClick={saveProfile}
                      disabled={profileSaving}
                    >
                      {profileSaving ? "Saving..." : "Save Changes"}
                    </button>
                    <button className="btn-brand-alt flex-1" onClick={cancelProfileEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "notifications" ? (
            <div className="screen active">
              <div className="tool-block-wrap bg-white px-4 py-6">
                <h2 className="sec-title mb-5 flex items-center gap-[10px] p-0 text-[1.35rem] font-extrabold text-[#0F1111]">
                  Alerts & Notifications
                </h2>

                <div className="flex max-w-[800px] flex-col gap-3">
                  {dashboardData.notifications.length === 0 ? (
                    <p className="text-[#565959]">No notifications yet</p>
                  ) : (
                    dashboardData.notifications.map((item) => (
                      <div
                        key={item.id}
                        className="mb-3 rounded-lg border p-4"
                        style={{
                          background: item.is_read ? "white" : "#F7FAFA",
                          borderColor: item.is_read ? "#D5D9D9" : "#007185",
                        }}
                      >
                        <div className="mb-[6px] flex justify-between gap-2">
                          <span className="text-[0.95rem] font-bold text-[#0F1111]">
                            {item.title}
                          </span>
                          <span className="text-[0.75rem] text-[#565959]">
                            {new Date(item.created_at).toLocaleDateString()}{" "}
                            {new Date(item.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="text-[0.9rem] leading-[1.4] text-[#0F1111]">
                          {item.message || ""}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </main>

        {cropModalOpen ? (
          <div className="crop-overlay active fixed inset-0 z-[5000] flex flex-col bg-[rgba(17,24,39,.95)] backdrop-blur-[5px]">
            <div className="crop-header-bar flex items-center justify-between bg-black/50 px-5 py-5 text-white">
              <div className="crop-title text-[1.2rem] font-bold">
                <FaCropSimple className="mr-2 inline" />
                Adjust Avatar
              </div>
              <button
                type="button"
                onClick={closeAvatarCropModal}
                className="border-none bg-transparent text-[1.5rem] text-white"
              >
                ×
              </button>
            </div>

            <div className="crop-workspace relative flex flex-1 items-center justify-center overflow-hidden p-5">
              <img
                ref={cropImageRef}
                src={avatarPreview}
                alt="Crop Avatar"
                className="block max-h-full max-w-full"
              />
            </div>

            <div className="crop-footer-bar flex justify-center gap-4 bg-black/50 p-5">
              <button className="btn-brand-alt" onClick={closeAvatarCropModal}>
                Cancel
              </button>
              <button className="btn-brand" onClick={applyAvatarCrop}>
                Apply Crop
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <CompleteProfileModal
        open={profileModalOpen}
        onClose={handleProfileModalClose}
        userId={user?.id}
        fullName={profile?.full_name || user?.user_metadata?.full_name || ""}
        onCompleted={handleProfileCompleted}
      />
    </MainLayout>
  )
}

function PromoSlider({ promos }) {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    if (!promos?.length || promos.length <= 1) return
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % promos.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [promos])

  if (!promos?.length) return null

  return (
    <div className="promo-banner-slider relative mb-4 h-[280px] overflow-hidden bg-[#0F1111] max-[768px]:h-[180px]">
      {promos.map((promo, idx) => (
        <div
          key={promo.id || idx}
          className={`promo-slide absolute left-0 top-0 h-full w-full transition-opacity duration-1000 ease-in-out ${
            idx === currentSlide ? "active z-[2] opacity-100" : "z-[1] opacity-0"
          }`}
        >
          <img
            src={promo.image_url}
            alt="Promo Banner"
            className="block h-full w-full object-cover object-center"
          />
        </div>
      ))}
    </div>
  )
}

function SvcCard({ icon, title, subtitle, onClick }) {
  return (
    <div className="svc-card rounded-lg border border-[#D5D9D9] bg-white px-4 py-5 text-center transition hover:bg-[#F7F7F7]">
      <button type="button" className="w-full" onClick={onClick}>
        <div className="svc-icon mx-auto mb-3 flex h-12 w-12 items-center justify-center text-[1.4rem] text-[#565959]">
          {icon}
        </div>
        <strong>{title}</strong>
        {subtitle ? (
          <div className="mt-1 text-[0.8rem] text-[#565959]">{subtitle}</div>
        ) : null}
      </button>
    </div>
  )
}

export default UserDashboard