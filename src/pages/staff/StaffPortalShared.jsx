/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  FaArrowRightFromBracket,
  FaCircleNotch,
  FaHouse,
  FaShieldHalved,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { signOutUser } from "../../lib/auth"
import BrandText from "../../components/common/BrandText"
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen"
import { resolveStaffAccess, withStaffAuthTimeout } from "../../lib/staffAuth"
import {
  clearStaffSessionState,
  getStaffSessionRemainingMs,
  hasActiveStaffSession,
  primeStaffPortalMemory,
  readStaffPortalMemory,
  refreshStaffSessionActivity,
} from "../../lib/staffSession"

let staffCountsCache = null

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
  const initialMemoryRef = useRef(readStaffPortalMemory())
  const expiryLogoutStartedRef = useRef(false)
  const [authUser, setAuthUser] = useState(() => initialMemoryRef.current.authUser)
  const [staffData, setStaffData] = useState(() => initialMemoryRef.current.staffData)
  const [fetchingStaff, setFetchingStaff] = useState(() => !initialMemoryRef.current.isResolved)
  const [staffError, setStaffError] = useState("")
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const adminRole = staffData?.admin_role || null
  const hasAdminRole = Boolean(adminRole)
  const isSuperAdmin = adminRole === "super_admin"
  const isCityAdmin = adminRole === "city_admin"
  const isAdmin = hasAdminRole
  const staffCityId = staffData?.admin_city_id || null

  const expireStaffSession = useCallback(async () => {
    if (expiryLogoutStartedRef.current) return
    expiryLogoutStartedRef.current = true
    setIsLoggingOut(true)
    clearStaffSessionState()
    setAuthUser(null)
    setStaffData(null)
    await signOutUser()
    navigate("/staff-portal?expired=1", { replace: true })
  }, [navigate])

  useEffect(() => {
    const memory = readStaffPortalMemory()
    if (memory.isResolved) {
      setAuthUser(memory.authUser)
      setStaffData(memory.staffData)
      setFetchingStaff(false)
      return undefined
    }

    async function initDashboard() {
      try {
        setStaffError("")
        const {
          data: { session },
        } = await withStaffAuthTimeout(
          supabase.auth.getSession(),
          "Could not confirm your staff session. Please retry."
        )

        if (!session || !hasActiveStaffSession(session.user?.id)) {
          const redirectPath = session?.user ? "/staff-portal?expired=1" : "/staff-portal"
          clearStaffSessionState()
          if (session?.user) {
            await signOutUser()
          }
          navigate(redirectPath, { replace: true })
          return
        }

        setAuthUser(session.user)

        const staffAccess = await resolveStaffAccess(session.user.id)

        if (!staffAccess) {
          clearStaffSessionState()
          await signOutUser()
          navigate("/staff-portal", { replace: true })
          return
        }

        refreshStaffSessionActivity(session.user.id)
        primeStaffPortalMemory(session.user, staffAccess)
        setStaffData(staffAccess)
      } catch (err) {
        console.error("Staff session error:", err)
        setStaffError(err.message || "Staff session could not be verified.")
      } finally {
        setFetchingStaff(false)
      }
    }

    initDashboard()
  }, [navigate])

  useEffect(() => {
    if (!authUser?.id || !staffData) return undefined

    let expiryTimer = null
    let activityTimer = null
    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"]

    const scheduleExpiry = () => {
      if (expiryTimer) {
        window.clearTimeout(expiryTimer)
      }

      const remainingMs = getStaffSessionRemainingMs(authUser.id)
      expiryTimer = window.setTimeout(() => {
        void expireStaffSession()
      }, Math.max(remainingMs, 0) + 250)
    }

    const markActivity = () => {
      if (activityTimer) return

      activityTimer = window.setTimeout(() => {
        activityTimer = null
        const refreshed = refreshStaffSessionActivity(authUser.id)
        if (!refreshed) {
          void expireStaffSession()
          return
        }
        scheduleExpiry()
      }, 350)
    }

    scheduleExpiry()
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, markActivity, { passive: true })
    })

    return () => {
      if (expiryTimer) window.clearTimeout(expiryTimer)
      if (activityTimer) window.clearTimeout(activityTimer)
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, markActivity)
      })
    }
  }, [authUser?.id, expireStaffSession, staffData])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    clearStaffSessionState()
    await signOutUser()
    navigate("/staff-portal", { replace: true })
  }

  return {
    authUser,
    staffData,
    adminRole,
    hasAdminRole,
    isSuperAdmin,
    isCityAdmin,
    isAdmin,
    staffCityId,
    fetchingStaff,
    staffError,
    isLoggingOut,
    handleLogout,
  }
}

