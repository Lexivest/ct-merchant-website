import { useCallback, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { FaCircleCheck, FaCircleNotch, FaEye, FaIdBadge, FaVideo } from "react-icons/fa6"
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

export default function StaffVerifications() {
  const location = useLocation()
  const navigate = useNavigate()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-verifications"
      ? location.state.prefetchedData
      : null
  const { notify } = useGlobalFeedback()
  const [shops, setShops] = useState(() => prefetchedData?.shops || [])
  const [loadingShops, setLoadingShops] = useState(() => !prefetchedData)
  const [togglingId, setTogglingId] = useState(null)
  const [selectedKycShop, setSelectedKycShop] = useState(null)
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const fetchShops = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      setShops(prefetchedData.shops || [])
      setLoadingShops(false)
      setPrefetchedReady(false)
      return
    }

    setLoadingShops(true)
    try {
      const { data, error } = await supabase
        .from("shops")
        .select(`
          id,
          name,
          unique_id,
          address,
          status,
          kyc_status,
          kyc_video_url,
          kyc_submission_meta,
          rejection_reason,
          id_issued,
          created_at,
          profiles ( full_name ),
          cities ( name, state )
        `)
        .order("created_at", { ascending: false })
        .limit(50)

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
  }, [notify, prefetchedData, prefetchedReady])

  useEffect(() => {
    fetchShops()
  }, [fetchShops])

  const toggleIdIssued = async (shopId, currentStatus) => {
    setTogglingId(shopId)
    try {
      const newStatus = !currentStatus
      const { error } = await supabase.from("shops").update({ id_issued: newStatus }).eq("id", shopId)
      if (error) throw error

      setShops((prev) => prev.map((shop) => (shop.id === shopId ? { ...shop, id_issued: newStatus } : shop)))
    } catch (err) {
      console.error("Error updating ID status:", err)
      notify({
        type: "error",
        title: "Could not update ID status",
        message: getFriendlyErrorMessage(err, "Could not update ID status. Retry."),
      })
    } finally {
      setTogglingId(null)
    }
  }

  const selectedKycMeta =
    selectedKycShop?.kyc_submission_meta && typeof selectedKycShop.kyc_submission_meta === "object"
      ? selectedKycShop.kyc_submission_meta
      : null

  return (
    <StaffPortalShell
      activeKey="verifications"
      title="Merchant Verifications"
      description="A focused workspace for KYC video review, merchant verification, and official ID issuance."
      headerActions={[
        <QuickActionButton key="refresh" icon={<FaCircleNotch className={loadingShops ? "animate-spin" : ""} />} label="Refresh Verifications" tone="white" onClick={fetchShops} />,
        <QuickActionButton key="issue" icon={<FaIdBadge />} label="Issue Merchant ID" onClick={() => navigate("/staff-issue-id")} />,
      ]}
    >
      <SectionHeading
        eyebrow="Verification"
        title="KYC Review Queue"
        description="Review merchant submissions, watch KYC videos, confirm location details, and progress identity issuance."
      />

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-white text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold">Shop Details</th>
                <th className="px-6 py-4 font-bold">Proprietor</th>
                <th className="px-6 py-4 font-bold">KYC Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingShops ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center"><FaCircleNotch className="mx-auto animate-spin text-2xl text-slate-400" /></td></tr>
              ) : shops.length === 0 ? (
                <tr><td colSpan="4" className="px-6 py-8 text-center text-slate-500 font-medium">No shops found in the repository.</td></tr>
              ) : (
                shops.map((shop) => (
                  <tr key={shop.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{shop.name}</div>
                      <div className="mt-0.5 text-xs font-mono text-slate-500">{shop.unique_id || "Unassigned"}</div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">{shop.profiles?.full_name || "Unknown"}</td>
                    <td className="px-6 py-4">
                      {shop.kyc_status === "approved" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-600" /> KYC Approved
                        </span>
                      ) : shop.kyc_status === "submitted" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" /> Video Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Awaiting submission
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {shop.kyc_status === "approved" ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleIdIssued(shop.id, shop.id_issued)}
                            disabled={togglingId === shop.id}
                            className={`inline-flex min-w-[110px] items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                              shop.id_issued
                                ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {togglingId === shop.id ? (
                              <FaCircleNotch className="animate-spin" />
                            ) : shop.id_issued ? (
                              <>
                                <FaCircleCheck className="text-green-600" /> Issued
                              </>
                            ) : (
                              "Mark Issued"
                            )}
                          </button>

                          <button
                            onClick={() => navigate(`/staff-issue-id?shop_id=${shop.id}`)}
                            className="inline-flex items-center gap-2 rounded-lg bg-[#2E1065] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4c1d95]"
                          >
                            <FaIdBadge /> Issue ID
                          </button>
                        </div>
                      ) : shop.kyc_status === "submitted" ? (
                        <div className="flex justify-end">
                          <button
                            onClick={() => setSelectedKycShop(shop)}
                            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-amber-600"
                          >
                            <FaVideo /> Review KYC
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <button disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-xs font-bold text-slate-400">
                            <FaEye /> No Action
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedKycShop ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">KYC Video Review</h3>
                <p className="text-sm text-slate-500">{selectedKycShop.name} • {selectedKycShop.unique_id || "Unassigned"}</p>
              </div>
              <button onClick={() => setSelectedKycShop(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                Close
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.35fr_0.95fr]">
              <div className="space-y-4">
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-sm">
                  {selectedKycShop.kyc_video_url ? (
                    <video src={selectedKycShop.kyc_video_url} controls preload="metadata" className="aspect-video w-full bg-black" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-sm font-semibold text-slate-400">No video attached.</div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#2E1065]">
                    <FaVideo className="text-[#DB2777]" />
                    Submission Notes
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Merchant</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{selectedKycMeta?.merchant_name || selectedKycShop.profiles?.full_name || "Unknown"}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(selectedKycMeta?.submitted_at || selectedKycShop.created_at)}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recorded</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{formatDateTime(selectedKycMeta?.recorded_at)}</div>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Location</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{selectedKycMeta?.location_label || selectedKycShop.cities?.name || "Unknown location"}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 text-sm font-bold text-[#2E1065]">Shop Details</div>
                  <div className="space-y-3 text-sm text-slate-700">
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shop Name</div><div className="mt-1 font-semibold text-slate-900">{selectedKycShop.name}</div></div>
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Address</div><div className="mt-1 font-semibold text-slate-900">{selectedKycMeta?.shop_address || selectedKycShop.address || "No address provided"}</div></div>
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coordinates</div><div className="mt-1 font-semibold text-slate-900">LAT {formatCoordinate(selectedKycMeta?.latitude)} / LNG {formatCoordinate(selectedKycMeta?.longitude)}</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </StaffPortalShell>
  )
}
