import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { 
  FaCircleCheck, 
  FaCircleNotch, 
  FaEye, 
  FaIdBadge, 
  FaVideo, 
  FaStore, 
  FaUser, 
  FaFileContract, 
  FaXmark,
  FaCheck,
  FaTriangleExclamation,
  FaFileLines,
  FaLocationDot,
  FaWhatsapp,
  FaPhone
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatCoordinate,
  formatDateTime,
} from "./StaffPortalShared"
import { ProtectedImage, ProtectedVideo } from "../../components/common/ProtectedMedia"
import { UPLOAD_RULES } from "../../lib/uploadRules"

function StatusBadge({ status, type = "shop" }) {
  if (type === "kyc") {
    if (status === "approved") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
          <span className="h-1.5 w-1.5 rounded-full bg-green-600" /> KYC Approved
        </span>
      )
    }
    if (status === "submitted") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" /> Video Pending
        </span>
      )
    }
    if (status === "rejected") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-600" /> KYC Rejected
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Unsubmitted
      </span>
    )
  }

  // Shop Application Status
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Approved
      </span>
    )
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" /> Pending Review
      </span>
    )
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600" /> Rejected
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> {status || "Draft"}
    </span>
  )
}

export default function StaffVerifications() {
  const location = useLocation()
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()
  const navigate = useNavigate()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-verifications"
      ? location.state.prefetchedData
      : null
  const { notify, confirm } = useGlobalFeedback()

  // --- STATE ---
  const [shops, setShops] = useState(() => prefetchedData?.shops || [])
  const [loadingShops, setLoadingShops] = useState(() => !prefetchedData && !fetchingStaff)
  const [togglingId, setTogglingId] = useState(null)
  const [selectedShop, setSelectedShop] = useState(null)
  const [reviewTab, setReviewTab] = useState("application") // 'application' | 'kyc'
  const [processing, setProcessing] = useState(false)
  const [rejectionNote, setRejectionReason] = useState("")
  const [showRejectionInput, setShowRejectionInput] = useState(false)
  const [filterStatus, setFilterStatus] = useState("all") // 'all' | 'pending' | 'kyc_submitted'

  // Signed URLs for private assets
  const [signedUrls, setSignedUrls] = useState({ id: null, cac: null, video: null })

  useEffect(() => {
    if (!selectedShop) {
      setSignedUrls({ id: null, cac: null, video: null })
      return
    }

    async function signAssets() {
      const getPath = (url) => {
        if (!url) return null
        if (!url.startsWith("http")) return url
        try {
          const u = new URL(url)
          const parts = u.pathname.split("/")
          if (parts.length >= 6) return parts.slice(6).join("/")
        } catch (e) {
          return url
        }
        return url
      }

      const idPath = getPath(selectedShop.id_card_url)
      const cacPath = getPath(selectedShop.cac_certificate_url)
      // Only Super Admin can see Video KYC
      const videoPath = isSuperAdmin ? getPath(selectedShop.kyc_video_url) : null

      const promises = []
      if (idPath) {
        promises.push(supabase.storage.from(UPLOAD_RULES.idDocuments.bucket).createSignedUrl(idPath, 3600))
      } else {
        promises.push(Promise.resolve({ data: null }))
      }

      if (cacPath) {
        promises.push(supabase.storage.from(UPLOAD_RULES.cacDocuments.bucket).createSignedUrl(cacPath, 3600))
      } else {
        promises.push(Promise.resolve({ data: null }))
      }

      if (videoPath) {
        promises.push(supabase.storage.from(UPLOAD_RULES.kycVideos.bucket).createSignedUrl(videoPath, 3600))
      } else {
        promises.push(Promise.resolve({ data: null }))
      }

      const results = await Promise.all(promises)
      setSignedUrls({
        id: results[0]?.data?.signedUrl || selectedShop.id_card_url,
        cac: results[1]?.data?.signedUrl || selectedShop.cac_certificate_url,
        video: results[2]?.data?.signedUrl || selectedShop.kyc_video_url,
      })
    }

    signAssets()
  }, [selectedShop, isSuperAdmin])

  const fetchShops = useCallback(async () => {
    if (!fetchingStaff && !staffCityId && !isSuperAdmin) return

    setLoadingShops(true)
    try {
      let query = supabase
        .from("shops")
        .select(`
          id,
          name,
          unique_id,
          business_type,
          category,
          address,
          city_id,
          phone,
          whatsapp,
          status,
          rejection_reason,
          image_url,
          storefront_url,
          id_type,
          id_number,
          id_card_url,
          cac_number,
          cac_certificate_url,
          kyc_status,
          kyc_video_url,
          kyc_submission_meta,
          id_issued,
          created_at,
          owner_id,
          profiles ( full_name, avatar_url, phone ),
          cities ( name, state )
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
      console.error("Error fetching shops:", err)
      notify({
        type: "error",
        title: "Could not load shops",
        message: getFriendlyErrorMessage(err, "Could not load shop records. Retry."),
      })
    } finally {
      setLoadingShops(false)
    }
  }, [notify, isSuperAdmin, staffCityId, fetchingStaff])

  useEffect(() => {
    if (!fetchingStaff) {
      fetchShops()
    }
  }, [fetchShops, fetchingStaff])

  // --- ACTIONS ---
  const toggleIdIssued = async (shopId, currentStatus) => {
    if (togglingId) return
    setTogglingId(shopId)
    try {
      const newStatus = !currentStatus
      const { error } = await supabase.from("shops").update({ id_issued: newStatus }).eq("id", shopId)
      if (error) throw error

      setShops((prev) => prev.map((shop) => (shop.id === shopId ? { ...shop, id_issued: newStatus } : shop)))
      notify({ type: "success", title: "ID Status Updated", message: `ID marked as ${newStatus ? 'issued' : 'pending'}.` })
    } catch (err) {
      notify({ type: "error", title: "Update Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setTogglingId(null)
    }
  }

  const handleApprove = async (type) => {
    if (!selectedShop || processing) return
    
    const isKyc = type === "kyc"
    const confirmMsg = isKyc 
      ? `Are you sure you want to approve the KYC video for "${selectedShop.name}"?`
      : `Are you sure you want to approve the shop application for "${selectedShop.name}"?`

    const isConfirmed = await confirm({
      title: isKyc ? "Approve KYC" : "Approve Shop",
      message: confirmMsg,
      confirmLabel: "Yes, Approve",
      tone: "emerald"
    })

    if (!isConfirmed) return

    setProcessing(true)
    try {
      const updateData = isKyc 
        ? { kyc_status: "approved" }
        : { status: "approved" }

      // If we approve one, check if the other is already approved to set overall verification
      const otherApproved = isKyc 
        ? selectedShop.status === "approved"
        : selectedShop.kyc_status === "approved"

      if (otherApproved) {
        updateData.is_verified = true
      }

      const { error } = await supabase
        .from("shops")
        .update(updateData)
        .eq("id", selectedShop.id)

      if (error) throw error

      setShops(prev => prev.map(s => s.id === selectedShop.id ? { ...s, ...updateData } : s))
      setSelectedShop(prev => ({ ...prev, ...updateData }))
      
      notify({
        type: "success",
        title: isKyc ? "KYC Approved" : "Shop Approved",
        message: `${selectedShop.name} has been updated successfully.`
      })
    } catch (err) {
      notify({ type: "error", title: "Approval Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async (type) => {
    if (!selectedShop || processing) return
    if (!rejectionNote.trim()) {
      setShowRejectionInput(true)
      return
    }

    setProcessing(true)
    try {
      const isKyc = type === "kyc"
      const updateData = isKyc
        ? { kyc_status: "rejected", rejection_reason: rejectionNote.trim(), is_verified: false }
        : { status: "rejected", rejection_reason: rejectionNote.trim(), is_verified: false }

      const { error } = await supabase
        .from("shops")
        .update(updateData)
        .eq("id", selectedShop.id)

      if (error) throw error

      setShops(prev => prev.map(s => s.id === selectedShop.id ? { ...s, ...updateData } : s))
      setSelectedShop(prev => ({ ...prev, ...updateData }))
      
      notify({
        type: "info",
        title: isKyc ? "KYC Rejected" : "Shop Rejected",
        message: `Notification sent to merchant with reason.`
      })
      
      setShowRejectionInput(false)
      setRejectionReason("")
    } catch (err) {
      notify({ type: "error", title: "Rejection Failed", message: getFriendlyErrorMessage(err) })
    } finally {
      setProcessing(false)
    }
  }

  // --- UI HELPERS ---
  const filteredShops = useMemo(() => {
    if (filterStatus === "pending") return shops.filter(s => s.status === "pending")
    if (filterStatus === "kyc_submitted") return shops.filter(s => s.kyc_status === "submitted")
    return shops
  }, [shops, filterStatus])

  const selectedKycMeta = selectedShop?.kyc_submission_meta || {}

  return (
    <StaffPortalShell
      activeKey="verifications"
      title="Merchant Verifications"
      description="A focused workspace for reviewing shop applications, KYC videos, and official ID issuance."
      headerActions={[
        <QuickActionButton key="refresh" icon={<FaCircleNotch className={loadingShops ? "animate-spin" : ""} />} label="Refresh List" tone="white" onClick={fetchShops} />,
        <QuickActionButton key="issue" icon={<FaIdBadge />} label="Issue ID" onClick={() => navigate("/staff-issue-id")} />,
      ]}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SectionHeading
          eyebrow="Verification"
          title="Review Queue"
          description="Process submitted applications and identity verifications."
        />

        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          {[
            { id: "all", label: "All Records" },
            { id: "pending", label: "Applications" },
            { id: "kyc_submitted", label: "KYC Videos" },
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
                <th className="px-6 py-4 font-bold">Shop & Proprietor</th>
                <th className="px-6 py-4 font-bold">App Status</th>
                <th className="px-6 py-4 font-bold">KYC Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingShops ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center"><FaCircleNotch className="mx-auto animate-spin text-2xl text-slate-400" /></td></tr>
              ) : filteredShops.length === 0 ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500 font-medium">No records found matching this filter.</td></tr>
              ) : (
                filteredShops.map((shop) => (
                  <tr key={shop.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{shop.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-2">
                        <span className="font-medium text-[#DB2777]">{shop.profiles?.full_name || "Unknown"}</span>
                        <span className="text-slate-300">|</span>
                        <span className="font-mono">{shop.unique_id || "No ID"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={shop.status} type="shop" />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={shop.kyc_status} type="kyc" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedShop(shop)
                            setReviewTab(shop.status === 'pending' ? 'application' : 'kyc')
                          }}
                          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white transition shadow-sm ${
                            shop.status === 'pending' || shop.kyc_status === 'submitted'
                              ? "bg-indigo-600 hover:bg-indigo-700"
                              : "bg-slate-600 hover:bg-slate-700"
                          }`}
                        >
                          <FaEye /> {shop.status === 'pending' || shop.kyc_status === 'submitted' ? "Review Now" : "View Details"}
                        </button>

                        {shop.is_verified && (
                          <button
                            onClick={() => navigate(`/staff-issue-id?shop_id=${shop.id}`)}
                            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition border ${
                              shop.id_issued 
                                ? "bg-green-50 text-green-700 border-green-200" 
                                : "bg-white text-[#2E1065] border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <FaIdBadge /> {shop.id_issued ? "ID Issued" : "Issue ID"}
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

      {/* --- REVIEW MODAL --- */}
      {selectedShop ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-8 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <FaStore className="text-xl" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">{selectedShop.name}</h3>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <span>{selectedShop.business_type || "Standard Shop"}</span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" />
                    <span>{selectedShop.cities?.name}, {selectedShop.cities?.state}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedShop(null)
                  setShowRejectionInput(false)
                  setRejectionReason("")
                }} 
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <FaXmark className="text-lg" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-100 px-8">
              {[
                { id: "application", label: "Shop Application", icon: <FaFileContract /> },
                { id: "kyc", label: "KYC Verification", icon: <FaVideo />, superOnly: true },
              ].filter(t => !t.superOnly || isSuperAdmin).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setReviewTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 px-6 py-4 text-sm font-bold transition-all ${
                    reviewTab === tab.id
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.id === "application" && selectedShop.status === "pending" && (
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                  )}
                  {tab.id === "kyc" && selectedShop.kyc_status === "submitted" && (
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
              {reviewTab === "application" ? (
                <div className="grid gap-8 lg:grid-cols-2">
                  <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h4 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Business Profile</h4>
                      <div className="space-y-4">
                        <div className="flex justify-between border-b border-slate-50 pb-3">
                          <span className="text-sm font-semibold text-slate-500">Official Name</span>
                          <span className="text-sm font-bold text-slate-900">{selectedShop.name}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-3">
                          <span className="text-sm font-semibold text-slate-500">Business Category</span>
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">{selectedShop.category}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-50 pb-3">
                          <span className="text-sm font-semibold text-slate-500">Phone Number</span>
                          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><FaPhone className="text-xs text-slate-400" /> {selectedShop.phone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-semibold text-slate-500">WhatsApp</span>
                          <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-600"><FaWhatsapp className="text-xs" /> {selectedShop.whatsapp || "Not linked"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h4 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Owner Identity</h4>
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 overflow-hidden rounded-2xl bg-slate-100">
                          {selectedShop.profiles?.avatar_url ? (
                            <img src={selectedShop.profiles.avatar_url} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400"><FaUser /></div>
                          )}
                        </div>
                        <div>
                          <div className="text-base font-bold text-slate-900">{selectedShop.profiles?.full_name}</div>
                          <div className="text-xs font-medium text-slate-500">System ID: {selectedShop.owner_id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h4 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Legal Documents</h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <a 
                          href={signedUrls.id} 
                          target="_blank" 
                          rel="noreferrer"
                          className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 transition hover:border-indigo-200"
                        >
                          <img src={signedUrls.id} className="h-full w-full object-cover transition group-hover:scale-105" />
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
                            <span className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-900">View ID Card</span>
                          </div>
                          <div className="absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-black uppercase backdrop-blur-sm">
                            {selectedShop.id_type || "Govt ID"}
                          </div>
                        </a>
                        
                        {selectedShop.cac_certificate_url ? (
                          <a 
                            href={signedUrls.cac} 
                            target="_blank" 
                            rel="noreferrer"
                            className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 transition hover:border-indigo-200"
                          >
                            <img src={signedUrls.cac} className="h-full w-full object-cover transition group-hover:scale-105" />
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
                              <span className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-900">View CAC</span>
                            </div>
                            <div className="absolute bottom-2 left-2 rounded-lg bg-white/90 px-2 py-1 text-[10px] font-black uppercase backdrop-blur-sm">
                              CAC Certificate
                            </div>
                          </a>
                        ) : (
                          <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
                            <FaTriangleExclamation className="mb-2 text-xl" />
                            <span className="text-[10px] font-bold uppercase">No CAC Uploaded</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-4 grid gap-2">
                        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
                          <FaFileLines className="text-slate-400" />
                          <div className="text-xs font-bold text-slate-600">ID: <span className="text-slate-900">{selectedShop.id_number}</span></div>
                        </div>
                        {selectedShop.cac_number && (
                          <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3">
                            <FaFileLines className="text-slate-400" />
                            <div className="text-xs font-bold text-slate-600">CAC: <span className="text-slate-900">{selectedShop.cac_number}</span></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
                  <div className="space-y-6">
                    <div className="overflow-hidden rounded-[32px] border-4 border-white bg-slate-900 shadow-xl">
                      {selectedShop.kyc_video_url ? (
                        <video src={signedUrls.video} controls preload="metadata" className="aspect-video w-full" />
                      ) : (
                        <div className="flex aspect-video flex-col items-center justify-center text-slate-400">
                          <FaVideo className="mb-4 text-4xl opacity-20" />
                          <p className="font-bold">No KYC video submitted yet.</p>
                        </div>
                      )}
                    </div>
                    
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-indigo-600">
                        <FaLocationDot />
                        Recording Context
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="text-[10px] font-black uppercase text-slate-400">GPS Coordinates</div>
                          <div className="mt-1 font-mono text-sm font-bold text-slate-900">
                            {formatCoordinate(selectedKycMeta.latitude)}, {formatCoordinate(selectedKycMeta.longitude)}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="text-[10px] font-black uppercase text-slate-400">Verified Location</div>
                          <div className="mt-1 text-sm font-bold text-slate-900 truncate">
                            {selectedKycMeta.location_label || "No label provided"}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="text-[10px] font-black uppercase text-slate-400">Timestamp</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">
                            {formatDateTime(selectedKycMeta.recorded_at)}
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4">
                          <div className="text-[10px] font-black uppercase text-slate-400">Device Platform</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">
                            Mobile Handheld
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                      <h4 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Review Checklist</h4>
                      <ul className="space-y-3">
                        {[
                          "Face matches ID card photo",
                          "Official store signage visible",
                          "Real-time location matches address",
                          "Valid business surroundings",
                        ].map((item, i) => (
                          <li key={i} className="flex items-center gap-3 text-sm font-bold text-slate-600">
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100">
                              <FaCheck className="text-[10px] text-slate-400" />
                            </div>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer / Action Bar */}
            <div className="border-t border-slate-100 bg-white px-8 py-6">
              {showRejectionInput ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-black text-rose-600 uppercase tracking-widest">Rejection Reason</label>
                    <button onClick={() => setShowRejectionInput(false)} className="text-xs font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                  </div>
                  <div className="flex gap-3">
                    <input
                      autoFocus
                      value={rejectionNote}
                      onChange={e => setRejectionReason(e.target.value)}
                      placeholder="Explain what is missing or incorrect..."
                      className="flex-1 rounded-2xl border-2 border-rose-100 bg-rose-50/30 px-5 py-3 text-sm font-bold text-slate-900 outline-none focus:border-rose-500"
                    />
                    <button
                      onClick={() => handleReject(reviewTab)}
                      disabled={processing || !rejectionNote.trim()}
                      className="rounded-2xl bg-rose-600 px-6 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:opacity-50"
                    >
                      {processing ? <FaCircleNotch className="animate-spin" /> : "Confirm Rejection"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current App Status</div>
                      <div className="mt-1"><StatusBadge status={selectedShop.status} /></div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current KYC Status</div>
                      <div className="mt-1"><StatusBadge status={selectedShop.kyc_status} type="kyc" /></div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowRejectionInput(true)}
                      disabled={processing}
                      className="flex items-center gap-2 rounded-2xl border-2 border-rose-100 bg-white px-6 py-3 text-sm font-black text-rose-600 transition hover:bg-rose-50"
                    >
                      <FaXmark /> Reject {reviewTab === 'kyc' ? 'Video' : 'Application'}
                    </button>
                    <button
                      onClick={() => handleApprove(reviewTab)}
                      disabled={processing}
                      className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-8 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100 transition hover:bg-emerald-700 active:scale-95"
                    >
                      {processing ? <FaCircleNotch className="animate-spin" /> : <><FaCheck /> Approve {reviewTab === 'kyc' ? 'Video' : 'Application'}</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </StaffPortalShell>
  )
}
