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
  FaTriangleExclamation,
  FaTag,
  FaLayerGroup,
  FaBox
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

export default function StaffProducts() {
  const location = useLocation()
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-products"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  // --- STATE ---
  const [shops, setShops] = useState(() => prefetchedData?.shops || [])
  const [loading, setLoading] = useState(() => !prefetchedData && !fetchingStaff)
  const [selectedShop, setSelectedShop] = useState(null)
  const [processingId, setProcessingId] = useState(null)
  const [rejectionNote, setRejectionReason] = useState("")
  const [rejectingProductId, setRejectingProductId] = useState(null)
  const [filterStatus, setFilterStatus] = useState("pending") // 'all' | 'pending'

  const fetchProducts = useCallback(async () => {
    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoading(true)
    try {
      let query = supabase
        .from("shops")
        .select(`
          id,
          name,
          unique_id,
          owner_id,
          city_id,
          profiles ( full_name ),
          products (
            id,
            name,
            description,
            price,
            discount_price,
            category,
            image_url,
            image_url_2,
            image_url_3,
            is_approved,
            rejection_reason,
            created_at
          )
        `)
      
      if (!isSuperAdmin && staffCityId) {
        query = query.eq("city_id", staffCityId)
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) throw error
      setShops(data || [])
    } catch (err) {
      console.error("Error fetching products:", err)
      notify({
        type: "error",
        title: "Could not load products",
        message: getFriendlyErrorMessage(err, "Could not load products for review."),
      })
    } finally {
      setLoading(false)
    }
  }, [notify, isSuperAdmin, staffCityId, fetchingStaff])

  useEffect(() => {
    if (!fetchingStaff) {
      fetchProducts()
    }
  }, [fetchProducts, fetchingStaff])

  // --- ACTIONS ---
  const handleApprove = async (product) => {
    if (processingId) return
    
    const isConfirmed = await confirm({
      title: "Approve Product",
      message: `Approve "${product.name}" for the marketplace?`,
      confirmLabel: "Yes, Approve",
      tone: "emerald"
    })

    if (!isConfirmed) return

    setProcessingId(product.id)
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_approved: true, rejection_reason: null })
        .eq("id", product.id)

      if (error) throw error

      // Update local state
      setShops(prev => prev.map(s => ({
        ...s,
        products: s.products.map(p => p.id === product.id ? { ...p, is_approved: true, rejection_reason: null } : p)
      })))
      
      // Update selected shop products if open
      if (selectedShop) {
        setSelectedShop(prev => ({
          ...prev,
          products: prev.products.map(p => p.id === product.id ? { ...p, is_approved: true, rejection_reason: null } : p)
        }))
      }

      notify({ type: "success", title: "Product Approved", message: "Item is now live." })
    } catch (err) {
      notify({ type: "error", title: "Approval Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (product) => {
    if (processingId || !rejectionNote.trim()) return

    setProcessingId(product.id)
    try {
      const { error } = await supabase
        .from("products")
        .update({ is_approved: false, rejection_reason: rejectionNote.trim() })
        .eq("id", product.id)

      if (error) throw error

      // Update local state
      setShops(prev => prev.map(s => ({
        ...s,
        products: s.products.map(p => p.id === product.id ? { ...p, is_approved: false, rejection_reason: rejectionNote.trim() } : p)
      })))
      
      if (selectedShop) {
        setSelectedShop(prev => ({
          ...prev,
          products: prev.products.map(p => p.id === product.id ? { ...p, is_approved: false, rejection_reason: rejectionNote.trim() } : p)
        }))
      }

      notify({ type: "info", title: "Product Rejected", message: "Merchant will be notified." })
      setRejectingProductId(null)
      setRejectionReason("")
    } catch (err) {
      notify({ type: "error", title: "Rejection Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessingId(null)
    }
  }

  // --- UI HELPERS ---
  const filteredShops = useMemo(() => {
    if (filterStatus === "all") return shops
    return shops.filter(s => s.products.some(p => !p.is_approved && !p.rejection_reason))
  }, [shops, filterStatus])

  return (
    <StaffPortalShell
      activeKey="products"
      title="Product Moderation"
      description="Review and approve new product listings to maintain marketplace quality."
      headerActions={[
        <QuickActionButton key="refresh" icon={<FaCircleNotch className={loading ? "animate-spin" : ""} />} label="Refresh Queue" tone="white" onClick={fetchProducts} />,
      ]}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SectionHeading
          eyebrow="Moderation"
          title="Product Queue"
          description="Listing submissions grouped by shop for efficient bulk review."
        />

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: "pending", label: "Needs Review" },
            { id: "all", label: "All Shops" },
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

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex h-64 items-center justify-center">
            <FaCircleNotch className="animate-spin text-4xl text-slate-300" />
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="col-span-full py-20 text-center">
            <FaBox className="mx-auto mb-4 text-5xl text-slate-200" />
            <p className="text-lg font-bold text-slate-400">All caught up! No products pending review.</p>
          </div>
        ) : (
          filteredShops.map((shop) => {
            const pending = shop.products.filter(p => !p.is_approved && !p.rejection_reason).length
            return (
              <button
                key={shop.id}
                onClick={() => setSelectedShop(shop)}
                className="group relative flex flex-col rounded-[32px] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                    <FaStore className="text-xl" />
                  </div>
                  {pending > 0 && (
                    <span className="rounded-full bg-amber-500 px-3 py-1 text-[10px] font-black text-white shadow-sm">
                      {pending} PENDING
                    </span>
                  )}
                </div>
                
                <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                  {shop.name}
                </h3>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-400">
                  <FaUser className="text-[10px]" />
                  {shop.profiles?.full_name || "Unknown Merchant"}
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-slate-50 pt-4">
                  <div className="text-xs font-bold text-slate-500">
                    {shop.products.length} Products total
                  </div>
                  <div className="flex items-center gap-1 text-xs font-black text-indigo-600">
                    Review <FaEye />
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* --- SHOP PRODUCTS MODAL --- */}
      {selectedShop ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-8 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                  <FaStore className="text-xl" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">{selectedShop.name}</h3>
                  <p className="text-sm font-bold text-slate-400">{selectedShop.profiles?.full_name} • {selectedShop.unique_id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedShop(null)} 
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm transition hover:text-slate-600"
              >
                <FaXmark />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto bg-slate-50/30 p-8">
              <div className="grid gap-6">
                {selectedShop.products
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((product) => (
                    <div 
                      key={product.id} 
                      className={`relative flex flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:flex-row ${
                        !product.is_approved && !product.rejection_reason ? "ring-2 ring-indigo-500/20" : ""
                      }`}
                    >
                      {/* Product Images */}
                      <div className="flex flex-shrink-0 gap-2 overflow-x-auto pb-2 lg:flex-col lg:pb-0">
                        {[product.image_url, product.image_url_2, product.image_url_3]
                          .filter(Boolean)
                          .map((url, i) => (
                            <a 
                              key={i} 
                              href={url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50"
                            >
                              <img src={url} className="h-full w-full object-cover" />
                            </a>
                          ))
                        }
                      </div>

                      {/* Details */}
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-lg font-black text-slate-900">{product.name}</h4>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 uppercase">
                                {product.category}
                              </span>
                            </div>
                            <div className="mt-1 text-sm font-medium leading-relaxed text-slate-500">
                              {product.description || "No description provided."}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className="text-xl font-black text-[#2E1065]">
                              ₦{Number(product.price).toLocaleString()}
                            </div>
                            {product.discount_price && (
                              <div className="text-sm font-bold text-emerald-600">
                                Disc: ₦{Number(product.discount_price).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-6 border-t border-slate-50 pt-4">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                            <FaLayerGroup /> Submitted {formatDateTime(product.created_at)}
                          </div>
                          
                          {product.is_approved ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-600">
                              <FaCircleCheck /> APPROVED & LIVE
                            </span>
                          ) : product.rejection_reason ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 text-xs font-black text-rose-600">
                                <FaTriangleExclamation /> REJECTED
                              </span>
                              <div className="text-[10px] font-bold text-slate-400 italic">"{product.rejection_reason}"</div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-black text-amber-500">
                              <FaCircleNotch className="animate-spin" /> PENDING MODERATION
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col justify-center gap-2 border-t border-slate-50 pt-4 lg:w-48 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                        {rejectingProductId === product.id ? (
                          <div className="space-y-2">
                            <textarea
                              autoFocus
                              value={rejectionNote}
                              onChange={e => setRejectionReason(e.target.value)}
                              placeholder="Reason..."
                              className="w-full rounded-xl border border-rose-200 bg-rose-50/30 p-2 text-xs font-bold outline-none focus:border-rose-500"
                              rows={3}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleReject(product)}
                                disabled={processingId === product.id || !rejectionNote.trim()}
                                className="flex-1 rounded-xl bg-rose-600 py-2 text-[10px] font-black text-white"
                              >
                                {processingId === product.id ? "..." : "Confirm"}
                              </button>
                              <button
                                onClick={() => {
                                  setRejectingProductId(null)
                                  setRejectionReason("")
                                }}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black text-slate-400"
                              >
                                <FaXmark />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {!product.is_approved && (
                              <button
                                onClick={() => handleApprove(product)}
                                disabled={processingId === product.id}
                                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {processingId === product.id ? <FaCircleNotch className="animate-spin" /> : <><FaCheck /> Approve</>}
                              </button>
                            )}
                            
                            {(!product.is_approved || !product.rejection_reason) && (
                              <button
                                onClick={() => setRejectingProductId(product.id)}
                                disabled={processingId === product.id}
                                className="flex items-center justify-center gap-2 rounded-xl border border-rose-100 bg-white py-3 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                              >
                                <FaXmark /> Reject
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </StaffPortalShell>
  )
}
