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

  const ipClusters = insights.filter((i) => i.fingerprint_type === "IP Address")
  const deviceClusters = insights.filter((i) => i.fingerprint_type === "Device Signature")

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

      <div className="space-y-10">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex min-h-[300px] items-center justify-center">
            <FaCircleNotch className="animate-spin text-3xl text-[#DB2777]" />
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
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
          </div>
        ) : (
          <>
            {/* IP Clusters Section */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900">IP Address Clusters</h3>
                  <p className="text-sm text-slate-500">Duplicate accounts sharing the same network connection.</p>
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                  {ipClusters.length} Found
                </div>
              </div>

              {ipClusters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-500">
                    <FaCircleCheck className="text-xl" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No IP clusters detected.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[1000px] text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-bold">IP Address</th>
                        <th className="px-5 py-4 font-bold">Count</th>
                        <th className="px-5 py-4 font-bold">Account Mapping (Email + Shops)</th>
                        <th className="px-5 py-4 font-bold">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ipClusters.map((item, idx) => (
                        <ClusterRow key={idx} item={item} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Device Clusters Section */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900">Device Signature Clusters</h3>
                  <p className="text-sm text-slate-500">Duplicate accounts sharing the same hardware footprint.</p>
                </div>
                <div className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-[#DB2777]">
                  {deviceClusters.length} Found
                </div>
              </div>

              {deviceClusters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                    <FaTowerBroadcast className="text-xl" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No device signature clusters detected.</p>
                  <p className="mt-1 text-xs text-slate-400 max-w-xs">
                    This is common as modern browsers use highly unique version strings.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full min-w-[1000px] text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-4 font-bold">Signature</th>
                        <th className="px-5 py-4 font-bold">Count</th>
                        <th className="px-5 py-4 font-bold">Account Mapping (IP + Email + Shops)</th>
                        <th className="px-5 py-4 font-bold">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deviceClusters.map((item, idx) => (
                        <ClusterRow key={idx} item={item} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </StaffPortalShell>
  )
}

function ClusterRow({ item }) {
  const accounts = Array.isArray(item.account_data) ? item.account_data : []

  return (
    <tr className="align-top transition hover:bg-slate-50">
      <td className="px-5 py-4">
        <div className="font-mono text-xs font-bold text-slate-900 break-all max-w-[300px]">
          {item.fingerprint_value}
        </div>
        {item.is_banned && (
          <span className="mt-2 inline-flex items-center gap-1 rounded bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
            <FaBan /> BANNED
          </span>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-black text-slate-900">
          {item.occurrence_count}
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-col gap-4">
          {accounts.map((acc, index) => (
            <div key={index} className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-900">{acc.email}</span>
                {acc.ip && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">
                    IP: {acc.ip}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {Array.isArray(acc.shops) && acc.shops.length > 0 ? (
                  acc.shops.map((shop, sIdx) => (
                    <span key={sIdx} className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-[10px] font-bold text-[#DB2777]">
                      {shop}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] italic text-slate-400">No shops linked</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </td>
      <td className="px-5 py-4">
        {item.occurrence_count > 5 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
            <FaSkullCrossbones /> High
          </span>
        ) : item.occurrence_count > 2 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
            <FaTriangleExclamation /> Medium
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
            Low
          </span>
        )}
      </td>
    </tr>
  )
}
