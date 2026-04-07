import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import {
  FaArrowRightFromBracket,
  FaBoxOpen,
  FaBuilding,
  FaChartLine,
  FaCircleCheck,
  FaCircleNotch,
  FaComments,
  FaEnvelope,
  FaEye,
  FaFilter,
  FaIdBadge,
  FaLocationDot,
  FaReply,
  FaShieldHalved,
  FaTriangleExclamation,
  FaUsers,
  FaVideo,
  FaWandMagicSparkles,
} from "react-icons/fa6"

function formatDateTime(value) {
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

function formatCoordinate(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return "Unknown"
  return numeric.toFixed(6)
}

function formatInactivity(days) {
  if (days == null) return "Unknown"
  if (days < 1) return "Today"
  if (days < 30) return `${days} day${days === 1 ? "" : "s"}`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? "" : "s"}`
}

function formatActivityNote(days, isInactive, hasLoggedIn) {
  if (!hasLoggedIn) {
    return "No login recorded yet"
  }

  if (days == null) {
    return "Recent activity unknown"
  }

  if (isInactive) {
    return `Inactive for ${formatInactivity(days)}`
  }

  if (days < 1) {
    return "Active today"
  }

  return `Active ${formatInactivity(days)} ago`
}

function normaliseShopList(shops) {
  return Array.isArray(shops) ? shops : []
}

function formatPageLabel(path) {
  if (!path) return "Unknown page"
  if (path === "/") return "Home"
  return path
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/-/g, " "))
    .join(" / ")
}

function getStaffCommentThreads(comments) {
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

function getCommentStatusBadge(status) {
  if (status === "approved") {
    return "bg-green-100 text-green-800"
  }
  if (status === "pending") {
    return "bg-amber-100 text-amber-800"
  }
  if (status === "hidden") {
    return "bg-slate-200 text-slate-700"
  }
  if (status === "rejected") {
    return "bg-rose-100 text-rose-800"
  }
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

function buildVisitTimeline(data, windowDays) {
  const safeData = Array.isArray(data) ? data : []
  const byDay = new Map(
    safeData.map((item) => [
      String(item.visit_date),
      {
        ...item,
        total_visits: Number(item.total_visits) || 0,
        unique_visitors: Number(item.unique_visitors) || 0,
        authenticated_visits: Number(item.authenticated_visits) || 0,
        total_sessions: Number(item.total_sessions) || 0,
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
        unique_visitors: 0,
        authenticated_visits: 0,
        total_sessions: 0,
      }
    )
  }

  return days
}

function VisitTrendChart({ data }) {
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

export default function StaffDashboard() {
  const navigate = useNavigate()
  const { notify } = useGlobalFeedback()

  const [authUser, setAuthUser] = useState(null)
  const [staffData, setStaffData] = useState(null)
  const [fetchingStaff, setFetchingStaff] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const [shops, setShops] = useState([])
  const [loadingShops, setLoadingShops] = useState(true)
  const [togglingId, setTogglingId] = useState(null)
  const [selectedKycShop, setSelectedKycShop] = useState(null)
  const [commentThreads, setCommentThreads] = useState([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [selectedCommentThread, setSelectedCommentThread] = useState(null)
  const [commentFilter, setCommentFilter] = useState("pending")
  const [moderatingCommentId, setModeratingCommentId] = useState(null)
  const [moderationDrafts, setModerationDrafts] = useState({})

  const [cityOptions, setCityOptions] = useState([])
  const [selectedCityId, setSelectedCityId] = useState("all")
  const [inactiveDays, setInactiveDays] = useState(180)
  const [inactiveOnly, setInactiveOnly] = useState(false)
  const [userActivity, setUserActivity] = useState([])
  const [loadingUserActivity, setLoadingUserActivity] = useState(true)
  const [userActivityError, setUserActivityError] = useState("")

  const [visitWindow, setVisitWindow] = useState(30)
  const [visitStats, setVisitStats] = useState([])
  const [topPages, setTopPages] = useState([])
  const [loadingVisitStats, setLoadingVisitStats] = useState(true)
  const [visitStatsError, setVisitStatsError] = useState("")

  useEffect(() => {
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

        setStaffData(staffProfile)

        const cityTask = supabase
          .from("cities")
          .select("id, name, state")
          .order("state", { ascending: true })
          .order("name", { ascending: true })

        const [cityResult] = await Promise.allSettled([
          cityTask,
          fetchShops(),
          fetchCommentQueue(),
          fetchUserActivity({ cityId: "all", threshold: inactiveDays }),
          fetchVisitStats(visitWindow),
        ])

        if (cityResult.status === "fulfilled" && !cityResult.value.error) {
          setCityOptions(cityResult.value.data || [])
        }
      } catch (err) {
        console.error(err)
        await supabase.auth.signOut()
        navigate("/staff-portal", { replace: true })
      } finally {
        setFetchingStaff(false)
      }
    }

    initDashboard()
  }, [navigate])

  useEffect(() => {
    if (!staffData) return
    fetchUserActivity({ cityId: selectedCityId, threshold: inactiveDays })
  }, [staffData, selectedCityId, inactiveDays])

  useEffect(() => {
    if (!staffData) return
    fetchVisitStats(visitWindow)
  }, [staffData, visitWindow])

  useEffect(() => {
    if (!staffData) return undefined

    const channel = supabase
      .channel("public:shop_comments:staff-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_comments" },
        () => {
          fetchCommentQueue()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [staffData])

  async function fetchShops() {
    setLoadingShops(true)
    try {
      const { data, error } = await supabase
        .from("shops")
        .select(`
          id,
          name,
          unique_id,
          address,
          status,
          kyc_status,
          kyc_video_url,
          kyc_submission_meta,
          rejection_reason,
          id_issued,
          created_at,
          profiles ( full_name ),
          cities ( name, state )
        `)
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) throw error
      setShops(data || [])
    } catch (err) {
      console.error("Error fetching shops:", err)
      notify({
        type: "error",
        title: "Could not load shops",
        message: getFriendlyErrorMessage(err, "Could not load shop records. Retry."),
      })
    } finally {
      setLoadingShops(false)
    }
  }

  async function fetchCommentQueue() {
    setLoadingComments(true)
    try {
      const { data: commentRows, error: commentError } = await supabase
        .from("shop_comments")
        .select(
          "id, shop_id, product_id, user_id, parent_id, body, status, moderation_reason, created_at, updated_at"
        )
        .order("created_at", { ascending: false })
        .limit(200)

      if (commentError) throw commentError

      const comments = commentRows || []
      const shopIds = Array.from(new Set(comments.map((item) => item.shop_id).filter(Boolean)))
      const productIds = Array.from(new Set(comments.map((item) => item.product_id).filter(Boolean)))
      const userIds = Array.from(new Set(comments.map((item) => item.user_id).filter(Boolean)))

      const [shopsResult, productsResult, profilesResult] = await Promise.allSettled([
        shopIds.length
          ? supabase.from("shops").select("id, name, unique_id, owner_id").in("id", shopIds)
          : Promise.resolve({ data: [] }),
        productIds.length
          ? supabase.from("products").select("id, name").in("id", productIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
          : Promise.resolve({ data: [] }),
      ])

      const shopsMap =
        shopsResult.status === "fulfilled" && !shopsResult.value.error
          ? Object.fromEntries((shopsResult.value.data || []).map((shop) => [String(shop.id), shop]))
          : {}
      const productsMap =
        productsResult.status === "fulfilled" && !productsResult.value.error
          ? Object.fromEntries((productsResult.value.data || []).map((product) => [String(product.id), product]))
          : {}
      const profilesMap =
        profilesResult.status === "fulfilled" && !profilesResult.value.error
          ? Object.fromEntries((profilesResult.value.data || []).map((profile) => [profile.id, profile]))
          : {}

      const enriched = comments.map((comment) => {
        const shop = shopsMap[String(comment.shop_id)] || null
        const product = comment.product_id ? productsMap[String(comment.product_id)] || null : null
        const profile = profilesMap[comment.user_id] || null

        return {
          ...comment,
          shop_name: shop?.name || "Unknown Shop",
          shop_unique_id: shop?.unique_id || "",
          shop_owner_id: shop?.owner_id || null,
          product_name: product?.name || "",
          author_name: profile?.full_name || "CTMerchant User",
          author_avatar_url: profile?.avatar_url || "",
          is_owner_comment: Boolean(shop?.owner_id && shop.owner_id === comment.user_id),
        }
      })

      const nextThreads = getStaffCommentThreads(enriched)
      setCommentThreads(nextThreads)
      setModerationDrafts((prev) => {
        const next = { ...prev }
        nextThreads.forEach((thread) => {
          thread.comments.forEach((comment) => {
            if (next[comment.id] === undefined) {
              next[comment.id] = comment.moderation_reason || ""
            }
          })
        })
        return next
      })
    } catch (err) {
      console.error("Error fetching comment queue:", err)
      notify({
        type: "error",
        title: "Could not load comments",
        message: getFriendlyErrorMessage(err, "Could not load shop comments. Retry."),
      })
    } finally {
      setLoadingComments(false)
    }
  }

  async function fetchUserActivity({ cityId, threshold }) {
    setLoadingUserActivity(true)
    setUserActivityError("")
    try {
      const { data, error } = await supabase.rpc("staff_user_activity_summary", {
        p_inactive_days: threshold,
        p_city_id: cityId === "all" ? null : Number(cityId),
      })

      if (error) throw error
      setUserActivity(data || [])
    } catch (err) {
      console.error("Error fetching user activity:", err)
      const message = String(err?.message || "")
      if (message.includes("staff_user_activity_summary")) {
        setUserActivityError("Run the new staff activity SQL migration, then refresh this page.")
      } else {
        setUserActivityError(getFriendlyErrorMessage(err, "Could not load user activity. Retry."))
      }
    } finally {
      setLoadingUserActivity(false)
    }
  }

  async function fetchVisitStats(windowDays) {
    setLoadingVisitStats(true)
    setVisitStatsError("")
    try {
      const [dailyResult, topPagesResult] = await Promise.all([
        supabase.rpc("staff_site_visit_daily", { p_days: windowDays }),
        supabase.rpc("staff_site_visit_top_pages", { p_days: windowDays, p_limit: 8 }),
      ])

      if (dailyResult.error) throw dailyResult.error
      if (topPagesResult.error) throw topPagesResult.error

      setVisitStats(dailyResult.data || [])
      setTopPages(topPagesResult.data || [])
    } catch (err) {
      console.error("Error fetching visit stats:", err)
      const message = String(err?.message || "")
      if (message.includes("staff_site_visit_daily") || message.includes("staff_site_visit_top_pages")) {
        setVisitStatsError("Run the new staff activity SQL migration, then refresh this page.")
      } else {
        setVisitStatsError(getFriendlyErrorMessage(err, "Could not load visit stats. Retry."))
      }
    } finally {
      setLoadingVisitStats(false)
    }
  }

  const toggleIdIssued = async (shopId, currentStatus) => {
    setTogglingId(shopId)
    try {
      const newStatus = !currentStatus
      const { error } = await supabase.from("shops").update({ id_issued: newStatus }).eq("id", shopId)

      if (error) throw error

      setShops((prevShops) =>
        prevShops.map((shop) => (shop.id === shopId ? { ...shop, id_issued: newStatus } : shop))
      )
    } catch (err) {
      console.error("Error updating ID status:", err)
      notify({
        type: "error",
        title: "Could not update ID status",
        message: getFriendlyErrorMessage(err, "Could not update ID status. Retry."),
      })
    } finally {
      setTogglingId(null)
    }
  }

  const updateModerationDraft = (commentId, value) => {
    setModerationDrafts((prev) => ({ ...prev, [commentId]: value }))
  }

  const moderateComment = async (comment, nextStatus) => {
    const note = String(moderationDrafts[comment.id] || "").trim()

    if (nextStatus === "rejected" && !note) {
      notify({
        type: "error",
        title: "Reason required",
        message: "Please enter a moderation reason before rejecting this comment.",
      })
      return
    }

    setModeratingCommentId(comment.id)
    try {
      const payload = {
        status: nextStatus,
        moderation_reason: nextStatus === "approved" ? null : note || null,
      }

      const { error } = await supabase.from("shop_comments").update(payload).eq("id", comment.id)
      if (error) throw error

      notify({
        type: "success",
        title: "Comment updated",
        message:
          nextStatus === "approved"
            ? "The comment is now publicly visible."
            : nextStatus === "hidden"
              ? "The comment has been hidden from public view."
              : "The comment has been rejected.",
      })

      await fetchCommentQueue()
    } catch (err) {
      console.error("Error moderating comment:", err)
      notify({
        type: "error",
        title: "Moderation failed",
        message: getFriendlyErrorMessage(err, "Could not update this comment. Retry."),
      })
    } finally {
      setModeratingCommentId(null)
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    await supabase.auth.signOut()
    navigate("/staff-portal", { replace: true })
  }

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

  const visibleUsers = inactiveOnly ? userActivity.filter((item) => item.is_inactive) : userActivity
  const visitTimeline = buildVisitTimeline(visitStats, visitWindow)
  const todayKey = formatLagosDateKey(new Date())
  const pageVisitsToday = visitTimeline.find((item) => item.visit_date === todayKey)?.total_visits || 0
  const uniqueVisitorsToday = visitTimeline.find((item) => item.visit_date === todayKey)?.unique_visitors || 0
  const sessionsToday = visitTimeline.find((item) => item.visit_date === todayKey)?.total_sessions || 0
  const totalVisitsInWindow = visitTimeline.reduce((sum, item) => sum + (Number(item.total_visits) || 0), 0)
  const totalSessionsInWindow = visitTimeline.reduce((sum, item) => sum + (Number(item.total_sessions) || 0), 0)
  const totalInactiveUsers = userActivity.filter((item) => item.is_inactive).length

  const citySummaryMap = new Map()
  visibleUsers.forEach((item) => {
    const key = item.city_id || `unknown-${item.city_name || "none"}`
    if (!citySummaryMap.has(key)) {
      citySummaryMap.set(key, {
        city_id: item.city_id,
        city_name: item.city_name || "No city",
        state_name: item.state_name || "Unassigned",
        users: 0,
        inactive: 0,
        shops: 0,
      })
    }

    const summary = citySummaryMap.get(key)
    summary.users += 1
    summary.shops += Number(item.shop_count) || 0
    if (item.is_inactive) summary.inactive += 1
  })

  const citySummaries = Array.from(citySummaryMap.values()).sort((a, b) => {
    if (b.inactive !== a.inactive) return b.inactive - a.inactive
    return a.city_name.localeCompare(b.city_name)
  })
  const selectedKycMeta =
    selectedKycShop?.kyc_submission_meta && typeof selectedKycShop.kyc_submission_meta === "object"
      ? selectedKycShop.kyc_submission_meta
      : null
  const filteredCommentThreads = commentThreads.filter((thread) => {
    if (commentFilter === "all") return true
    return thread.comments.some((comment) => comment.status === commentFilter)
  })
  const pendingCommentCount = commentThreads.reduce((sum, thread) => sum + thread.pendingCount, 0)
  const approvedCommentTotal = commentThreads.reduce((sum, thread) => sum + thread.approvedCount, 0)
  const hiddenCommentTotal = commentThreads.reduce((sum, thread) => sum + thread.hiddenCount, 0)
  const rejectedCommentTotal = commentThreads.reduce((sum, thread) => sum + thread.rejectedCount, 0)

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
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
        <div className="mb-8 flex flex-col items-center gap-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:flex-row sm:items-start">
          <img
            src={avatarUrl}
            alt="Staff Avatar"
            className="h-24 w-24 rounded-full border-4 border-slate-100 object-cover shadow-sm"
          />
          <div className="text-center sm:text-left">
            <h2 className="mb-1 text-3xl font-bold text-[#2E1065]">{staffData.full_name}</h2>
            <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              <p className="flex items-center gap-2 font-medium text-slate-600">
                <FaEnvelope className="text-[#DB2777]" />
                <span>{authUser.email}</span>
              </p>
              <p className="flex items-center gap-2 font-medium text-slate-600">
                <FaBuilding className="text-[#DB2777]" />
                <span>{staffData.department || "General Operations"}</span>
              </p>
              <span className="inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-purple-800">
                {staffData.role}
              </span>
            </div>
          </div>
        </div>
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-purple-100">
              <FaBoxOpen className="text-xl text-[#2E1065]" />
            </div>
            <div className="text-3xl font-black text-slate-900">{shops.length}</div>
            <h3 className="mt-2 text-lg font-bold text-[#0F172A]">Recent Shops</h3>
            <p className="text-sm text-slate-500">Latest 50 shops in the repository.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <FaTriangleExclamation className="text-xl text-amber-600" />
            </div>
            <div className="text-3xl font-black text-slate-900">{totalInactiveUsers}</div>
            <h3 className="mt-2 text-lg font-bold text-[#0F172A]">Inactive Accounts</h3>
            <p className="text-sm text-slate-500">Users idle for {inactiveDays} days or more.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-pink-100">
              <FaUsers className="text-xl text-[#DB2777]" />
            </div>
            <div className="text-3xl font-black text-slate-900">{visibleUsers.length}</div>
            <h3 className="mt-2 text-lg font-bold text-[#0F172A]">Users In Scope</h3>
            <p className="text-sm text-slate-500">Current city/filter activity review.</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <FaChartLine className="text-xl text-blue-700" />
            </div>
            <div className="text-3xl font-black text-slate-900">{pageVisitsToday}</div>
            <h3 className="mt-2 text-lg font-bold text-[#0F172A]">Page Visits Today</h3>
            <p className="text-sm text-slate-500">
              {uniqueVisitorsToday} unique visitors, {sessionsToday} sessions today.
            </p>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-8 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900">Website Traffic</h2>
                <p className="text-sm text-slate-500">Daily page visits for the last {visitWindow} days.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[7, 30, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setVisitWindow(days)}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                      visitWindow === days ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            </div>

            {loadingVisitStats ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <FaCircleNotch className="animate-spin text-2xl text-slate-400" />
              </div>
            ) : visitStatsError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
                {visitStatsError}
              </div>
            ) : (
              <>
                <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Page Visits</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{totalVisitsInWindow}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Unique Visitors</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">
                      {visitTimeline.reduce((sum, item) => sum + (Number(item.unique_visitors) || 0), 0)}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Sessions</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">{totalSessionsInWindow}</div>
                  </div>
                </div>
                <VisitTrendChart data={visitTimeline} />
              </>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-900">Top Routes</h2>
                <p className="text-sm text-slate-500">Most visited pages in the selected window.</p>
              </div>
              <button
                type="button"
                onClick={() => fetchVisitStats(visitWindow)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
              >
                Refresh
              </button>
            </div>

            {loadingVisitStats ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <FaCircleNotch className="animate-spin text-2xl text-slate-400" />
              </div>
            ) : visitStatsError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
                {visitStatsError}
              </div>
            ) : topPages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No route visits recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {topPages.map((item, index) => (
                  <div
                    key={`${item.page_path}-${index}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-slate-900">{formatPageLabel(item.page_path)}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.page_path}</div>
                      </div>
                      <div className="text-right text-sm font-bold text-slate-900">
                        {item.total_visits}
                        <div className="mt-1 text-[11px] font-medium text-slate-500">{item.unique_visitors} unique</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900">User Activity Monitor</h2>
              <p className="text-sm text-slate-500">Review users by city, linked shops, and inactivity risk.</p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <FaLocationDot className="text-[#DB2777]" />
                <select value={selectedCityId} onChange={(event) => setSelectedCityId(event.target.value)} className="bg-transparent outline-none">
                  <option value="all">All cities</option>
                  {cityOptions.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name} - {city.state}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                <FaFilter className="text-[#DB2777]" />
                <select value={inactiveDays} onChange={(event) => setInactiveDays(Number(event.target.value))} className="bg-transparent outline-none">
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setInactiveOnly((value) => !value)}
                className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  inactiveOnly ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {inactiveOnly ? "Showing inactive only" : "Show inactive only"}
              </button>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {citySummaries.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 lg:col-span-3">
                No user activity found for this filter.
              </div>
            ) : (
              citySummaries.slice(0, 6).map((summary) => (
                <div key={`${summary.city_id}-${summary.city_name}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-lg font-black text-slate-900">{summary.city_name}</div>
                  <div className="text-sm font-medium text-slate-500">{summary.state_name}</div>
                  <div className="mt-4 flex gap-4 text-sm">
                    <div>
                      <div className="font-black text-slate-900">{summary.users}</div>
                      <div className="text-slate-500">Users</div>
                    </div>
                    <div>
                      <div className="font-black text-amber-600">{summary.inactive}</div>
                      <div className="text-slate-500">Inactive</div>
                    </div>
                    <div>
                      <div className="font-black text-[#2E1065]">{summary.shops}</div>
                      <div className="text-slate-500">Shops</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {loadingUserActivity ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <FaCircleNotch className="animate-spin text-2xl text-slate-400" />
            </div>
          ) : userActivityError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
              {userActivityError}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[980px] text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-bold">User</th>
                    <th className="px-5 py-4 font-bold">City</th>
                    <th className="px-5 py-4 font-bold">Last Login</th>
                    <th className="px-5 py-4 font-bold">Status</th>
                    <th className="px-5 py-4 font-bold">Shops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visibleUsers.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="px-5 py-10 text-center font-medium text-slate-500">
                        No users found for this filter.
                      </td>
                    </tr>
                  ) : (
                    visibleUsers.map((item) => {
                      const shopList = normaliseShopList(item.shops)
                      return (
                        <tr key={item.user_id} className="align-top transition hover:bg-slate-50">
                          <td className="px-5 py-4">
                            <div className="font-bold text-slate-900">{item.full_name || "Unnamed user"}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.email || "No email"}</div>
                            <div className="mt-2 text-xs text-slate-400">Joined {formatDateTime(item.account_created_at)}</div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">{item.city_name || "No city"}</div>
                            <div className="mt-1 text-xs text-slate-500">{item.state_name || "Unassigned"}</div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-900">
                              {formatDateTime(item.last_sign_in_at || item.last_seen_at)}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatActivityNote(item.inactivity_days, item.is_inactive, Boolean(item.last_sign_in_at))}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col items-start gap-2">
                              {item.is_inactive ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                                  <FaTriangleExclamation /> Flag inactive
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                                  <FaCircleCheck /> Active recently
                                </span>
                              )}
                              {item.is_suspended ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                                  Suspended
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {shopList.length === 0 ? (
                              <span className="text-sm font-medium text-slate-400">No shop</span>
                            ) : (
                              <div className="flex max-w-[360px] flex-wrap gap-2">
                                {shopList.map((shop) => (
                                  <span
                                    key={shop.shop_id}
                                    className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"
                                    title={`${shop.shop_name} (${shop.unique_id || "No ID"})`}
                                  >
                                    {shop.shop_name}
                                    <span className="text-slate-400">{shop.unique_id || "No ID"}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="mb-8 rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Community Moderation</h2>
              <p className="text-sm text-slate-500">Review shop discussion threads, approve comments, and keep conversations professional.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm">
                <FaComments className="text-[#DB2777]" />
                {pendingCommentCount} pending
              </div>
              <button
                type="button"
                onClick={fetchCommentQueue}
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100"
              >
                Refresh Comments
              </button>
            </div>
          </div>

          <div className="border-b border-slate-200 px-6 py-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-amber-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-amber-600">Pending</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{pendingCommentCount}</div>
              </div>
              <div className="rounded-2xl bg-green-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-green-600">Approved</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{approvedCommentTotal}</div>
              </div>
              <div className="rounded-2xl bg-slate-100 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Hidden</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{hiddenCommentTotal}</div>
              </div>
              <div className="rounded-2xl bg-rose-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wide text-rose-600">Rejected</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{rejectedCommentTotal}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { key: "pending", label: "Pending Review" },
                { key: "approved", label: "Approved" },
                { key: "hidden", label: "Hidden" },
                { key: "rejected", label: "Rejected" },
                { key: "all", label: "All Threads" },
              ].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setCommentFilter(option.key)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                    commentFilter === option.key
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold">Thread</th>
                  <th className="px-6 py-4 font-bold">Shop</th>
                  <th className="px-6 py-4 font-bold">Author</th>
                  <th className="px-6 py-4 font-bold">Status Mix</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingComments ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center">
                      <FaCircleNotch className="mx-auto animate-spin text-2xl text-slate-400" />
                    </td>
                  </tr>
                ) : filteredCommentThreads.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-10 text-center font-medium text-slate-500">
                      No comment threads found for this filter.
                    </td>
                  </tr>
                ) : (
                  filteredCommentThreads.map((thread) => (
                    <tr key={thread.id} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="max-w-[360px]">
                          <div className="line-clamp-2 font-semibold text-slate-900">{thread.root.body}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            {thread.root.product_name ? (
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">
                                {thread.root.product_name}
                              </span>
                            ) : (
                              <span className="rounded-full bg-pink-50 px-2.5 py-1 font-bold text-pink-600">
                                General shop service
                              </span>
                            )}
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">
                              {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{thread.root.shop_name}</div>
                        <div className="mt-1 text-xs font-mono text-slate-500">{thread.root.shop_unique_id || "No ID"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{thread.root.author_name}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(thread.root.created_at)}</div>
                        {thread.root.is_owner_comment ? (
                          <div className="mt-2 inline-flex rounded-full bg-pink-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-pink-600">
                            Shop owner
                          </div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {thread.pendingCount > 0 ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                              {thread.pendingCount} pending
                            </span>
                          ) : null}
                          {thread.approvedCount > 0 ? (
                            <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
                              {thread.approvedCount} approved
                            </span>
                          ) : null}
                          {thread.hiddenCount > 0 ? (
                            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">
                              {thread.hiddenCount} hidden
                            </span>
                          ) : null}
                          {thread.rejectedCount > 0 ? (
                            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
                              {thread.rejectedCount} rejected
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedCommentThread(thread)}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#2E1065] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4c1d95]"
                        >
                          <FaEye /> Review Thread
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center">
            <h2 className="text-lg font-extrabold text-slate-900">Merchant Verifications</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate("/staff-studio")}
                className="inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-pink-700"
              >
                <FaWandMagicSparkles /> Launch CT Studio
              </button>
              <button
                onClick={() => navigate("/staff-inbox")}
                className="inline-flex items-center gap-2 rounded-lg bg-[#2E1065] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4c1d95]"
              >
                <FaUsers /> Open Support Inbox
              </button>
              <button onClick={fetchShops} className="rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100">
                Refresh List
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="border-b border-slate-200 bg-white text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-bold">Shop Details</th>
                  <th className="px-6 py-4 font-bold">Proprietor</th>
                  <th className="px-6 py-4 font-bold">KYC Status</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loadingShops ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center">
                      <FaCircleNotch className="mx-auto animate-spin text-2xl text-slate-400" />
                    </td>
                  </tr>
                ) : shops.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500 font-medium">
                      No shops found in the repository.
                    </td>
                  </tr>
                ) : (
                  shops.map((shop) => (
                    <tr key={shop.id} className="transition hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{shop.name}</div>
                        <div className="mt-0.5 text-xs font-mono text-slate-500">{shop.unique_id || "Unassigned"}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">{shop.profiles?.full_name || "Unknown"}</td>
                      <td className="px-6 py-4">
                        {shop.kyc_status === "approved" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-600" /> KYC Approved
                          </span>
                        ) : shop.kyc_status === "submitted" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" /> Video Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Awaiting submission
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {shop.kyc_status === "approved" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => toggleIdIssued(shop.id, shop.id_issued)}
                              disabled={togglingId === shop.id}
                              className={`inline-flex min-w-[110px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                                shop.id_issued
                                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                              }`}
                            >
                              {togglingId === shop.id ? (
                                <FaCircleNotch className="animate-spin" />
                              ) : shop.id_issued ? (
                                <>
                                  <FaCircleCheck className="text-green-600" /> Issued
                                </>
                              ) : (
                                "Mark Issued"
                              )}
                            </button>

                            <button
                              onClick={() => navigate(`/staff-issue-id?shop_id=${shop.id}`)}
                              className="inline-flex items-center gap-2 rounded-lg bg-[#2E1065] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4c1d95]"
                            >
                              <FaIdBadge /> Issue ID
                            </button>
                          </div>
                        ) : shop.kyc_status === "submitted" ? (
                          <div className="flex justify-end">
                            <button
                              onClick={() => setSelectedKycShop(shop)}
                              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600"
                            >
                              <FaVideo /> Review KYC
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <button
                              disabled
                              className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-xs font-bold text-slate-400"
                            >
                              <FaEye /> No Action
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedCommentThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Community Thread Review</h3>
                <p className="text-sm text-slate-500">
                  {selectedCommentThread.root.shop_name} • {selectedCommentThread.comments.length} comment{selectedCommentThread.comments.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setSelectedCommentThread(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                {selectedCommentThread.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className={`rounded-3xl border p-5 shadow-sm ${
                      comment.parent_id ? "ml-0 bg-slate-50 lg:ml-8" : "bg-white"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-extrabold text-slate-900">{comment.author_name}</div>
                          {comment.is_owner_comment ? (
                            <span className="rounded-full bg-pink-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-pink-600">
                              Shop Owner
                            </span>
                          ) : null}
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${getCommentStatusBadge(comment.status)}`}>
                            {comment.status}
                          </span>
                          {comment.product_name ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                              {comment.product_name}
                            </span>
                          ) : null}
                          {comment.parent_id ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              <FaReply />
                              Reply
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs font-medium text-slate-400">{formatDateTime(comment.created_at)}</div>
                        <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{comment.body}</div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                        Moderation Note
                      </label>
                      <textarea
                        value={moderationDrafts[comment.id] || ""}
                        onChange={(event) => updateModerationDraft(comment.id, event.target.value)}
                        placeholder="Optional for approve/hide. Required for reject."
                        className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => moderateComment(comment, "approved")}
                        disabled={moderatingCommentId === comment.id}
                        className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-60"
                      >
                        {moderatingCommentId === comment.id ? <FaCircleNotch className="animate-spin" /> : <FaCircleCheck />}
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => moderateComment(comment, "hidden")}
                        disabled={moderatingCommentId === comment.id}
                        className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-900 disabled:opacity-60"
                      >
                        Hide
                      </button>
                      <button
                        type="button"
                        onClick={() => moderateComment(comment, "rejected")}
                        disabled={moderatingCommentId === comment.id}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                  <div className="mb-3 text-sm font-bold text-[#2E1065]">Thread Summary</div>
                  <div className="space-y-3 text-sm text-slate-700">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shop</div>
                      <div className="mt-1 font-semibold text-slate-900">{selectedCommentThread.root.shop_name}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shop ID</div>
                      <div className="mt-1 font-mono font-semibold text-slate-900">
                        {selectedCommentThread.root.shop_unique_id || "Unassigned"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest Activity</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {formatDateTime(selectedCommentThread.latestAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                  <div className="mb-2 text-sm font-bold text-amber-900">Moderation Guidance</div>
                  <p className="text-sm leading-6 text-amber-900/90">
                    Approve useful business-related comments, hide low-quality noise, and reject abusive or misleading posts with a clear note.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedKycShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">KYC Video Review</h3>
                <p className="text-sm text-slate-500">
                  {selectedKycShop.name} • {selectedKycShop.unique_id || "Unassigned"}
                </p>
              </div>
              <button
                onClick={() => setSelectedKycShop(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.95fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-sm">
                  {selectedKycShop.kyc_video_url ? (
                    <video
                      src={selectedKycShop.kyc_video_url}
                      controls
                      preload="metadata"
                      className="aspect-video w-full bg-black"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm font-semibold text-slate-400">
                      No video attached.
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#2E1065]">
                    <FaVideo className="text-[#DB2777]" />
                    Submission Notes
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Merchant</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">
                        {selectedKycMeta?.merchant_name || selectedKycShop.profiles?.full_name || "Unknown"}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">
                        {formatDateTime(selectedKycMeta?.submitted_at || selectedKycShop.created_at)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recorded</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">
                        {formatDateTime(selectedKycMeta?.recorded_at)}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">
                        {selectedKycMeta?.location_label ||
                          selectedKycShop.cities?.name ||
                          "Unknown location"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 text-sm font-bold text-[#2E1065]">Shop Details</div>
                  <div className="space-y-3 text-sm text-slate-700">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shop Name</div>
                      <div className="mt-1 font-semibold text-slate-900">{selectedKycShop.name}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        {selectedKycMeta?.shop_address || selectedKycShop.address || "No address provided"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coordinates</div>
                      <div className="mt-1 font-semibold text-slate-900">
                        LAT {formatCoordinate(selectedKycMeta?.latitude)} / LNG {formatCoordinate(selectedKycMeta?.longitude)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                  <div className="mb-2 text-sm font-bold text-amber-900">Admin Review Guidance</div>
                  <p className="text-sm leading-6 text-amber-900/90">
                    Confirm the storefront is visible, products are shown clearly, and the video location matches the
                    registered shop information before approval.
                  </p>
                  {selectedKycShop.rejection_reason && (
                    <div className="mt-4 rounded-2xl border border-rose-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-rose-400">Last Rejection Note</div>
                      <div className="mt-1 text-sm font-semibold text-rose-700">{selectedKycShop.rejection_reason}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
