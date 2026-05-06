import { useCallback, useEffect, useMemo, useState } from "react"
import { useLocation } from "react-router-dom"
import {
  FaAddressBook,
  FaCircleNotch,
  FaLock,
  FaMagnifyingGlass,
  FaPhone,
  FaRotateRight,
  FaShieldHalved,
  FaStore,
} from "react-icons/fa6"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { supabase } from "../../lib/supabase"
import { isValidNigerianPhone, normalizePhone } from "../../lib/validators"
import {
  QuickActionButton,
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  useStaffPortalSession,
} from "./StaffPortalShared"

const SHOP_SELECT = `
  id,
  name,
  unique_id,
  owner_id,
  city_id,
  status,
  is_verified,
  is_open,
  phone,
  whatsapp,
  address,
  created_at,
  subscription_end_date,
  profiles ( full_name, phone ),
  cities ( name, state )
`

function sanitizeSearchTerm(value) {
  return String(value || "")
    .trim()
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80)
}

function buildShopPatchForm(shop) {
  return {
    name: shop?.name || "",
    phone: shop?.phone || "",
    whatsapp: shop?.whatsapp || "",
    reason: "",
  }
}

function shopCityLabel(shop) {
  const city = shop?.cities?.name || ""
  const state = shop?.cities?.state || ""
  return [city, state].filter(Boolean).join(", ") || `City ${shop?.city_id || "unknown"}`
}

function statusPillClass(status) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 ring-emerald-100"
  if (status === "rejected") return "bg-rose-50 text-rose-700 ring-rose-100"
  return "bg-amber-50 text-amber-700 ring-amber-100"
}

