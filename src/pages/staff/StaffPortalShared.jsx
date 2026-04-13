/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  FaArrowRightFromBracket,
  FaChartLine,
  FaCircleNotch,
  FaComments,
  FaEnvelope,
  FaImages,
  FaReceipt,
  FaShieldHalved,
  FaStore,
  FaUsers,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"

let staffPortalMemory = {
  isResolved: false,
  authUser: null,
  staffData: null,
}

export function formatDateTime(value) {
  if (!value) return "Never"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatCoordinate(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return "Unknown"
  return numeric.toFixed(6)
}

export function formatInactivity(days) {
  if (days == null) return "Unknown"
  if (days < 1) return "Today"
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? "" : "s"}`
}

export function formatActivityNote(days, isInactive, hasLoggedIn) {
  if (!hasLoggedIn) return "No login recorded yet"
  if (days == null) return "Recent activity unknown"
  if (isInactive) return `Inactive for ${formatInactivity(days)}`
  if (days < 1) return "Active today"
  return `Active ${formatInactivity(days)} ago`
}

export function normaliseShopList(shops) {
  return Array.isArray(shops) ? shops : []
}

export function formatPageLabel(path) {
  if (!path) return "Unknown page"
  if (path === "/") return "Home"
  return path
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/-/g, " "))
    .join(" / ")
}

export function getStaffCommentThreads(comments) {
  const safeComments = Array.isArray(comments) ? comments : []
  const replyMap = new Map()

  for (const comment of safeComments) {
    if (!comment?.parent_id) continue
    if (!replyMap.has(comment.parent_id)) {
      replyMap.set(comment.parent_id, [])
    }
    replyMap.get(comment.parent_id).push(comment)
  }

  for (const replies of replyMap.values()) {
    replies.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  return safeComments
    .filter((comment) => !comment?.parent_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((comment) => {
      const replies = replyMap.get(comment.id) || []
      const all = [comment, ...replies]
      return {
        id: comment.id,
        root: comment,
        replies,
        comments: all,
        pendingCount: all.filter((item) => item.status === "pending").length,
        approvedCount: all.filter((item) => item.status === "approved").length,
        hiddenCount: all.filter((item) => item.status === "hidden").length,
        rejectedCount: all.filter((item) => item.status === "rejected").length,
        latestAt: all.reduce((latest, item) => {
          const currentTime = new Date(item.created_at).getTime()
          return currentTime > latest ? currentTime : latest
        }, 0),
      }
    })
}

export function getCommentStatusBadge(status) {
  if (status === "approved") return "bg-green-100 text-green-800"
  if (status === "pending") return "bg-amber-100 text-amber-800"
  if (status === "hidden") return "bg-slate-200 text-slate-700"
  if (status === "rejected") return "bg-rose-100 text-rose-800"
  return "bg-slate-100 text-slate-600"
}

const lagosDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

function formatLagosDateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  const parts = lagosDateFormatter.formatToParts(date)
  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  if (!year || !month || !day) return ""
  return `${year}-${month}-${day}`
}

export function buildVisitTimeline(data, windowDays) {
  const safeData = Array.isArray(data) ? data : []
  const byDay = new Map(
    safeData.map((item) => [
      String(item.visit_date),
      {
        ...item,
        total_visits: Number(item.total_visits) || 0,
        authenticated_visits: Number(item.authenticated_visits) || 0,
      },
    ])
  )

  const totalDays = Math.max(Number(windowDays) || 0, 1)
  const days = []
  const now = new Date()

  for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(now)
    date.setDate(now.getDate() - offset)
    const key = formatLagosDateKey(date)
    const existing = byDay.get(key)

    days.push(
      existing || {
        visit_date: key,
        total_visits: 0,
        authenticated_visits: 0,
      }
    )
  }

  return days
}

export function VisitTrendChart({ data }) {
  const safeData = Array.isArray(data) ? data : []
  const maxVisits = safeData.reduce((max, item) => Math.max(max, Number(item.total_visits) || 0), 0)

  if (!safeData.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
        No visit data yet.
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex h-56 items-end justify-between gap-2">
        {safeData.map((item, index) => {
          const totalVisits = Number(item.total_visits) || 0
          const height = maxVisits > 0 ? Math.max((totalVisits / maxVisits) * 100, totalVisits > 0 ? 12 : 4) : 4
          const labelDate = new Date(`${item.visit_date}T12:00:00`)
          const showLabel =
            safeData.length <= 8 ||
            index === 0 ||
            index === safeData.length - 1 ||
            index % Math.ceil(safeData.length / 6) === 0

          return (
            <div key={item.visit_date} className="flex min-w-0 flex-1 max-w-[24px] flex-col items-center gap-2">
              <div className="text-[11px] font-semibold text-slate-400">{totalVisits}</div>
              <div className="flex h-44 w-full items-end">
                <div
                  className="w-full rounded-t-2xl bg-gradient-to-t from-[#DB2777] via-pink-500 to-[#2E1065] transition-all"
                  style={{ height: `${height}%` }}
                  title={`${labelDate.toLocaleDateString("en-NG")}: ${totalVisits} visits`}
                />
              </div>
              <div className="h-8 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {showLabel ? labelDate.toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : ""}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SectionHeading({ eyebrow, title, description, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? (
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#DB2777]">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="text-2xl font-black text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-2 max-w-[760px] text-sm leading-6 text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  )
}

export function QuickActionButton({ icon, label, tone = "dark", onClick }) {
  const toneClass =
    tone === "pink"
      ? "bg-[#DB2777] text-white hover:bg-pink-600"
      : tone === "white"
        ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        : "bg-[#2E1065] text-white hover:bg-[#4c1d95]"

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  )
}

export function useStaffPortalSession() {
  const navigate = useNavigate()
  const [authUser, setAuthUser] = useState(() => staffPortalMemory.authUser)
  const [staffData, setStaffData] = useState(() => staffPortalMemory.staffData)
  const [fetchingStaff, setFetchingStaff] = useState(() => !staffPortalMemory.isResolved)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    if (staffPortalMemory.isResolved) return undefined

    async function initDashboard() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          navigate("/staff-portal", { replace: true })
          return
        }

        setAuthUser(session.user)

        const { data: staffProfile, error: staffErr } = await supabase
          .from("staff_profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()

        if (staffErr || !staffProfile) {
          throw new Error("Access denied. Staff account required.")
        }

        staffPortalMemory = {
          isResolved: true,
          authUser: session.user,
          staffData: staffProfile,
        }
        setStaffData(staffProfile)
      } catch (err) {
        console.error(err)
        staffPortalMemory = {
          isResolved: false,
          authUser: null,
          staffData: null,
        }
        await supabase.auth.signOut()
        navigate("/staff-portal", { replace: true })
      } finally {
        setFetchingStaff(false)
      }
    }

    initDashboard()
  }, [navigate])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    staffPortalMemory = {
      isResolved: false,
      authUser: null,
      staffData: null,
    }
    await supabase.auth.signOut()
    navigate("/staff-portal", { replace: true })
  }

  return {
    authUser,
    staffData,
    fetchingStaff,
    isLoggingOut,
    handleLogout,
  }
}

export function StaffPortalShell({
  activeKey = "home",
  title,
  description,
  children,
  headerActions = null,
}) {
  const routeLocation = useLocation()
  const { authUser, staffData, fetchingStaff, isLoggingOut, handleLogout } = useStaffPortalSession()

  if (fetchingStaff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2E1065] via-[#5B21B6] to-[#DB2777] font-sans">
        <FaCircleNotch className="mb-4 animate-spin text-5xl text-[#DB2777]" />
        <p className="text-lg font-semibold text-white">Verifying secure session...</p>
      </div>
    )
  }

  if (!staffData || !authUser) return null

  const avatarUrl =
    authUser.user_metadata?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(staffData.full_name)}&background=2E1065&color=fff&size=150&font-size=0.4`

  const navItems = [
    { key: "home", label: "Home", to: "/staff-dashboard", icon: <FaShieldHalved /> },
    { key: "traffic", label: "Traffic", to: "/staff-traffic", icon: <FaChartLine /> },
    { key: "users", label: "Users", to: "/staff-users", icon: <FaUsers /> },
    { key: "community", label: "Community", to: "/staff-community", icon: <FaComments /> },
    { key: "verifications", label: "Verifications", to: "/staff-verifications", icon: <FaStore /> },
    { key: "payments", label: "Payments", to: "/staff-payments", icon: <FaReceipt /> },
    { key: "city-banners", label: "City Banners", to: "/staff-city-banners", icon: <FaImages /> },
    { key: "inbox", label: "Inbox", to: "/staff-inbox", icon: <FaEnvelope /> },
    { key: "studio", label: "CT Studio", to: "/staff-studio", icon: <FaWandMagicSparkles /> },
  ]

  return (
    <div
      className={`min-h-screen bg-[radial-gradient(circle_at_top,#fdf2f8_0,#f8fafc_26%,#f8fafc_100%)] pb-12 font-sans ${
        routeLocation.state?.fromStaffTransition ? "ctm-page-enter" : ""
      }`}
    >
      <nav className="flex items-center justify-between bg-[#2E1065] px-6 py-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <FaShieldHalved className="text-2xl text-[#DB2777]" />
          <h1 className="text-lg font-bold tracking-wide">
            CTMerchant <span className="text-[#DB2777]">Staff</span>
          </h1>
        </div>
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-2 rounded-lg bg-[#DB2777] px-5 py-2 font-bold transition-colors hover:bg-pink-600 disabled:opacity-70"
        >
          {isLoggingOut ? <FaCircleNotch className="animate-spin" /> : <FaArrowRightFromBracket />}
          {isLoggingOut ? "Logging out..." : "Logout"}
        </button>
      </nav>

      <div className="mx-auto mt-8 max-w-[1280px] px-4 sm:px-6">
        <div className="mb-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]">
          <div className="bg-[linear-gradient(135deg,#2E1065_0%,#4c1d95_45%,#DB2777_100%)] px-8 py-8 text-white">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
                <img
                  src={avatarUrl}
                  alt="Staff Avatar"
                  className="h-24 w-24 rounded-full border-4 border-white/20 object-cover shadow-sm"
                />
                <div className="text-center sm:text-left">
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-pink-200">
                    Staff Operations Console
                  </div>
                  <h2 className="mt-3 text-3xl font-black text-white">{title || staffData.full_name}</h2>
                  <p className="mt-2 max-w-[640px] text-sm leading-6 text-white/80">
                    {description || "Navigate through staff operations, moderation, intelligence, and merchant controls."}
                  </p>
                </div>
              </div>

              {headerActions ? <div className="flex flex-wrap gap-3">{headerActions}</div> : null}
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.key}
                  to={item.to}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
                    activeKey === item.key
                      ? "bg-[#2E1065] text-white"
                      : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
