import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaArrowsUpDown,
  FaBullhorn,
  FaCircleNotch,
  FaClock,
  FaGlobe,
  FaLocationDot,
  FaPlus,
  FaToggleOff,
  FaToggleOn,
  FaTrash,
  FaTowerBroadcast,
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

const MAX_CHARS = 120

export default function StaffTickerMessages() {
  const location = useLocation()
  const { isSuperAdmin, isCityAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-ticker"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  // ── State ──────────────────────────────────────────────────────────────
  const [messages,        setMessages]        = useState(() => prefetchedData?.messages  || [])
  const [cities,          setCities]          = useState(() => prefetchedData?.cities    || [])
  const [loading,         setLoading]         = useState(() => !prefetchedData && !fetchingStaff)
  const [saving,          setSaving]          = useState(false)
  const [processingId,    setProcessingId]    = useState(null)
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  // Editable sort-order value per row (super-admin only)
  const [editingSortId,   setEditingSortId]   = useState(null)
  const [sortDraft,       setSortDraft]       = useState("")

  const [form, setForm] = useState({
    city_id:    isSuperAdmin ? "" : (staffCityId ? String(staffCityId) : ""),
    message:    "",
    is_active:  true,
    sort_order: 0,
  })

  // ── Data fetching ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      setCities(prefetchedData.cities   || [])
      setMessages(prefetchedData.messages || [])
      setLoading(false)
      setPrefetchedReady(false)
      return
    }

    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoading(true)
    try {
      let msgQuery = supabase
        .from("ticker_messages")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })

      if (!isSuperAdmin && staffCityId) {
        msgQuery = msgQuery.eq("city_id", staffCityId)
      }

      const [citiesRes, msgRes] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("name"),
        msgQuery,
      ])

      if (citiesRes.error) throw citiesRes.error
      if (msgRes.error)    throw msgRes.error

      setCities(citiesRes.data   || [])
      setMessages(msgRes.data || [])
    } catch (err) {
      notify({
        type:    "error",
        title:   "Could not load data",
        message: getFriendlyErrorMessage(err, "Could not load ticker messages. Retry."),
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
    const trimmed = form.message.trim()
    if (!trimmed || saving) return
    // city_id required unless super-admin posting globally
    if (!isSuperAdmin && !form.city_id) return

    setSaving(true)
    try {
      const payload = {
        message:    trimmed,
        is_active:  form.is_active,
        sort_order: Number(form.sort_order) || 0,
        ...(form.city_id ? { city_id: parseInt(form.city_id, 10) } : {}),
      }

      const { data, error } = await supabase
        .from("ticker_messages")
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      setMessages((prev) => [data, ...prev])
      setForm({
        city_id:    isSuperAdmin ? "" : (staffCityId ? String(staffCityId) : ""),
        message:    "",
        is_active:  true,
        sort_order: 0,
      })
      notify({ type: "success", title: "Ticker Message Posted", message: "Now live in the market dashboard." })
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
      const nextActive = !item.is_active
      const { error } = await supabase
        .from("ticker_messages")
        .update({ is_active: nextActive })
        .eq("id", item.id)

      if (error) throw error

      setMessages((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, is_active: nextActive } : m))
      )
    } catch (err) {
      notify({ type: "error", title: "Update Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Save sort order (super-admin) ──────────────────────────────────────
  const saveSortOrder = async (item) => {
    const next = parseInt(sortDraft, 10)
    if (!Number.isFinite(next) || next === item.sort_order) {
      setEditingSortId(null)
      return
    }
    setProcessingId(item.id)
    try {
      const { error } = await supabase
        .from("ticker_messages")
        .update({ sort_order: next })
        .eq("id", item.id)

      if (error) throw error

      setMessages((prev) =>
        prev
          .map((m) => (m.id === item.id ? { ...m, sort_order: next } : m))
          .sort((a, b) => a.sort_order - b.sort_order || new Date(b.created_at) - new Date(a.created_at))
      )
      setEditingSortId(null)
    } catch (err) {
      notify({ type: "error", title: "Sort Update Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (item) => {
    const confirmed = await confirm({
      title:        "Delete Ticker Message",
      message:      "Remove this message from the market ticker permanently?",
      confirmLabel: "Yes, Delete",
      tone:         "rose",
    })
    if (!confirmed) return

    setProcessingId(item.id)
    try {
      const { error } = await supabase
        .from("ticker_messages")
        .delete()
        .eq("id", item.id)

      if (error) throw error

      setMessages((prev) => prev.filter((m) => m.id !== item.id))
      notify({ type: "info", title: "Message Removed" })
    } catch (err) {
      notify({ type: "error", title: "Delete Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // ── Derived display list ───────────────────────────────────────────────
  const displayMessages = useMemo(() => {
    return messages.map((m) => {
      const city = cities.find((c) => String(c.id) === String(m.city_id))
      return {
        ...m,
        city_name: m.city_id
          ? (city ? `${city.name}, ${city.state}` : "Unknown city")
          : "Global — all cities",
      }
    })
  }, [messages, cities])

  const charsLeft = MAX_CHARS - form.message.length

  return (
    <StaffPortalShell
      activeKey="ticker"
      title="Market Ticker"
      description="Post short broadcast messages shown inside the market dashboard ticker bar."
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
      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">

        {/* ── Create panel ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          <SectionHeading eyebrow="Post" title="New Ticker Message" />

          <form
            onSubmit={handleCreate}
            className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="space-y-5">

              {/* City selector */}
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                  Target City
                </label>

                {isCityAdmin && !isSuperAdmin ? (
                  <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3">
                    <FaLocationDot className="shrink-0 text-pink-400" />
                    <span className="text-sm font-bold text-slate-900">
                      {(() => {
                        const c = cities.find((c) => String(c.id) === String(staffCityId))
                        return c ? `${c.name} (${c.state})` : "Your city"
                      })()}
                    </span>
                    <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Locked
                    </span>
                  </div>
                ) : (
                  <select
                    value={form.city_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, city_id: e.target.value }))}
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-500 focus:bg-white"
                  >
                    <option value="">🌍 Global — all cities</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.state})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Message text */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Message
                  </label>
                  <span
                    className={`text-xs font-black ${
                      charsLeft < 20
                        ? charsLeft < 0
                          ? "text-rose-500"
                          : "text-amber-500"
                        : "text-slate-400"
                    }`}
                  >
                    {charsLeft} left
                  </span>
                </div>
                <textarea
                  required
                  rows={3}
                  maxLength={MAX_CHARS}
                  value={form.message}
                  onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                  placeholder="e.g. 🔥 Flash sale — up to 60% off electronics today"
                  className="w-full resize-none rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-500 focus:bg-white"
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Keep it short and punchy — max {MAX_CHARS} characters.
                </p>
              </div>

              {/* Sort order (super-admin only) */}
              {isSuperAdmin && (
                <div>
                  <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, sort_order: e.target.value }))
                    }
                    className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-pink-500 focus:bg-white"
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Lower values display first in the rotation.
                  </p>
                </div>
              )}

              {/* Active toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, is_active: !prev.is_active }))}
                  className="flex items-center gap-2 text-xs font-bold text-slate-600"
                >
                  {form.is_active ? (
                    <FaToggleOn className="text-2xl text-emerald-500" />
                  ) : (
                    <FaToggleOff className="text-2xl text-slate-300" />
                  )}
                  {form.is_active ? "Go live immediately" : "Save as inactive"}
                </button>
              </div>

              <button
                type="submit"
                disabled={
                  saving ||
                  !form.message.trim() ||
                  form.message.length > MAX_CHARS ||
                  (!isSuperAdmin && !form.city_id)
                }
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 py-4 text-sm font-black text-white shadow-lg shadow-pink-100 transition hover:bg-pink-700 disabled:opacity-50"
              >
                {saving ? (
                  <FaCircleNotch className="animate-spin" />
                ) : (
                  <>
                    <FaPlus /> Post to Ticker
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Preview strip */}
          {form.message.trim() && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Live Preview
              </p>
              <div
                className="flex items-center gap-3 overflow-hidden rounded-xl px-4"
                style={{ height: 36, background: "#131921" }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "2px 10px",
                    borderRadius: 99,
                    background: "#db2777",
                    color: "#fff",
                    fontSize: "0.62rem",
                    fontWeight: 900,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                  }}
                >
                  CTMerchant
                </span>
                <p
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "#e2e8f0",
                    margin: 0,
                  }}
                >
                  {form.message}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Messages list ──────────────────────────────────────────────── */}
        <div className="space-y-6">
          <SectionHeading
            eyebrow="Active Feed"
            title="Ticker Messages"
            description="Toggle, reorder, or remove messages from the market ticker."
          />

          <div className="space-y-4">
            {loading ? (
              <div className="flex h-32 items-center justify-center">
                <FaCircleNotch className="animate-spin text-2xl text-slate-300" />
              </div>
            ) : displayMessages.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-100 p-12 text-center text-slate-400">
                <FaTowerBroadcast className="mx-auto mb-4 text-4xl opacity-20" />
                <p className="font-bold">No ticker messages yet.</p>
                <p className="mt-1 text-sm">Post one to start the broadcast.</p>
              </div>
            ) : (
              displayMessages.map((item) => (
                <div
                  key={item.id}
                  className={`group relative rounded-3xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                    item.is_active
                      ? "border-slate-200"
                      : "border-slate-100 opacity-60"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* City label */}
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-pink-600">
                        {item.city_id ? <FaLocationDot /> : <FaGlobe />}
                        {item.city_name}
                      </div>

                      {/* Message */}
                      <p className="text-sm font-bold leading-relaxed text-slate-900 break-words">
                        {item.message}
                      </p>

                      {/* Sort order badge + editable for super-admin */}
                      {isSuperAdmin && (
                        <div className="flex items-center gap-2 pt-1">
                          <FaArrowsUpDown className="text-[10px] text-slate-400" />
                          {editingSortId === item.id ? (
                            <input
                              type="number"
                              min={0}
                              value={sortDraft}
                              onChange={(e) => setSortDraft(e.target.value)}
                              onBlur={() => void saveSortOrder(item)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void saveSortOrder(item)
                                if (e.key === "Escape") setEditingSortId(null)
                              }}
                              autoFocus
                              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-black text-slate-900 outline-none focus:border-pink-400"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSortId(item.id)
                                setSortDraft(String(item.sort_order))
                              }}
                              className="text-[10px] font-black text-slate-400 hover:text-pink-600 transition-colors"
                              title="Click to edit sort order"
                            >
                              Order: {item.sort_order}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void toggleActive(item)}
                        disabled={processingId === item.id}
                        title={item.is_active ? "Mark Inactive" : "Mark Active"}
                        className={`rounded-xl p-2 transition-colors ${
                          item.is_active
                            ? "text-emerald-500 hover:bg-emerald-50"
                            : "text-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {processingId === item.id ? (
                          <FaCircleNotch className="animate-spin text-xl" />
                        ) : item.is_active ? (
                          <FaToggleOn className="text-2xl" />
                        ) : (
                          <FaToggleOff className="text-2xl" />
                        )}
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

                  <div className="mt-3 flex items-center gap-2 text-[10px] font-bold text-slate-400">
                    <FaClock />
                    Posted {formatDateTime(item.created_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </StaffPortalShell>
  )
}