export function useStaffCounts(isSuperAdmin = true, staffCityId = null, hasAdminRole = true) {
  const cacheKey = `${isSuperAdmin ? "super" : "city"}:${staffCityId || "none"}:${hasAdminRole ? "admin" : "staff"}`
  const cachedCounts = staffCountsCache?.key === cacheKey ? staffCountsCache : null
  const hasCachedCounts = Boolean(cachedCounts)
  const [counts, setCounts] = useState({
    verifications: cachedCounts?.counts?.verifications || 0,
    products: cachedCounts?.counts?.products || 0,
    payments: cachedCounts?.counts?.payments || 0,
    community: cachedCounts?.counts?.community || 0,
    content: cachedCounts?.counts?.content || 0,
    inbox: cachedCounts?.counts?.inbox || 0,
    radar: cachedCounts?.counts?.radar || 0,
  })
  const [summary, setSummary] = useState({
    shopCount: cachedCounts?.summary?.shopCount || 0,
    inactiveUsers: cachedCounts?.summary?.inactiveUsers || 0,
    visitsToday: cachedCounts?.summary?.visitsToday || 0,
  })
  const [loading, setLoading] = useState(() => !hasCachedCounts)

  const fetchCountsFallback = useCallback(async () => {
    if (!hasAdminRole) {
      const nextCounts = {
        verifications: 0,
        products: 0,
        payments: 0,
        community: 0,
        content: 0,
        inbox: 0,
        radar: 0,
      }
      const nextSummary = {
        shopCount: 0,
        inactiveUsers: 0,
        visitsToday: 0,
      }
      staffCountsCache = { key: cacheKey, counts: nextCounts, summary: nextSummary, updatedAt: Date.now() }
      setCounts(nextCounts)
      setSummary(nextSummary)
      return
    }

    const cityId = staffCityId ? Number(staffCityId) : null
    const shouldFilterByCity = !isSuperAdmin && cityId != null
    const lagosToday = formatLagosDateKey(new Date())

    const buildScopedShopQuery = (query) =>
      shouldFilterByCity ? query.eq("city_id", cityId) : query

    const buildScopedProductsQuery = () => {
      const query = supabase
        .from("products")
        .select("id, shops!inner(city_id)", { count: "exact", head: true })
        .eq("is_approved", false)
        .is("rejection_reason", null)

      return shouldFilterByCity ? query.eq("shops.city_id", cityId) : query
    }

    const buildScopedCommentsQuery = () => {
      const query = supabase
        .from("shop_comments")
        .select("id, shops!inner(city_id)", { count: "exact", head: true })
        .eq("status", "pending")

      return shouldFilterByCity ? query.eq("shops.city_id", cityId) : query
    }

    const buildScopedContentQuery = () => {
      const query = supabase
        .from("shop_banners_news")
        .select("id, shops!inner(city_id)", { count: "exact", head: true })
        .eq("status", "pending")

      return shouldFilterByCity ? query.eq("shops.city_id", cityId) : query
    }

    const [
      shopCountResult,
      pendingShopResult,
      submittedKycResult,
      pendingProductsResult,
      pendingCommunityResult,
      pendingContentResult,
      unreadContactResult,
      pendingPaymentsResult,
      visitsTodayResult,
      cityReporterIdsResult,
      radarResult,
    ] = await Promise.allSettled([
      buildScopedShopQuery(
        supabase.from("shops").select("id", { count: "exact", head: true })
      ),
      buildScopedShopQuery(
        supabase.from("shops").select("id", { count: "exact", head: true }).eq("status", "pending")
      ),
      isSuperAdmin
        ? buildScopedShopQuery(
            supabase.from("shops").select("id", { count: "exact", head: true }).eq("kyc_status", "submitted")
          )
        : Promise.resolve({ count: 0, error: null }),
      buildScopedProductsQuery(),
      buildScopedCommentsQuery(),
      buildScopedContentQuery(),
      supabase
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .or("status.eq.unread,status.is.null"),
      isSuperAdmin
        ? supabase
            .from("offline_payment_proofs")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
        : Promise.resolve({ count: 0, error: null }),
      lagosToday
        ? supabase
            .from("daily_site_visits")
            .select("total_visits")
            .eq("visit_date", lagosToday)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      shouldFilterByCity
        ? supabase
            .from("profiles")
            .select("id")
            .eq("city_id", cityId)
        : Promise.resolve({ data: null, error: null }),
      isSuperAdmin
        ? supabase.rpc("ctm_get_contact_security_radar", {
            p_days: 30,
            p_city_id: null,
          })
        : Promise.resolve({ data: [], error: null }),
    ])

    const readCount = (result) =>
      result.status === "fulfilled" && !result.value.error ? result.value.count || 0 : 0

    const visitsToday =
      visitsTodayResult.status === "fulfilled" && !visitsTodayResult.value.error
        ? Number(visitsTodayResult.value.data?.total_visits) || 0
        : 0
    const radarCount =
      radarResult.status === "fulfilled" && !radarResult.value.error
        ? Array.isArray(radarResult.value.data)
          ? radarResult.value.data.length
          : 0
        : 0

    let pendingAbuseCount = 0

    if (!shouldFilterByCity) {
      const { count, error } = await supabase
        .from("abuse_reports")
        .select("id", { count: "exact", head: true })
        .or("status.eq.pending,status.is.null")

      pendingAbuseCount = error ? 0 : count || 0
    } else {
      const reporterIds =
        cityReporterIdsResult.status === "fulfilled" && !cityReporterIdsResult.value.error
          ? (cityReporterIdsResult.value.data || []).map((item) => item.id).filter(Boolean)
          : []

      if (reporterIds.length > 0) {
        const { count, error } = await supabase
          .from("abuse_reports")
          .select("id", { count: "exact", head: true })
          .or("status.eq.pending,status.is.null")
          .in("reporter_id", reporterIds)

        pendingAbuseCount = error ? 0 : count || 0
      }
    }

    const nextCounts = {
      verifications: readCount(pendingShopResult) + readCount(submittedKycResult),
      products: readCount(pendingProductsResult),
      payments: readCount(pendingPaymentsResult),
      community: readCount(pendingCommunityResult),
      content: readCount(pendingContentResult),
      inbox: readCount(unreadContactResult) + pendingAbuseCount,
      radar: radarCount,
    }

    const nextSummary = {
      shopCount: readCount(shopCountResult),
      inactiveUsers: 0,
      visitsToday,
    }
    staffCountsCache = { key: cacheKey, counts: nextCounts, summary: nextSummary, updatedAt: Date.now() }
    setCounts(nextCounts)
    setSummary(nextSummary)
  }, [cacheKey, hasAdminRole, isSuperAdmin, staffCityId])

  const fetchCounts = useCallback(async () => {
    if (!hasAdminRole) {
      const nextCounts = {
        verifications: 0,
        products: 0,
        payments: 0,
        community: 0,
        content: 0,
        inbox: 0,
        radar: 0,
      }
      const nextSummary = {
        shopCount: 0,
        inactiveUsers: 0,
        visitsToday: 0,
      }
      staffCountsCache = { key: cacheKey, counts: nextCounts, summary: nextSummary, updatedAt: Date.now() }
      setCounts(nextCounts)
      setSummary(nextSummary)
      setLoading(false)
      return
    }

    try {
      setLoading((previous) => previous && !hasCachedCounts)
      const [payloadResult, radarResult] = await Promise.all([
        supabase.rpc("get_staff_dashboard_payload", {
          p_is_super_admin: isSuperAdmin,
          p_city_id: staffCityId ? Number(staffCityId) : null,
        }),
        isSuperAdmin
          ? supabase.rpc("ctm_get_contact_security_radar", {
              p_days: 30,
              p_city_id: null,
            })
          : Promise.resolve({ data: [], error: null }),
      ])

      const { data, error } = payloadResult

      if (error) throw error

      if (data) {
        const radarCount =
          radarResult.error || !Array.isArray(radarResult.data)
            ? Number(data.counts?.radar || 0)
            : radarResult.data.length

        const nextCounts = {
          ...data.counts,
          radar: radarCount,
        }
        const nextSummary = {
          shopCount: data.summary.shop_count,
          inactiveUsers: data.summary.inactive_users_count,
          visitsToday: data.summary.visits_today,
        }
        staffCountsCache = { key: cacheKey, counts: nextCounts, summary: nextSummary, updatedAt: Date.now() }
        setCounts(nextCounts)
        setSummary(nextSummary)
      }
    } catch (err) {
      console.error("Error fetching staff dashboard payload:", err)
      await fetchCountsFallback()
    } finally {
      setLoading(false)
    }
  }, [cacheKey, fetchCountsFallback, hasAdminRole, hasCachedCounts, isSuperAdmin, staffCityId])

  useEffect(() => {
    fetchCounts()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchCounts()
      }
    }, 120000)
    return () => clearInterval(timer)
  }, [fetchCounts])

  return { counts, summary, loading, refresh: fetchCounts }
}

