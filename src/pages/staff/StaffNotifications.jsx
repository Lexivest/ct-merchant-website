import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { 
  FaEnvelope, 
  FaCircleNotch, 
  FaPlus, 
  FaTrash, 
  FaUser,
  FaMagnifyingGlass,
  FaClock,
  FaCheckDouble,
  FaPaperPlane
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

export default function StaffNotifications() {
  const location = useLocation()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-notifications"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  // --- STATE ---
  const [notifications, setNotifications] = useState(() => prefetchedData?.notifications || [])
  const [profiles, setProfiles] = useState(() => prefetchedData?.profiles || [])
  const [loading, setLoading] = useState(() => !prefetchedData)
  const [saving, setSaving] = useState(false)
  const [processingId, setProcessingId] = useState(null)
  const [userSearch, setUserSearch] = useState("")

  // Form State
  const [form, setForm] = useState({
    user_id: "",
    title: "",
    message: ""
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [profilesRes, notificationsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone").order("full_name"),
        supabase.from("notifications").select(`*, profiles(full_name)`).order("created_at", { ascending: false }).limit(100)
      ])

      if (profilesRes.error) throw profilesRes.error
      if (notificationsRes.error) throw notificationsRes.error

      setProfiles(profilesRes.data || [])
      setNotifications(notificationsRes.data || [])
    } catch (err) {
      console.error("Error fetching notifications:", err)
      notify({
        type: "error",
        title: "Could not load data",
        message: getFriendlyErrorMessage(err, "Could not load notifications. Retry."),
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
  const handleSend = async (e) => {
    e.preventDefault()
    if (!form.user_id || !form.title.trim() || !form.message.trim() || saving) return

    setSaving(true)
    try {
      const payload = {
        user_id: form.user_id,
        title: form.title.trim(),
        message: form.message.trim(),
        is_read: false
      }

      const { data, error } = await supabase
        .from("notifications")
        .insert(payload)
        .select(`*, profiles(full_name)`)
        .single()

      if (error) throw error

      setNotifications(prev => [data, ...prev])
      setForm({ user_id: "", title: "", message: "" })
      setUserSearch("")
      notify({ type: "success", title: "Notification Sent", message: "User will see this in their dashboard." })
    } catch (err) {
      notify({ type: "error", title: "Send Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item) => {
    const isConfirmed = await confirm({
      title: "Delete Notification",
      message: "Are you sure you want to remove this notification history?",
      confirmLabel: "Yes, Delete",
      tone: "rose"
    })

    if (!isConfirmed) return

    setProcessingId(item.id)
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", item.id)

      if (error) throw error

      setNotifications(prev => prev.filter(n => n.id !== item.id))
      notify({ type: "info", title: "Notification Removed" })
    } catch (err) {
      notify({ type: "error", title: "Delete Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // Filtered profiles for selection
  const filteredProfiles = useMemo(() => {
    if (!userSearch.trim()) return []
    const term = userSearch.toLowerCase()
    return profiles.filter(p => 
      p.full_name?.toLowerCase().includes(term) || 
      p.phone?.includes(term) ||
      p.id.toLowerCase().includes(term)
    ).slice(0, 10)
  }, [profiles, userSearch])

  return (
    <StaffPortalShell
      activeKey="notifications"
      title="Targeted Notifications"
      description="Send direct, personal alerts to specific merchant or customer accounts."
      headerActions={[
        <QuickActionButton key="refresh" icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />} label="Refresh Inbox" tone="white" onClick={fetchData} />,
      ]}
    >
      <div className="grid gap-8 lg:grid-cols-[450px_1fr]">
        {/* Composer Side */}
        <div className="space-y-6">
          <SectionHeading
            eyebrow="Compose"
            title="New Message"
          />
          
          <form onSubmit={handleSend} className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-6">
              {/* User Selection */}
              <div className="relative">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Recipient</label>
                
                {form.user_id ? (
                  <div className="flex items-center justify-between rounded-2xl bg-indigo-50 p-4 border-2 border-indigo-100">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
                        <FaUser />
                      </div>
                      <div>
                        <div className="text-sm font-black text-indigo-900">
                          {profiles.find(p => p.id === form.user_id)?.full_name}
                        </div>
                        <div className="text-[10px] font-bold text-indigo-400">Selected User</div>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setForm(prev => ({ ...prev, user_id: "" }))}
                      className="text-indigo-400 hover:text-indigo-600"
                    >
                      <FaTrash />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <FaMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search name or phone..."
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 pl-11 pr-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white transition-all"
                      />
                    </div>
                    
                    {filteredProfiles.length > 0 && (
                      <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                        {filteredProfiles.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setForm(prev => ({ ...prev, user_id: p.id }))
                              setUserSearch("")
                            }}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-400 text-xs">
                              <FaUser />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-900">{p.full_name}</div>
                              <div className="text-[10px] font-medium text-slate-400">{p.phone || "No phone"}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Subject / Title</label>
                <input
                  required
                  type="text"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. KYC Update Required"
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Detailed Message</label>
                <textarea
                  required
                  rows={5}
                  value={form.message}
                  onChange={e => setForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Type your message to the user..."
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-5 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={saving || !form.user_id || !form.title.trim() || !form.message.trim()}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-indigo-600 py-4 text-sm font-black text-white transition hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-100"
              >
                {saving ? <FaCircleNotch className="animate-spin" /> : <><FaPaperPlane /> Send Notification</>}
              </button>
            </div>
          </form>
        </div>

        {/* History Side */}
        <div className="space-y-6">
          <SectionHeading
            eyebrow="Activity"
            title="Outbox History"
            description="Track previous communications and their read status."
          />

          <div className="space-y-4">
            {loading ? (
              <div className="flex h-32 items-center justify-center"><FaCircleNotch className="animate-spin text-2xl text-slate-300" /></div>
            ) : notifications.length === 0 ? (
              <div className="rounded-[40px] border-2 border-dashed border-slate-100 bg-slate-50/50 p-20 text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-slate-200 shadow-sm">
                  <FaEnvelope className="text-3xl" />
                </div>
                <p className="text-lg font-black text-slate-400 tracking-tight">No notifications sent yet.</p>
                <p className="mt-2 text-sm font-medium text-slate-400">Use the composer to reach out to individuals.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div 
                  key={item.id} 
                  className={`group relative flex flex-col gap-5 rounded-[32px] border p-8 transition-all bg-white shadow-sm hover:shadow-md ${
                    item.is_read ? 'border-slate-100 opacity-70' : 'border-indigo-100'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600">
                          {item.profiles?.full_name || "Unknown User"}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-slate-200" />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                          ID: {item.user_id.slice(0, 8)}...
                        </span>
                      </div>
                      <h4 className="text-base font-black text-slate-900">{item.title}</h4>
                      <p className="text-sm font-medium leading-relaxed text-slate-500">{item.message}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div 
                        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                          item.is_read ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                        }`}
                        title={item.is_read ? "User has read this" : "Unread by user"}
                      >
                        {item.is_read ? <FaCheckDouble /> : <FaEnvelope />}
                      </div>
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={processingId === item.id}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-all"
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 border-t border-slate-50 pt-4">
                    <FaClock /> Sent {formatDateTime(item.created_at)}
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
