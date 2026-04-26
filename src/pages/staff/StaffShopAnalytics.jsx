import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  FaArrowTrendUp,
  FaCircleNotch,
  FaClockRotateLeft,
  FaEye,
  FaPhone,
  FaRotateRight,
  FaShieldHalved,
  FaStore,
} from "react-icons/fa6"
import { FaWhatsapp } from "react-icons/fa"
import { useLocation } from "react-router-dom"
import InlineErrorState from "../../components/common/InlineErrorState"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { fetchStaffShopAnalytics, purgeOldShopAnalyticsData } from "../../lib/shopAnalytics"
import { supabase } from "../../lib/supabase"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  useStaffPortalSession,
} from "./StaffPortalShared"

const ANALYTICS_WINDOWS = [30, 90, 180]

function formatCompactNumber(value) {
  const number = Number(value || 0)
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`
  return `${number}`
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`
}

function getRiskTone(level) {
  if (level === "critical") return "bg-rose-100 text-rose-700"
  if (level === "high") return "bg-amber-100 text-amber-800"
  if (level === "medium") return "bg-blue-100 text-blue-700"
  return "bg-slate-100 text-slate-600"
}

function MetricCard({ icon, title, value, note, toneClass }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-xl ${toneClass}`}>
        {icon}
      </div>
      <div className="text-[2rem] font-black leading-none text-slate-900">{value}</div>
      <div className="mt-2 text-[0.98rem] font-bold text-slate-900">{title}</div>
      <div className="mt-1 text-[0.8rem] font-medium text-slate-500">{note}</div>
    </div>
  )
}

function TopShopCard({ rank, shop }) {
  return (
    <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#DB2777]">
            Rank #{rank}
          </div>
          <div className="mt-2 text-lg font-black text-slate-900">{shop.shop_name}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {shop.unique_id || "No repo ID"} {shop.city_name ? `• ${shop.city_name}` : ""}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getRiskTone(shop.risk_level)}`}>
          {shop.risk_level || "low"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <div className="text-lg font-black text-slate-900">{formatCompactNumber(shop.total_contacts)}</div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Contacts</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <div className="text-lg font-black text-slate-900">{formatCompactNumber(shop.total_views)}</div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Views</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <div className="text-lg font-black text-emerald-700">{formatCompactNumber(shop.whatsapp_contacts)}</div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">WhatsApp</div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-3">
          <div className="text-lg font-black text-sky-700">{formatCompactNumber(shop.phone_contacts)}</div>
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Phone</div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>Conversion {formatPercent(shop.conversion_rate)}</span>
        <span>{shop.latest_contact_at ? formatDateTime(shop.latest_contact_at) : "No contact yet"}</span>
      </div>
    </div>
  )
}

