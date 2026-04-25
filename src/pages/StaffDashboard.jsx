import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaArrowTrendUp,
  FaChartLine,
  FaCircleNotch,
  FaComments,
  FaEnvelope,
  FaImages,
  FaReceipt,
  FaShieldHalved,
  FaStore,
  FaTowerBroadcast,
  FaUsers,
  FaPanorama,
  FaBullhorn,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { prepareStaffRouteTransition } from "../lib/staffRouteTransitions"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  useStaffCounts,
  useStaffPortalSession,
} from "./staff/StaffPortalShared"

function HomeCard({ icon, title, subtitle, metric, metricLabel = "Live", onClick, tone = "pink" }) {
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
      className={`group relative rounded-[28px] border border-slate-200 bg-gradient-to-br ${toneClass} p-1 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)]`}
    >
      <div className="rounded-[24px] bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-current/10 text-2xl">
            {icon}
          </div>
          {metric !== undefined ? (
            <div className="text-right">
              <div className={`text-[11px] font-black uppercase tracking-[0.18em] ${metric > 0 && metricLabel === "Pending" ? "text-pink-600" : "text-slate-400"}`}>
                {metricLabel}
              </div>
              <div className="mt-1 text-3xl font-black text-slate-900">{metric}</div>
            </div>
          ) : null}
        </div>
        <div className="text-lg font-black text-slate-900">{title}</div>
        <div className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</div>
      </div>
      {metric > 0 && metricLabel === "Pending" && (
        <div className="absolute -right-2 -top-2 flex h-8 min-w-[32px] items-center justify-center rounded-full bg-[#DB2777] px-2 text-xs font-black text-white shadow-lg ring-4 ring-white">
          {metric > 99 ? "99+" : metric}
        </div>
      )}
    </button>
  )
}

export default function StaffDashboard() {
  const navigate = useNavigate()
  const isMounted = useRef(true)
  const retryRouteTransitionRef = useRef(null)

  const { 
    isSuperAdmin, 
    staffCityId
  } = useStaffPortalSession()

  const { counts, summary, loading, refresh: refreshCounts } = useStaffCounts(isSuperAdmin, staffCityId)

  const [routeTransition, setRouteTransition] = useState({
    pending: false,
    error: "",
  })

  useEffect(() => {
    return () => { isMounted.current = false }
  }, [])

  const handleRefresh = useCallback(() => {
    refreshCounts()
  }, [refreshCounts])

  const beginRouteTransition = useCallback((retryAction = null) => {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: true,
      error: "",
    })
  }, [])

  const failRouteTransition = useCallback((message, retryAction = null) => {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: false,
      error: message,
    })
  }, [])

  const runStaffRouteTransition = useCallback(async (path, retryAction) => {
    if (!path) return

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
  }, [beginRouteTransition, failRouteTransition, navigate])

  const openStaffRouteWithTransition = useCallback((path) => {
    if (!path) return undefined

    let retryAction = null
    retryAction = () => {
      void runStaffRouteTransition(path, retryAction)
    }

    return runStaffRouteTransition(path, retryAction)
  }, [runStaffRouteTransition])

  const headerActions = useMemo(
    () => [
      <QuickActionButton
        key="refresh"
        icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />}
        label="Refresh Overview"
        tone="white"
        onClick={handleRefresh}
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
    [handleRefresh, loading, openStaffRouteWithTransition]
  )

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
              subtitle="Review page visits, route performance, and daily traffic movement."
              metric={summary.visitsToday}
              tone="blue"
              onClick={() => void openStaffRouteWithTransition("/staff-traffic")}
            />
            <HomeCard
              icon={<FaArrowTrendUp />}
              title="Shop Analytics"
              subtitle="Rank shops by visits, repo-search visibility, and real buyer contact actions."
              tone="pink"
              onClick={() => void openStaffRouteWithTransition("/staff-shop-analytics")}
            />
            <HomeCard
              icon={<FaUsers />}
              title="User Activity"
              subtitle="Inspect city-level user activity, inactivity risk, and shop ownership patterns."
              metric={summary.inactiveUsers}
              metricLabel="Inactive"
              tone="amber"
              onClick={() => void openStaffRouteWithTransition("/staff-users")}
            />
            <HomeCard
              icon={<FaComments />}
              title="Community Moderation"
              subtitle="Approve, hide, or reject shop discussion threads and keep conversations professional."
              metric={counts.community}
              metricLabel="Pending"
              tone="pink"
              onClick={() => void openStaffRouteWithTransition("/staff-community")}
            />
            <HomeCard
              icon={<FaStore />}
              title="Merchant Verifications"
              subtitle="Review applications, KYC videos, and supervise approval workflows."
              metric={counts.verifications}
              metricLabel="Pending"
              tone="purple"
              onClick={() => void openStaffRouteWithTransition("/staff-verifications")}
            />
            <HomeCard
              icon={<FaPanorama />}
              title="Shop Content"
              subtitle="Moderate shop display banners and news updates for high-quality visuals."
              metric={counts.content}
              metricLabel="Pending"
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
              icon={<FaEnvelope />}
              title="Individual Alerts"
              subtitle="Send targeted, private notifications directly to specific merchant accounts."
              tone="blue"
              onClick={() => void openStaffRouteWithTransition("/staff-notifications")}
            />
            <HomeCard
              icon={<FaWandMagicSparkles />}
              title="Product Moderation"
              subtitle="Approve or reject new product listings from merchants to keep marketplace clean."
              metric={counts.products}
              metricLabel="Pending"
              tone="purple"
              onClick={() => void openStaffRouteWithTransition("/staff-products")}
            />

            {isSuperAdmin && (
              <HomeCard
                icon={<FaReceipt />}
                title="Offline Payments"
                subtitle="Approve bank transfer receipts and activate shop subscriptions."
                metric={counts.payments}
                metricLabel="Pending"
                tone="blue"
                onClick={() => void openStaffRouteWithTransition("/staff-payments")}
              />
            )}

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
              subtitle="Detect suspicious contact behavior, spam pressure, and deeper account clusters."
              metric={counts.radar}
              metricLabel="Alerts"
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
              <div className="mt-3 text-4xl font-black text-slate-900">{counts.community}</div>
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
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#DB2777]">Merchant Verifications</div>
              <div className="mt-3 text-4xl font-black text-slate-900">{counts.verifications}</div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Pending shop applications and identity submissions awaiting review.
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
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#DB2777]">User Activity</div>
              <div className="mt-3 text-4xl font-black text-slate-900">{summary.inactiveUsers}</div>
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Inactive accounts flagged for follow-up and city-level analysis.
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
