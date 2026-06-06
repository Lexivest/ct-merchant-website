import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { FaChartLine, FaCircleNotch } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import InlineErrorState from "../../components/common/InlineErrorState"
import {
  SectionHeading,
  StaffPortalShell,
  VisitTrendChart,
  buildVisitTimeline,
} from "./StaffPortalShared"

export default function StaffTraffic() {
  const location = useLocation()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-traffic"
      ? location.state.prefetchedData
      : null
  const [visitWindow, setVisitWindow] = useState(() => prefetchedData?.visitWindow || 30)
  const [visitStats, setVisitStats] = useState(() => prefetchedData?.visitStats || [])
  const [loadingVisitStats, setLoadingVisitStats] = useState(() => !prefetchedData)
  const [visitStatsError, setVisitStatsError] = useState("")
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const fetchVisitStats = useCallback(async (windowDays) => {
    if (prefetchedReady && prefetchedData && windowDays === prefetchedData.visitWindow) {
      setVisitStats(prefetchedData.visitStats || [])
      setVisitStatsError("")
      setLoadingVisitStats(false)
      setPrefetchedReady(false)
      return
    }

    setLoadingVisitStats(true)
    setVisitStatsError("")
    try {
      const { data, error } = await supabase.rpc("staff_site_visit_daily", { p_days: windowDays })

      if (error) throw error
      setVisitStats(data || [])
    } catch (err) {
      console.error("Error fetching visit stats:", err)
      const message = String(err?.message || "")
      if (message.includes("staff_site_visit_daily")) {
        setVisitStatsError("Run the new staff activity SQL migration, then refresh this page.")
      } else {
        setVisitStatsError(getFriendlyErrorMessage(err, "Could not load visit stats. Retry."))
      }
    } finally {
      setLoadingVisitStats(false)
    }
  }, [prefetchedData, prefetchedReady])

  useEffect(() => {
    fetchVisitStats(visitWindow)
  }, [fetchVisitStats, visitWindow])

  const visitTimeline = useMemo(() => buildVisitTimeline(visitStats, visitWindow), [visitStats, visitWindow])
  const uniqueVisitorsInWindow = visitTimeline.reduce((sum, item) => sum + (Number(item.unique_visitors) || 0), 0)
  const uniqueHomeVisitsInWindow = visitTimeline.reduce((sum, item) => sum + (Number(item.unique_home_visits) || 0), 0)
  const windowLabel = visitWindow === 1 ? "today" : `in the last ${visitWindow} days`

  return (
    <StaffPortalShell
      activeKey="traffic"
      title="Unique Visitors"
      description="How many distinct people open the platform — counted once per visitor per day."
    >
      <SectionHeading
        eyebrow="Insights"
        title="Unique Visitor Trends"
        description="Daily unique visitors to the platform and to the homepage. Each browser is counted at most once per day; no visitor identity or device data is stored."
        actions={
          <div className="flex flex-wrap gap-2">
            {[1, 7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setVisitWindow(days)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  visitWindow === days ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
                }`}
              >
                {days === 1 ? "Today" : `${days} days`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => fetchVisitStats(visitWindow)}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-100"
            >
              Refresh
            </button>
          </div>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-pink-200 bg-gradient-to-br from-white to-pink-50 p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-pink-500">Unique Site Visitors</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{uniqueVisitorsInWindow}</div>
          <div className="mt-1 text-xs font-semibold text-slate-400">
            Distinct people who opened the platform {windowLabel}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Unique Home Visits</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{uniqueHomeVisitsInWindow}</div>
          <div className="mt-1 text-xs font-semibold text-slate-400">
            Opened ctmerchant.com.ng homepage {windowLabel}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {loadingVisitStats ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <FaCircleNotch className="animate-spin text-2xl text-slate-400" />
          </div>
        ) : visitStatsError ? (
          <InlineErrorState
            title="Traffic data unavailable"
            message={visitStatsError}
            onRetry={() => fetchVisitStats(visitWindow)}
          />
        ) : (
          <VisitTrendChart data={visitTimeline} />
        )}
      </div>
    </StaffPortalShell>
  )
}