export default function StaffShopAnalytics() {
  const location = useLocation()
  const { confirm, notify } = useGlobalFeedback()
  const { isSuperAdmin, staffCityId } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-shop-analytics"
      ? location.state.prefetchedData
      : null

  const [windowDays, setWindowDays] = useState(() => prefetchedData?.days || 30)
  const [selectedCityId, setSelectedCityId] = useState(() => {
    if (!isSuperAdmin && staffCityId) return String(staffCityId)
    return prefetchedData?.selectedCityId || "all"
  })
  const [cityOptions, setCityOptions] = useState(() => prefetchedData?.cityOptions || [])
  const [rows, setRows] = useState(() => prefetchedData?.rows || [])
  const [loading, setLoading] = useState(() => !prefetchedData)
  const [refreshing, setRefreshing] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [error, setError] = useState("")
  const initialLoadRef = useRef(Boolean(prefetchedData))

  const effectiveCityId = useMemo(() => {
    if (!isSuperAdmin) return staffCityId ? Number(staffCityId) : null
    return selectedCityId && selectedCityId !== "all" ? Number(selectedCityId) : null
  }, [isSuperAdmin, selectedCityId, staffCityId])

  const fetchPageData = useCallback(
    async ({ days = windowDays, cityId = effectiveCityId, isRefresh = false } = {}) => {
      try {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)

        const [nextRows, citiesResult] = await Promise.all([
          fetchStaffShopAnalytics({
            days,
            cityId,
            limit: 100,
          }),
          isSuperAdmin
            ? supabase.from("cities").select("id, name, state").order("state").order("name")
            : Promise.resolve({ data: [], error: null }),
        ])

        if (citiesResult?.error) throw citiesResult.error

        setRows(Array.isArray(nextRows) ? nextRows : [])
        setWindowDays(days)
        if (isSuperAdmin) {
          setCityOptions(citiesResult.data || [])
        }
        setError("")
      } catch (fetchError) {
        setError(getFriendlyErrorMessage(fetchError, "Could not load shop analytics right now."))
      } finally {
        if (isRefresh) setRefreshing(false)
        else setLoading(false)
      }
    },
    [effectiveCityId, isSuperAdmin, windowDays]
  )

  useEffect(() => {
    if (initialLoadRef.current) return
    if (!isSuperAdmin && !staffCityId) return
    initialLoadRef.current = true

    void fetchPageData({
      days: windowDays,
      cityId: effectiveCityId,
      isRefresh: false,
    })
  }, [effectiveCityId, fetchPageData, isSuperAdmin, staffCityId, windowDays])

  useEffect(() => {
    const channel = supabase
      .channel(`staff-shop-analytics-${windowDays}-${effectiveCityId || "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_analytics_events" },
        () => {
          void fetchPageData({
            days: windowDays,
            cityId: effectiveCityId,
            isRefresh: true,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [effectiveCityId, fetchPageData, windowDays])

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalViews += Number(row.total_views) || 0
        acc.repoSearchViews += Number(row.repo_search_views) || 0
        acc.totalContacts += Number(row.total_contacts) || 0
        acc.whatsappContacts += Number(row.whatsapp_contacts) || 0
        acc.phoneContacts += Number(row.phone_contacts) || 0
        acc.suspiciousActors += Number(row.suspicious_actor_count) || 0
        if ((Number(row.conversion_rate) || 0) > acc.bestConversion) {
          acc.bestConversion = Number(row.conversion_rate) || 0
        }
        if (row.risk_level === "critical") acc.criticalShops += 1
        return acc
      },
      {
        totalViews: 0,
        repoSearchViews: 0,
        totalContacts: 0,
        whatsappContacts: 0,
        phoneContacts: 0,
        suspiciousActors: 0,
        criticalShops: 0,
        bestConversion: 0,
      }
    )
  }, [rows])

  const topShops = rows.slice(0, 3)

  const handleCleanupOldAnalytics = useCallback(async () => {
    if (cleaning) return

    const approved = await confirm({
      type: "error",
      title: "Purge analytics older than 1 year?",
      message:
        "This will permanently delete shop analytics records older than 365 days, including legacy shop views and WhatsApp click logs. Recent analytics will remain untouched.",
      confirmText: "Purge old data",
      cancelText: "Cancel",
    })

    if (!approved) return

    try {
      setCleaning(true)
      const result = await purgeOldShopAnalyticsData({ keepDays: 365 })
      notify({
        type: "success",
        title: "Analytics cleanup completed",
        message: `Deleted ${Number(result?.total_deleted || 0).toLocaleString()} old analytics rows.`,
      })
      await fetchPageData({
        days: windowDays,
        cityId: effectiveCityId,
        isRefresh: true,
      })
    } catch (cleanupError) {
      notify({
        type: "error",
        title: "Cleanup failed",
        message: getFriendlyErrorMessage(
          cleanupError,
          "Old analytics data could not be cleaned right now."
        ),
      })
    } finally {
      setCleaning(false)
    }
  }, [cleaning, confirm, effectiveCityId, fetchPageData, notify, windowDays])

  const metrics = useMemo(
    () => [
      {
        title: "Tracked Shops",
        value: formatCompactNumber(rows.length),
        note: "Shops with visits or contacts in this timeline",
        icon: <FaStore />,
        toneClass: "bg-slate-100 text-slate-700",
      },
      {
        title: "Total Visits",
        value: formatCompactNumber(summary.totalViews),
        note: "All recorded shop visits",
        icon: <FaEye />,
        toneClass: "bg-blue-100 text-blue-700",
      },
      {
        title: "Repo Search Visits",
        value: formatCompactNumber(summary.repoSearchViews),
        note: "Visits that originated from repo search",
        icon: <FaArrowTrendUp />,
        toneClass: "bg-violet-100 text-violet-700",
      },
      {
        title: "Successful Contacts",
        value: formatCompactNumber(summary.totalContacts),
        note: "WhatsApp and phone launches combined",
        icon: <FaShieldHalved />,
        toneClass: "bg-pink-100 text-[#DB2777]",
      },
      {
        title: "WhatsApp Contacts",
        value: formatCompactNumber(summary.whatsappContacts),
        note: "Successful WhatsApp handoffs",
        icon: <FaWhatsapp />,
        toneClass: "bg-emerald-100 text-emerald-700",
      },
      {
        title: "Phone Contacts",
        value: formatCompactNumber(summary.phoneContacts),
        note: "Successful phone launches",
        icon: <FaPhone />,
        toneClass: "bg-sky-100 text-sky-700",
      },
    ],
    [rows.length, summary]
  )

  return (
    <StaffPortalShell
      activeKey="shop-analytics"
      title="Shop Analytics"
      description="Review the strongest-performing shops, repo-search visibility, and contact conversion signals across the market."
      headerActions={
        <>
          <QuickActionButton
            icon={refreshing ? <FaCircleNotch className="animate-spin" /> : <FaRotateRight />}
            label="Refresh Analytics"
            tone="white"
            onClick={() =>
              void fetchPageData({
                days: windowDays,
                cityId: effectiveCityId,
                isRefresh: true,
              })
            }
          />
          {isSuperAdmin ? (
            <QuickActionButton
              icon={cleaning ? <FaCircleNotch className="animate-spin" /> : <FaClockRotateLeft />}
              label={cleaning ? "Cleaning..." : "Clean 1y+ Data"}
              tone="pink"
              onClick={() => void handleCleanupOldAnalytics()}
            />
          ) : null}
        </>
      }
    >
      <SectionHeading
        eyebrow="Market Intelligence"
        title="Top Ranking Shops"
        description="This view ranks shops by real visits and successful buyer contact actions, including repo-search traffic and suspicious contact pressure."
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              {ANALYTICS_WINDOWS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    void fetchPageData({
                      days,
                      cityId: effectiveCityId,
                      isRefresh: false,
                    })
                  }
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${
                    windowDays === days
                      ? "bg-[#2E1065] text-white"
                      : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>

            {isSuperAdmin ? (
              <select
                value={selectedCityId}
                onChange={(event) => {
                  const nextCityId = event.target.value
                  setSelectedCityId(nextCityId)
                  void fetchPageData({
                    days: windowDays,
                    cityId: nextCityId !== "all" ? Number(nextCityId) : null,
                    isRefresh: false,
                  })
                }}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-[#DB2777]"
              >
                <option value="all">All cities</option>
                {cityOptions.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}, {city.state}
                  </option>
                ))}
              </select>
            ) : null}
          </>
        }
      />

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex min-h-[280px] items-center justify-center">
            <FaCircleNotch className="animate-spin text-3xl text-[#DB2777]" />
          </div>
        </div>
      ) : error ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <InlineErrorState
            title="Shop analytics unavailable"
            message={error}
            onRetry={() =>
              void fetchPageData({
                days: windowDays,
                cityId: effectiveCityId,
                isRefresh: false,
              })
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => (
              <MetricCard key={metric.title} {...metric} />
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(135deg,#2E1065_0%,#4c1d95_45%,#DB2777_100%)] p-6 text-white shadow-sm xl:col-span-1">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] text-pink-200">
              Risk Briefing
            </div>
            <div className="mt-2 text-xs leading-5 text-white/70">
              Retention policy keeps the latest 365 days. Older analytics can be purged manually by super admin from the header.
            </div>
            <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="text-2xl font-black">{summary.suspiciousActors}</div>
                  <div className="text-xs font-semibold text-white/80">Suspicious actor clusters</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="text-2xl font-black">{summary.criticalShops}</div>
                  <div className="text-xs font-semibold text-white/80">Shops at critical contact risk</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="text-2xl font-black">{formatPercent(summary.bestConversion)}</div>
                  <div className="text-xs font-semibold text-white/80">Best shop conversion rate</div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3 xl:col-span-2">
              {topShops.length ? (
                topShops.map((shop, index) => (
                  <TopShopCard key={shop.shop_id} rank={index + 1} shop={shop} />
                ))
              ) : (
                <div className="rounded-[26px] border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center text-sm font-semibold text-slate-500 md:col-span-3">
                  No shop analytics have been recorded in this timeline yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-slate-900">Shop Ranking Table</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Shops are sorted by successful contact volume first, then by visit strength.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {rows.length} shops
              </div>
            </div>

            {rows.length ? (
              <div className="overflow-x-auto rounded-3xl border border-slate-100">
                <table className="w-full min-w-[1140px] text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-4 font-black">Rank</th>
                      <th className="px-5 py-4 font-black">Shop</th>
                      <th className="px-5 py-4 font-black">Owner</th>
                      <th className="px-5 py-4 font-black">Views</th>
                      <th className="px-5 py-4 font-black">Repo</th>
                      <th className="px-5 py-4 font-black">Contacts</th>
                      <th className="px-5 py-4 font-black">WhatsApp</th>
                      <th className="px-5 py-4 font-black">Phone</th>
                      <th className="px-5 py-4 font-black">Conversion</th>
                      <th className="px-5 py-4 font-black">Latest Contact</th>
                      <th className="px-5 py-4 font-black">Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {rows.map((row, index) => (
                      <tr key={row.shop_id} className="align-top transition hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-900">
                            {index + 1}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-black text-slate-900">{row.shop_name}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            {row.unique_id || "No repo ID"} {row.city_name ? `• ${row.city_name}` : ""}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-700">{row.owner_name || "Unknown owner"}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {Number(row.suspicious_actor_count || 0)} suspicious actor{Number(row.suspicious_actor_count || 0) === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-5 py-4 font-black text-slate-900">{formatCompactNumber(row.total_views)}</td>
                        <td className="px-5 py-4 font-black text-violet-700">{formatCompactNumber(row.repo_search_views)}</td>
                        <td className="px-5 py-4 font-black text-slate-900">{formatCompactNumber(row.total_contacts)}</td>
                        <td className="px-5 py-4 font-black text-emerald-700">{formatCompactNumber(row.whatsapp_contacts)}</td>
                        <td className="px-5 py-4 font-black text-sky-700">{formatCompactNumber(row.phone_contacts)}</td>
                        <td className="px-5 py-4 font-black text-[#DB2777]">{formatPercent(row.conversion_rate)}</td>
                        <td className="px-5 py-4 text-xs font-semibold text-slate-500">
                          {row.latest_contact_at ? formatDateTime(row.latest_contact_at) : "No contact yet"}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getRiskTone(row.risk_level)}`}>
                            {row.risk_level || "low"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center text-sm font-semibold text-slate-500">
                No shop visits or contact actions have been recorded in this analytics window yet.
              </div>
            )}
          </div>
        </div>
      )}
    </StaffPortalShell>
  )
}
