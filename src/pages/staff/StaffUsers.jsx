import { useEffect, useState } from "react"
import { FaCircleCheck, FaCircleNotch, FaFilter, FaLocationDot, FaTriangleExclamation } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  SectionHeading,
  StaffPortalShell,
  formatActivityNote,
  formatDateTime,
  normaliseShopList,
} from "./StaffPortalShared"

export default function StaffUsers() {
  const [cityOptions, setCityOptions] = useState([])
  const [selectedCityId, setSelectedCityId] = useState("all")
  const [inactiveDays, setInactiveDays] = useState(180)
  const [inactiveOnly, setInactiveOnly] = useState(false)
  const [userActivity, setUserActivity] = useState([])
  const [loadingUserActivity, setLoadingUserActivity] = useState(true)
  const [userActivityError, setUserActivityError] = useState("")

  async function fetchCities() {
    const { data } = await supabase
      .from("cities")
      .select("id, name, state")
      .order("state", { ascending: true })
      .order("name", { ascending: true })
    setCityOptions(data || [])
  }

  async function fetchUserActivity({ cityId, threshold }) {
    setLoadingUserActivity(true)
    setUserActivityError("")
    try {
      const { data, error } = await supabase.rpc("staff_user_activity_summary", {
        p_inactive_days: threshold,
        p_city_id: cityId === "all" ? null : Number(cityId),
      })

      if (error) throw error
      setUserActivity(data || [])
    } catch (err) {
      console.error("Error fetching user activity:", err)
      const message = String(err?.message || "")
      if (message.includes("staff_user_activity_summary")) {
        setUserActivityError("Run the new staff activity SQL migration, then refresh this page.")
      } else {
        setUserActivityError(getFriendlyErrorMessage(err, "Could not load user activity. Retry."))
      }
    } finally {
      setLoadingUserActivity(false)
    }
  }

  useEffect(() => {
    fetchCities()
  }, [])

  useEffect(() => {
    fetchUserActivity({ cityId: selectedCityId, threshold: inactiveDays })
  }, [selectedCityId, inactiveDays])

  const visibleUsers = inactiveOnly ? userActivity.filter((item) => item.is_inactive) : userActivity
  const totalInactiveUsers = userActivity.filter((item) => item.is_inactive).length

  return (
    <StaffPortalShell
      activeKey="users"
      title="User Activity"
      description="A dedicated operations page for user health, inactivity monitoring, city distribution, and shop linkage."
    >
      <SectionHeading
        eyebrow="User Health"
        title="Activity Monitor"
        description="Filter by city and inactivity threshold to identify dormant accounts, active clusters, and linked merchant footprints."
      />

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Users in Scope</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{visibleUsers.length}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Inactive Accounts</div>
          <div className="mt-3 text-4xl font-black text-amber-600">{totalInactiveUsers}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-black uppercase tracking-wide text-slate-400">Current Threshold</div>
          <div className="mt-3 text-4xl font-black text-slate-900">{inactiveDays}</div>
          <div className="mt-2 text-sm font-semibold text-slate-500">days</div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Filtered User Directory</h2>
            <p className="text-sm text-slate-500">Review user status, last login, and associated shop portfolio.</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              <FaLocationDot className="text-[#DB2777]" />
              <select value={selectedCityId} onChange={(event) => setSelectedCityId(event.target.value)} className="bg-transparent outline-none">
                <option value="all">All cities</option>
                {cityOptions.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} - {city.state}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
              <FaFilter className="text-[#DB2777]" />
              <select value={inactiveDays} onChange={(event) => setInactiveDays(Number(event.target.value))} className="bg-transparent outline-none">
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setInactiveOnly((value) => !value)}
              className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${
                inactiveOnly ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {inactiveOnly ? "Showing inactive only" : "Show inactive only"}
            </button>
          </div>
        </div>

        {loadingUserActivity ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <FaCircleNotch className="animate-spin text-2xl text-slate-400" />
          </div>
        ) : userActivityError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm font-medium text-amber-900">
            {userActivityError}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[980px] text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-bold">User</th>
                  <th className="px-5 py-4 font-bold">City</th>
                  <th className="px-5 py-4 font-bold">Last Login</th>
                  <th className="px-5 py-4 font-bold">Status</th>
                  <th className="px-5 py-4 font-bold">Shops</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-10 text-center font-medium text-slate-500">
                      No users found for this filter.
                    </td>
                  </tr>
                ) : (
                  visibleUsers.map((item) => {
                    const shopList = normaliseShopList(item.shops)
                    return (
                      <tr key={item.user_id} className="align-top transition hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-900">{item.full_name || "Unnamed user"}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.email || "No email"}</div>
                          <div className="mt-2 text-xs text-slate-400">Joined {formatDateTime(item.account_created_at)}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">{item.city_name || "No city"}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.state_name || "Unassigned"}</div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-slate-900">
                            {formatDateTime(item.last_sign_in_at || item.last_seen_at)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatActivityNote(item.inactivity_days, item.is_inactive, Boolean(item.last_sign_in_at))}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-2">
                            {item.is_inactive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                                <FaTriangleExclamation /> Flag inactive
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">
                                <FaCircleCheck /> Active recently
                              </span>
                            )}
                            {item.is_suspended ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                                Suspended
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {shopList.length === 0 ? (
                            <span className="text-sm font-medium text-slate-400">No shop</span>
                          ) : (
                            <div className="flex max-w-[360px] flex-wrap gap-2">
                              {shopList.map((shop) => (
                                <span
                                  key={shop.shop_id}
                                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700"
                                  title={`${shop.shop_name} (${shop.unique_id || "No ID"})`}
                                >
                                  {shop.shop_name}
                                  <span className="text-slate-400">{shop.unique_id || "No ID"}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </StaffPortalShell>
  )
}

