import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowDownAZ,
  FaBell,
  FaBriefcase,
  FaBuilding,
  FaCircleExclamation,
  FaCircleNotch,
  FaCircleQuestion,
  FaHeart,
  FaHeadset,
  FaHouse,
  FaLayerGroup,
  FaLocationDot,
  FaRightFromBracket,
  FaStore,
  FaTableCellsLarge,
  FaTriangleExclamation,
  FaUser,
} from "react-icons/fa6"
import MainLayout from "../layouts/MainLayout"
import AuthButton from "../components/auth/AuthButton"
import AuthNotification from "../components/auth/AuthNotification"
import CompleteProfileModal from "../components/auth/CompleteProfileModal"
import useAuthSession from "../hooks/useAuthSession"
import {
  completeProfileSetup,
  fetchProfileByUserId,
  signOutUser,
} from "../lib/auth"
import { supabase } from "../lib/supabase"

function UserDashboard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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

  const [dashboardData, setDashboardData] = useState({
    profile: null,
    notifications: [],
    unread: 0,
    myShop: null,
    wishlistCount: 0,
  })

  const [profileModalOpen, setProfileModalOpen] = useState(false)

  useEffect(() => {
    if (searchParams.get("tab")) {
      setActiveTab(searchParams.get("tab"))
    }
  }, [searchParams])

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
        message:
          "Your account has been restricted. Please contact support.",
      })
      return
    }

    if (!profile || !profileComplete) {
      setProfileModalOpen(true)
      setDashboardLoading(false)
      return
    }

    loadDashboard()
  }, [loading, user, profile, profileComplete, suspended])

  async function loadDashboard() {
    try {
      setDashboardLoading(true)
      setDashboardError("")

      const [notificationsRes, myShopRes, wishlistRes] = await Promise.all([
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

      if (notificationsRes.error) throw notificationsRes.error
      if (myShopRes.error) throw myShopRes.error
      if (wishlistRes.error) throw wishlistRes.error

      const notifications = notificationsRes.data || []
      const unread = notifications.filter((item) => !item.is_read).length

      setDashboardData({
        profile,
        notifications,
        unread,
        myShop: myShopRes.data || null,
        wishlistCount: wishlistRes.count || 0,
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
    await signOutUser()
    navigate("/", { replace: true })
  }

  async function markNotificationsRead() {
    if (!user) return
    if (dashboardData.unread === 0) return

    setDashboardData((prev) => ({ ...prev, unread: 0 }))

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false)
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
          "Your shop application is currently under review. Please check back later.",
      })
      return
    }

    if (shop.status === "rejected") {
      setNotice({
        visible: true,
        type: "warning",
        title: "Correction required",
        message:
          shop.rejection_reason || "Please correct your shop details and resubmit.",
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

  const shopCard = useMemo(() => {
    const shop = dashboardData.myShop

    if (!shop) {
      return {
        title: "Register Shop",
        icon: <FaStore className="text-xl text-pink-600" />,
      }
    }

    if (shop.is_open === false) {
      return {
        title: "Locked",
        icon: <FaLockFallback />,
      }
    }

    if (shop.status === "pending") {
      return {
        title: "Pending",
        icon: <FaCircleNotch className="text-xl text-amber-500" />,
      }
    }

    if (shop.status === "rejected") {
      return {
        title: "Rejected",
        icon: <FaCircleExclamation className="text-xl text-red-500" />,
      }
    }

    return {
      title: "My Shop",
      icon: <FaStore className="text-xl text-emerald-600" />,
    }
  }, [dashboardData.myShop])

  if (loading || dashboardLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-[70vh] items-center justify-center bg-pink-50 px-4">
          <div className="rounded-[28px] border border-pink-100 bg-white px-8 py-10 text-center shadow-xl">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600" />
            <p className="text-sm font-extrabold text-slate-700">
              Loading dashboard...
            </p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!user) return null

  return (
    <MainLayout>
      <section className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="mb-4 rounded-[24px] border border-pink-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-pink-600">
                  Marketplace
                </p>
                <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
                  Welcome, {profile?.full_name || user.email}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  {profile?.cities?.name || "Your city"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("notifications")
                    markNotificationsRead()
                  }}
                  className="relative rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700"
                  aria-label="Notifications"
                >
                  <FaBell />
                  {dashboardData.unread > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
                      {dashboardData.unread > 9 ? "9+" : dashboardData.unread}
                    </span>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-700 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700"
                  aria-label="Sign out"
                >
                  <FaRightFromBracket />
                </button>
              </div>
            </div>
          </div>

          <AuthNotification
            visible={Boolean(error || dashboardError || notice.visible)}
            type={
              dashboardError || error
                ? "error"
                : notice.type
            }
            title={
              dashboardError || error
                ? "Dashboard issue"
                : notice.title
            }
            message={
              dashboardError || error
                ? dashboardError || error
                : notice.message
            }
          />

          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <DashNavCard
              active={activeTab === "market"}
              icon={<FaHouse />}
              label="Repository"
              onClick={() => setActiveTab("market")}
            />
            <DashNavCard
              active={activeTab === "services"}
              icon={<FaTableCellsLarge />}
              label="Dashboard"
              onClick={() => setActiveTab("services")}
            />
            <DashNavCard
              active={activeTab === "notifications"}
              icon={<FaBell />}
              label="Alerts"
              badge={dashboardData.unread}
              onClick={() => {
                setActiveTab("notifications")
                markNotificationsRead()
              }}
            />
            <DashNavCard
              active={activeTab === "profile"}
              icon={<FaUser />}
              label="Profile"
              onClick={() => setActiveTab("profile")}
            />
            <DashNavCard
              active={false}
              icon={<FaArrowDownAZ />}
              label="Shop Index"
              onClick={() => navigate("/shop-index")}
            />
          </div>

          {activeTab === "market" ? (
            <DashboardPanel
              title="Marketplace"
              subtitle="Your verified city commerce dashboard."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <InfoCard
                  title="City"
                  value={profile?.cities?.name || "Not available"}
                  icon={<FaLocationDot className="text-pink-600" />}
                />
                <InfoCard
                  title="Wishlist"
                  value={`${dashboardData.wishlistCount} item${
                    dashboardData.wishlistCount === 1 ? "" : "s"
                  }`}
                  icon={<FaHeart className="text-pink-600" />}
                />
                <InfoCard
                  title="Notifications"
                  value={`${dashboardData.notifications.length}`}
                  icon={<FaBell className="text-pink-600" />}
                />
              </div>
            </DashboardPanel>
          ) : null}

          {activeTab === "services" ? (
            <DashboardPanel
              title="Dashboard"
              subtitle="Quick access to your account tools and support."
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <ServiceCard
                  icon={shopCard.icon}
                  title={shopCard.title}
                  onClick={handleShopClick}
                />
                <ServiceCard
                  icon={<FaHeart className="text-xl text-pink-600" />}
                  title="Wishlist"
                  subtitle={`${dashboardData.wishlistCount} items`}
                  onClick={() => navigate("/wishlist")}
                />
                <ServiceCard
                  icon={<FaHeadset className="text-xl text-sky-600" />}
                  title="Support"
                  onClick={() => navigate("/contact")}
                />
                <ServiceCard
                  icon={<FaCircleQuestion className="text-xl text-sky-600" />}
                  title="FAQ"
                  onClick={() => navigate("/faq")}
                />
                <ServiceCard
                  icon={
                    <FaTriangleExclamation className="text-xl text-red-500" />
                  }
                  title="Report Abuse"
                  onClick={() => navigate("/report-abuse")}
                />
                <ServiceCard
                  icon={<FaBriefcase className="text-xl text-sky-600" />}
                  title="Careers"
                  onClick={() => navigate("/careers")}
                />
                <ServiceCard
                  icon={<FaBuilding className="text-xl text-sky-600" />}
                  title="About Us"
                  onClick={() => navigate("/about")}
                />
                <ServiceCard
                  icon={<FaLayerGroup className="text-xl text-sky-600" />}
                  title="Our Services"
                  onClick={() => navigate("/services")}
                />
              </div>
            </DashboardPanel>
          ) : null}

          {activeTab === "notifications" ? (
            <DashboardPanel
              title="Alerts & Notifications"
              subtitle="Recent updates from CTMerchant."
            >
              <div className="space-y-3">
                {dashboardData.notifications.length === 0 ? (
                  <EmptyState message="No notifications yet." />
                ) : (
                  dashboardData.notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-2xl border p-4 shadow-sm ${
                        item.is_read
                          ? "border-slate-200 bg-white"
                          : "border-sky-200 bg-sky-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-extrabold text-slate-900">
                          {item.title}
                        </h3>
                        <span className="text-xs font-semibold text-slate-500">
                          {new Date(item.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {item.message || ""}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </DashboardPanel>
          ) : null}

          {activeTab === "profile" ? (
            <DashboardPanel
              title="Profile"
              subtitle="Your account information and quick actions."
            >
              <div className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-sm">
                <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-pink-100 text-3xl font-extrabold text-pink-700">
                  {(profile?.full_name || user.email || "U")
                    .charAt(0)
                    .toUpperCase()}
                </div>

                <h3 className="text-2xl font-extrabold text-slate-900">
                  {profile?.full_name || "User"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {profile?.phone || "No phone number added"}
                </p>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <AuthButton
                    variant="outline"
                    className="sm:w-auto"
                    onClick={() => setProfileModalOpen(true)}
                  >
                    Edit Profile
                  </AuthButton>
                  <AuthButton
                    variant="secondary"
                    className="sm:w-auto"
                    onClick={handleLogout}
                  >
                    Sign Out
                  </AuthButton>
                </div>
              </div>
            </DashboardPanel>
          ) : null}
        </div>
      </section>

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

function DashboardPanel({ title, subtitle, children }) {
  return (
    <div className="rounded-[28px] border border-pink-100 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5">
        <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function DashNavCard({ active, icon, label, onClick, badge = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-extrabold transition ${
        active
          ? "border-pink-200 bg-pink-50 text-pink-700"
          : "border-slate-200 bg-white text-slate-700 hover:border-pink-200 hover:bg-pink-50 hover:text-pink-700"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </button>
  )
}

function InfoCard({ title, value, icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-white p-3 shadow-sm">{icon}</div>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
            {title}
          </p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

function ServiceCard({ icon, title, subtitle, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:border-pink-200 hover:bg-pink-50"
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50">
        {icon}
      </div>
      <div className="text-base font-extrabold text-slate-900">{title}</div>
      {subtitle ? (
        <div className="mt-1 text-sm font-semibold text-slate-500">
          {subtitle}
        </div>
      ) : null}
    </button>
  )
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">
      {message}
    </div>
  )
}

function FaLockFallback() {
  return <span className="text-xl text-slate-500">🔒</span>
}

export default UserDashboard