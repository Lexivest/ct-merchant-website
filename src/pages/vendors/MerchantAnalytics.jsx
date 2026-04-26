import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import {
  FaArrowLeft,
  FaArrowTrendUp,
  FaCircleNotch,
  FaEye,
  FaPhone,
  FaRotateRight,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { FaWhatsapp } from "react-icons/fa"
import { supabase } from "../../lib/supabase"
import useAuthSession from "../../hooks/useAuthSession"
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh"
import { PageLoadingScreen } from "../../components/common/PageStatusScreen"
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { fetchMerchantShopAnalytics } from "../../lib/shopAnalytics"

const ANALYTICS_WINDOWS = [30, 90, 180]

function isFutureDate(value) {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

function formatCompactNumber(value) {
  const number = Number(value || 0)
  if (number >= 1000000) return `${(number / 1000000).toFixed(1)}M`
  if (number >= 1000) return `${(number / 1000).toFixed(1)}k`
  return `${number}`
}

function formatPercent(value) {
  const number = Number(value || 0)
  return `${number.toFixed(1)}%`
}

function formatDateTime(value) {
  if (!value) return "Unknown time"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown time"
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatContactChannel(eventType) {
  if (eventType === "contact_whatsapp") return "WhatsApp"
  if (eventType === "contact_phone") return "Phone"
  return "Contact"
}

function formatEventSourceLabel(value) {
  if (value === "repo_search") return "Repo Search"
  if (value === "product_detail") return "Product Detail"
  if (value === "shop_detail") return "Shop Detail"
  return "Marketplace"
}

function getRiskTone(level) {
  if (level === "critical") return "bg-rose-100 text-rose-700"
  if (level === "high") return "bg-amber-100 text-amber-800"
  if (level === "medium") return "bg-blue-100 text-blue-700"
  return "bg-slate-100 text-slate-600"
}

function AnalyticsShimmer() {
  return (
    <PageLoadingScreen
      title="Opening analytics"
      message="Please wait while we prepare your shop analytics."
    />
  )
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

function AnalyticsTimelineChart({ data }) {
  const safeData = Array.isArray(data) ? data : []
  const maxViews = safeData.reduce((max, item) => Math.max(max, Number(item.views) || 0), 0)
  const maxContacts = safeData.reduce((max, item) => Math.max(max, Number(item.contacts) || 0), 0)

  if (!safeData.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
        No analytics data for this timeline yet.
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-black text-slate-900">Activity Timeline</div>
          <div className="mt-1 text-sm text-slate-500">Views and successful contacts by day.</div>
        </div>
        <div className="flex items-center gap-4 text-xs font-bold">
          <span className="inline-flex items-center gap-2 text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-800" />
            Views
          </span>
          <span className="inline-flex items-center gap-2 text-slate-500">
            <span className="h-2.5 w-2.5 rounded-full bg-[#DB2777]" />
            Contacts
          </span>
        </div>
      </div>
      <div className="flex h-60 items-end gap-2 overflow-x-auto pb-1">
        {safeData.map((item, index) => {
          const views = Number(item.views) || 0
          const contacts = Number(item.contacts) || 0
          const viewHeight = maxViews > 0 ? Math.max((views / maxViews) * 100, views > 0 ? 10 : 3) : 3
          const contactHeight =
            maxContacts > 0 ? Math.max((contacts / maxContacts) * 100, contacts > 0 ? 10 : 0) : 0
          const date = new Date(`${item.event_date}T12:00:00`)
          const showLabel =
            safeData.length <= 8 ||
            index === 0 ||
            index === safeData.length - 1 ||
            index % Math.ceil(safeData.length / 6) === 0

          return (
            <div key={item.event_date} className="flex min-w-[28px] flex-1 flex-col items-center gap-2">
              <div className="text-[10px] font-bold text-slate-400">{views}</div>
              <div className="relative flex h-44 w-full items-end rounded-t-2xl bg-slate-50">
                <div
                  className="w-full rounded-t-2xl bg-gradient-to-t from-slate-900 via-slate-700 to-slate-500"
                  style={{ height: `${viewHeight}%` }}
                  title={`${date.toLocaleDateString("en-NG")}: ${views} views`}
                />
                {contacts > 0 ? (
                  <div
                    className="absolute left-1/2 w-[55%] -translate-x-1/2 rounded-t-xl bg-[#DB2777]"
                    style={{ height: `${contactHeight}%` }}
                    title={`${date.toLocaleDateString("en-NG")}: ${contacts} contacts`}
                  />
                ) : null}
              </div>
              <div className="h-8 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {showLabel ? date.toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : ""}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function MerchantAnalytics() {
  const navigate = useNavigate()
  const location = useLocation()
  const { notify } = useGlobalFeedback()
  const [searchParams] = useSearchParams()
  usePreventPullToRefresh()

  const urlShopId = searchParams.get("shop_id")
  const prefetchedData =
    location.state?.prefetchedData?.kind === "merchant-analytics" &&
    (!urlShopId || String(location.state.prefetchedData.shopId) === String(urlShopId))
      ? location.state.prefetchedData
      : null

  const { user, loading: authLoading, isOffline } = useAuthSession()

  const [shopId, setShopId] = useState(() => prefetchedData?.shopId || urlShopId)
  const [windowDays, setWindowDays] = useState(() => prefetchedData?.days || 30)
  const [analytics, setAnalytics] = useState(() => prefetchedData?.summary || null)
  const [loading, setLoading] = useState(() => !prefetchedData)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const initialLoadRef = useRef(Boolean(prefetchedData))

  const fetchAnalytics = useCallback(
    async ({ days, isRefresh = false } = {}) => {
      const nextDays = Number(days) || windowDays

      if (prefetchedData && !isRefresh && nextDays === Number(prefetchedData.days || 30)) {
        setShopId(prefetchedData.shopId || urlShopId)
        setAnalytics(prefetchedData.summary || null)
        setWindowDays(nextDays)
        setError("")
        setLoading(false)
        return
      }

      if (isOffline) {
        const message = "Network offline. Please connect to the internet to view analytics."
        if (isRefresh) {
          notify({ type: "error", title: "Network unavailable", message })
        } else {
          setError(message)
        }
        return
      }

      try {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)

        let currentShopId = shopId
        if (!currentShopId) {
          const { data: shopLookup, error: lookupError } = await supabase
            .from("shops")
            .select("id, subscription_end_date")
            .eq("owner_id", user.id)
            .maybeSingle()

          if (lookupError || !shopLookup?.id) {
            throw new Error("Shop not found.")
          }

          if (!isFutureDate(shopLookup.subscription_end_date)) {
            throw new Error("Activate your service plan before opening analytics.")
          }

          currentShopId = String(shopLookup.id)
          setShopId(currentShopId)
        } else {
          const { data: shopAccess, error: shopAccessError } = await supabase
            .from("shops")
            .select("id, subscription_end_date")
            .eq("id", currentShopId)
            .eq("owner_id", user.id)
            .maybeSingle()

          if (shopAccessError || !shopAccess?.id) {
            throw new Error("Shop not found or access denied.")
          }

          if (!isFutureDate(shopAccess.subscription_end_date)) {
            throw new Error("Activate your service plan before opening analytics.")
          }
        }

        const summary = await fetchMerchantShopAnalytics({
          shopId: currentShopId,
          days: nextDays,
        })

        setAnalytics(summary)
        setWindowDays(nextDays)
        setError("")
      } catch (fetchError) {
        const friendly = getFriendlyErrorMessage(fetchError, "Could not load analytics. Retry.")
        if (isRefresh) {
          notify({ type: "error", title: "Refresh failed", message: friendly })
        } else {
          setError(friendly)
        }
      } finally {
        if (isRefresh) setRefreshing(false)
        else setLoading(false)
      }
    },
    [isOffline, notify, prefetchedData, shopId, urlShopId, user, windowDays]
  )

  useEffect(() => {
    if (authLoading || !user) return
    if (initialLoadRef.current) return
    initialLoadRef.current = true
    void fetchAnalytics({ days: windowDays, isRefresh: false })
  }, [authLoading, fetchAnalytics, user, windowDays])

  useEffect(() => {
    if (!shopId) return undefined

    const channel = supabase
      .channel(`merchant-shop-analytics-${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "shop_analytics_events",
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          void fetchAnalytics({ days: windowDays, isRefresh: true })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchAnalytics, shopId, windowDays])

  const totals = useMemo(() => analytics?.totals || {}, [analytics])
  const timeline = useMemo(() => analytics?.timeline || [], [analytics])
  const recentContacts = useMemo(() => analytics?.recent_contacts || [], [analytics])

  const summaryCards = useMemo(
    () => [
      {
        title: "Shop Visits",
        value: formatCompactNumber(totals.views),
        note: "All recorded visits in this window",
        icon: <FaEye />,
        toneClass: "bg-slate-100 text-slate-700",
      },
      {
        title: "Repo Search Visits",
        value: formatCompactNumber(totals.repo_search_views),
        note: "Visits that came through public repository search",
        icon: <FaArrowTrendUp />,
        toneClass: "bg-blue-100 text-blue-700",
      },
      {
        title: "Successful Contacts",
        value: formatCompactNumber(totals.contacts),
        note: "Successful WhatsApp and phone launches",
        icon: <FaArrowTrendUp />,
        toneClass: "bg-pink-100 text-[#DB2777]",
      },
      {
        title: "WhatsApp Launches",
        value: formatCompactNumber(totals.whatsapp_contacts),
        note: "Successful WhatsApp handoffs",
        icon: <FaWhatsapp />,
        toneClass: "bg-emerald-100 text-emerald-700",
      },
      {
        title: "Phone Launches",
        value: formatCompactNumber(totals.phone_contacts),
        note: "Successful call actions",
        icon: <FaPhone />,
        toneClass: "bg-sky-100 text-sky-700",
      },
      {
        title: "Conversion Rate",
        value: formatPercent(totals.conversion_rate),
        note: "Successful contacts divided by total visits",
        icon: <FaArrowTrendUp />,
        toneClass: "bg-violet-100 text-violet-700",
      },
    ],
    [totals]
  )

  if (authLoading || loading) {
    return <AnalyticsShimmer />
  }

  if (error) {
    return (
      <GlobalErrorScreen
        error={error}
        message={error}
        onRetry={() => void fetchAnalytics({ days: windowDays, isRefresh: false })}
        onBack={() => navigate("/vendor-panel")}
      />
    )
  }

  return (
    <div
      className={`min-h-screen bg-[#F4F5F7] text-[#0F1111] ${
        location.state?.fromVendorTransition ? "ctm-page-enter" : ""
      }`}
    >
      <header className="sticky top-0 z-40 flex w-full items-center justify-between bg-[#131921] px-4 py-3 text-white shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/vendor-panel")}
            className="text-xl transition hover:text-[#db2777]"
          >
            <FaArrowLeft />
          </button>
          <div>
            <div className="text-[1.15rem] font-bold">Shop Analytics</div>
            <div className="text-[0.78rem] font-semibold text-white/65">
              {analytics?.shop?.name || "Merchant Intelligence"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void fetchAnalytics({ days: windowDays, isRefresh: true })}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-md border border-[#be185d] bg-[#db2777] px-3 py-1.5 text-[0.9rem] font-bold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:border-[#565959] disabled:bg-[#565959] disabled:shadow-none"
        >
          {refreshing ? <FaCircleNotch className="animate-spin" /> : <FaRotateRight />}
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-6 pb-12 sm:px-6">
        <div className="mb-6 rounded-[28px] bg-[linear-gradient(135deg,#2E1065_0%,#4c1d95_45%,#DB2777_100%)] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-pink-200">
                Merchant Intelligence
              </div>
              <h1 className="mt-3 text-3xl font-black">
                {analytics?.shop?.name || "Shop Analytics"}
              </h1>
              <p className="mt-2 max-w-[720px] text-sm leading-6 text-white/80">
                Review shop visits, successful customer contacts, repo-search traffic, and suspicious contact activity from one clean analytics surface.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ANALYTICS_WINDOWS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => void fetchAnalytics({ days, isRefresh: false })}
                  className={`rounded-full px-4 py-2 text-sm font-black transition ${
                    windowDays === days
                      ? "bg-white text-[#2E1065]"
                      : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {summaryCards.map((card) => (
            <MetricCard key={card.title} {...card} />
          ))}
        </div>

        <div className="mt-8">
          <AnalyticsTimelineChart data={timeline} />
        </div>

        <div className="mt-8">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">Recent Contact Feed</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Latest successful contact activity by identified buyer.
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {recentContacts.length} people
              </div>
            </div>

            {recentContacts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-semibold text-slate-500">
                No successful contacts recorded in this window yet.
              </div>
            ) : (
              <div className="space-y-3">
                {recentContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-black text-slate-900">
                            {contact.actor_name || "Guest visitor"}
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${getRiskTone(contact.risk_level)}`}>
                            {contact.risk_level || "low"}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                            {formatContactChannel(contact.event_type)}
                          </span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                            {formatEventSourceLabel(contact.event_source)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                          <span>{contact.actor_email || "No email captured"}</span>
                          {contact.actor_phone ? <span>{contact.actor_phone}</span> : null}
                          {contact.product_name ? <span>Product: {contact.product_name}</span> : null}
                        </div>
                      </div>
                      <div className="text-right text-xs font-bold text-slate-500">
                        <div>{formatDateTime(contact.created_at)}</div>
                        <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                          {contact.actor_contact_count || 0} total contact{Number(contact.actor_contact_count || 0) === 1 ? "" : "s"} in window
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="mt-8 rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 text-lg text-amber-600">
              <FaTriangleExclamation />
            </div>
            <div>
              <div className="font-black">How to read this page</div>
              <div className="mt-1 leading-6">
                Conversion rate is based on successful phone and WhatsApp launches divided by recorded shop visits. The contact feed shows the latest recorded activity for each identified person so you can quickly see who has reached out to your shop.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
