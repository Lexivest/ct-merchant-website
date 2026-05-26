import { useEffect, useState } from "react"
import {
  FaBriefcase,
  FaBuilding,
  FaCamera,
  FaCircleExclamation,
  FaCircleNotch,
  FaCircleQuestion,
  FaCropSimple,
  FaHeadset,
  FaHeart,
  FaHourglassHalf,
  FaLayerGroup,
  FaLock,
  FaStore,
  FaTrash,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { Suspense, lazy } from "react"
import { supabase } from "../../../lib/supabase"
import { getFriendlyErrorMessage } from "../../../lib/friendlyErrors"
import { UPLOAD_RULES, getAcceptValue, getRuleLabel } from "../../../lib/uploadRules";
import { renderBrandedText } from "../../common/BrandText"
import AboutDashboardView from "../views/AboutDashboardView"
import ServicesDashboardView from "../views/ServicesDashboardView"
import CareersDashboardView from "../views/CareersDashboardView"
import SupportDashboardView from "../views/SupportDashboardView"
import AbuseReportDashboardView from "../views/AbuseReportDashboardView"
import FaqDashboardView from "../views/FaqDashboardView"

const WishlistDashboardView = lazy(() => import("../views/WishlistDashboardView"))

const AVATAR_RULE = UPLOAD_RULES.avatars
const AVATAR_ACCEPT = getAcceptValue(AVATAR_RULE, "image/jpeg,image/png")
const AVATAR_RULE_LABEL = getRuleLabel(AVATAR_RULE)

function ServiceCard({ icon, title, subtitle, onClick }) {
  return (
    <div className="svc-card rounded-[22px] bg-pink-200 p-1 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:bg-pink-300 hover:shadow-[0_8px_16px_rgba(219,39,119,0.15)]">
      <button
        type="button"
        className="flex h-full min-h-[128px] w-full flex-col items-center justify-center rounded-[18px] border border-pink-100 bg-white px-4 py-5 text-center"
        onClick={onClick}
      >
        <div className="svc-icon mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pink-50 text-[1.4rem] text-[#565959] shadow-[inset_0_0_0_1px_rgba(244,114,182,0.12)]">
          {icon}
        </div>
        <strong className="text-[0.95rem] font-extrabold text-[#0F1111]">{title}</strong>
        {subtitle ? (
          <div className="mt-1 text-[0.8rem] font-semibold text-[#565959]">{subtitle}</div>
        ) : null}
      </button>
    </div>
  )
}

function ServiceViewFallback({ label = "Loading..." }) {
  return (
    <div className="screen active">
      <div className="tool-block-wrap bg-white px-4 py-6">
        <div className="mx-auto max-w-[900px] animate-pulse">
          <div className="mb-2 h-4 w-28 rounded bg-slate-100" />
          <div className="mb-4 h-8 w-56 rounded bg-slate-200" />
          <div className="h-40 rounded-[24px] border border-slate-200 bg-slate-50" />
          <p className="mt-4 text-sm font-semibold text-slate-500">{renderBrandedText(label)}</p>
        </div>
      </div>
    </div>
  )
}

function LazyServiceView({ children, label }) {
  return <Suspense fallback={<ServiceViewFallback label={label} />}>{children}</Suspense>
}

function renderShopMetaIcon(status) {
  if (status === "locked") return <FaLock />
  if (status === "pending" || status === "kyc_pending") {
    return <FaHourglassHalf style={{ color: "#d97706" }} />
  }
  if (status === "rejected") return <FaCircleExclamation />
  return <FaStore />
}

function ServicesProfileSection({
  mode,
  serviceView,
  setServiceView,
  user,
  currentProfile,
  handleLogout,
  handleShopClick,
  shopCardMeta,
  wishlistCount,
  prefetchedWishlistItems,
  onOpenWishlist,
  onOpenProduct,
  profileEditForm,
  setProfileEditForm,
  profileEditCities,
  profileEditAreas,
  profileEditError,
  profileSaving,
  handleProfileCityChange,
  saveProfile,
  fileInputRef,
  avatarPreview,
  onAvatarSelect,
  cropModalOpen,
  cropImageRef,
  closeAvatarCropModal,
  applyAvatarCrop,
}) {
  const profileFallbackAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    currentProfile?.full_name || "User"
  )}`

  const [deleteZoneOpen, setDeleteZoneOpen]     = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting]                 = useState(false)
  const [deleteError, setDeleteError]           = useState("")

  function openDeleteZone() {
    setDeleteZoneOpen(true)
    setDeleteConfirmText("")
    setDeleteError("")
  }

  function closeDeleteZone() {
    setDeleteZoneOpen(false)
    setDeleteConfirmText("")
    setDeleteError("")
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "CTMerchant" || deleting) return
    setDeleting(true)
    setDeleteError("")

    try {
      const { error } = await supabase.rpc("ctm_delete_user_account")
      if (error) throw error
      // Auth session is now invalidated — sign out and redirect
      await handleLogout()
    } catch (err) {
      setDeleteError(getFriendlyErrorMessage(err, "Account deletion failed. Please try again."))
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (mode !== "services") return

    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }, [mode, serviceView])

  if (mode === "services") {
    if (serviceView === "about") {
      return <AboutDashboardView onBack={() => setServiceView("menu")} />
    }

    if (serviceView === "services-info") {
      return (
        <ServicesDashboardView
          onBack={() => setServiceView("menu")}
          onOpenSupport={() => setServiceView("support")}
        />
      )
    }

    if (serviceView === "careers") {
      return <CareersDashboardView onBack={() => setServiceView("menu")} />
    }

    if (serviceView === "support") {
      return (
        <SupportDashboardView
          mode="support"
          onBack={() => setServiceView("menu")}
          onOpenServices={() => setServiceView("services-info")}
        />
      )
    }

    if (serviceView === "faq") {
      return (
        <FaqDashboardView
          onBack={() => setServiceView("menu")}
          onOpenSupport={() => setServiceView("support")}
        />
      )
    }

    if (serviceView === "report-abuse") {
      return (
        <AbuseReportDashboardView
          onBack={() => setServiceView("menu")}
          user={user}
        />
      )
    }

    if (serviceView === "wishlist") {
      return (
        <LazyServiceView label="Loading wishlist...">
          <WishlistDashboardView
            onBack={() => setServiceView("menu")}
            user={user}
            prefetchedItems={prefetchedWishlistItems}
            onOpenProduct={onOpenProduct}
          />
        </LazyServiceView>
      )
    }

    return (
      <div className="screen active">
        <div className="tool-block-wrap bg-white px-4 py-6">
          <h2 className="sec-title mb-5 flex items-center gap-[10px] p-0 text-[1.35rem] font-extrabold text-[#0F1111]">
            Dashboard
          </h2>

          <div className="svc-grid grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            <ServiceCard
              icon={renderShopMetaIcon(shopCardMeta.status)}
              title={shopCardMeta.title}
              onClick={handleShopClick}
            />
            <ServiceCard
              icon={<FaHeart style={{ color: "#db2777" }} />}
              title="Wishlist"
              subtitle={`${wishlistCount || 0} items`}
              onClick={onOpenWishlist || (() => setServiceView("wishlist"))}
            />
            <ServiceCard
              icon={<FaHeadset style={{ color: "#007185" }} />}
              title="Support"
              onClick={() => setServiceView("support")}
            />
            <ServiceCard
              icon={<FaCircleQuestion style={{ color: "#007185" }} />}
              title="FAQ"
              onClick={() => setServiceView("faq")}
            />
            <ServiceCard
              icon={<FaTriangleExclamation style={{ color: "#C40000" }} />}
              title="Report Abuse"
              onClick={() => setServiceView("report-abuse")}
            />
            <ServiceCard
              icon={<FaBriefcase style={{ color: "#007185" }} />}
              title="Careers"
              onClick={() => setServiceView("careers")}
            />
            <ServiceCard
              icon={<FaBuilding style={{ color: "#007185" }} />}
              title="About Us"
              onClick={() => setServiceView("about")}
            />
            <ServiceCard
              icon={<FaLayerGroup style={{ color: "#007185" }} />}
              title="Our Services"
              onClick={() => setServiceView("services-info")}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="screen active">
        <div className="mx-auto my-5 max-w-[600px] space-y-4 px-4 pb-10">

          {/* ── Avatar + identity ── */}
          <div className="rounded-xl border border-[#D5D9D9] bg-white p-6 text-center">
            <div
              className="avatar-edit-box relative mx-auto h-[110px] w-[110px] cursor-pointer overflow-hidden rounded-full border-2 border-[#D5D9D9]"
              onClick={() => fileInputRef.current?.click()}
            >
              <img
                src={avatarPreview || currentProfile?.avatar_url || profileFallbackAvatar}
                alt="Avatar"
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.onerror = null
                  event.currentTarget.src = profileFallbackAvatar
                }}
              />
              <div className="avatar-overlay absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition hover:opacity-100">
                <FaCamera className="text-2xl" />
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept={AVATAR_ACCEPT}
              onChange={onAvatarSelect}
            />

            <p className="mt-2 text-[0.8rem] font-semibold text-[#565959]">
              {`Tap photo to update (${AVATAR_RULE_LABEL})`}
            </p>
            <p className="mt-1 text-[0.88rem] text-[#565959]">{user?.email}</p>
          </div>

          {/* ── Edit form ── */}
          <div className="rounded-xl border border-[#D5D9D9] bg-white p-6">
            <h3 className="mb-5 text-[1.2rem] font-extrabold text-[#0F1111]">Edit Profile</h3>

            <div className="form-group mb-4 text-left">
              <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                Full Name
              </label>
              <input
                className="form-input w-full rounded border border-[#888C8C] px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                value={profileEditForm.full_name}
                onChange={(e) =>
                  setProfileEditForm((prev) => ({ ...prev, full_name: e.target.value }))
                }
              />
            </div>

            <div className="form-group mb-4 text-left">
              <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                Phone Number
              </label>
              <input
                className="form-input w-full rounded border border-[#888C8C] px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                value={profileEditForm.phone}
                onChange={(e) =>
                  setProfileEditForm((prev) => ({ ...prev, phone: e.target.value }))
                }
              />
            </div>

            <div className="form-group mb-4 text-left">
              <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                City
              </label>
              <select
                disabled
                className="form-input w-full rounded border border-[#888C8C] bg-slate-100 px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)] cursor-not-allowed text-slate-400"
                value={profileEditForm.city_id}
                onChange={(e) => handleProfileCityChange(e.target.value)}
              >
                <option value="">Select City</option>
                {profileEditCities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-[0.78rem] font-semibold text-amber-600">
                City change is unavailable now.
              </p>
            </div>

            <div className="form-group mb-6 text-left">
              <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                Area
              </label>
              <select
                className="form-input w-full rounded border border-[#888C8C] bg-white px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                value={profileEditForm.area_id}
                onChange={(e) =>
                  setProfileEditForm((prev) => ({ ...prev, area_id: e.target.value }))
                }
              >
                <option value="">Select Area</option>
                {profileEditAreas.map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </div>

            {profileEditError ? (
              <p className="mb-4 text-[0.9rem] text-[#C40000]">{profileEditError}</p>
            ) : null}

            <div className="flex gap-3">
              <button
                className="btn-brand flex-1"
                onClick={saveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? "Saving..." : "Save Changes"}
              </button>
              <button className="btn-brand-alt flex-1" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </div>

          {/* ── Delete Account Zone ── */}
          <div className="rounded-xl border border-[#D5D9D9] bg-white px-6 py-5 text-center">
            {!deleteZoneOpen ? (
              <button
                type="button"
                onClick={openDeleteZone}
                className="mx-auto flex items-center gap-1.5 text-[0.82rem] font-semibold text-[#9CA3AF] transition hover:text-[#C40000]"
              >
                <FaTrash className="text-[0.7rem]" />
                Delete my account
              </button>
            ) : (
              <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-5 text-left">
                <h4 className="mb-2 flex items-center gap-2 text-[0.95rem] font-extrabold text-[#991B1B]">
                  <FaTriangleExclamation /> Permanently Delete Account
                </h4>
                <p className="mb-3 text-[0.82rem] leading-relaxed text-[#7F1D1D]">
                  This will permanently delete your account, all your shops, products, analytics, notifications, and every piece of associated data.
                  <strong> This cannot be undone.</strong>
                </p>
                <p className="mb-2 text-[0.82rem] font-bold text-[#991B1B]">
                  Type <span className="rounded bg-[#FEE2E2] px-1.5 py-0.5 font-mono font-extrabold">CTMerchant</span> to confirm:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="CTMerchant"
                  autoComplete="off"
                  className="mb-4 w-full rounded-lg border border-[#FECACA] bg-white px-3 py-2.5 text-sm font-semibold text-[#0F1111] placeholder:font-normal placeholder:text-[#9CA3AF] focus:border-[#EF4444] focus:outline-none focus:ring-2 focus:ring-[#EF4444]/20"
                />
                {deleteError && (
                  <p className="mb-3 text-[0.82rem] font-semibold text-[#C40000]">{deleteError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={closeDeleteZone}
                    disabled={deleting}
                    className="flex-1 rounded-lg border border-[#D5D9D9] bg-white px-4 py-2.5 text-[0.88rem] font-bold text-[#0F1111] transition hover:bg-[#F3F4F6] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteConfirmText !== "CTMerchant" || deleting}
                    onClick={handleDeleteAccount}
                    className="flex-1 rounded-lg bg-[#C40000] px-4 py-2.5 text-[0.88rem] font-bold text-white transition hover:bg-[#9B0000] disabled:cursor-not-allowed disabled:bg-[#E3E6E6] disabled:text-[#888C8C]"
                  >
                    {deleting
                      ? <span className="flex items-center justify-center gap-2"><FaCircleNotch className="animate-spin" /> Deleting...</span>
                      : "Delete Forever"}
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {cropModalOpen ? (
        <div className="crop-overlay active fixed inset-0 z-[5000] flex flex-col bg-[rgba(17,24,39,.95)] backdrop-blur-[5px]">
          <div className="crop-header-bar flex items-center justify-between bg-black/50 px-5 py-5 text-white">
            <div className="crop-title text-[1.2rem] font-bold">
              <FaCropSimple className="mr-2 inline" />
              Adjust Avatar (Optional)
            </div>
            <button
              type="button"
              onClick={closeAvatarCropModal}
              className="border-none bg-transparent text-[1.5rem] text-white"
            >
              x
            </button>
          </div>

          <div className="crop-workspace relative flex flex-1 items-center justify-center overflow-hidden p-5">
            <img
              ref={cropImageRef}
              src={avatarPreview}
              alt="Crop Avatar"
              className="block max-h-full max-w-full"
            />
          </div>

          <div className="crop-footer-bar flex justify-center gap-4 bg-black/50 p-5">
            <button className="btn-brand-alt" onClick={closeAvatarCropModal}>
              Use Without Crop
            </button>
            <button className="btn-brand" onClick={applyAvatarCrop}>
              Apply Crop
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ServicesProfileSection

