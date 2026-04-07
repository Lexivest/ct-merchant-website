import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaAddressCard,
  FaArrowLeft,
  FaBuildingCircleCheck,
  FaBullhorn,
  FaCamera,
  FaChartLine,
  FaCheckDouble,
  FaEye,
  FaFileInvoiceDollar,
  FaGear,
  FaHourglassHalf,
  FaImage,
  FaLock,
  FaPenToSquare,
  FaStoreSlash,
  FaTriangleExclamation,
  FaVideo,
  FaVideoSlash,
} from "react-icons/fa6"
import { FaRegSquarePlus } from "react-icons/fa6"
import RetryingNotice, {
  getRetryingMessage,
} from "../components/common/RetryingNotice"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { ShimmerBlock } from "../components/common/Shimmers"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { supabase } from "../lib/supabase"

function VendorsPanelShimmer() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[1000px] items-center gap-4 px-4 py-3 text-white">
          <div className="p-1 text-[1.2rem] opacity-50">
            <FaArrowLeft />
          </div>
          <div className="text-[1.15rem] font-bold tracking-[0.5px] opacity-50">
            Merchant Dashboard
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 py-8">
        <div className="mb-8">
          <ShimmerBlock className="mb-3 h-8 w-64 rounded-md" />
          <ShimmerBlock className="h-5 w-48 rounded-md" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-[22px] bg-pink-100 p-1">
              <div className="flex h-full min-h-[125px] flex-col items-center justify-center rounded-[18px] border border-pink-50 bg-white p-4 sm:min-h-[140px]">
                <ShimmerBlock className="mb-3 h-10 w-10 rounded-full sm:h-12 sm:w-12" />
                <ShimmerBlock className="h-4 w-24 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

