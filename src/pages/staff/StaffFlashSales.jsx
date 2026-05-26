import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaArrowsUpDown,
  FaBolt,
  FaCalendarCheck,
  FaCircleNotch,
  FaClock,
  FaGlobe,
  FaLocationDot,
  FaPlus,
  FaToggleOff,
  FaToggleOn,
  FaTrash,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  useStaffPortalSession,
} from "./StaffPortalShared"

// ── Helpers ────────────────────────────────────────────────────────────────

const TITLE_MAX     = 60
const SUBTITLE_MAX  = 80
const BADGE_MAX     = 20

/** Convert a datetime-local string (local tz) to UTC ISO string. */
function localToUtc(value) {
  if (!value) return null
  return new Date(value).toISOString()
}

/** Format a UTC ISO date for datetime-local input (no seconds). */
function utcToLocal(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  // datetime-local format: YYYY-MM-DDTHH:MM
  const pad = (n) => String(n).padStart(2, "0")
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function getSaleStatus(sale) {
  const now  = Date.now()
  const start = new Date(sale.starts_at).getTime()
  const end   = new Date(sale.ends_at).getTime()
  if (!sale.is_active) return { label: "INACTIVE", color: "text-slate-400 bg-slate-50 border-slate-200" }
  if (now < start)     return { label: "SCHEDULED", color: "text-indigo-700 bg-indigo-50 border-indigo-200" }
  if (now > end)       return { label: "EXPIRED",   color: "text-rose-600 bg-rose-50 border-rose-200" }
  return                      { label: "LIVE",      color: "text-emerald-700 bg-emerald-50 border-emerald-300" }
}

/** Live countdown string for the list cards (non-interactive, just text). */
function formatRemaining(endsAt) {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return "Ended"
  const s = Math.floor(diff / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor(s / 3600) % 24
  const m = Math.floor(s / 60) % 60
  const sec = s % 60
  if (d > 0) return `${d}d ${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m`
  return `${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(sec).padStart(2,"0")}s`
}

// ── Component ──────────────────────────────────────────────────────────────

export default function StaffFlashSales() {
  const location = useLocation()
  const { isSuperAdmin, isCityAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-flash-sales"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  // ── State ──────────────────────────────────────────────────────────────
  const [sales,           setSales]           = useState(() => prefetchedData?.sales   || [])
  const [cities,          setCities]          = useState(() => prefetchedData?.cities  || [])
  const [loading,         setLoading]         = useState(() => !prefetchedData && !fetchingStaff)
  const [saving,          setSaving]          = useState(false)
  const [processingId,    setProcessingId]    = useState(null)
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))
  const [tick,            setTick]            = useState(0) // incremented every second for live status

  // Form — times stored as datetime-local strings (user's local timezone)
  const now30 = useMemo(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000)
    return utcToLocal(d.toISOString())
  }, [])
  const now90 = useMemo(() => {
    const d = new Date(Date.now() + 90 * 60 * 1000)
    return utcToLocal(d.toISOString())
  }, [])

  const [form, setForm] = useState({
    city_id:        isSuperAdmin ? "" : (staffCityId ? String(staffCityId) : ""),
    title:          "",
    subtitle:       "",
    discount_label: "",
    image_url:      "",
    starts_at:      now30,
    ends_at:        now90,
    is_active:      true,
    sort_order:     0,
  })

  // Tick every second to keep status badges and remaining times fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      setCities(prefetchedData.cities || [])
      setSales(prefetchedData.sales   || [])
      setLoading(false)
      setPrefetchedReady(false)
      return
    }

    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoading(true)
    try {
      let salesQuery = supabase
        .from("flash_sales")
        .select("*")
        .order("ends_at", { ascending: true })

      if (!isSuperAdmin && staffCityId) {
        salesQuery = salesQuery.eq("city_id", staffCityId)
      }

      const [citiesRes, salesRes] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("name"),
        salesQuery,
      ])

      if (citiesRes.error) throw citiesRes.error
      if (salesRes.error)  throw salesRes.error

      setCities(citiesRes.data || [])
      setSales(salesRes.data   || [])
    } catch (err) {
      notify({
        type:    "error",
        title:   "Could not load data",
        message: getFriendlyErrorMessage(err, "Could not load flash sales. Retry."),
      })
    } finally {
      setLoading(false)
    }
  }, [notify, isSuperAdmin, prefetchedData, prefetchedReady, staffCityId, fetchingStaff])

  useEffect(() => {
    if (!fetchingStaff) void fetchData()
  }, [fetchData, fetchingStaff])

  // ── Create ─────────────────────────────────────────────────────────────
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.starts_at || !form.ends_at || saving) return
    if (!isSuperAdmin && !form.city_id) return

    const startsUtc = localToUtc(form.starts_at)
    const endsUtc   = localToUtc(form.ends_at)

    if (new Date(endsUtc) <= new Date(startsUtc)) {
      notify({ type: "error", title: "Invalid Dates", message: "End time must be after start time." })
      return
    }

    setSaving(true)
    try {
      const payload = {
        title:          form.title.trim(),
        subtitle:       form.subtitle.trim()       || null,
        discount_label: form.discount_label.trim() || null,
        image_url:      form.image_url.trim()      || null,
        starts_at:      startsUtc,
        ends_at:        endsUtc,
        is_active:      form.is_active,
        sort_order:     Number(form.sort_order) || 0,
        ...(form.city_id ? { city_id: parseInt(form.city_id, 10) } : {}),
      }

      const { data, error } = await supabase
        .from("flash_sales")
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      setSales((prev) =>
        [...prev, data].sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))
      )
      setForm((prev) => ({
        ...prev,
        title:          "",
        subtitle:       "",
        discount_label: "",
        image_url:      "",
        starts_at:      now30,
        ends_at:        now90,
        is_active:      true,
      }))
      notify({ type: "success", title: "Flash Sale Created", message: "It will go live at the scheduled start time." })
    } catch (err) {
      notify({ type: "error", title: "Save Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────
  const toggleActive = async (item) => {
    if (processingId) return
    setProcessingId(item.id)
    try {
      const { error } = await supabase
        .from("flash_sales")
        .update({ is_active: !item.is_active })
        .eq("id", item.id)

      if (error) throw error

      setSales((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, is_active: !s.is_active } : s))
      )
    } catch (err) {
      notify({ type: "error", title: "Update Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (item) => {
    const confirmed = await confirm({
      title:        "Delete Flash Sale",
      message:      `Remove "${item.title}" permanently?`,
      confirmLabel: "Yes, Delete",
      tone:         "rose",
    })
    if (!confirmed) return

    setProcessingId(item.id)
    try {
      const { error } = await supabase
        .from("flash_sales")
        .delete()
        .eq("id", item.id)

      if (error) throw error

      setSales((prev) => prev.filter((s) => s.id !== item.id))
      notify({ type: "info", title: "Flash Sale Removed" })
    } catch (err) {
      notify({ type: "error", title: "Delete Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const displaySales = useMemo(() => {
    return sales.map((s) => {
      const city = cities.find((c) => String(c.id) === String(s.city_id))
      return {
        ...s,
        city_name: s.city_id
          ? (city ? `${city.name}, ${city.state}` : "Unknown city")
          : "Global — all cities",
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, cities, tick]) // tick keeps getSaleStatus fresh without cloning

  // Preview countdown from form values
  const previewRemaining = useMemo(() => {
    if (!form.ends_at) return null
    return formatRemaining(localToUtc(form.ends_at))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.ends_at, tick])

  const formValid =
    form.title.trim() &&
    form.title.length <= TITLE_MAX &&
    form.starts_at &&
    form.ends_at &&
    (isSuperAdmin || Boolean(form.city_id))

  return (
    <StaffPortalShell
      activeKey="flash-sales"
      title="Flash Sales"
      description="Create timed sale events with a live countdown bar shown in the market dashboard."
      headerActions={[
        <QuickActionButton
          key="refresh"
          icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />}
          label="Refresh"
          tone="white"
          onClick={fetchData}
        />,
      ]}
    >
      <div className="grid gap-8 lg:grid-cols-[420px_1fr]">

        {/* ── Create panel ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          <SectionHeading eyebrow="Schedule" title="New Flash Sale" />

          <form
            onSubmit={handleCreate}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-5"
          >
            {/* City */}
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                Target City
              </label>
              {isCityAdmin && !isSuperAdmin ? (
                <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3">
                  <FaLocationDot className="shrink-0 text-rose-400" />
                  <span className="text-sm font-bold text-slate-900">
                    {(() => {
                      const c = cities.find((c) => String(c.id) === String(staffCityId))
                      return c ? `${c.name} (${c.state})` : "Your city"
                    })()}
                  </span>
                  <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400">Locked</span>
                </div>
              ) : (
                <select
                  value={form.city_id}
                  onChange={(e) => setForm((p) => ({ ...p, city_id: e.target.value }))}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                >
                  <option value="">🌍 Global — all cities</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.state})</option>
                  ))}
                </select>
              )}
            </div>

            {/* Title */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Sale Title</label>
                <span className={`text-xs font-black ${form.title.length > TITLE_MAX - 10 ? "text-amber-500" : "text-slate-400"}`}>
                  {TITLE_MAX - form.title.length} left
                </span>
              </div>
              <input
                required
                type="text"
                maxLength={TITLE_MAX}
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. FLASH SALE · Electronics Week"
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
              />
            </div>

            {/* Subtitle */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Subtitle <span className="normal-case font-semibold tracking-normal">(optional)</span>
                </label>
                <span className="text-xs font-black text-slate-400">{SUBTITLE_MAX - form.subtitle.length} left</span>
              </div>
              <input
                type="text"
                maxLength={SUBTITLE_MAX}
                value={form.subtitle}
                onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                placeholder="e.g. Up to 60% off selected shops"
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
              />
            </div>

            {/* Discount label */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Discount Badge <span className="normal-case font-semibold tracking-normal">(optional)</span>
                </label>
                <span className="text-xs font-black text-slate-400">{BADGE_MAX - form.discount_label.length} left</span>
              </div>
              <input
                type="text"
                maxLength={BADGE_MAX}
                value={form.discount_label}
                onChange={(e) => setForm((p) => ({ ...p, discount_label: e.target.value }))}
                placeholder="e.g. 60% OFF or ₦500 OFF"
                className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
              />
            </div>

            {/* Image URL */}
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                Image URL <span className="normal-case font-semibold tracking-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-3">
                {form.image_url.trim() && (
                  <img
                    src={form.image_url.trim()}
                    alt="preview"
                    className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 object-cover"
                    onError={(e) => { e.currentTarget.style.display = "none" }}
                  />
                )}
                <input
                  type="url"
                  value={form.image_url}
                  onChange={(e) => setForm((p) => ({ ...p, image_url: e.target.value }))}
                  placeholder="https://… product/logo image"
                  className="flex-1 rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">34 px thumbnail shown on the left. Leave blank to use the ⚡ icon.</p>
            </div>

            {/* Start / End times */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Starts</label>
                <input
                  required
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm((p) => ({ ...p, starts_at: e.target.value }))}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Ends</label>
                <input
                  required
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm((p) => ({ ...p, ends_at: e.target.value }))}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Sort order (super-admin) */}
            {isSuperAdmin && (
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Sort Order</label>
                <input
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500 focus:bg-white"
                />
              </div>
            )}

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                className="flex items-center gap-2 text-xs font-bold text-slate-600"
              >
                {form.is_active
                  ? <FaToggleOn className="text-2xl text-emerald-500" />
                  : <FaToggleOff className="text-2xl text-slate-300" />
                }
                {form.is_active ? "Goes live at start time" : "Save as inactive draft"}
              </button>
            </div>

            <button
              type="submit"
              disabled={saving || !formValid}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 py-4 text-sm font-black text-white shadow-lg shadow-rose-100 transition hover:bg-rose-700 disabled:opacity-50"
            >
              {saving
                ? <FaCircleNotch className="animate-spin" />
                : <><FaPlus /> Schedule Flash Sale</>
              }
            </button>
          </form>

          {/* Live preview bar */}
          {form.title.trim() && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Preview</p>
              <div
                className="flex items-center gap-2 overflow-hidden rounded-xl px-4"
                style={{ height: 56, background: "linear-gradient(135deg, #991b1b 0%, #7c2d12 100%)" }}
              >
                {/* Icon or image */}
                {form.image_url.trim() ? (
                  <img
                    src={form.image_url.trim()}
                    alt=""
                    style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: "2px solid rgba(255,255,255,0.25)" }}
                    onError={(e) => { e.currentTarget.style.display = "none" }}
                  />
                ) : (
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FaBolt style={{ color: "#fbbf24", fontSize: "1rem" }} />
                  </div>
                )}

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 900, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {form.title}
                  </span>
                  {form.subtitle.trim() && (
                    <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {form.subtitle}
                    </span>
                  )}
                </div>

                {/* Badge */}
                {form.discount_label.trim() && (
                  <span style={{ flexShrink: 0, background: "#fbbf24", color: "#7c2d12", fontSize: "0.6rem", fontWeight: 900, letterSpacing: "0.09em", textTransform: "uppercase", padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>
                    {form.discount_label}
                  </span>
                )}

                {/* Timer preview */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                  {["hh", "mm", "ss"].map((label) => (
                    <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <span style={{ minWidth: 28, padding: "3px 5px", borderRadius: 5, background: "rgba(0,0,0,0.30)", color: "#fff", fontFamily: "monospace", fontWeight: 900, fontSize: "0.92rem", textAlign: "center", border: "1px solid rgba(255,255,255,0.12)" }}>
                        {label === "hh" ? "--" : label === "mm" ? "--" : "--"}
                      </span>
                      <span style={{ fontSize: "0.48rem", fontWeight: 700, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {label[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {previewRemaining && form.ends_at && (
                <p className="text-[10px] text-slate-400 text-right">
                  Ends in approximately: <span className="font-black text-slate-600">{previewRemaining}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Sales list ─────────────────────────────────────────────────── */}
        <div className="space-y-6">
          <SectionHeading
            eyebrow="Schedule"
            title="Flash Sales"
            description="Manage scheduled, live, and past sales."
          />

          <div className="space-y-4">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <FaCircleNotch className="animate-spin text-2xl text-slate-300" />
              </div>
            ) : displaySales.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-100 p-12 text-center text-slate-400">
                <FaBolt className="mx-auto mb-4 text-4xl opacity-20" />
                <p className="font-bold">No flash sales scheduled.</p>
                <p className="mt-1 text-sm">Create one to show a countdown bar in the market.</p>
              </div>
            ) : (
              displaySales.map((item) => {
                const status = getSaleStatus(item)
                const isLive = status.label === "LIVE"

                return (
                  <div
                    key={item.id}
                    className={`rounded-3xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                      isLive ? "border-rose-200" : "border-slate-200"
                    } ${!item.is_active ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        {/* Status + city */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${status.color}`}>
                            {status.label}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-rose-600">
                            {item.city_id ? <FaLocationDot /> : <FaGlobe />}
                            {item.city_name}
                          </span>
                        </div>

                        {/* Title + image */}
                        <div className="flex items-center gap-2">
                          {item.image_url && (
                            <img
                              src={item.image_url}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 object-cover"
                            />
                          )}
                          <div>
                            <p className="text-sm font-black text-slate-900">{item.title}</p>
                            {item.subtitle && (
                              <p className="text-xs font-semibold text-slate-500">{item.subtitle}</p>
                            )}
                          </div>
                          {item.discount_label && (
                            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                              {item.discount_label}
                            </span>
                          )}
                        </div>

                        {/* Countdown or schedule */}
                        {isLive ? (
                          <div className="flex items-center gap-1.5 text-xs font-black text-rose-600">
                            <FaClock className="text-[0.7rem]" />
                            Ends in {formatRemaining(item.ends_at)}
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400">
                            <span className="flex items-center gap-1"><FaCalendarCheck /> Starts: {formatDateTime(item.starts_at)}</span>
                            <span className="flex items-center gap-1"><FaClock /> Ends: {formatDateTime(item.ends_at)}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void toggleActive(item)}
                          disabled={processingId === item.id}
                          title={item.is_active ? "Deactivate" : "Activate"}
                          className={`rounded-xl p-2 transition-colors ${item.is_active ? "text-emerald-500 hover:bg-emerald-50" : "text-slate-300 hover:bg-slate-50"}`}
                        >
                          {processingId === item.id
                            ? <FaCircleNotch className="animate-spin text-xl" />
                            : item.is_active
                              ? <FaToggleOn className="text-2xl" />
                              : <FaToggleOff className="text-2xl" />
                          }
                        </button>
                        <button
                          onClick={() => void handleDelete(item)}
                          disabled={processingId === item.id}
                          title="Delete"
                          className="rounded-xl p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </StaffPortalShell>
  )
}
