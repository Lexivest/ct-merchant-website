import { useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import { FaCircleNotch, FaTriangleExclamation, FaSkullCrossbones, FaBan, FaCircleCheck, FaTowerBroadcast } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  SectionHeading,
  StaffPortalShell,
} from "./StaffPortalShared"

export default function StaffSecurityRadar() {
  const location = useLocation()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-security-radar"
      ? location.state.prefetchedData
      : null

  const [insights, setInsights] = useState(() => prefetchedData?.insights || [])
  const [loading, setLoading] = useState(() => !prefetchedData)
  const [error, setError] = useState("")
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))

  const fetchInsights = useCallback(async () => {
    if (prefetchedReady && prefetchedData) {
      setInsights(prefetchedData.insights || [])
      setLoading(false)
      setPrefetchedReady(false)
      return
    }

    setLoading(true)
    setError("")
    try {
      const { data, error } = await supabase.rpc("ctm_get_security_radar_insights")
      if (error) throw error
      setInsights(data || [])
    } catch (err) {
      console.error("Error fetching security radar insights:", err)
      setError(getFriendlyErrorMessage(err, "Could not load security insights."))
    } finally {
      setLoading(false)
    }
  }, [prefetchedData, prefetchedReady])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  return (
    <StaffPortalShell
      activeKey="security-radar"
      title="Security Radar"
      description="Intelligence console for detecting multi-account clusters and suspicious merchant footprints."
    >
      <SectionHeading
        eyebrow="Intelligence"
        title="Network & Device Clusters"
        description="This radar identifies different accounts and shops that share the exact same registration fingerprint (IP or Device). High occurrence counts often indicate a single operator managing multiple identities."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <FaCircleNotch className="animate-spin text-3xl text-[#DB2777]" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-6 py-8 text-center">
            <FaTriangleExclamation className="mx-auto mb-3 text-3xl text-rose-500" />
            <p className="text-sm font-bold text-rose-900">{error}</p>
            <button
              onClick={fetchInsights}
              className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700"
            >
              Retry
            </button>
          </div>
        ) : insights.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <FaCircleCheck className="text-3xl" />
            </div>
            <h3 className="text-lg font-black text-slate-900">All Clear</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              No suspicious clusters detected. All active registrations and shops appear to have unique fingerprints.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 border border-amber-200 text-amber-900">
              <FaTriangleExclamation className="text-xl shrink-0" />
              <p className="text-sm font-medium">
                Showing <strong>{insights.length}</strong> suspicious clusters. Review these accounts carefully for potential terms-of-service violations.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[1000px] text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-bold">Fingerprint</th>
                    <th className="px-5 py-4 font-bold">Cluster Size</th>
                    <th className="px-5 py-4 font-bold">Associated Accounts</th>
                    <th className="px-5 py-4 font-bold">Associated Shops</th>
                    <th className="px-5 py-4 font-bold">Risk Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {insights.map((item, idx) => (
                    <tr key={`${item.fingerprint_type}-${idx}`} className="align-top transition hover:bg-slate-50">
                      <td className="px-5 py-4">
                        <div className="text-[10px] font-black uppercase tracking-wider text-[#DB2777]">
                          {item.fingerprint_type}
                        </div>
                        <div className="mt-1 font-mono text-xs font-bold text-slate-900 break-all max-w-[250px]">
                          {item.fingerprint_value}
                        </div>
                        {item.is_banned && (
                          <span className="mt-2 inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                            <FaBan /> BANNED IP
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-900">
                          {item.occurrence_count}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          {item.associated_emails?.map((email) => (
                            <span key={email} className="text-xs font-semibold text-slate-700">
                              {email}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {item.associated_shops?.length > 0 ? (
                            item.associated_shops.map((shop) => (
                              <span key={shop} className="inline-flex items-center rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-bold text-[#DB2777] border border-pink-100">
                                {shop}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs italic text-slate-400">No shops created</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {item.occurrence_count > 5 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                            <FaSkullCrossbones /> High Risk
                          </span>
                        ) : item.occurrence_count > 2 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                            <FaTriangleExclamation /> Medium Risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                            Low Risk
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </StaffPortalShell>
  )
}

