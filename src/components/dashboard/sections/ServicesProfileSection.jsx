import { useEffect } from "react"
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
  FaLayerGroup,
  FaLock,
  FaStore,
  FaTriangleExclamation,
} from "react-icons/fa6"
import AboutDashboardView from "../../../features/dashboard/views/AboutDashboardView";
import ServicesDashboardView from "../../../features/dashboard/views/ServicesDashboardView";
import CareersDashboardView from "../../../features/dashboard/views/CareersDashboardView";
import SupportDashboardView from "../../../features/dashboard/views/SupportDashboardView";
import AbuseReportDashboardView from "../../../features/dashboard/views/AbuseReportDashboardView";
import FaqDashboardView from "../../../features/dashboard/views/FaqDashboardView";
import WishlistDashboardView from "../../../features/dashboard/views/WishlistDashboardView";
import { UPLOAD_RULES, getAcceptValue, getRuleLabel } from "../../../lib/uploadRules";

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

function renderShopMetaIcon(status) {
  if (status === "locked") return <FaLock />
  if (status === "pending") return <FaCircleNotch className="animate-spin" />
  if (status === "rejected") return <FaCircleExclamation />
  return <FaStore />
}

function ServicesProfileSection({
  mode,
  serviceView,
  setServiceView,
  user,
  currentProfile,
  profileEditOpen,
  openProfileEdit,
  cancelProfileEdit,
  handleLogout,
  handleShopClick,
  shopCardMeta,
  wishlistCount,
  onNavigate,
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
        <WishlistDashboardView
          onBack={() => setServiceView("menu")}
          user={user}
          onOpenProduct={(productId) =>
            onNavigate(`/product-detail?id=${productId}`)
          }
        />
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
              onClick={() => setServiceView("wishlist")}
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
        {!profileEditOpen ? (
          <div className="mx-auto my-5 max-w-[600px] rounded-lg border border-[#D5D9D9] bg-white p-10 text-center">
            <img
              src={
                currentProfile?.avatar_url ||
                profileFallbackAvatar
              }
              alt="Avatar"
              className="mx-auto mb-4 h-[120px] w-[120px] rounded-full border-2 border-[#D5D9D9] object-cover"
              onError={(event) => {
                event.currentTarget.onerror = null
                event.currentTarget.src = profileFallbackAvatar
              }}
            />
            <h2 className="mb-2 text-[1.8rem] font-extrabold text-[#0F1111]">
              {currentProfile?.full_name || "Loading..."}
            </h2>
            <p className="mb-1 font-medium text-[#565959]">
              {currentProfile?.phone || "No phone number added"}
            </p>
            <p className="mb-6 text-[0.95rem] text-[#565959]">{user?.email}</p>

            <div className="flex justify-center gap-3">
              <button className="btn-brand" onClick={openProfileEdit}>
                Edit Profile
              </button>
              <button className="btn-brand-alt" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto my-5 max-w-[600px] rounded-lg border border-[#D5D9D9] bg-white p-[30px]">
            <h3 className="mb-6 text-[1.4rem] font-extrabold">Edit Profile</h3>

            <div className="mb-6 text-center">
              <div
                className="avatar-edit-box relative mx-auto h-[110px] w-[110px] cursor-pointer overflow-hidden rounded-full border-2 border-[#D5D9D9]"
                onClick={() => fileInputRef.current?.click()}
              >
                <img
                  src={avatarPreview}
                  alt="Avatar Preview"
                  className="h-full w-full object-cover"
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
            </div>

            <div className="form-group mb-4 text-left">
              <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                Full Name
              </label>
              <input
                className="form-input w-full rounded border border-[#888C8C] px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                value={profileEditForm.full_name}
                onChange={(e) =>
                  setProfileEditForm((prev) => ({
                    ...prev,
                    full_name: e.target.value,
                  }))
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
                  setProfileEditForm((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
              />
            </div>

            <div className="form-group mb-4 text-left">
              <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                City
              </label>
              <select
                className="form-input w-full rounded border border-[#888C8C] bg-white px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                value={profileEditForm.city_id}
                onChange={(e) => handleProfileCityChange(e.target.value)}
              >
                <option value="">Select City</option>
                {profileEditCities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group mb-6 text-left">
              <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
                Area
              </label>
              <select
                className="form-input w-full rounded border border-[#888C8C] bg-white px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)]"
                value={profileEditForm.area_id}
                onChange={(e) =>
                  setProfileEditForm((prev) => ({
                    ...prev,
                    area_id: e.target.value,
                  }))
                }
              >
                <option value="">Select Area</option>
                {profileEditAreas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>

            {profileEditError ? (
              <p className="mb-4 text-[0.9rem] text-[#C40000]">
                {profileEditError}
              </p>
            ) : null}

            <div className="flex gap-3">
              <button
                className="btn-brand flex-1"
                onClick={saveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? "Saving..." : "Save Changes"}
              </button>
              <button
                className="btn-brand-alt flex-1"
                onClick={cancelProfileEdit}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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

