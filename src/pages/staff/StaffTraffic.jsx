import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { FaChartLine, FaCircleNotch } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
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
  const totalVisitsInWindow = visitTimeline.reduce((sum, item) => sum + (Number(item.total_visits) || 0), 0)

  return (
    <StaffPortalShell
      activeKey="traffic"
      title="Traffic Intelligence"
      description="A focused workspace for platform traffic monitoring and visitor trends."
    >
      <SectionHeading
        eyebrow="Insights"
        title="Traffic Monitoring"
        description="Review daily visit movement and general platform discovery trends."
        actions={
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setVisitWindow(days)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  visitWindow === days ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
                }`}
              >
                {days} days
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

      <div className="mb-8 max-w-sm">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Total Page Visits</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{totalVisitsInWindow}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {loadingVisitStats ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <FaCircleNotch className="animate-spin text-2xl text-slate-400" />
          </div>
        ) : visitStatsError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
            {visitStatsError}
          </div>
        ) : (
          <VisitTrendChart data={visitTimeline} />
        )}
      </div>
    </StaffPortalShell>
  )
}
