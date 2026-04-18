import { useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaCircleCheck,
  FaCircleNotch,
  FaFilter,
  FaLocationDot,
  FaTriangleExclamation,
  FaRotateLeft,
  FaMagnifyingGlass,
  FaUserSlash,
} from "react-icons/fa6"
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
  const location = useLocation()
  const { isSuperAdmin, staffCityId, fetchingStaff } = useStaffPortalSession()

  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-users"
      ? location.state.prefetchedData
      : null
  
  // If city admin, force city selection
  const initialCityId = isSuperAdmin ? (prefetchedData?.selectedCityId || "all") : (staffCityId || "all")

  const [cityOptions, setCityOptions] = useState(() => prefetchedData?.cityOptions || [])
  const [selectedCityId, setSelectedCityId] = useState(initialCityId)
  const [inactiveDays, setInactiveDays] = useState(() => prefetchedData?.inactiveDays || 180)
  const [inactiveOnly, setInactiveOnly] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [userActivity, setUserActivity] = useState(() => prefetchedData?.userActivity || [])
  const [loadingUserActivity, setLoadingUserActivity] = useState(() => !prefetchedData && !fetchingStaff)
  const [userActivityError, setUserActivityError] = useState("")
  const [prefetchedReady, setPrefetchedReady] = useState(() => Boolean(prefetchedData))
  const [updatingUserId, setUpdatingUserId] = useState(null)

  const fetchCities = useCallback(async () => {
    if (prefetchedData?.cityOptions?.length) {
      setCityOptions(prefetchedData.cityOptions)
      return
    }

    const { data } = await supabase
      .from("cities")
      .select("id, name, state")
      .order("state", { ascending: true })
      .order("name", { ascending: true })
    setCityOptions(data || [])
  }, [prefetchedData?.cityOptions])

  const fetchUserActivity = useCallback(async ({ cityId, threshold }) => {
    // Determine effective city ID for filtering
    const effectiveCityId = isSuperAdmin ? cityId : staffCityId

    if (
      prefetchedReady &&
      prefetchedData &&
      effectiveCityId === prefetchedData.selectedCityId &&
      threshold === prefetchedData.inactiveDays
    ) {
      setUserActivity(prefetchedData.userActivity || [])
      setUserActivityError("")
      setLoadingUserActivity(false)
      setPrefetchedReady(false)
      return
    }

    setLoadingUserActivity(true)
    setUserActivityError("")
    try {
      const { data, error } = await supabase.rpc("staff_user_activity_summary", {
        p_inactive_days: threshold,
        p_city_id: effectiveCityId === "all" ? null : Number(effectiveCityId),
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
  }, [prefetchedData, prefetchedReady, isSuperAdmin, staffCityId])

  useEffect(() => {
    if (!fetchingStaff) {
      fetchCities()
    }
  }, [fetchCities, fetchingStaff])

  useEffect(() => {
    if (!fetchingStaff) {
      fetchUserActivity({ cityId: selectedCityId, threshold: inactiveDays })
    }
  }, [fetchUserActivity, inactiveDays, selectedCityId, fetchingStaff])

  const handleToggleSuspension = async (user) => {
    const isSuspending = !user.is_suspended
    const actionLabel = isSuspending ? "suspend" : "reinstate"
    
    if (!window.confirm(`Are you sure you want to ${actionLabel} ${user.email || user.full_name}?`)) {
      return
    }

    let reason = null
    if (isSuspending) {
      reason = window.prompt("Enter a reason for suspension (optional):")
      if (reason === null) return // User cancelled prompt
    }

    setUpdatingUserId(user.user_id)
    try {
      const { data, error } = await supabase.rpc("ctm_staff_update_user_status", {
        p_user_id: user.user_id,
        p_email: user.email,
        p_suspend: isSuspending,
        p_reason: reason || (isSuspending ? "Manual staff suspension" : null)
      })

      if (error) throw error
      
      if (data) {
        // Refresh the list
        fetchUserActivity({ cityId: selectedCityId, threshold: inactiveDays })
      } else {
        alert(`Failed to ${actionLabel} user.`)
      }
    } catch (err) {
      console.error(`Error during user ${actionLabel}:`, err)
      alert(getFriendlyErrorMessage(err, `Failed to ${actionLabel} user.`))
    } finally {
      setUpdatingUserId(null)
    }
  }

  const filteredUsers = userActivity.filter((item) => {
    const matchesInactive = !inactiveOnly || item.is_inactive
    const matchesSearch = !searchQuery.trim() || 
      String(item.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(item.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    return matchesInactive && matchesSearch
  })

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
          <div className="mt-3 text-4xl font-black text-slate-900">{filteredUsers.length}</div>
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
            <div className="relative flex items-center">
              <FaMagnifyingGlass className="absolute left-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or email..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold text-slate-600 outline-none focus:border-[#DB2777] focus:bg-white"
              />
            </div>

            {isSuperAdmin && (
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
            )}

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
              {inactiveOnly ? "Showing inactive" : "Filter inactive"}
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
            <table className="w-full min-w-[1000px] text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-bold">User</th>
                  <th className="px-5 py-4 font-bold">City</th>
                  <th className="px-5 py-4 font-bold">Last Login</th>
                  <th className="px-5 py-4 font-bold">Status & Actions</th>
                  <th className="px-5 py-4 font-bold">Shops</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-10 text-center font-medium text-slate-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((item) => {
                    const shopList = normaliseShopList(item.shops)
                    const isProcessing = updatingUserId === item.user_id

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
                          <div className="flex flex-col items-start gap-3">
                            <div className="flex flex-wrap gap-2">
                              {item.is_inactive ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase text-amber-800">
                                  <FaTriangleExclamation /> Inactive
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-[10px] font-black uppercase text-green-800">
                                  <FaCircleCheck /> Active
                                </span>
                              )}
                              {item.is_suspended ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black uppercase text-rose-800" title={item.guard_suspension_reason || "Manual Suspension"}>
                                  <FaUserSlash /> {item.guard_suspended_at ? "Security Lock" : "Suspended"}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex flex-col gap-2 w-full">
                              {item.is_suspended ? (
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => handleToggleSuspension(item)}
                                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {isProcessing ? <FaCircleNotch className="animate-spin" /> : <FaRotateLeft />}
                                  Reinstate User
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => handleToggleSuspension(item)}
                                  className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
                                >
                                  {isProcessing ? <FaCircleNotch className="animate-spin" /> : <FaUserSlash />}
                                  Suspend User
                                </button>
                              )}
                            </div>
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

