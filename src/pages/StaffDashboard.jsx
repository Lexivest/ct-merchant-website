import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaChartLine,
  FaCircleNotch,
  FaComments,
  FaEnvelope,
  FaImages,
  FaReceipt,
  FaShieldHalved,
  FaStore,
  FaTowerBroadcast,
  FaTriangleExclamation,
  FaUsers,
  FaPanorama,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import GlobalErrorScreen from "../components/common/GlobalErrorScreen"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { prepareStaffRouteTransition } from "../lib/staffRouteTransitions"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  buildVisitTimeline,
} from "./staff/StaffPortalShared"

function HomeCard({ icon, title, subtitle, metric, onClick, tone = "pink" }) {
  const toneClass =
    tone === "purple"
      ? "from-[#ede9fe] to-white text-[#5B21B6]"
      : tone === "blue"
        ? "from-[#dbeafe] to-white text-[#1d4ed8]"
        : tone === "amber"
          ? "from-[#fef3c7] to-white text-[#b45309]"
          : "from-[#fce7f3] to-white text-[#DB2777]"

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-[28px] border border-slate-200 bg-gradient-to-br ${toneClass} p-1 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]`}
    >
      <div className="rounded-[24px] bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-current/10 text-2xl">
            {icon}
          </div>
          {metric !== undefined ? (
            <div className="text-right">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                Live
              </div>
              <div className="mt-1 text-3xl font-black text-slate-900">{metric}</div>
            </div>
          ) : null}
        </div>
        <div className="text-lg font-black text-slate-900">{title}</div>
        <div className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</div>
      </div>
    </button>
  )
}

export default function StaffDashboard() {
  const navigate = useNavigate()
  const { notify } = useGlobalFeedback()
  const isMounted = useRef(true)
  const retryRouteTransitionRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [routeTransition, setRouteTransition] = useState({
    pending: false,
    error: "",
  })
  const [summaryError, setSummaryError] = useState(null)
  const [summary, setSummary] = useState({
    shopCount: 0,
    pendingComments: 0,
    inactiveUsers: 0,
    visitsToday: 0,
    pendingPayments: 0,
    securityClusters: 0,
  })

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    setSummaryError(null)
    try {
      const results = await Promise.allSettled([
        supabase.from("shops").select("id", { count: "exact", head: true }),
        supabase.from("shop_comments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.rpc("staff_user_activity_summary", {
          p_inactive_days: 180,
          p_city_id: null,
        }),
        supabase.rpc("staff_site_visit_daily", { p_days: 7 }),
        supabase.from("offline_payment_proofs").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.rpc("ctm_get_security_radar_insights"),
      ])

      const labels = ["shops", "comments", "users", "visits", "payments", "radar"]
      const errors = []
      
      results.forEach((result, idx) => {
        if (result.status === "rejected") {
          errors.push(`${labels[idx]}: ${result.reason?.message || "Unknown error"}`)
        } else if (result.value.error) {
          errors.push(`${labels[idx]}: ${result.value.error.message}`)
        }
      })

      if (errors.length > 0) {
        throw new Error(`Summary fetch partially failed: ${errors.join(", ")}`)
      }

      const [shopsResult, commentsResult, usersResult, visitsResult, paymentsResult, radarResult] = results.map(r => r.value)

      const userRows = usersResult.data || []
      const visitTimeline = buildVisitTimeline(visitsResult.data || [], 7)
      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })
      const visitsToday = visitTimeline.find((item) => item.visit_date === todayKey)?.total_visits || 0

      if (isMounted.current) {
        setSummary({
          shopCount: shopsResult.count || 0,
          pendingComments: commentsResult.count || 0,
          inactiveUsers: userRows.filter((item) => item.is_inactive).length,
          visitsToday: Number(visitsToday) || 0,
          pendingPayments: paymentsResult.count || 0,
          securityClusters: (radarResult.data || []).length,
        })
      }
    } catch (err) {
      console.error("Error fetching staff summary:", err)
      if (isMounted.current) {
        setSummaryError(err)
        notify({
          type: "error",
          title: "Could not load staff overview",
          message: getFriendlyErrorMessage(err, "Could not load the staff home screen. Retry."),
        })
      }
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    fetchSummary()
    return () => { isMounted.current = false }
  }, [fetchSummary])

  function beginRouteTransition(retryAction = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: true,
      error: "",
    })
  }

  function failRouteTransition(message, retryAction = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: false,
      error: message,
    })
  }

  const openStaffRouteWithTransition = useCallback(async (path) => {
    if (!path) return

    const retryAction = () => openStaffRouteWithTransition(path)
    beginRouteTransition(retryAction)

    try {
      const prefetchedData = await prepareStaffRouteTransition({ path })
      navigate(path, {
        state: {
          fromStaffTransition: true,
          prefetchedData,
        },
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
  }, [navigate])

  const headerActions = useMemo(
    () => [
      <QuickActionButton
        key="refresh"
        icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />}
        label="Refresh Overview"
        tone="white"
        onClick={fetchSummary}
      />,
      <QuickActionButton
        key="inbox"
        icon={<FaEnvelope />}
        label="Open Support Inbox"
        onClick={() => void openStaffRouteWithTransition("/staff-inbox")}
      />,
      <QuickActionButton
        key="sponsored-products"
        icon={<FaImages />}
        label="Sponsored Products"
        tone="pink"
        onClick={() => void openStaffRouteWithTransition("/staff-sponsored-products")}
      />,
      <QuickActionButton
        key="city-banners"
        icon={<FaImages />}
        label="City Banners"
        tone="pink"
        onClick={() => void openStaffRouteWithTransition("/staff-city-banners")}
      />,
    ],
    [fetchSummary, loading, openStaffRouteWithTransition]
  )

  if (summaryError && !loading) {
    return (
      <GlobalErrorScreen
        error={summaryError}
        message={getFriendlyErrorMessage(summaryError, "Could not load the staff home screen. Retry.")}
        onRetry={fetchSummary}
        onBack={() => navigate("/staff-portal")}
      />
    )
  }

  return (
    <>
      <PageTransitionOverlay
        visible={routeTransition.pending}
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
          })
        }
      />
      <div className={routeTransition.pending ? "pointer-events-none select-none" : ""}>
        <StaffPortalShell
          activeKey="home"
          title="Staff Portal Home"
          description="Move through moderation, analytics, user operations, and merchant controls from one clean command center."
          headerActions={headerActions}
        >
          <SectionHeading
            eyebrow="Home"
            title="Operations Areas"
            description="Each card opens a dedicated working page so the staff portal behaves like a proper internal product, not one long stacked screen."
          />

          <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-6">
            <HomeCard
              icon={<FaChartLine />}
              title="Traffic Intelligence"
              subtitle="Review page visits, route performance, and daily traffic movement in a dedicated analytics workspace."
              metric={summary.visitsToday}
              tone="blue"
              onClick={() => void openStaffRouteWithTransition("/staff-traffic")}
            />
            <HomeCard
              icon={<FaUsers />}
              title="User Activity"
              subtitle="Inspect city-level user activity, inactivity risk, and shop ownership patterns without crowding the main dashboard."
              metric={summary.inactiveUsers}
              tone="amber"
              onClick={() => void openStaffRouteWithTransition("/staff-users")}
            />
            <HomeCard
              icon={<FaComments />}
              title="Community Moderation"
              subtitle="Approve, hide, or reject shop discussion threads and keep public conversations professional."
              metric={summary.pendingComments}
              tone="pink"
              onClick={() => void openStaffRouteWithTransition("/staff-community")}
            />
            <HomeCard
              icon={<FaStore />}
              title="Merchant Verifications"
              subtitle="Review KYC videos, issue merchant IDs, and supervise approval workflows from a focused verification page."
              metric={summary.shopCount}
              tone="purple"
              onClick={() => void openStaffRouteWithTransition("/staff-verifications")}
            />
            <HomeCard
              icon={<FaPanorama />}
              title="Shop Content"
              subtitle="Moderate shop display banners and news updates to ensure high-quality marketplace visuals."
              tone="blue"
              onClick={() => void openStaffRouteWithTransition("/staff-shop-content")}
            />
            <HomeCard
              icon={<FaBullhorn />}
              title="City Announcements"
              subtitle="Broadcast important messages and alerts to users in specific cities."
              tone="amber"
              onClick={() => void openStaffRouteWithTransition("/staff-announcements")}
            />
            <HomeCard
              icon={<FaWandMagicSparkles />}
              title="Product Moderation"
              subtitle="Approve or reject new product listings from merchants to keep the marketplace clean and professional."
              metric={summary.shopCount}
              tone="purple"
              onClick={() => void openStaffRouteWithTransition("/staff-products")}
            />
            <HomeCard
              icon={<FaReceipt />}
              title="Offline Payments"
              subtitle="Approve bank transfer receipts, activate subscriptions, and reject unclear proof with notes."
              metric={summary.pendingPayments}
              tone="blue"
              onClick={() => void openStaffRouteWithTransition("/staff-payments")}
            />
            <HomeCard
              icon={<FaImages />}
              title="Sponsored Products"
              subtitle="Select and publish products to feature in the marketplace."
              tone="pink"
              onClick={() => void openStaffRouteWithTransition("/staff-sponsored-products")}
            />
            <HomeCard
              icon={<FaPanorama />}
              title="Market Discoveries"
              subtitle="Post portrait-style direct fashion and lifestyle shots."
              tone="blue"
              onClick={() => void openStaffRouteWithTransition("/staff-discoveries")}
            />
            <HomeCard
              icon={<FaImages />}
              title="City Banners"
              subtitle="Generate and publish featured shop banners for the marketplace carousel."
              tone="pink"
              onClick={() => void openStaffRouteWithTransition("/staff-city-banners")}
            />
            <HomeCard
              icon={<FaTowerBroadcast />}
              title="Security Intelligence"
              subtitle="Detect multi-account clusters and suspicious merchant footprints sharing network fingerprints."
              metric={summary.securityClusters}
              tone="amber"
              onClick={() => void openStaffRouteWithTransition("/staff-security-radar")}
            />
          </div>

          <SectionHeading
            eyebrow="Quick Status"
            title="Today At A Glance"
            description="A compact briefing for what needs attention before you drill into the detailed operational pages."
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#DB2777]">Community Queue</div>
              <div className="mt-3 text-4xl font-black text-slate-900">{summary.pendingComments}</div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Pending shop comments awaiting approval or moderation action.
              </p>
              <button
                type="button"
                onClick={() => void openStaffRouteWithTransition("/staff-community")}
                className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                Open Community Page
              </button>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#DB2777]">Merchant Load</div>
              <div className="mt-3 text-4xl font-black text-slate-900">{summary.shopCount}</div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Latest merchant records available for verification and operational supervision.
              </p>
              <button
                type="button"
                onClick={() => void openStaffRouteWithTransition("/staff-verifications")}
                className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                Open Verification Page
              </button>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#DB2777]">User Health</div>
              <div className="mt-3 text-4xl font-black text-slate-900">{summary.inactiveUsers}</div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Inactive accounts flagged at the 180-day threshold for follow-up and analysis.
              </p>
              <button
                type="button"
                onClick={() => void openStaffRouteWithTransition("/staff-users")}
                className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                Open User Activity Page
              </button>
            </div>
          </div>
        </StaffPortalShell>
      </div>
    </>
  )
}
