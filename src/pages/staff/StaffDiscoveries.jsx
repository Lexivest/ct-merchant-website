import { useCallback, useEffect, useState } from "react"
import {
  FaCircleNotch,
  FaImage,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrashCan,
  FaCloudArrowUp,
  FaXmark,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { SectionHeading, StaffPortalShell, formatDateTime, useStaffPortalSession } from "./StaffPortalShared"
import StableImage from "../../components/common/StableImage"
import { clearCachedFetchStore } from "../../hooks/useCachedFetch"
import { UPLOAD_RULES, formatBytes } from "../../lib/uploadRules"

const DISCOVERY_RULE = UPLOAD_RULES.sponsoredProducts;

export default function StaffDiscoveries() {
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const { notify, confirm } = useGlobalFeedback()
  const [loading, setLoading] = useState(() => !fetchingStaff)
  const [saving, setSaving] = useState(false)
  const [discoveries, setDiscoveries] = useState([])
  
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    image_url: "",
    contact_phone: "",
    sort_order: "0",
  })

  const loadDiscoveries = useCallback(async () => {
    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoading(true)
    try {
      let query = supabase
        .from("staff_discoveries")
        .select("*")
      
      const { data, error } = await query
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
      
      if (error) throw error
      setDiscoveries(data || [])
    } catch (error) {
      notify({ type: "error", title: "Load failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }, [notify, isSuperAdmin, staffCityId, fetchingStaff])

  useEffect(() => { 
    if (!fetchingStaff) {
      loadDiscoveries() 
    }
  }, [loadDiscoveries, fetchingStaff])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > DISCOVERY_RULE.maxBytes) {
      notify({ 
        type: "error", 
        title: "File too large", 
        message: `Maximum allowed size is ${formatBytes(DISCOVERY_RULE.maxBytes)}.` 
      })
      return
    }

    try {
      setSaving(true)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
      const filePath = `discoveries/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from(DISCOVERY_RULE.bucket)
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from(DISCOVERY_RULE.bucket)
        .getPublicUrl(filePath)

      setForm(prev => ({ ...prev, image_url: publicUrl }))
      notify({ type: "success", title: "Image Uploaded", message: "Portrait image ready." })
    } catch (error) {
      notify({ type: "error", title: "Upload failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.image_url || !form.title) {
      notify({ type: "error", title: "Validation error", message: "Title and Image are required." })
      return
    }

    try {
      setSaving(true)
      const { error } = await supabase.from("staff_discoveries").insert({
        title: form.title,
        description: form.description,
        price: form.price ? Number(form.price) : null,
        image_url: form.image_url,
        contact_phone: form.contact_phone,
        sort_order: Number(form.sort_order) || 0,
        status: "published"
      })
      
      if (error) throw error

      clearCachedFetchStore((key) => key.startsWith("dashboard_cache_"))
      notify({ type: "success", title: "Discovery Published", message: "Post is now live in the marketplace." })
      
      setForm({
        title: "",
        description: "",
        price: "",
        image_url: "",
        contact_phone: "",
        sort_order: "0"
      })
      await loadDiscoveries()
    } catch (error) {
      notify({ type: "error", title: "Save failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(item, status) {
    try {
      const { error } = await supabase.from("staff_discoveries").update({ status }).eq("id", item.id)
      if (error) throw error
      clearCachedFetchStore((key) => key.startsWith("dashboard_cache_"))
      await loadDiscoveries()
    } catch (error) {
      notify({ type: "error", title: "Update failed", message: getFriendlyErrorMessage(error) })
    }
  }

  async function handleDelete(item) {
    const ok = await confirm({ type: "error", title: "Delete Discovery?", message: "This post will be permanently removed.", confirmText: "Delete" })
    if (!ok) return
    try {
      const { error } = await supabase.from("staff_discoveries").delete().eq("id", item.id)
      if (error) throw error
      clearCachedFetchStore((key) => key.startsWith("dashboard_cache_"))
      await loadDiscoveries()
    } catch (error) {
      notify({ type: "error", title: "Delete failed", message: getFriendlyErrorMessage(error) })
    }
  }

  return (
    <StaffPortalShell activeKey="discoveries" title="Market Discoveries" description="Create direct portrait-style product posts.">
      <SectionHeading eyebrow="Fashion & Lifestyle" title="Direct Discoveries" description="Post high-quality portrait shots that appear directly in the marketplace." />
      
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[400px_1fr]">
        {/* CREATE FORM */}
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm h-fit">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-black text-slate-900">New Post</h3>
            {(form.title || form.image_url) && (
              <button 
                onClick={() => setForm({ title: "", description: "", price: "", image_url: "", contact_phone: "", sort_order: "0" })}
                className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-600 transition"
              >
                Clear Form
              </button>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-slate-100 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer group">
              {form.image_url ? (
                <div className="relative h-full w-full">
                  <img src={form.image_url} alt="Preview" className="h-full w-full object-cover" />
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setForm(p => ({ ...p, image_url: "" })); }}
                    className="absolute top-2 right-2 h-8 w-8 bg-black/50 text-white rounded-full flex items-center justify-center backdrop-blur-md hover:bg-rose-600 transition"
                  >
                    <FaXmark />
                  </button>
                </div>
              ) : (
                <div className="text-center p-4">
                  <FaCloudArrowUp className="mx-auto text-3xl text-slate-300 group-hover:text-pink-500 mb-2" />
                  <p className="text-xs font-black text-slate-400">Upload Portrait Image</p>
                  <p className="text-[10px] text-slate-400 mt-1">Recommended: 1080x1620 (2:3)</p>
                  <p className="text-[9px] text-slate-300 mt-1">Max {formatBytes(DISCOVERY_RULE.maxBytes)}</p>
                </div>
              )}
              {!form.image_url && <input type="file" accept="image/*" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer" />}
              {saving && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><FaCircleNotch className="animate-spin text-2xl text-pink-600" /></div>}
            </div>

            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Product Title (e.g. Silk Nightgown)" 
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500 transition-all"
              />
              <textarea 
                placeholder="Detailed description..." 
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500 resize-none transition-all"
              />
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="number" 
                  placeholder="Price (₦)" 
                  value={form.price}
                  onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500 transition-all"
                />
                <input 
                  type="number" 
                  placeholder="Order" 
                  value={form.sort_order}
                  onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500 transition-all"
                />
              </div>
              <input 
                type="text" 
                placeholder="Contact WhatsApp/Phone" 
                value={form.contact_phone}
                onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500 transition-all"
              />
            </div>

            <button 
              type="submit"
              disabled={saving || !form.image_url || !form.title}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 py-4 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:bg-pink-700 disabled:bg-slate-300 disabled:shadow-none"
            >
              {saving ? <FaCircleNotch className="animate-spin" /> : <FaPlus />} 
              Publish Discovery
            </button>
          </form>
        </div>

        {/* LISTING */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-black text-slate-900">Active Discoveries</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{discoveries.length} Posts</span>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center"><FaCircleNotch className="animate-spin text-3xl text-pink-600" /></div>
          ) : discoveries.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {discoveries.map(item => (
                <div key={item.id} className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
                  <div className="relative aspect-[2/3] w-full bg-slate-100">
                    <img src={item.image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
                    <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition duration-300">
                      <button onClick={() => updateStatus(item, item.status === 'published' ? 'paused' : 'published')} title={item.status === 'published' ? 'Pause' : 'Publish'} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-600 backdrop-blur-sm shadow-sm hover:text-pink-600">
                        {item.status === 'published' ? <FaPause className="text-[12px]" /> : <FaPlay className="text-[12px]" />}
                      </button>
                      <button onClick={() => handleDelete(item)} title="Delete" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-600 backdrop-blur-sm shadow-sm hover:bg-rose-50">
                        <FaTrashCan className="text-[12px]" />
                      </button>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${item.status === 'published' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="truncate text-sm font-black text-slate-900">{item.title}</div>
                    <div className="mt-1 flex items-center justify-between">
                       <span className="text-xs font-bold text-pink-600">₦{Number(item.price).toLocaleString()}</span>
                       <span className="text-[10px] font-bold text-slate-400"># {item.sort_order}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-50 text-[9px] font-bold text-slate-300 uppercase tracking-tighter">
                      Created {formatDateTime(item.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-slate-200 rounded-[32px] bg-slate-50">
              <FaImage className="mx-auto text-4xl text-slate-200 mb-3" />
              <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">No discoveries posted yet.</p>
            </div>
          )}
        </div>
      </div>
    </StaffPortalShell>
  )
}
