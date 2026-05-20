import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import PageSeo from "../components/common/PageSeo"
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

function AgentCard({ agent }) {
  const q           = agent.questionnaire || {}
  const name        = agent.full_name || "Agent"
  const agentId     = agent.agent_id  || "—"
  const region      = q.preferredRegion  || "Nigeria"
  const isCorporate = q.agentApplicantType === "corporate"
  const bizName     = isCorporate ? (q.businessName || null) : null
  const bio         = agent.bio || ""
  const since       = agent.reviewed_at || agent.created_at
  const sinceYear   = since ? new Date(since).getFullYear() : null
  const initials    = getInitials(name)
  const [from, to]  = avatarGrad(name)

  return (
    <div className="rounded-3xl bg-pink-200 p-1 shadow-sm transition hover:shadow-lg">
      <div className="flex flex-col overflow-hidden rounded-[22px] border border-pink-100 bg-white transition hover:-translate-y-0.5">
        {/* colour band */}
        <div
          className="relative h-16 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, #3B1C09 0%, #7b2d42 55%, #C9A84C 100%)` }}
        >
          {/* avatar */}
          <div
            className="absolute -bottom-8 left-5 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
          >
            <span className="text-xl font-black text-white">{initials}</span>
          </div>
          {/* type badge */}
          <div className="absolute right-3 top-3">
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                isCorporate
                  ? "bg-[#C9A84C] text-[#3B1C09]"
                  : "bg-white/20 text-white"
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

          {/* Region */}
          <div className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 flex-shrink-0 text-pink-500"
            >
              <path
                fillRule="evenodd"
                d="M9.69 18.933l.003.002.004.002a.7.7 0 0 0 .606 0l.004-.002.003-.002.01-.006.033-.02.115-.073a20.372 20.372 0 0 0 1.685-1.214C14.136 16.02 17 13.23 17 9A7 7 0 1 0 3 9c0 4.23 2.864 7.02 4.847 8.62a20.381 20.381 0 0 0 1.8 1.287l.033.02.01.006ZM10 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                clipRule="evenodd"
              />
            </svg>
            {region}
          </div>

          {/* Bio */}
          {bio && (
            <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-500">{bio}</p>
          )}

          {/* footer row */}
          <div className="mt-4 flex items-center gap-3">
            {sinceYear && (
              <span className="text-[10px] font-semibold text-slate-400">Since {sinceYear}</span>
            )}
            <Link
              to={`/verify-agent?id=${encodeURIComponent(agentId)}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[#3B1C09] px-3.5 py-2 text-[11px] font-black uppercase tracking-widest text-[#C9A84C] transition hover:bg-[#5E3016]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </svg>
              Verify Agent
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="h-72 animate-pulse rounded-3xl bg-slate-100" />
  )
}

export default function Agents() {
  const [agents,       setAgents]       = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState("")
  const [regionFilter, setRegionFilter] = useState("all")
  const [typeFilter,   setTypeFilter]   = useState("all")

  useEffect(() => {
    supabase
      .from("agent_applications")
      .select("full_name, agent_id, questionnaire, bio, reviewed_at, created_at")
      .eq("status", "approved")
      .or("is_suspended.is.null,is_suspended.eq.false")
      .order("reviewed_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setAgents(data || [])
        setLoading(false)
      })
  }, [])

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
      const aq       = a.questionnaire || {}
      const name     = (a.full_name || "").toLowerCase()
      const type     = aq.agentApplicantType === "corporate" ? "corporate" : "individual"
      const region   = aq.preferredRegion || ""

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

          {!loading && (
            <p className="mt-5 text-sm font-semibold text-white/50">
              <span className="text-2xl font-black text-[#C9A84C]">{agents.length}</span>
              {" "}certified {agents.length === 1 ? "agent" : "agents"} active across Nigeria
            </p>
          )}
        </div>
      </section>

      {/* ── FILTER BAR ── */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          {/* search */}
          <div className="relative min-w-[200px] flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
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
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </div>

          {/* type toggle */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {([ ["all", "All"], ["individual", "Individual"], ["corporate", "Corporate"] ] ).map(([val, label]) => (
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
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="mx-auto mb-4 h-16 w-16 text-slate-300"
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
            </svg>
            <p className="text-lg font-black text-slate-700">No agents found</p>
            <p className="mt-1 text-sm text-slate-400">
              {hasFilters
                ? "Try adjusting your search or filters."
                : "No certified agents yet. Check back soon."}
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
              <AgentCard key={agent.agent_id || agent.full_name} agent={agent} />
            ))}
          </div>
        )}
      </div>

      {/* ── BECOME AN AGENT CTA ── */}
      <section className="border-t border-slate-100 bg-slate-50 px-4 py-12 text-center">
        <p className="text-sm font-semibold text-slate-500">
          Want to represent CTMerchant in your community?
        </p>
        <Link
          to="/become-agent"
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#3B1C09] px-6 py-3 text-sm font-black text-[#C9A84C] shadow transition hover:bg-[#5E3016]"
        >
          Apply to Become an Agent
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
      </section>
    </MainLayout>
  )
}
