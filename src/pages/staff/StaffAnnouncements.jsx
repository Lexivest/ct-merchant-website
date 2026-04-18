import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { 
  FaBullhorn, 
  FaCircleNotch, 
  FaPlus, 
  FaTrash, 
  FaToggleOn, 
  FaToggleOff,
  FaLocationDot,
  FaClock
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
} from "./StaffPortalShared"

export default function StaffAnnouncements() {
  const location = useLocation()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-announcements"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  // --- STATE ---
  const [announcements, setAnnouncements] = useState(() => prefetchedData?.announcements || [])
  const [cities, setCities] = useState(() => prefetchedData?.cities || [])
  const [loading, setLoading] = useState(() => !prefetchedData)
  const [saving, setSaving] = useState(false)
  const [processingId, setProcessingId] = useState(null)

  // Form State
  const [form, setForm] = useState({
    city_id: "",
    message: "",
    is_active: true
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [citiesRes, announcementsRes] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("name"),
        supabase.from("announcements").select("*").order("created_at", { ascending: false })
      ])

      if (citiesRes.error) throw citiesRes.error
      if (announcementsRes.error) throw announcementsRes.error

      setCities(citiesRes.data || [])
      setAnnouncements(announcementsRes.data || [])
    } catch (err) {
      console.error("Error fetching announcements:", err)
      notify({
        type: "error",
        title: "Could not load data",
        message: getFriendlyErrorMessage(err, "Could not load announcements. Retry."),
      })
    } finally {
      setLoading(false)
    }
  }, [notify])

  useEffect(() => {
    if (!prefetchedData) {
      fetchData()
    }
  }, [fetchData, prefetchedData])

  // --- ACTIONS ---
  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.city_id || !form.message.trim() || saving) return

    setSaving(true)
    try {
      const payload = {
        city_id: parseInt(form.city_id, 10),
        message: form.message.trim(),
        is_active: form.is_active
      }

      const { data, error } = await supabase
        .from("announcements")
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      setAnnouncements(prev => [data, ...prev])
      setForm({ city_id: "", message: "", is_active: true })
      notify({ type: "success", title: "Announcement Created", message: "Live in the selected city." })
    } catch (err) {
      notify({ type: "error", title: "Save Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (item) => {
    if (processingId) return
    setProcessingId(item.id)
    try {
      const nextActive = !item.is_active
      const { error } = await supabase
        .from("announcements")
        .update({ is_active: nextActive })
        .eq("id", item.id)

      if (error) throw error

      setAnnouncements(prev => prev.map(a => a.id === item.id ? { ...a, is_active: nextActive } : a))
    } catch (err) {
      notify({ type: "error", title: "Update Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  const handleDelete = async (item) => {
    const isConfirmed = await confirm({
      title: "Delete Announcement",
      message: "Are you sure you want to permanently remove this message?",
      confirmLabel: "Yes, Delete",
      tone: "rose"
    })

    if (!isConfirmed) return

    setProcessingId(item.id)
    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", item.id)

      if (error) throw error

      setAnnouncements(prev => prev.filter(a => a.id !== item.id))
      notify({ type: "info", title: "Announcement Removed" })
    } catch (err) {
      notify({ type: "error", title: "Delete Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // Enriched list
  const displayAnnouncements = useMemo(() => {
    return announcements.map(a => {
      const city = cities.find(c => String(c.id) === String(a.city_id))
      return { ...a, city_name: city ? `${city.name}, ${city.state}` : "Global / Unknown" }
    })
  }, [announcements, cities])

  return (
    <StaffPortalShell
      activeKey="announcements"
      title="City Announcements"
      description="Publish targeted broadcast messages to users in specific cities."
      headerActions={[
        <QuickActionButton key="refresh" icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />} label="Refresh Feed" tone="white" onClick={fetchData} />,
      ]}
    >
      <div className="grid gap-8 lg:grid-cols-[400px_1fr]">
        {/* Creation Side */}
        <div className="space-y-6">
          <SectionHeading
            eyebrow="Publish"
            title="New Broadcast"
          />
          
          <form onSubmit={handleCreate} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Target City</label>
                <select
                  required
                  value={form.city_id}
                  onChange={e => setForm(prev => ({ ...prev, city_id: e.target.value }))}
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                >
                  <option value="">Select a city...</option>
                  {cities.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.state})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-widest text-slate-400">Message Content</label>
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Type your announcement here..."
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className="flex items-center gap-2 text-xs font-bold text-slate-600"
                >
                  {form.is_active ? <FaToggleOn className="text-2xl text-emerald-500" /> : <FaToggleOff className="text-2xl text-slate-300" />}
                  Published Immediately
                </button>
              </div>

              <button
                type="submit"
                disabled={saving || !form.city_id || !form.message.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2E1065] py-4 text-sm font-black text-white transition hover:bg-[#4C1D95] disabled:opacity-50 shadow-lg shadow-indigo-100"
              >
                {saving ? <FaCircleNotch className="animate-spin" /> : <><FaPlus /> Post Announcement</>}
              </button>
            </div>
          </form>
        </div>

        {/* History Side */}
        <div className="space-y-6">
          <SectionHeading
            eyebrow="History"
            title="Recent Broadcasts"
            description="Manage your previous announcements and their active status."
          />

          <div className="space-y-4">
            {loading ? (
              <div className="flex h-32 items-center justify-center"><FaCircleNotch className="animate-spin text-2xl text-slate-300" /></div>
            ) : displayAnnouncements.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-100 p-12 text-center text-slate-400">
                <FaBullhorn className="mx-auto mb-4 text-4xl opacity-20" />
                <p className="font-bold">No announcements have been posted yet.</p>
              </div>
            ) : (
              displayAnnouncements.map((item) => (
                <div 
                  key={item.id} 
                  className={`group relative flex flex-col gap-4 rounded-3xl border p-6 transition-all bg-white shadow-sm hover:shadow-md ${
                    item.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600">
                        <FaLocationDot /> {item.city_name}
                      </div>
                      <p className="text-sm font-bold leading-relaxed text-slate-900">{item.message}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleActive(item)}
                        disabled={processingId === item.id}
                        className={`p-2 transition-colors rounded-xl ${item.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-50'}`}
                        title={item.is_active ? "Mark Inactive" : "Mark Active"}
                      >
                        {item.is_active ? <FaToggleOn className="text-2xl" /> : <FaToggleOff className="text-2xl" />}
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={processingId === item.id}
                        className="p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 rounded-xl"
                        title="Delete"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                    <FaClock /> Published {formatDateTime(item.created_at)}
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
