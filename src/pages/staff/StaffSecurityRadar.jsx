import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaBan,
  FaCircleCheck,
  FaCircleNotch,
  FaRotateRight,
  FaShieldHalved,
  FaSkullCrossbones,
  FaTowerBroadcast,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import InlineErrorState from "../../components/common/InlineErrorState"
import { fetchContactSecurityRadar } from "../../lib/shopAnalytics"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  useStaffPortalSession,
} from "./StaffPortalShared"

const ANALYTICS_WINDOWS = [30, 90, 180]

function getRiskTone(level) {
  if (level === "critical") return "bg-rose-100 text-rose-700"
  if (level === "high") return "bg-amber-100 text-amber-800"
  if (level === "medium") return "bg-blue-100 text-blue-700"
  return "bg-slate-100 text-slate-600"
}

function SummaryCard({ icon, title, value, note, toneClass }) {
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

function ClusterRow({ item }) {
  const accounts = Array.isArray(item.account_data) ? item.account_data : []

  return (
    <tr className="align-top transition hover:bg-slate-50">
      <td className="px-5 py-4">
        <div className="max-w-[300px] break-all font-mono text-xs font-bold text-slate-900">
          {item.fingerprint_value}
        </div>
        {item.is_banned ? (
          <span className="mt-2 inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
            <FaBan /> BANNED
          </span>
        ) : null}
      </td>
      <td className="px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-900">
          {item.occurrence_count}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-col gap-4">
          {accounts.map((acc, index) => (
            <div key={`${item.fingerprint_value}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-900">{acc.email}</span>
                {acc.ip ? (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                    IP: {acc.ip}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.isArray(acc.shops) && acc.shops.length > 0 ? (
                  acc.shops.map((shop, shopIndex) => (
                    <span key={`${item.fingerprint_value}-${index}-${shopIndex}`} className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-[#DB2777]">
                      {shop}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] italic text-slate-400">No shops linked</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </td>
      <td className="px-5 py-4">
        {item.occurrence_count > 5 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
            <FaSkullCrossbones /> High
          </span>
        ) : item.occurrence_count > 2 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            <FaTriangleExclamation /> Medium
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Low
          </span>
        )}
      </td>
    </tr>
  )
}

export default function StaffSecurityRadar() {
  const location = useLocation()
  const { isSuperAdmin, staffCityId } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-security-radar"
      ? location.state.prefetchedData
      : null

  const [windowDays, setWindowDays] = useState(() => prefetchedData?.days || 30)
  const [selectedCityId, setSelectedCityId] = useState(() => {
    if (!isSuperAdmin && staffCityId) return String(staffCityId)
    return prefetchedData?.selectedCityId || "all"
  })
  const [cityOptions, setCityOptions] = useState(() => prefetchedData?.cityOptions || [])
  const [contactRadar, setContactRadar] = useState(() => prefetchedData?.contactRadar || [])
  const [legacyInsights, setLegacyInsights] = useState(() => prefetchedData?.insights || [])
  const [loading, setLoading] = useState(() => !prefetchedData)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const initialLoadRef = useRef(Boolean(prefetchedData))

  const effectiveCityId = useMemo(() => {
    if (!isSuperAdmin) return staffCityId ? Number(staffCityId) : null
    return selectedCityId && selectedCityId !== "all" ? Number(selectedCityId) : null
  }, [isSuperAdmin, selectedCityId, staffCityId])

  const fetchInsights = useCallback(
    async ({ days = windowDays, cityId = effectiveCityId, isRefresh = false } = {}) => {
      try {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)

        const [contactResult, legacyResult, citiesResult] = await Promise.all([
          fetchContactSecurityRadar({
            days,
            cityId,
          }),
          supabase.rpc("ctm_get_security_radar_insights"),
          isSuperAdmin
            ? supabase.from("cities").select("id, name, state").order("state").order("name")
            : Promise.resolve({ data: [], error: null }),
        ])

        if (legacyResult.error) throw legacyResult.error
        if (citiesResult?.error) throw citiesResult.error

        setContactRadar(Array.isArray(contactResult) ? contactResult : [])
        setLegacyInsights(Array.isArray(legacyResult.data) ? legacyResult.data : [])
        if (isSuperAdmin) {
          setCityOptions(citiesResult.data || [])
        }
        setWindowDays(days)
        setError("")
      } catch (err) {
        console.error("Error fetching security radar insights:", err)
        setError(getFriendlyErrorMessage(err, "Could not load security insights."))
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

    void fetchInsights({
      days: windowDays,
      cityId: effectiveCityId,
      isRefresh: false,
    })
  }, [effectiveCityId, fetchInsights, isSuperAdmin, staffCityId, windowDays])

  useEffect(() => {
    const channel = supabase
      .channel(`staff-security-radar-${windowDays}-${effectiveCityId || "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_analytics_events" },
        () => {
          void fetchInsights({
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
  }, [effectiveCityId, fetchInsights, windowDays])

  const ipClusters = legacyInsights.filter((i) => i.fingerprint_type === "IP Address")
  const deviceClusters = legacyInsights.filter((i) => i.fingerprint_type === "Device Signature")

  const summary = useMemo(() => {
    return contactRadar.reduce(
      (acc, item) => {
        acc.totalActors += 1
        acc.totalContacts += Number(item.total_contacts) || 0
        if ((Number(item.distinct_shops) || 0) >= 2) acc.multiShopActors += 1
        if (item.risk_level === "critical") acc.criticalActors += 1
        return acc
      },
      {
        totalActors: 0,
        totalContacts: 0,
        multiShopActors: 0,
        criticalActors: 0,
      }
    )
  }, [contactRadar])

  const summaryCards = [
    {
      title: "Flagged Contact Actors",
      value: summary.totalActors,
      note: "People whose contact frequency crossed the radar threshold",
      icon: <FaShieldHalved />,
      toneClass: "bg-pink-100 text-[#DB2777]",
    },
    {
      title: "Total Contact Attempts",
      value: summary.totalContacts,
      note: "Successful WhatsApp and phone launches by flagged actors",
      icon: <FaTowerBroadcast />,
      toneClass: "bg-blue-100 text-blue-700",
    },
    {
      title: "Multi-Shop Reach",
      value: summary.multiShopActors,
      note: "Actors contacting multiple shops inside the same window",
      icon: <FaTriangleExclamation />,
      toneClass: "bg-amber-100 text-amber-800",
    },
    {
      title: "Critical Risk Actors",
      value: summary.criticalActors,
      note: "Highest-priority actors needing staff review",
      icon: <FaSkullCrossbones />,
      toneClass: "bg-rose-100 text-rose-700",
    },
  ]

  return (
    <StaffPortalShell
      activeKey="security-radar"
      title="Security Radar"
      description="Monitor contact abuse, suspicious buyer behavior, and deeper registration fingerprint clusters from one intelligence console."
      headerActions={
        <QuickActionButton
          icon={refreshing ? <FaCircleNotch className="animate-spin" /> : <FaRotateRight />}
          label="Refresh Radar"
          tone="white"
          onClick={() =>
            void fetchInsights({
              days: windowDays,
              cityId: effectiveCityId,
              isRefresh: true,
            })
          }
        />
      }
    >
      <SectionHeading
        eyebrow="Intelligence"
        title="Contact Abuse Radar"
        description="This radar prioritizes people who repeatedly launch WhatsApp or phone contact flows across one or many shops. That helps staff identify spammy or malicious buyer behavior early."
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              {ANALYTICS_WINDOWS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    void fetchInsights({
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
                  void fetchInsights({
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

      <div className="space-y-8">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex min-h-[300px] items-center justify-center">
              <FaCircleNotch className="animate-spin text-3xl text-[#DB2777]" />
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <InlineErrorState
              title="Security insights unavailable"
              message={error}
              onRetry={() =>
                void fetchInsights({
                  days: windowDays,
                  cityId: effectiveCityId,
                  isRefresh: false,
                })
              }
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {summaryCards.map((card) => (
                <SummaryCard key={card.title} {...card} />
              ))}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Suspicious Contact Actors</h3>
                  <p className="text-sm text-slate-500">
                    People repeatedly opening merchant contact channels are ranked below with the shops they touched.
                  </p>
                </div>
                <div className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-[#DB2777]">
                  {contactRadar.length} flagged
                </div>
              </div>

              {contactRadar.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500">
                    <FaCircleCheck className="text-xl" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No contact abuse clusters detected.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[1280px] text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-bold">Actor</th>
                        <th className="px-5 py-4 font-bold">Identity</th>
                        <th className="px-5 py-4 font-bold">Contacts</th>
                        <th className="px-5 py-4 font-bold">Shops Touched</th>
                        <th className="px-5 py-4 font-bold">Latest Activity</th>
                        <th className="px-5 py-4 font-bold">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contactRadar.map((item) => {
                        const shops = Array.isArray(item.shops) ? item.shops : []
                        return (
                          <tr key={item.actor_key} className="align-top transition hover:bg-slate-50">
                            <td className="px-5 py-4">
                              <div className="font-black text-slate-900">{item.actor_name || "Guest visitor"}</div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">
                                {item.actor_email || "No email captured"}
                              </div>
                              {item.actor_phone ? (
                                <div className="mt-1 text-xs font-semibold text-slate-500">{item.actor_phone}</div>
                              ) : null}
                            </td>
                            <td className="px-5 py-4">
                              <div className="space-y-2 text-xs font-semibold text-slate-500">
                                <div>IP: {item.primary_ip || "Unknown"}</div>
                                <div className="break-all">Device: {item.device_fingerprint || "Unknown"}</div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                  <div className="text-lg font-black text-slate-900">{item.total_contacts}</div>
                                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Total</div>
                                </div>
                                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                  <div className="text-lg font-black text-emerald-700">{item.whatsapp_contacts}</div>
                                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">WhatsApp</div>
                                </div>
                                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                                  <div className="text-lg font-black text-sky-700">{item.phone_contacts}</div>
                                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Phone</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex max-w-[280px] flex-wrap gap-2">
                                {shops.length ? (
                                  shops.map((shop) => (
                                    <div key={`${item.actor_key}-${shop.shop_id}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                                      <div className="text-xs font-black text-slate-900">{shop.shop_name}</div>
                                      <div className="mt-1 text-[10px] font-semibold text-slate-500">
                                        {shop.unique_id || "No repo ID"} • {shop.contacts} contacts
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-xs italic text-slate-400">No shop history</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-xs font-semibold text-slate-500">
                              {formatDateTime(item.latest_contact_at)}
                            </td>
                            <td className="px-5 py-4">
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getRiskTone(item.risk_level)}`}>
                                {item.risk_level || "low"}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <SectionHeading
              eyebrow="Registration Signals"
              title="Network & Device Clusters"
              description="These are the older registration-fingerprint signals. They remain useful as a secondary security layer beside the newer contact-abuse radar."
            />

            <div className="grid gap-8">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">IP Address Clusters</h3>
                    <p className="text-sm text-slate-500">Duplicate accounts sharing the same network connection.</p>
                  </div>
                  <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                    {ipClusters.length} Found
                  </div>
                </div>

                {ipClusters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500">
                      <FaCircleCheck className="text-xl" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No IP clusters detected.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full min-w-[1000px] text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-4 font-bold">IP Address</th>
                          <th className="px-5 py-4 font-bold">Count</th>
                          <th className="px-5 py-4 font-bold">Account Mapping</th>
                          <th className="px-5 py-4 font-bold">Risk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ipClusters.map((item, index) => (
                          <ClusterRow key={`ip-${index}`} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Device Signature Clusters</h3>
                    <p className="text-sm text-slate-500">Duplicate accounts sharing the same hardware footprint.</p>
                  </div>
                  <div className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-[#DB2777]">
                    {deviceClusters.length} Found
                  </div>
                </div>

                {deviceClusters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                      <FaTowerBroadcast className="text-xl" />
                    </div>
                    <p className="text-sm font-medium text-slate-500">No device signature clusters detected.</p>
                    <p className="mt-1 max-w-xs text-xs text-slate-400">
                      This is common because modern browsers often produce very unique signatures.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full min-w-[1000px] text-left text-sm text-slate-600">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-4 font-bold">Signature</th>
                          <th className="px-5 py-4 font-bold">Count</th>
                          <th className="px-5 py-4 font-bold">Account Mapping</th>
                          <th className="px-5 py-4 font-bold">Risk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deviceClusters.map((item, index) => (
                          <ClusterRow key={`device-${index}`} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </StaffPortalShell>
  )
}
