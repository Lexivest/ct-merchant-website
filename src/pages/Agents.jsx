import { useCallback, useEffect, useMemo, useState } from "react"
import MainLayout from "../layouts/MainLayout"
import PageSeo from "../components/common/PageSeo"
import InlineErrorState from "../components/common/InlineErrorState"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import { useNetworkStatus } from "../lib/networkStatus"
import { supabase } from "../lib/supabase"

/* ── helpers ── */
function getInitials(name) {
  return String(name || "CT")
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() || "")
    .slice(0, 2)
    .join("")
}

const GRAD_PAIRS = [
  ["#7b2d42", "#c2607a"],
  ["#1e3a8a", "#3b82f6"],
  ["#3B1C09", "#C9A84C"],
  ["#065f46", "#34d399"],
  ["#4c1d95", "#a78bfa"],
  ["#9a3412", "#fb923c"],
]
function avatarGrad(name) {
  let n = 0
  for (let i = 0; i < (name?.length ?? 0); i++) n += name.charCodeAt(i)
  return GRAD_PAIRS[n % GRAD_PAIRS.length]
}

/* ── Avatar — tries profile_photo_url, then RPC, then initials ── */
function AgentAvatar({ agent, size = 64 }) {
  const [src, setSrc] = useState(agent.profile_photo_url || null)
  const [failed, setFailed] = useState(false)
  const name    = agent.full_name || "CT"
  const email   = agent.email || ""
  const initials = getInitials(name)
  const [from, to] = avatarGrad(name)

  useEffect(() => {
    if (src || failed || !email) return
    let cancelled = false
    supabase
      .rpc("get_agent_avatar_by_email", { p_email: email })
      .then(({ data }) => {
        if (!cancelled && data) setSrc(data)
      })
    return () => { cancelled = true }
  }, [src, failed, email])

  const fs      = Math.round(size * 0.35)
  const border  = Math.round(size * 0.075)

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${border}px solid white`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        overflow: "hidden",
        flexShrink: 0,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onError={() => { setFailed(true); setSrc(null) }}
        />
      ) : (
        <span style={{ fontSize: fs, fontWeight: 900, color: "#fff", lineHeight: 1 }}>
          {initials}
        </span>
      )}
    </div>
  )
}

/* ── Active agent card ── */
function ActiveCard({ agent }) {
  const q           = agent.questionnaire || {}
  const name        = agent.full_name || "Agent"
  const agentId     = agent.agent_id  || "—"
  const email       = agent.email     || ""
  const phone       = agent.phone     || ""
  const region      = q.preferredRegion  || "Nigeria"
  const isCorporate = q.agentApplicantType === "corporate"
  const bizName     = isCorporate ? (q.businessName || null) : null
  const bio         = agent.bio || ""
  const since       = agent.reviewed_at || agent.created_at
  const sinceYear   = since ? new Date(since).getFullYear() : null

  return (
    <div className="rounded-3xl bg-pink-200 p-1 shadow-sm transition hover:shadow-lg">
      <div className="flex flex-col overflow-hidden rounded-[22px] border border-pink-100 bg-white transition hover:-translate-y-0.5">

        {/* colour band */}
        <div
          className="relative h-20 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #3B1C09 0%, #7b2d42 55%, #C9A84C 100%)" }}
        >
          {/* avatar — overlaps band */}
          <div className="absolute -bottom-8 left-5">
            <AgentAvatar agent={agent} size={64} />
          </div>

          {/* badges top-right */}
          <div className="absolute right-3 top-3 flex items-center gap-2">
            {/* Active badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-white">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              Active
            </span>
            {/* type */}
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                isCorporate ? "bg-[#C9A84C] text-[#3B1C09]" : "bg-white/20 text-white"
              }`}
            >
              {isCorporate ? "Corporate" : "Individual"}
            </span>
          </div>
        </div>

        {/* content */}
        <div className="px-5 pb-5 pt-10">
          <h3 className="text-base font-extrabold leading-tight text-slate-900">{name}</h3>
          {bizName && (
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{bizName}</p>
          )}

          {/* Agent ID pill */}
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ID</span>
            <span className="font-mono text-xs font-black tracking-wider text-[#3B1C09]">{agentId}</span>
          </div>

          {/* contact row */}
          <div className="mt-3 space-y-1.5">
            {phone && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500">
                  <path fillRule="evenodd" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.716 3.223a1.5 1.5 0 0 1-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 0 0 6.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 0 1 1.767-1.052l3.223.716A1.5 1.5 0 0 1 18 16.352V17.5a1.5 1.5 0 0 1-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 0 1 2.43 8.326 13.019 13.019 0 0 1 2 5V3.5Z" clipRule="evenodd" />
                </svg>
                {phone}
              </div>
            )}
            {email && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 flex-shrink-0 text-blue-500">
                  <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z" />
                  <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z" />
                </svg>
                <span className="min-w-0 truncate">{email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 flex-shrink-0 text-pink-500">
                <path fillRule="evenodd" d="M9.69 18.933l.003.002.004.002a.7.7 0 0 0 .606 0l.004-.002.003-.002.01-.006.033-.02.115-.073a20.372 20.372 0 0 0 1.685-1.214C14.136 16.02 17 13.23 17 9A7 7 0 1 0 3 9c0 4.23 2.864 7.02 4.847 8.62a20.381 20.381 0 0 0 1.8 1.287l.033.02.01.006ZM10 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" clipRule="evenodd" />
              </svg>
              {region}
            </div>
          </div>

          {/* Bio */}
          {bio && (
            <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-500">{bio}</p>
          )}

          {sinceYear && (
            <p className="mt-4 text-[10px] font-semibold text-slate-400">Since {sinceYear}</p>
          )}
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-3xl bg-pink-100 p-1 shadow-sm">
      <div className="overflow-hidden rounded-[22px] border border-pink-50 bg-white">
        {/* colour band */}
        <div className="relative h-20 animate-pulse bg-slate-200">
          {/* avatar placeholder */}
          <div className="absolute -bottom-8 left-5 h-16 w-16 rounded-full border-4 border-white bg-slate-300" />
        </div>
        <div className="px-5 pb-5 pt-11 space-y-3">
          <div className="h-4 w-2/5 animate-pulse rounded-full bg-slate-200" />
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-slate-100" />
          <div className="h-8 w-28 animate-pulse rounded-xl bg-slate-100" />
          <div className="space-y-2 pt-1">
            <div className="h-3 w-3/5 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-2/5 animate-pulse rounded-full bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Page ── */
export default function Agents() {
  const [agents,       setAgents]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState(null)
  const [search,       setSearch]       = useState("")
  const [regionFilter, setRegionFilter] = useState("all")
  const [typeFilter,   setTypeFilter]   = useState("all")
  const { isOffline }                   = useNetworkStatus()

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await supabase
        .from("agent_applications")
        .select("full_name, agent_id, email, phone, questionnaire, bio, reviewed_at, created_at, profile_photo_url")
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false })
      if (error) throw error
      setAgents(data || [])
    } catch (err) {
      setLoadError(getFriendlyErrorMessage(err, "Could not load agents. Please check your connection and try again."))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const regions = useMemo(() => {
    const set = new Set()
    agents.forEach((a) => {
      const r = a.questionnaire?.preferredRegion
      if (r) set.add(r)
    })
    return Array.from(set).sort()
  }, [agents])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return agents.filter((a) => {
      const aq     = a.questionnaire || {}
      const name   = (a.full_name || "").toLowerCase()
      const type   = aq.agentApplicantType === "corporate" ? "corporate" : "individual"
      const region = aq.preferredRegion || ""

      if (q && !name.includes(q)) return false
      if (regionFilter !== "all" && region !== regionFilter) return false
      if (typeFilter   !== "all" && type   !== typeFilter)   return false
      return true
    })
  }, [agents, search, regionFilter, typeFilter])

  const clearFilters = () => {
    setSearch("")
    setRegionFilter("all")
    setTypeFilter("all")
  }
  const hasFilters = search || regionFilter !== "all" || typeFilter !== "all"

  return (
    <MainLayout>
      <PageSeo
        title="Certified Agents | CTMerchant"
        description="Find verified CTMerchant field agents operating in your city. Agents are trained and authorised to onboard merchants and promote products."
      />

      {/* ── HERO ── */}
      <section
        className="px-4 py-16 text-center"
        style={{ background: "linear-gradient(135deg, #3B1C09 0%, #4A2410 45%, #7b2d42 100%)" }}
      >
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C9A84C] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#C9A84C]" />
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-[#C9A84C]">
              Verified Network
            </span>
          </div>

          <h1 className="mt-2 text-3xl font-black leading-tight text-white sm:text-4xl">
            Certified CTMerchant<br />
            <span className="text-[#C9A84C]">Field Agents</span>
          </h1>

          <p className="mx-auto mt-4 max-w-lg text-sm font-medium leading-relaxed text-white/70">
            Our agents are trained, vetted, and authorised to onboard merchants,
            promote products, and represent CTMerchant in their communities.
            Always verify before you engage.
          </p>

        </div>
      </section>

      {/* ── FILTER BAR ── */}
      <div className={`border-b border-slate-200 bg-white transition-opacity ${loading || loadError ? "pointer-events-none opacity-40" : ""}`}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          {/* search */}
          <div className="relative min-w-[200px] flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              placeholder="Search agents by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
            />
          </div>

          {/* region */}
          <div className="relative">
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 text-sm font-semibold text-slate-700 outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
            >
              <option value="all">All Regions</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </div>

          {/* type toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {[["all", "All"], ["individual", "Individual"], ["corporate", "Corporate"]].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setTypeFilter(val)}
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                  typeFilter === val
                    ? "bg-[#3B1C09] text-[#C9A84C]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs font-semibold text-slate-400">
            {loading ? "…" : `${filtered.length} ${filtered.length === 1 ? "agent" : "agents"}`}
          </span>
        </div>
      </div>

      {/* ── GRID ── */}
      <div className="mx-auto max-w-6xl px-4 py-10">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : loadError ? (
          <div className="mx-auto max-w-lg py-16">
            <InlineErrorState
              title={isOffline ? "You're offline" : "Could not load agents"}
              message={isOffline
                ? "No internet connection. Reconnect and tap Retry to load the agent directory."
                : loadError}
              onRetry={fetchAgents}
              retryLabel="Try again"
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 h-16 w-16 text-slate-300">
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-lg font-black text-slate-700">No agents found</p>
            <p className="mt-1 text-sm text-slate-400">
              {hasFilters ? "Try adjusting your search or filters." : "No certified agents yet. Check back soon."}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-xl bg-[#3B1C09] px-5 py-2.5 text-sm font-black text-[#C9A84C] transition hover:bg-[#5E3016]"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((agent) => (
              <ActiveCard key={agent.agent_id || agent.email} agent={agent} />
            ))}
          </div>
        )}
      </div>

      {/* ── BECOME AN AGENT ── */}
      <section className="border-t border-slate-100 bg-slate-50 px-4 py-14">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#3B1C09]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-[#C9A84C]">
                <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-slate-900">Become a CTMerchant Agent</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Create an account",
                body: "Sign up on CTMerchant and log in to your dashboard. An active account is required before you can apply.",
              },
              {
                step: "2",
                title: "Submit your application",
                body: "Inside your dashboard, find the \"Become an Agent\" section. Fill out the application form with your details, preferred region, and experience.",
              },
              {
                step: "3",
                title: "Wait for review",
                body: "Our team reviews every application. You will be notified once a decision is made — approved agents receive a unique Agent ID and their profile appears on this page.",
              },
              {
                step: "4",
                title: "Attend scheduled online training & certification",
                body: "Approved agents are enrolled in a scheduled online training session. You will learn how to onboard merchants, represent the brand, and use CTMerchant tools effectively. A certification is awarded upon completion.",
              },
              {
                step: "5",
                title: "Start representing CTMerchant",
                body: "Once certified, download your official Agent ID card from your dashboard and begin onboarding merchants and customers in your area.",
              },
            ].map(({ step, title, body }) => (
              <div key={step} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#3B1C09] text-sm font-black text-[#C9A84C]">
                  {step}
                </div>
                <div>
                  <p className="text-sm font-extrabold text-slate-900">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MainLayout>
  )
}