function VendorsPanel() {
  const navigate = useNavigate()
  const { notify } = useGlobalFeedback()

  usePreventPullToRefresh()

  const { user, loading: authLoading, isOffline } = useAuthSession()
  const [realtimeShop, setRealtimeShop] = useState(null)
  const [realtimeRejectedCount, setRealtimeRejectedCount] = useState(null)

  const fetchMerchantData = async () => {
    if (!user) throw new Error("Authentication required")

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_suspended")
      .eq("id", user.id)
      .maybeSingle()

    if (profileErr) throw profileErr
    if (profile?.is_suspended) {
      throw new Error(
        "Your account access has been restricted by administration.",
      )
    }

    const { data: shopData, error: shopErr } = await supabase
      .from("shops")
      .select("*, is_subscription_active")
      .eq("owner_id", user.id)
      .maybeSingle()

    if (shopErr) throw shopErr
    if (!shopData) {
      throw new Error("SHOP_NOT_FOUND")
    }

    if (shopData.status === "rejected" && shopData.kyc_status !== "rejected") {
      throw new Error(
        "Your shop application was rejected. Please contact support.",
      )
    }

    const { count, error: rejectErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopData.id)
      .eq("is_approved", false)
      .not("rejection_reason", "is", null)

    const rejectedCount = !rejectErr && count ? count : 0

    const { data: paymentRecord } = await supabase
      .from("physical_verification_payments")
      .select("id")
      .eq("merchant_id", user.id)
      .eq("status", "success")
      .maybeSingle()

    return {
      shop: shopData,
      rejectedProductCount: rejectedCount,
      hasPaidFee: Boolean(paymentRecord),
    }
  }

  const { data, loading, error, mutate } = useCachedFetch(
    `vendor_panel_${user?.id}`,
    fetchMerchantData,
    { dependencies: [user?.id], ttl: 1000 * 60 * 5 },
  )

  useEffect(() => {
    if (!user || !data?.shop?.id || isOffline) return

    const shopId = data.shop.id

    const shopChannel = supabase
      .channel(`public:shops:id=eq.${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "shops",
          filter: `id=eq.${shopId}`,
        },
        (payload) => {
          setRealtimeShop(payload.new)
        },
      )
      .subscribe()

    const productChannel = supabase
      .channel(`public:products:shop_id=eq.${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "products",
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          mutate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(shopChannel)
      supabase.removeChannel(productChannel)
    }
  }, [user, data?.shop?.id, isOffline, mutate])

  useEffect(() => {
    if (error === "SHOP_NOT_FOUND") {
      navigate("/shop-registration", { replace: true })
    }
  }, [error, navigate])

  if (authLoading || (loading && !data)) {
    return <VendorsPanelShimmer />
  }

  if (error && error !== "SHOP_NOT_FOUND" && !data) {
    return <RetryingNotice message={getRetryingMessage(error)} />
  }

  if (!data?.shop) return null

  const activeShop = realtimeShop || data.shop
  const activeRejectedCount =
    realtimeRejectedCount !== null
      ? realtimeRejectedCount
      : data.rejectedProductCount

  const hasPaidFee = data.hasPaidFee
  const isVerified =
    activeShop.is_verified || activeShop.kyc_status === "approved"
  const isSuspended = activeShop.is_open === false
  const isSubscriptionActive = activeShop.is_subscription_active === true

  const handleCardClick = (path, action) => {
    if (isOffline) {
      notify({
        type: "error",
        title: "Network unavailable",
        message:
          "You must be connected to the internet to perform this action.",
      })
      return
    }

    if (action) {
      action()
    } else {
      navigate(path)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      <header className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
        <div className="mx-auto flex w-full max-w-[1000px] items-center gap-4 px-4 py-3 text-white">
          <button
            onClick={() => navigate("/user-dashboard")}
            className="ml-[-4px] p-1 text-[1.2rem] transition hover:text-pink-500"
          >
            <FaArrowLeft />
          </button>
          <div className="truncate text-[1.15rem] font-bold tracking-[0.5px]">
            Merchant Dashboard
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 py-8">
        <div className="mb-8">
          <h1 className="mb-1 text-[1.8rem] font-extrabold leading-[1.2] text-[#0F1111]">
            Manage {activeShop.name}
          </h1>
          <p className="text-[0.95rem] font-medium text-[#565959]">
            Control your inventory and shop presence.
          </p>

          {activeShop.status === "pending" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FDE68A] border-l-4 border-l-[#D97706] bg-[#FEF3C7] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#92400E]">
              <FaTriangleExclamation className="shrink-0 text-[1.2rem]" />
              <span>Your shop application is pending digital approval.</span>
            </div>
          )}

          {activeShop.kyc_status === "rejected" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FECACA] border-l-4 border-l-[#DC2626] bg-[#FEE2E2] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#991B1B]">
              <FaVideoSlash className="shrink-0 text-[1.2rem]" />
              <span>
                KYC REJECTED:{" "}
                {activeShop.rejection_reason ||
                  "Your video did not meet our standards."}{" "}
                Please click the red "Record Video" card below to try again.
              </span>
            </div>
          )}

          {isSuspended && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FECACA] border-l-4 border-l-[#DC2626] bg-[#FEE2E2] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#991B1B]">
              <FaLock className="shrink-0 text-[1.2rem]" />
              <span>
                Your shop has been locked by administration. It is no longer
                visible to the public. Please contact support.
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-5">
          <DashCard
            title="Add Product"
            icon={<FaRegSquarePlus />}
            colorClass="bg-[#DCFCE7] text-[#16A34A]"
            isLocked={!isSubscriptionActive}
            onClick={
              isSubscriptionActive
                ? () =>
                    handleCardClick(
                      `/merchant-add-product?shop_id=${activeShop.id}`,
                    )
                : () =>
                    notify({
                      type: "error",
                      title: "Subscription required",
                      message:
                        "Please activate your service fee subscription to add new products.",
                    })
            }
          />

          <DashCard
            title="Edit Products"
            icon={<FaPenToSquare />}
            colorClass="bg-[#DBEAFE] text-[#2563EB]"
            badge={activeRejectedCount}
            isLocked={!isSubscriptionActive}
            onClick={
              isSubscriptionActive
                ? () =>
                    handleCardClick(`/merchant-products?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: "Subscription required",
                      message:
                        "Please activate your service fee subscription to edit products.",
                    })
            }
          />

          <DashCard
            title="Shop Banner"
            icon={<FaCamera />}
            colorClass="bg-[#F3E8FF] text-[#9333EA]"
            onClick={() =>
              handleCardClick(`/merchant-banner?shop_id=${activeShop.id}`)
            }
          />

          <DashCard
            title="Shop Settings"
            icon={<FaGear />}
            colorClass="bg-[#FFEDD5] text-[#EA580C]"
            onClick={() =>
              handleCardClick(`/merchant-settings?shop_id=${activeShop.id}`)
            }
          />

          <DashCard
            title="Post News"
            icon={<FaBullhorn />}
            colorClass="bg-[#FEE2E2] text-[#DC2626]"
            onClick={() =>
              handleCardClick(`/merchant-news?shop_id=${activeShop.id}`)
            }
          />

          {isSuspended ? (
            <DashCard
              title="View Shop"
              subtitle="Suspended"
              icon={<FaStoreSlash />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "error",
                  title: "Shop restricted",
                  message:
                    "Your shop access has been restricted by administration.",
                })
              }
            />
          ) : (
            <DashCard
              title="View Shop"
              icon={<FaEye />}
              colorClass="bg-[#E0E7FF] text-[#4F46E5]"
              onClick={() => handleCardClick(`/shop-detail?id=${activeShop.id}`)}
            />
          )}

          <DashCard
            title="Official ID Card"
            subtitle="Issued by Staff"
            icon={<FaAddressCard />}
            colorClass="bg-[#FAE8FF] text-[#C026D3]"
            onClick={() =>
              notify({
                type: "info",
                title: "Official ID card",
                message:
                  "Your official CTMerchant ID card is issued by the approval team directly to your registered WhatsApp or email after physical approval. Please check your inbox or contact support if you have not received it.",
              })
            }
          />

          <DashCard
            title="Promo Banner"
            subtitle="Print & Broadcast"
            icon={<FaImage />}
            colorClass="bg-[#D1FAE5] text-[#059669]"
            isLocked={!isSubscriptionActive}
            onClick={
              isSubscriptionActive
                ? () =>
                    handleCardClick(
                      `/merchant-promo-banner?shop_id=${activeShop.id}`,
                    )
                : () =>
                    notify({
                      type: "error",
                      title: "Subscription required",
                      message:
                        "Please activate your service fee subscription to access promo banners.",
                    })
            }
          />

          <DashCard
            title="Analytics"
            icon={<FaChartLine />}
            colorClass="bg-[#CCFBF1] text-[#0D9488]"
            isLocked={!isSubscriptionActive}
            onClick={
              isSubscriptionActive
                ? () =>
                    handleCardClick(`/merchant-analytics?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: "Subscription required",
                      message:
                        "Please activate your service fee subscription to access analytics.",
                    })
            }
          />

          {isVerified ? (
            <DashCard
              title="Approved Shop"
              subtitle="Active"
              icon={<FaCheckDouble />}
              colorClass="bg-[#DCFCE7] text-[#16A34A]"
              onClick={() =>
                handleCardClick(null, () =>
                  notify({
                    type: "success",
                    title: "Shop approved",
                    message: "Your shop has completed physical approval.",
                  }),
                )
              }
            />
          ) : hasPaidFee ? (
            activeShop.kyc_status === "submitted" ? (
              <DashCard
                title="KYC Pending"
                subtitle="Under Review"
                icon={<FaHourglassHalf />}
                isLocked={true}
                onClick={() =>
                  notify({
                    type: "info",
                    title: "KYC in review",
                    message:
                      "We are currently reviewing your video KYC. We will notify you once approved.",
                  })
                }
              />
            ) : activeShop.kyc_status === "rejected" ? (
              <DashCard
                title="Re-record Video"
                subtitle="Action Required"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                onClick={() =>
                  handleCardClick(`/merchant-video-kyc?shop_id=${activeShop.id}`)
                }
              />
            ) : (
              <DashCard
                title="Record KYC Video"
                subtitle="Action Required"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                onClick={() =>
                  handleCardClick(`/merchant-video-kyc?shop_id=${activeShop.id}`)
                }
              />
            )
          ) : (
            <DashCard
              title="Digital ID & KYC"
              icon={<FaBuildingCircleCheck />}
              colorClass="bg-[#FEF3C7] text-[#D97706]"
              onClick={() => handleCardClick(`/remita?shop_id=${activeShop.id}`)}
            />
          )}

          {isVerified ? (
            <DashCard
              title="Service Fee"
              icon={<FaFileInvoiceDollar />}
              colorClass="bg-pink-100 text-pink-600"
              onClick={() =>
                handleCardClick(`/service-fee?shop_id=${activeShop.id}`)
              }
            />
          ) : (
            <DashCard
              title="Service Fee"
              subtitle="Approval Req."
              icon={<FaLock />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "error",
                  title: "Approval required",
                  message:
                    "You cannot subscribe to a service plan until your shop passes KYC approval.",
                })
              }
            />
          )}
        </div>
      </main>
    </div>
  )
}

