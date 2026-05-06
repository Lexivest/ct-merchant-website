import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import { 
  FaCircleCheck, 
  FaCircleNotch, 
  FaEye, 
  FaStore, 
  FaUser, 
  FaXmark,
  FaCheck,
  FaBullhorn,
  FaImage,
  FaNewspaper
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  useStaffPortalSession,
} from "./StaffPortalShared"

export default function StaffShopContent() {
  const location = useLocation()
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-shop-content"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  // --- STATE ---
  const [items, setItems] = useState(() => prefetchedData?.items || [])
  const [loading, setLoading] = useState(() => !prefetchedData && !fetchingStaff)
  const [processingId, setProcessingId] = useState(null)
  const [filterStatus, setFilterStatus] = useState("pending") // 'all' | 'pending'
  const [previewItem, setPreviewItem] = useState(null)
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const fetchContent = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      setItems(prefetchedData.items || [])
      setLoading(false)
      setPrefetchedReady(false)
      return
    }

    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoading(true)
    try {
      let query = supabase
        .from("shop_banners_news")
        .select(`
          id,
          shop_id,
          content_type,
          content_data,
          status,
          created_at,
          shops!inner (
            id,
            name,
            unique_id,
            owner_id,
            city_id,
            profiles ( full_name )
          )
        `)
      
      if (!isSuperAdmin && staffCityId) {
        query = query.eq("shops.city_id", staffCityId)
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error
      setItems(data || [])
    } catch (err) {
      console.error("Error fetching content:", err)
      notify({
        type: "error",
        title: "Could not load content",
        message: getFriendlyErrorMessage(err, "Could not load shop banners and news."),
      })
    } finally {
      setLoading(false)
    }
  }, [notify, isSuperAdmin, prefetchedData, prefetchedReady, staffCityId, fetchingStaff])

  useEffect(() => {
    if (!fetchingStaff) {
      fetchContent()
    }
  }, [fetchContent, fetchingStaff])

  // --- ACTIONS ---
  const handleUpdateStatus = async (item, nextStatus) => {
    if (processingId) return
    
    const isApproved = nextStatus === "approved"
    const confirmMsg = isApproved 
      ? `Approve this ${item.content_type} for "${item.shops?.name}"?`
      : `Reject this ${item.content_type}? It will no longer be visible to customers.`

    const isConfirmed = await confirm({
      title: isApproved ? "Approve Content" : "Reject Content",
      message: confirmMsg,
      confirmLabel: isApproved ? "Yes, Approve" : "Yes, Reject",
      tone: isApproved ? "emerald" : "rose"
    })

    if (!isConfirmed) return

    setProcessingId(item.id)
    try {
      const { error } = await supabase
        .from("shop_banners_news")
        .update({ status: nextStatus })
        .eq("id", item.id)

      if (error) throw error

      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: nextStatus } : i))
      notify({ 
        type: isApproved ? "success" : "info", 
        title: `Content ${isApproved ? 'Approved' : 'Rejected'}`, 
        message: "Status updated successfully." 
      })
    } catch (err) {
      notify({ type: "error", title: "Update Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // --- UI HELPERS ---
  const filteredItems = useMemo(() => {
    if (filterStatus === "all") return items
    return items.filter(i => i.status === "pending")
  }, [items, filterStatus])

  return (
    <StaffPortalShell
      activeKey="shop-content"
      title="Shop Content Moderation"
      description="Review and supervise shop banners and news updates before they go public."
      headerActions={[
        <QuickActionButton key="refresh" icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />} label="Refresh Content" tone="white" onClick={fetchContent} />,
      ]}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SectionHeading
          eyebrow="Moderation"
          title="Banners & News Queue"
          description="A centralized feed of merchant-posted shop updates and display banners."
        />

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: "pending", label: "Pending Review" },
            { id: "all", label: "All History" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                filterStatus === tab.id
                  ? "bg-[#2E1065] text-white shadow-md"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold">Type</th>
                <th className="px-6 py-4 font-bold">Shop & Proprietor</th>
                <th className="px-6 py-4 font-bold">Preview</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="5" className="px-6 py-12 text-center"><FaCircleNotch className="mx-auto animate-spin text-2xl text-slate-400" /></td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan="5" className="px-6 py-12 text-center text-slate-500 font-medium">No pending content to review. Good job!</td></tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      {item.content_type === 'banner' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-black uppercase text-indigo-700">
                          <FaImage /> Banner
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-pink-50 px-2 py-1 text-[10px] font-black uppercase text-pink-700">
                          <FaNewspaper /> News
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{item.shops?.name || "Unknown Shop"}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{item.shops?.profiles?.full_name}</div>
                    </td>
                    <td className="px-6 py-4">
                      {item.content_type === 'banner' ? (
                        <button 
                          onClick={() => setPreviewItem(item)}
                          className="group relative h-10 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                        >
                          <img src={item.content_data} className="h-full w-full object-cover opacity-60 transition group-hover:opacity-100" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                            <FaEye className="text-white drop-shadow-md" />
                          </div>
                        </button>
                      ) : (
                        <button 
                          onClick={() => setPreviewItem(item)}
                          className="max-w-[160px] truncate text-xs font-medium text-slate-400 hover:text-indigo-600"
                        >
                          {item.content_data}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {item.status === "approved" ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-emerald-600">
                          <FaCircleCheck className="text-[10px]" /> Published
                        </span>
                      ) : item.status === "pending" ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-amber-500">
                          <FaCircleNotch className="animate-spin text-[10px]" /> Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-bold text-rose-500">
                          <FaXmark className="text-[10px]" /> Rejected
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.status === "pending" ? (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(item, "rejected")}
                              disabled={processingId === item.id}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-100 text-rose-600 hover:bg-rose-50"
                            >
                              <FaXmark />
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(item, "approved")}
                              disabled={processingId === item.id}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                            >
                              {processingId === item.id ? <FaCircleNotch className="animate-spin" /> : <><FaCheck /> Approve</>}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleUpdateStatus(item, item.status === 'approved' ? 'rejected' : 'approved')}
                            disabled={processingId === item.id}
                            className="text-xs font-bold text-slate-400 hover:text-slate-600"
                          >
                            {item.status === 'approved' ? "Reject" : "Re-approve"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- PREVIEW MODAL --- */}
      {previewItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
              <div className="flex items-center gap-3">
                <FaBullhorn className="text-indigo-600" />
                <h3 className="font-black text-slate-900">Content Preview</h3>
              </div>
              <button onClick={() => setPreviewItem(null)} className="text-slate-400 hover:text-slate-600">
                <FaXmark />
              </button>
            </div>
            
            <div className="p-8">
              {previewItem.content_type === 'banner' ? (
                <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 shadow-inner">
                  <img src={previewItem.content_data} className="w-full" />
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-700 shadow-inner">
                  {previewItem.content_data}
                </div>
              )}
              
              <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Merchant</div>
                  <div className="font-bold text-slate-900">{previewItem.shops?.name}</div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      handleUpdateStatus(previewItem, "rejected")
                      setPreviewItem(null)
                    }}
                    className="rounded-xl border border-rose-100 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                  >
                    Reject
                  </button>
                  <button 
                    onClick={() => {
                      handleUpdateStatus(previewItem, "approved")
                      setPreviewItem(null)
                    }}
                    className="rounded-xl bg-emerald-600 px-6 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </StaffPortalShell>
  )
}
