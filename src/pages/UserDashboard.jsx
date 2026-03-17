import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import Cropper from "cropperjs"
import "cropperjs/dist/cropper.css"

import AuthNotification from "../components/auth/AuthNotification"
import CompleteProfileModal from "../components/auth/CompleteProfileModal"
import useAuthSession from "../hooks/useAuthSession"
import { fetchProfileByUserId, signOutUser } from "../lib/auth"
import { supabase } from "../lib/supabase"

import DashboardHeader from "../components/dashboard/DashboardHeader"
import MarketSection from "../components/dashboard/MarketSection"
import ServicesProfileSection from "../components/dashboard/ServicesProfileSection"
import NotificationsSection from "../components/dashboard/NotificationsSection"

const MAX_FILE_SIZE = 500000
const INACTIVITY_LIMIT = 15 * 60 * 1000

const EMPTY_DASHBOARD_DATA = {
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
}

let dashboardCache = {
  userId: "",
  data: null,
}

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
  const { loading, user, profile, profileComplete, suspended, error } =
    useAuthSession()

  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "market")
  const [serviceView, setServiceView] = useState("menu")
  const [dashboardLoading, setDashboardLoading] = useState(!dashboardCache.data)
  const [dashboardError, setDashboardError] = useState("")
  const [notice, setNotice] = useState({
    visible: false,
    type: "info",
    title: "",
    message: "",
  })

  const [profileModalOpen, setProfileModalOpen] = useState(false)

  const [dashboardData, setDashboardData] = useState(
    dashboardCache.data || EMPTY_DASHBOARD_DATA
  )

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
  const [profileEditCities, setProfileEditCities] = useState([])
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
    if (tab) {
      setActiveTab(tab)
      if (tab === "services") {
        setServiceView("menu")
      }
    }
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

    events.forEach((name) => {
      document.addEventListener(name, resetInactivityTimer, { passive: true })
    })

    const hasWarmCache =
      dashboardCache.userId === user.id && Boolean(dashboardCache.data?.profile)

    if (hasWarmCache) {
      setDashboardData(dashboardCache.data)
      setDashboardLoading(false)
      loadDashboard({ silent: true })
    } else {
      loadDashboard({ silent: false })
    }

    return () => {
      events.forEach((name) => {
        document.removeEventListener(name, resetInactivityTimer)
      })
      clearTimeout(inactivityTimerRef.current)
    }
  }, [loading, user, profile, profileComplete, suspended, navigate])

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

  function setAndCacheDashboardData(nextData) {
    setDashboardData(nextData)
    if (user?.id) {
      dashboardCache = {
        userId: user.id,
        data: nextData,
      }
    }
  }

  function clearDashboardCache() {
    dashboardCache = {
      userId: "",
      data: null,
    }
  }

  function resetInactivityTimer() {
    clearTimeout(inactivityTimerRef.current)
    inactivityTimerRef.current = setTimeout(async () => {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("ctm_")) localStorage.removeItem(key)
      })
      clearDashboardCache()
      await signOutUser()
      navigate("/", { replace: true })
    }, INACTIVITY_LIMIT)
  }

  async function loadDashboard({ silent = false } = {}) {
    if (!user) return

    try {
      if (!silent) {
        setDashboardLoading(true)
      }
      setDashboardError("")

      const profileRes = await supabase
        .from("profiles")
        .select("*, cities(name)")
        .eq("id", user.id)
        .maybeSingle()

      if (profileRes.error) throw profileRes.error

      if (!profileRes.data || !profileRes.data.city_id) {
        clearDashboardCache()
        await signOutUser()
        navigate("/", { replace: true })
        return
      }

      if (profileRes.data.is_suspended === true) {
        clearDashboardCache()
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

      const nextData = {
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
      }

      setAndCacheDashboardData(nextData)
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
      await loadDashboard({ silent: true })
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
    clearDashboardCache()
    await signOutUser()
    navigate("/", { replace: true })
  }

  async function handleLogout() {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("ctm_")) localStorage.removeItem(key)
    })
    clearDashboardCache()
    await signOutUser()
    navigate("/", { replace: true })
  }

  async function markNotificationsRead() {
    if (!user || dashboardData.unread === 0) return

    const nextData = {
      ...dashboardData,
      unread: 0,
      notifications: dashboardData.notifications.map((item) => ({
        ...item,
        is_read: true,
      })),
    }

    setAndCacheDashboardData(nextData)

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
  }

  function switchScreen(tab) {
    setActiveTab(tab)
    if (tab === "services") {
      setServiceView("menu")
    }
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

    if (!shop) return { title: "Register Shop", status: "default" }
    if (shop.is_open === false) return { title: "Locked", status: "locked" }
    if (shop.status === "pending") return { title: "Pending", status: "pending" }
    if (shop.status === "rejected") {
      return { title: "Rejected", status: "rejected" }
    }
    return { title: "My Shop", status: "approved" }
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
          icon: "shop",
        })
      }
    })

    ;(dashboardData.products || []).forEach((product) => {
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

  function navigateCategory(name) {
    if (name === "all") return
    navigate(`/cat?name=${encodeURIComponent(name)}`)
  }

  async function openProfileEdit() {
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

      await loadDashboard({ silent: true })
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

  if (!dashboardData.profile && (loading || dashboardLoading)) {
    return (
      <DashboardShimmer
        label={loading ? "Loading session..." : "Loading marketplace..."}
      />
    )
  }

  return (
    <div className="bg-[#E3E6E6] text-[#0F1111]">
      <DashboardHeader
        activeTab={activeTab}
        currentProfile={currentProfile}
        user={user}
        sortedAreas={sortedAreas}
        categories={dashboardData.categories}
        searchArea={searchArea}
        setSearchArea={setSearchArea}
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
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
        unread={dashboardData.unread}
        onShopIndex={() => navigate("/shop-index")}
      />

      <main className="content-body mx-auto w-full max-w-[1600px] pb-10">
        <AuthNotification
          visible={Boolean(error || dashboardError || notice.visible)}
          type={dashboardError || error ? "error" : notice.type}
          title={dashboardError || error ? "Dashboard issue" : notice.title}
          message={
            dashboardError || error ? dashboardError || error : notice.message
          }
        />

        {activeTab === "market" && (
          <MarketSection
            dashboardData={dashboardData}
            featuredShops={featuredShops}
            groupedShopsByArea={groupedShopsByArea}
            navigateCategory={navigateCategory}
          />
        )}

        {activeTab === "services" && (
          <ServicesProfileSection
            mode="services"
            serviceView={serviceView}
            setServiceView={setServiceView}
            user={user}
            currentProfile={currentProfile}
            profileEditOpen={profileEditOpen}
            openProfileEdit={openProfileEdit}
            cancelProfileEdit={cancelProfileEdit}
            handleLogout={handleLogout}
            handleShopClick={handleShopClick}
            shopCardMeta={shopCardMeta}
            wishlistCount={dashboardData.wishlistCount}
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
            setServiceView={setServiceView}
            user={user}
            currentProfile={currentProfile}
            profileEditOpen={profileEditOpen}
            openProfileEdit={openProfileEdit}
            cancelProfileEdit={cancelProfileEdit}
            handleLogout={handleLogout}
            handleShopClick={handleShopClick}
            shopCardMeta={shopCardMeta}
            wishlistCount={dashboardData.wishlistCount}
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
          <NotificationsSection notifications={dashboardData.notifications} />
        )}
      </main>

      <CompleteProfileModal
        open={profileModalOpen}
        onClose={handleProfileModalClose}
        userId={user?.id}
        fullName={profile?.full_name || user?.user_metadata?.full_name || ""}
        onCompleted={handleProfileCompleted}
      />
    </div>
  )
}

export default UserDashboard