export function StaffPortalShell({
  title,
  description,
  children,
  headerActions = null,
}) {
  const routeLocation = useLocation()
  const navigate = useNavigate()
  const { 
    authUser, 
    staffData, 
    fetchingStaff, 
    staffError,
    isLoggingOut, 
    handleLogout 
  } = useStaffPortalSession()

  if (fetchingStaff) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#2E1065] via-[#5B21B6] to-[#DB2777] font-sans">
        <FaCircleNotch className="mb-4 animate-spin text-5xl text-[#DB2777]" />
        <p className="text-lg font-semibold text-white">Verifying secure session...</p>
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

  const avatarUrl =
    authUser.user_metadata?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(staffData.full_name || "Admin")}&background=2E1065&color=fff&size=150&font-size=0.4`

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
            <BrandText /> <span className="text-[#DB2777]">Staff</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/staff-dashboard")}
            className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-2 font-bold transition-colors hover:bg-white/15"
          >
            <FaHouse />
            Home
          </button>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-2 rounded-lg bg-[#DB2777] px-5 py-2 font-bold transition-colors hover:bg-pink-600 disabled:opacity-70"
          >
            {isLoggingOut ? <FaCircleNotch className="animate-spin" /> : <FaArrowRightFromBracket />}
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
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

          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            <button
              type="button"
              onClick={() => navigate("/staff-dashboard")}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-600 shadow-sm transition hover:bg-slate-100"
            >
              <FaHouse />
              Back to staff home
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
