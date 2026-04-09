import { useEffect, useMemo, useState } from "react"
import { FaChartLine, FaCircleNotch } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  SectionHeading,
  StaffPortalShell,
  VisitTrendChart,
  buildVisitTimeline,
  formatPageLabel,
} from "./StaffPortalShared"

export default function StaffTraffic() {
  const [visitWindow, setVisitWindow] = useState(30)
  const [visitStats, setVisitStats] = useState([])
  const [topPages, setTopPages] = useState([])
  const [loadingVisitStats, setLoadingVisitStats] = useState(true)
  const [visitStatsError, setVisitStatsError] = useState("")

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

  useEffect(() => {
    fetchVisitStats(visitWindow)
  }, [visitWindow])

  const visitTimeline = useMemo(() => buildVisitTimeline(visitStats, visitWindow), [visitStats, visitWindow])
  const totalVisitsInWindow = visitTimeline.reduce((sum, item) => sum + (Number(item.total_visits) || 0), 0)
  const totalUniqueVisitors = visitTimeline.reduce((sum, item) => sum + (Number(item.unique_visitors) || 0), 0)
  const totalSessionsInWindow = visitTimeline.reduce((sum, item) => sum + (Number(item.total_sessions) || 0), 0)

  return (
    <StaffPortalShell
      activeKey="traffic"
      title="Traffic Intelligence"
      description="A focused workspace for platform traffic, route visibility, and visitor movement trends."
    >
      <SectionHeading
        eyebrow="Insights"
        title="Traffic Monitoring"
        description="Review daily visit movement and identify which routes are driving the most discovery across the platform."
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

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Page Visits</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{totalVisitsInWindow}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Unique Visitors</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{totalUniqueVisitors}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Sessions</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{totalSessionsInWindow}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.15fr,0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {loadingVisitStats ? (
            <div className="flex min-h-[260px] items-center justify-center">
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

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-100 text-[#DB2777]">
              <FaChartLine />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Top Routes</h3>
              <p className="text-sm text-slate-500">Most visited pages in the selected window.</p>
            </div>
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
                <div key={`${item.page_path}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
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
    </StaffPortalShell>
  )
}
