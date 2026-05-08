import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowRightFromBracket,
  FaArrowTrendUp,
  FaBell,
  FaBriefcase,
  FaBuildingUser,
  FaBullhorn,
  FaChartLine,
  FaCircleNotch,
  FaClipboardCheck,
  FaComments,
  FaEnvelope,
  FaFileContract,
  FaFolderOpen,
  FaIdBadge,
  FaImages,
  FaMoneyCheckDollar,
  FaPanorama,
  FaReceipt,
  FaShieldHalved,
  FaStore,
  FaTowerBroadcast,
  FaUsers,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import BrandText, { renderBrandedText } from "../components/common/BrandText"
import { prepareStaffRouteTransition } from "../lib/staffRouteTransitions"
import { buildStaffAuthProfile } from "../lib/staffAuth"
import { primeStaffPortalMemory } from "../lib/staffSession"
import { primeAuthSessionState } from "../hooks/useAuthSession"
import { StaffInfoDrawer, useStaffCounts, useStaffPortalSession } from "./staff/StaffPortalShared"

function formatStaffDate(value) {
  if (!value) return "Pending HR upload"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Pending HR upload"
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatRoleLabel(value) {
  return String(value || "staff")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getInitials(value) {
  const parts = String(value || "CT Staff")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "CT"
}

function StaffHomeCard({
  icon,
  title,
  metric,
  metricLabel = "New",
  tone = "rose",
  locked = false,
  onClick,
}) {
  const hasMetric = metric !== undefined && metric !== null && metric !== ""
  const metricValue = hasMetric ? Number(metric) || 0 : 0
  const metricDisplay = metricValue > 99 ? "99+" : metricValue.toLocaleString()
  const toneClass =
    tone === "indigo"
      ? "from-indigo-50 via-white to-white text-indigo-700"
      : tone === "emerald"
        ? "from-emerald-50 via-white to-white text-emerald-700"
        : tone === "amber"
          ? "from-amber-50 via-white to-white text-amber-700"
          : tone === "slate"
            ? "from-slate-100 via-white to-white text-slate-700"
            : "from-rose-50 via-white to-white text-rose-700"

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={locked}
      className={`group relative flex min-h-[82px] flex-col justify-between overflow-hidden rounded-[16px] border border-slate-200 bg-gradient-to-br ${toneClass} p-2.5 text-left shadow-sm transition sm:min-h-[92px] sm:p-3.5 ${
        locked
          ? "cursor-not-allowed opacity-65"
          : "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.09)]"
      }`}
    >
      <div className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-current/10 blur-sm" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-current/10 text-base sm:h-10 sm:w-10 sm:rounded-2xl sm:text-lg">
          {icon}
        </div>
        {hasMetric ? (
          <div
            className={`flex min-w-7 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black shadow-sm sm:min-w-9 sm:px-2.5 sm:py-1 sm:text-xs ${
              metricValue > 0
                ? "bg-rose-600 text-white ring-2 ring-white"
                : "bg-white/80 text-slate-400 ring-1 ring-slate-200"
            }`}
            title={`${metricDisplay} ${metricLabel}`}
            aria-label={`${title}: ${metricDisplay} ${metricLabel}`}
          >
            {metricDisplay}
          </div>
        ) : null}
      </div>

      <div className="relative mt-2 sm:mt-3">
        <h3 className="text-[0.72rem] font-black leading-tight tracking-tight text-slate-950 sm:text-sm">{title}</h3>
      </div>
    </button>
  )
}

function ResourceTile({ icon, label, value, action = "Coming soon", tone = "slate", onClick }) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "rose"
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-700"

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[132px] flex-col rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${toneClass}`}>
          {icon}
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          {action}
        </span>
      </div>
      <div className="text-sm font-black text-slate-950">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-5 text-slate-500">{value}</div>
    </button>
  )
}

export default function StaffDashboard() {
  const navigate = useNavigate()
  const retryRouteTransitionRef = useRef(null)
  const {
    authUser,
    staffData,
    adminRole,
    hasAdminRole,
    isSuperAdmin,
    staffCityId,
    fetchingStaff,
    staffError,
    isLoggingOut,
    handleLogout,
  } = useStaffPortalSession()

  const { counts, summary, loading, refresh: refreshCounts } = useStaffCounts(
    isSuperAdmin,
    staffCityId,
    hasAdminRole
  )

  const [routeTransition, setRouteTransition] = useState({
    pending: false,
    error: "",
    label: "",
  })
  const [notice, setNotice] = useState("")
  const [staffInfoOpen, setStaffInfoOpen] = useState(false)

  useEffect(() => {
    if (!notice) return undefined
    const timerId = window.setTimeout(() => setNotice(""), 4200)
    return () => window.clearTimeout(timerId)
  }, [notice])

  const beginRouteTransition = useCallback((retryAction = null, label = "") => {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: true,
      error: "",
      label,
    })
  }, [])

  const failRouteTransition = useCallback((message, retryAction = null) => {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: false,
      error: message,
      label: "",
    })
  }, [])

  const primeStaffRouteAuth = useCallback(() => {
    const staffProfile = buildStaffAuthProfile(authUser, staffData)
    if (!authUser?.id || !staffProfile) return

    primeAuthSessionState({
      user: authUser,
      profile: staffProfile,
      suspended: false,
      profileLoaded: true,
    })
    primeStaffPortalMemory(authUser, staffData)
  }, [authUser, staffData])

  const runStaffRouteTransition = useCallback(async (path, retryAction, label = "") => {
    if (!path) return

    beginRouteTransition(retryAction, label)

    try {
      primeStaffRouteAuth()
      const prefetchedData = await prepareStaffRouteTransition({
        path,
        staffContext: {
          isSuperAdmin,
          staffCityId,
          hasAdminRole,
          adminRole,
        },
      })
      primeStaffRouteAuth()
      setRouteTransition({
        pending: false,
        error: "",
        label: "",
      })
      startTransition(() => {
        navigate(path, {
          state: {
            fromStaffTransition: true,
            prefetchedData,
          },
        })
      })
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open that staff page right now. Please try again."
        ),
        retryAction
      )
    }
  }, [adminRole, beginRouteTransition, failRouteTransition, hasAdminRole, isSuperAdmin, navigate, primeStaffRouteAuth, staffCityId])

  const openStaffRouteWithTransition = useCallback((path, label = "") => {
    if (!path) return undefined

    let retryAction = null
    retryAction = () => {
      void runStaffRouteTransition(path, retryAction, label)
    }

    return runStaffRouteTransition(path, retryAction, label)
  }, [runStaffRouteTransition])

  const openLockedCard = useCallback((message) => {
    setNotice(message || "This workspace requires an admin operation role.")
  }, [])

  const staffName =
    staffData?.full_name ||
    authUser?.user_metadata?.full_name ||
    authUser?.email ||
    "CTMerchant Staff"
  const avatarUrl = authUser?.user_metadata?.avatar_url || ""
  const staffInitials = getInitials(staffName)
  const staffRoleLabel = formatRoleLabel(staffData?.staff_role || "staff")
  const adminRoleLabel = adminRole ? formatRoleLabel(adminRole) : "Portal Access Only"
  const department = staffData?.department || "Pending HR assignment"
  const employmentDate = formatStaffDate(staffData?.employment_date || authUser?.created_at)
  const cityScope = isSuperAdmin
    ? "All cities"
    : staffCityId
      ? `City ${staffCityId}`
      : "Pending city scope"

  const operations = useMemo(() => {
    const adminLocked = !hasAdminRole
    const superLocked = !isSuperAdmin

    return [
      {
        title: "Traffic",
        icon: <FaChartLine />,
        metric: summary.visitsToday,
        metricLabel: "Today",
        tone: "indigo",
        path: "/staff-traffic",
        locked: adminLocked,
      },
      {
        title: "Shop Analytics",
        icon: <FaArrowTrendUp />,
        badge: "Market",
        tone: "rose",
        path: "/staff-shop-analytics",
        locked: adminLocked,
      },
      {
        title: "Users",
        icon: <FaUsers />,
        metric: summary.inactiveUsers,
        metricLabel: "Inactive",
        tone: "amber",
        path: "/staff-users",
        locked: adminLocked,
      },
      {
        title: "Community",
        icon: <FaComments />,
        metric: counts.community,
        metricLabel: "Pending",
        tone: "rose",
        path: "/staff-community",
        locked: adminLocked,
      },
      {
        title: "Verifications",
        icon: <FaStore />,
        metric: counts.verifications,
        metricLabel: "Queue",
        tone: "emerald",
        path: "/staff-verifications",
        locked: adminLocked,
      },
      {
        title: "Products",
        icon: <FaWandMagicSparkles />,
        metric: counts.products,
        metricLabel: "Pending",
        tone: "indigo",
        path: "/staff-products",
        locked: adminLocked,
      },
      {
        title: "Shop Content",
        icon: <FaPanorama />,
        metric: counts.content,
        metricLabel: "Pending",
        tone: "rose",
        path: "/staff-shop-content",
        locked: adminLocked,
      },
      {
        title: "Shop Identity",
        icon: <FaFileContract />,
        badge: "Support",
        tone: "slate",
        path: "/staff-shop-identity",
        locked: superLocked,
        lockedMessage: "Locked shop identity updates are reserved for super admins.",
      },
      {
        title: "Announcements",
        icon: <FaBullhorn />,
        badge: "Comms",
        tone: "amber",
        path: "/staff-announcements",
        locked: adminLocked,
      },
      {
        title: "Notifications",
        icon: <FaEnvelope />,
        badge: "Comms",
        tone: "indigo",
        path: "/staff-notifications",
        locked: adminLocked,
      },
      {
        title: "Payments",
        icon: <FaReceipt />,
        metric: counts.payments,
        metricLabel: "Pending",
        tone: "emerald",
        path: "/staff-payments",
        locked: superLocked,
        lockedMessage: "Payments control is reserved for super admins.",
      },
      {
        title: "Commissions",
        icon: <FaMoneyCheckDollar />,
        badge: "Finance",
        tone: "emerald",
        path: "/staff-commissions",
        locked: adminLocked,
      },
      {
        title: "Sponsored Products",
        icon: <FaImages />,
        badge: "Studio",
        tone: "rose",
        path: "/staff-sponsored-products",
        locked: adminLocked,
      },
      {
        title: "City Banners",
        icon: <FaImages />,
        badge: "Studio",
        tone: "indigo",
        path: "/staff-city-banners",
        locked: adminLocked,
      },
      {
        title: "Discoveries",
        icon: <FaPanorama />,
        badge: "Editorial",
        tone: "rose",
        path: "/staff-discoveries",
        locked: adminLocked,
      },
      {
        title: "Inbox",
        icon: <FaEnvelope />,
        metric: counts.inbox,
        metricLabel: "Unread",
        tone: "slate",
        path: "/staff-inbox",
        locked: adminLocked,
      },
      {
        title: "CT Studio",
        icon: <FaWandMagicSparkles />,
        badge: "Tools",
        tone: "emerald",
        path: "/staff-studio",
        locked: adminLocked,
      },
      {
        title: "Issue Staff ID",
        icon: <FaIdBadge />,
        badge: "Identity",
        tone: "indigo",
        path: "/staff-issue-id",
        locked: adminLocked,
      },
      {
        title: "Security Radar",
        icon: <FaTowerBroadcast />,
        metric: counts.radar,
        metricLabel: "Alerts",
        tone: "amber",
        path: "/staff-security-radar",
        locked: superLocked,
        lockedMessage: "Security radar is reserved for super admins.",
      },
    ]
  }, [counts, hasAdminRole, isSuperAdmin, summary])

  if (fetchingStaff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f172a] text-white">
        <FaCircleNotch className="mb-4 animate-spin text-5xl text-rose-400" />
        <p className="text-lg font-black">Opening staff workspace...</p>
      </div>
    )
  }

  if (staffError) {
    return (
      <GlobalErrorScreen
        title="Staff access could not be verified"
        message={staffError}
        onRetry={() => navigate("/staff-portal", { replace: true })}
        retryLabel="Return to staff login"
        onBack={false}
      />
    )
  }

  if (!staffData || !authUser) return null

  return (
    <>
      <PageTransitionOverlay
        visible={false}
        error={routeTransition.error}
        onRetry={() => {
          if (typeof retryRouteTransitionRef.current === "function") {
            retryRouteTransitionRef.current()
          }
        }}
        onDismiss={() =>
          setRouteTransition({
            pending: false,
            error: "",
            label: "",
          })
        }
      />

      <StaffInfoDrawer
        open={staffInfoOpen}
        onClose={() => setStaffInfoOpen(false)}
        authUser={authUser}
        staffData={staffData}
        counts={counts}
        summary={summary}
      />

      <div className={`min-h-[100dvh] overflow-x-hidden bg-[#eef2f7] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-slate-950 ${routeTransition.pending ? "pointer-events-none select-none" : ""}`}>
        <header className="sticky top-0 z-[100] border-b border-white/10 bg-[#0f172a]/95 px-3 py-3 text-white shadow-xl shadow-slate-900/10 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-rose-300 sm:h-11 sm:w-11">
                <FaShieldHalved />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[11px] font-black tracking-[0.16em] text-white/50 sm:text-sm">
                  <BrandText /> Staff
                </div>
                <div className="truncate text-base font-black sm:text-lg">Operations Home</div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setStaffInfoOpen(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2.5 text-sm font-black transition hover:bg-white/15 sm:px-4"
              >
                <FaIdBadge />
                <span className="hidden min-[420px]:inline">Info</span>
              </button>
              <button
                type="button"
                onClick={refreshCounts}
                className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-black transition hover:bg-white/15 sm:inline-flex"
              >
                <FaCircleNotch className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-3 py-2.5 text-sm font-black transition hover:bg-rose-500 disabled:opacity-70 sm:px-4"
              >
                {isLoggingOut ? <FaCircleNotch className="animate-spin" /> : <FaArrowRightFromBracket />}
                <span className="hidden min-[370px]:inline">
                  {isLoggingOut ? "Signing out" : "Logout"}
                </span>
              </button>
            </div>
          </div>
        </header>

        {notice ? (
          <div className="fixed left-1/2 top-20 z-[200] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-900 shadow-2xl">
            {notice}
          </div>
        ) : null}

        {routeTransition.pending ? (
          <div className="fixed left-1/2 top-20 z-[200] w-[min(92vw,440px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/80 bg-white/95 px-5 py-3 text-center text-sm font-black text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur">
            Opening {routeTransition.label || "staff page"}...
            <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-100">
              <div className="ctm-transition-progress h-full w-full" />
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-6 sm:py-5">
          <section className="mb-3 rounded-[22px] border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-5">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Staff operations</div>
                <h1 className="mt-1 truncate text-xl font-black text-slate-950 sm:text-2xl">
                  Welcome, {staffName.split(" ")[0] || "Staff"}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => setStaffInfoOpen(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-slate-950 px-3 py-2.5 text-xs font-black text-white transition hover:bg-slate-800 sm:px-4 sm:text-sm"
              >
                <FaIdBadge />
                Staff info
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Shops</div>
                <div className="mt-1 text-lg font-black text-slate-950">{summary.shopCount}</div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Pending</div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {counts.verifications + counts.products + counts.community + counts.content + counts.payments}
                </div>
              </div>
              <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Scope</div>
                <div className="mt-1 truncate text-sm font-black text-slate-950 sm:text-lg">{cityScope}</div>
              </div>
            </div>
          </section>

          <section className="hidden relative overflow-hidden rounded-[28px] bg-[#111827] text-white shadow-[0_28px_90px_rgba(15,23,42,0.25)] sm:rounded-[38px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(244,63,94,0.40),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.26),transparent_30%),linear-gradient(135deg,#111827_0%,#1e1b4b_55%,#881337_100%)]" />
            <div className="absolute -bottom-24 right-4 h-64 w-64 rounded-full border border-white/10" />
            <div className="relative grid min-w-0 gap-7 p-5 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
              <div className="flex flex-col justify-between gap-10">
                <div className="min-w-0">
                  <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 sm:px-4 sm:text-[11px] sm:tracking-[0.22em]">
                    <FaBuildingUser />
                    <span className="truncate">Standalone Staff Workspace</span>
                  </div>
                  <h1 className="mt-5 max-w-3xl break-words text-[clamp(2.2rem,11vw,3.8rem)] font-black leading-[0.98] tracking-[-0.05em] sm:mt-6 lg:text-6xl">
                    Welcome back, {renderBrandedText(staffName.split(" ")[0] || "Staff")}.
                  </h1>
                  <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-white/72">
                    A focused home for <BrandText /> staff operations, resources, marketplace controls, and administrative workspaces.
                  </p>
                </div>

                <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                  <div className="min-w-0 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Shops</div>
                    <div className="mt-2 text-3xl font-black">{summary.shopCount}</div>
                  </div>
                  <div className="min-w-0 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Pending</div>
                    <div className="mt-2 text-3xl font-black">
                      {counts.verifications + counts.products + counts.community + counts.content + counts.payments}
                    </div>
                  </div>
                  <div className="min-w-0 rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Scope</div>
                    <div className="mt-2 truncate text-2xl font-black">{cityScope}</div>
                  </div>
                </div>
              </div>

              <aside className="min-w-0 rounded-[28px] border border-white/10 bg-white/12 p-5 backdrop-blur-xl sm:rounded-[32px] sm:p-6">
                <div className="flex items-start gap-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={staffName}
                      className="h-20 w-20 rounded-3xl border border-white/20 object-cover"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/20 bg-white/10 text-2xl font-black">
                      {staffInitials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-2xl font-black">{staffName}</div>
                    <div className="mt-1 text-sm font-bold text-white/60">{authUser.email}</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-900">
                        {staffRoleLabel}
                      </span>
                      <span className="rounded-full bg-rose-500 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white">
                        {adminRoleLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  {[
                    ["Department", department],
                    ["Employment Date", employmentDate],
                    ["Grade Level", "Pending HR assignment"],
                    ["File No.", "Pending HR assignment"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                      <span className="shrink-0 text-xs font-black uppercase tracking-[0.18em] text-white/42">{label}</span>
                      <span className="min-w-0 truncate text-sm font-black text-white">{value}</span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          {!hasAdminRole ? (
            <section className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
              <h2 className="text-sm font-black text-slate-950">Staff portal access confirmed</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-amber-900">
                No admin operation role is assigned yet. Use Staff info for profile/resources while a super admin configures permissions.
              </p>
            </section>
          ) : null}

          <section className="mt-3">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">Action cards</div>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950">Operations workspaces</h2>
              </div>
              <button
                type="button"
                onClick={refreshCounts}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white transition hover:bg-slate-800 sm:hidden"
              >
                <FaCircleNotch className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
              {operations.map((item) => (
                <StaffHomeCard
                  key={item.title}
                  {...item}
                  onClick={() => {
                    if (item.locked) {
                      openLockedCard(item.lockedMessage)
                      return
                    }
                    void openStaffRouteWithTransition(item.path, item.title)
                  }}
                />
              ))}
            </div>
          </section>

          <section className="hidden">
            <div className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700">
                  <FaIdBadge />
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-600">Staff Resource</div>
                  <h2 className="text-2xl font-black text-slate-950">Personnel profile</h2>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  ["Bio", "Short staff biography and work summary will appear here."],
                  ["Department", department],
                  ["Employment Date", employmentDate],
                  ["Grade Level", "Pending HR assignment"],
                  ["File No.", "Pending HR assignment"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
                    <div className="mt-1 text-sm font-bold text-slate-800">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[34px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-600">Resource Library</div>
                  <h2 className="text-2xl font-black text-slate-950">Documents and staff services</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    Placeholder cards for the HR and internal-resource features we can wire into real tables/storage next.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                  Phase 1 UI
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ResourceTile
                  icon={<FaFileContract />}
                  label="Employment Letter"
                  value="Official appointment letter and contract document."
                  tone="rose"
                />
                <ResourceTile
                  icon={<FaMoneyCheckDollar />}
                  label="Payment Slip"
                  value="Monthly payslip records will be available here."
                  tone="green"
                />
                <ResourceTile
                  icon={<FaBell />}
                  label="Notifications"
                  value="Internal HR, policy, and operations notices."
                  tone="amber"
                  action={hasAdminRole ? "Open" : "Coming soon"}
                  onClick={hasAdminRole ? () => void openStaffRouteWithTransition("/staff-notifications", "Notifications") : undefined}
                />
                <ResourceTile
                  icon={<FaFolderOpen />}
                  label="Staff File"
                  value="File number, grade level, department, and archive documents."
                />
                <ResourceTile
                  icon={<FaBriefcase />}
                  label="Department Memo"
                  value="Team updates, policies, and resource links."
                />
                <ResourceTile
                  icon={<FaClipboardCheck />}
                  label="Performance Notes"
                  value="Review notes and work history placeholders."
                  tone="green"
                />
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  )
}