function DashCard({ title, subtitle, icon, colorClass, badge, isLocked, onClick }) {
  if (isLocked) {
    return (
      <div
        onClick={onClick}
        className="cursor-not-allowed rounded-[22px] bg-slate-200 p-1 transition-all"
      >
        <div className="relative flex h-full min-h-[125px] flex-col items-center justify-center rounded-[18px] border border-slate-200 bg-[#F7F7F7] p-4 text-center text-[#565959] sm:min-h-[140px]">
          <div className="mb-3 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#E2E8F0] text-[1.2rem] text-[#888C8C] sm:h-[50px] sm:w-[50px] sm:text-[1.4rem]">
            {icon}
          </div>
          <div className="text-[0.85rem] font-extrabold sm:text-[0.95rem]">
            {title}
          </div>
          {subtitle && (
            <div className="mt-1 text-[0.7rem] font-semibold sm:text-[0.75rem]">
              {subtitle}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-[22px] bg-pink-200 p-1 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:bg-pink-300 hover:shadow-[0_8px_16px_rgba(219,39,119,0.15)]"
    >
      <div className="relative flex h-full min-h-[125px] flex-col items-center justify-center rounded-[18px] border border-pink-100 bg-white p-4 text-center sm:min-h-[140px]">
        {badge > 0 && (
          <div className="absolute right-3 top-3 flex h-6 min-w-[24px] animate-[popIn_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards] items-center justify-center rounded-full border-2 border-white bg-[#DC2626] px-1.5 text-[0.75rem] font-extrabold text-white shadow-[0_2px_6px_rgba(220,38,38,0.5)]">
            {badge}
          </div>
        )}

        <div
          className={`mb-3 flex h-[42px] w-[42px] items-center justify-center rounded-full text-[1.2rem] sm:h-[50px] sm:w-[50px] sm:text-[1.4rem] ${colorClass}`}
        >
          {icon}
        </div>

        <div className="text-[0.85rem] font-extrabold text-[#0F1111] sm:text-[0.95rem]">
          {title}
        </div>

        {subtitle && (
          <div className="mt-1 text-[0.7rem] font-semibold text-[#565959] sm:text-[0.75rem]">
            {subtitle}
          </div>
        )}

        <style
          dangerouslySetInnerHTML={{
            __html:
              "@keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }",
          }}
        />
      </div>
    </div>
  )
}

export default VendorsPanel