export default function StaffShopIdentity() {
  const location = useLocation()
  const { isSuperAdmin, fetchingStaff } = useStaffPortalSession()
  const { confirm, notify } = useGlobalFeedback()
  const prefetchedData =
    location.state?.prefetchedData?.kind === "staff-shop-identity"
      ? location.state.prefetchedData
      : null

  const [shops, setShops] = useState(() => prefetchedData?.shops || [])
  const [selectedShop, setSelectedShop] = useState(() => prefetchedData?.shops?.[0] || null)
  const [form, setForm] = useState(() => buildShopPatchForm(prefetchedData?.shops?.[0]))
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(() => !prefetchedData && !fetchingStaff)
  const [saving, setSaving] = useState(false)

  const loadShops = useCallback(async (queryText = "") => {
    if (!isSuperAdmin) {
      setShops([])
      setSelectedShop(null)
      setLoading(false)
      return
    }

    const searchTerm = sanitizeSearchTerm(queryText)
    setLoading(true)

    try {
      let query = supabase
        .from("shops")
        .select(SHOP_SELECT)
        .order("created_at", { ascending: false })
        .limit(60)

      if (searchTerm) {
        const filters = [
          `name.ilike.%${searchTerm}%`,
          `unique_id.ilike.%${searchTerm}%`,
          `phone.ilike.%${searchTerm}%`,
          `whatsapp.ilike.%${searchTerm}%`,
        ]

        if (/^\d+$/.test(searchTerm)) {
          filters.unshift(`id.eq.${Number(searchTerm)}`)
        }

        query = query.or(filters.join(","))
      }

      const { data, error } = await query
      if (error) throw error

      const nextShops = data || []
      setShops(nextShops)

      setSelectedShop((currentShop) => {
        const refreshedCurrentShop = currentShop
          ? nextShops.find((shop) => shop.id === currentShop.id)
          : null

        if (refreshedCurrentShop) {
          setForm(buildShopPatchForm(refreshedCurrentShop))
          return refreshedCurrentShop
        }

        const nextSelected = nextShops[0] || null
        setForm(buildShopPatchForm(nextSelected))
        return nextSelected
      })
    } catch (error) {
      notify({
        type: "error",
        title: "Could not load shops",
        message: getFriendlyErrorMessage(error, "Could not load shops for locked field updates."),
      })
    } finally {
      setLoading(false)
    }
  }, [isSuperAdmin, notify])

  useEffect(() => {
    if (!fetchingStaff && !prefetchedData) {
      void loadShops()
    }
  }, [fetchingStaff, loadShops, prefetchedData])

  const formErrors = useMemo(() => {
    const errors = {}
    const name = form.name.trim()
    const phone = normalizePhone(form.phone)
    const whatsapp = normalizePhone(form.whatsapp)

    if (name.length < 2) errors.name = "Business name must be at least 2 characters."
    if (!isValidNigerianPhone(phone)) errors.phone = "Enter a valid shop phone number."
    if (whatsapp && !isValidNigerianPhone(whatsapp)) {
      errors.whatsapp = "Enter a valid WhatsApp number or leave it empty."
    }
    if (form.reason.trim().length < 4) {
      errors.reason = "Add a short support reason for the audit trail."
    }

    return errors
  }, [form])

  const hasFormChanges = useMemo(() => {
    if (!selectedShop) return false
    return (
      form.name.trim() !== String(selectedShop.name || "").trim() ||
      normalizePhone(form.phone) !== normalizePhone(selectedShop.phone) ||
      normalizePhone(form.whatsapp) !== normalizePhone(selectedShop.whatsapp)
    )
  }, [form, selectedShop])

  const canSave =
    Boolean(selectedShop) &&
    hasFormChanges &&
    !saving &&
    Object.keys(formErrors).length === 0

  function selectShop(shop) {
    setSelectedShop(shop)
    setForm(buildShopPatchForm(shop))
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!selectedShop || !canSave) return

    const confirmed = await confirm({
      type: "error",
      title: "Update locked shop fields",
      message:
        `This will update locked customer-facing fields for "${selectedShop.name}".\n\n` +
        "Only continue if the merchant request has been verified.",
      confirmText: "Update shop",
      cancelText: "Cancel",
    })

    if (!confirmed) return

    setSaving(true)

    try {
      const { data, error } = await supabase.rpc("ctm_update_shop_locked_contact_fields", {
        p_shop_id: selectedShop.id,
        p_name: form.name.trim(),
        p_phone: normalizePhone(form.phone),
        p_whatsapp: normalizePhone(form.whatsapp) || null,
        p_reason: form.reason.trim(),
      })

      if (error) throw error

      const updatedShop = data?.shop
        ? {
            ...selectedShop,
            ...data.shop,
            profiles: selectedShop.profiles,
            cities: selectedShop.cities,
          }
        : {
            ...selectedShop,
            name: form.name.trim(),
            phone: normalizePhone(form.phone),
            whatsapp: normalizePhone(form.whatsapp) || null,
          }

      setSelectedShop(updatedShop)
      setShops((previous) =>
        previous.map((shop) => (shop.id === updatedShop.id ? updatedShop : shop))
      )
      setForm(buildShopPatchForm(updatedShop))

      notify({
        kind: "toast",
        type: "success",
        message: "Locked shop details updated successfully.",
      })
    } catch (error) {
      notify({
        type: "error",
        title: "Update failed",
        message: getFriendlyErrorMessage(error, "Could not update locked shop details."),
      })
    } finally {
      setSaving(false)
    }
  }

  if (!isSuperAdmin && !fetchingStaff) {
    return (
      <StaffPortalShell
        activeKey="shop-identity"
        title="Shop Identity Updates"
        description="Super-admin-only controls for locked shop identity and contact fields."
      >
        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl text-amber-600 shadow-sm">
            <FaLock />
          </div>
          <h3 className="text-xl font-black text-slate-900">Super admin required</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            Locked shop identity fields can only be changed by super admins after verifying a merchant request.
          </p>
        </div>
      </StaffPortalShell>
    )
  }

  return (
    <StaffPortalShell
      activeKey="shop-identity"
      title="Shop Identity Updates"
      description="Update approved shop business name, phone, and WhatsApp after verified merchant support requests."
      headerActions={[
        <QuickActionButton
          key="refresh"
          icon={<FaRotateRight className={loading ? "animate-spin" : ""} />}
          label="Refresh"
          tone="white"
          onClick={() => loadShops(searchQuery)}
        />,
      ]}
    >
      <SectionHeading
        eyebrow="Super admin"
        title="Locked merchant details"
        description="Use this only after confirming the merchant request. Every change is written through a super-admin-only RPC and recorded in the database audit table."
      />

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void loadShops(searchQuery)
        }}
        className="mb-6 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row"
      >
        <div className="relative flex-1">
          <FaMagnifyingGlass className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search shop name, CT ID, phone, WhatsApp, or numeric shop id"
            className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-pink-300 focus:bg-white"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#2E1065] px-5 text-sm font-black text-white transition hover:bg-[#4c1d95]"
        >
          <FaMagnifyingGlass />
          Search
        </button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(420px,1fr)]">
        <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-black text-slate-900">Shops</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
              {shops.length.toLocaleString()}
            </span>
          </div>

          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center text-slate-500">
              <FaCircleNotch className="mr-2 animate-spin" />
              Loading shops...
            </div>
          ) : shops.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <FaStore className="mx-auto mb-3 text-3xl text-slate-300" />
              <p className="text-sm font-bold text-slate-500">No matching shops found.</p>
            </div>
          ) : (
            <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
              {shops.map((shop) => (
                <button
                  key={shop.id}
                  type="button"
                  onClick={() => selectShop(shop)}
                  className={`w-full rounded-3xl border p-4 text-left transition ${
                    selectedShop?.id === shop.id
                      ? "border-pink-300 bg-pink-50/70 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-950">{shop.name}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {shop.unique_id || `Shop #${shop.id}`} - {shopCityLabel(shop)}
                      </div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ${statusPillClass(shop.status)}`}>
                      {shop.status || "pending"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-500 sm:grid-cols-2">
                    <span>Phone: {shop.phone || "Not provided"}</span>
                    <span>WhatsApp: {shop.whatsapp || "Not provided"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          {selectedShop ? (
            <>
              <div className="mb-5 rounded-3xl bg-slate-950 p-5 text-white">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-xl">
                      <FaShieldHalved />
                    </div>
                    <div>
                      <h3 className="text-xl font-black">{selectedShop.name}</h3>
                      <p className="text-xs font-semibold text-white/70">
                        {selectedShop.unique_id || `Shop #${selectedShop.id}`} - {shopCityLabel(selectedShop)}
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase">
                    Locked fields
                  </span>
                </div>
                <div className="grid gap-3 text-xs font-semibold text-white/70 sm:grid-cols-2">
                  <span>Owner: {selectedShop.profiles?.full_name || selectedShop.owner_id}</span>
                  <span>Created: {formatDateTime(selectedShop.created_at)}</span>
                  <span>Verified: {selectedShop.is_verified ? "Yes" : "No"}</span>
                  <span>Subscription: {formatDateTime(selectedShop.subscription_end_date)}</span>
                </div>
              </div>

              <form onSubmit={(event) => void handleSave(event)} className="space-y-5">
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    <FaStore className="text-pink-600" />
                    Business name
                  </label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-300 focus:bg-white"
                  />
                  {formErrors.name ? <p className="mt-1 text-xs font-bold text-rose-600">{formErrors.name}</p> : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      <FaPhone className="text-pink-600" />
                      Phone
                    </label>
                    <input
                      value={form.phone}
                      onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-300 focus:bg-white"
                    />
                    {formErrors.phone ? <p className="mt-1 text-xs font-bold text-rose-600">{formErrors.phone}</p> : null}
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      <FaAddressBook className="text-pink-600" />
                      WhatsApp
                    </label>
                    <input
                      value={form.whatsapp}
                      onChange={(event) => setForm((previous) => ({ ...previous, whatsapp: event.target.value }))}
                      className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-300 focus:bg-white"
                    />
                    {formErrors.whatsapp ? <p className="mt-1 text-xs font-bold text-rose-600">{formErrors.whatsapp}</p> : null}
                  </div>
                </div>

                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    <FaLock className="text-pink-600" />
                    Verified request reason
                  </label>
                  <textarea
                    value={form.reason}
                    onChange={(event) => setForm((previous) => ({ ...previous, reason: event.target.value }))}
                    placeholder="Example: Merchant verified by phone and requested WhatsApp number correction."
                    className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-pink-300 focus:bg-white"
                  />
                  {formErrors.reason ? <p className="mt-1 text-xs font-bold text-rose-600">{formErrors.reason}</p> : null}
                </div>

                <button
                  type="submit"
                  disabled={!canSave}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#DB2777] text-sm font-black text-white shadow-lg shadow-pink-600/20 transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
                >
                  {saving ? <FaCircleNotch className="animate-spin" /> : <FaShieldHalved />}
                  {saving ? "Updating locked details..." : "Update locked details"}
                </button>
              </form>
            </>
          ) : (
            <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <div>
                <FaStore className="mx-auto mb-3 text-4xl text-slate-300" />
                <h3 className="text-lg font-black text-slate-900">Select a shop</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Choose a shop from the list to update locked identity and contact fields.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </StaffPortalShell>
  )
}
