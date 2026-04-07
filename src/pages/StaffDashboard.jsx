import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaChartLine,
  FaCircleNotch,
  FaComments,
  FaEnvelope,
  FaStore,
  FaTriangleExclamation,
  FaUsers,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
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

  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({
    shopCount: 0,
    pendingComments: 0,
    inactiveUsers: 0,
    visitsToday: 0,
  })

  async function fetchSummary() {
    setLoading(true)
    try {
      const [shopsResult, commentsResult, usersResult, visitsResult] = await Promise.all([
        supabase.from("shops").select("id", { count: "exact", head: true }),
        supabase.from("shop_comments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.rpc("staff_user_activity_summary", {
          p_inactive_days: 180,
          p_city_id: null,
        }),
        supabase.rpc("staff_site_visit_daily", { p_days: 7 }),
      ])

      if (shopsResult.error) throw shopsResult.error
      if (commentsResult.error) throw commentsResult.error
      if (usersResult.error) throw usersResult.error
      if (visitsResult.error) throw visitsResult.error

      const userRows = usersResult.data || []
      const visitTimeline = buildVisitTimeline(visitsResult.data || [], 7)
      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })
      const visitsToday = visitTimeline.find((item) => item.visit_date === todayKey)?.total_visits || 0

      setSummary({
        shopCount: shopsResult.count || 0,
        pendingComments: commentsResult.count || 0,
        inactiveUsers: userRows.filter((item) => item.is_inactive).length,
        visitsToday: Number(visitsToday) || 0,
      })
    } catch (err) {
      console.error("Error fetching staff summary:", err)
      notify({
        type: "error",
        title: "Could not load staff overview",
        message: getFriendlyErrorMessage(err, "Could not load the staff home screen. Retry."),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSummary()
  }, [])

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
        onClick={() => navigate("/staff-inbox")}
      />,
      <QuickActionButton
        key="studio"
        icon={<FaWandMagicSparkles />}
        label="Launch CT Studio"
        tone="pink"
        onClick={() => navigate("/staff-studio")}
      />,
    ],
    [loading, navigate]
  )

  return (
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

      <div className="mb-10 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <HomeCard
          icon={<FaChartLine />}
          title="Traffic Intelligence"
          subtitle="Review page visits, route performance, and daily traffic movement in a dedicated analytics workspace."
          metric={summary.visitsToday}
          tone="blue"
          onClick={() => navigate("/staff-traffic")}
        />
        <HomeCard
          icon={<FaUsers />}
          title="User Activity"
          subtitle="Inspect city-level user activity, inactivity risk, and shop ownership patterns without crowding the main dashboard."
          metric={summary.inactiveUsers}
          tone="amber"
          onClick={() => navigate("/staff-users")}
        />
        <HomeCard
          icon={<FaComments />}
          title="Community Moderation"
          subtitle="Approve, hide, or reject shop discussion threads and keep public conversations professional."
          metric={summary.pendingComments}
          tone="pink"
          onClick={() => navigate("/staff-community")}
        />
        <HomeCard
          icon={<FaStore />}
          title="Merchant Verifications"
          subtitle="Review KYC videos, issue merchant IDs, and supervise approval workflows from a focused verification page."
          metric={summary.shopCount}
          tone="purple"
          onClick={() => navigate("/staff-verifications")}
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
            onClick={() => navigate("/staff-community")}
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
            onClick={() => navigate("/staff-verifications")}
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
            onClick={() => navigate("/staff-users")}
            className="mt-5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
          >
            Open User Activity Page
          </button>
        </div>
      </div>
    </StaffPortalShell>
  )
}

