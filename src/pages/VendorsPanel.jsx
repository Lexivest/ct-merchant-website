import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
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
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { FaRegSquarePlus } from "react-icons/fa6"
import RetryingNotice, {
  getRetryingMessage,
} from "../components/common/RetryingNotice"
import PageTransitionOverlay from "../components/common/PageTransitionOverlay"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import useAuthSession from "../hooks/useAuthSession"
import useCachedFetch from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { supabase } from "../lib/supabase"
import { clearCachedFetchStore } from "../hooks/useCachedFetch"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"
import { prepareVendorRouteTransition } from "../lib/vendorRouteTransitions"

const loadVendorRoutes = {
  "/merchant-add-product": () => import("./vendors/AddProduct"),
  "/merchant-products": () => import("./vendors/MerchantProducts"),
  "/merchant-promo-banner": () => import("./vendors/MerchantPromoBanner"),
  "/merchant-settings": () => import("./vendors/MerchantSettings"),
  "/merchant-news": () => import("./vendors/MerchantNews"),
  "/merchant-video-kyc": () => import("./vendors/MerchantVideoKYC"),
  "/remita": () => import("./vendors/MerchantPayment"),
  "/service-fee": () => import("./vendors/MerchantServiceFee"),
  "/shop-registration": () => import("./ShopRegistration"),
}

function VendorsPanelShimmer() {
  return (
    <PageLoadingScreen
      title="Opening vendor tools"
      message="Please wait while we prepare your merchant workspace."
    />
  )
}

function VendorsPanel() {
  const navigate = useNavigate()
  const { notify } = useGlobalFeedback()

  usePreventPullToRefresh()

  const { user, loading: authLoading, isOffline } = useAuthSession()
  const [realtimeShop, setRealtimeShop] = useState(null)
  const retryRouteTransitionRef = useRef(null)
  const [routeTransition, setRouteTransition] = useState({
    pending: false,
    error: "",
  })

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
        // Invalidate global caches so updates reflect instantly in the marketplace
        clearCachedFetchStore((key) => 
          key.startsWith("dashboard_cache_") || key.startsWith("shop_detail_") || key.startsWith("dir_city_") || key.startsWith("search_city_")
        )
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
    return <RetryingNotice message={getRetryingMessage(error)} onRetry={mutate} />
  }

  if (!data?.shop) return null

  const activeShop = realtimeShop || data.shop
  const activeRejectedCount = data.rejectedProductCount

  const hasPaidFee = data.hasPaidFee
  const isVerified =
    activeShop.is_verified || activeShop.kyc_status === "approved"
  const isSuspended = activeShop.is_open === false
  const isSubscriptionActive = activeShop.is_subscription_active === true

  function beginRouteTransition(retryAction = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: true,
      error: "",
    })
  }

  function failRouteTransition(message, retryAction = null) {
    retryRouteTransitionRef.current = retryAction
    setRouteTransition({
      pending: false,
      error: message,
    })
  }

  async function openVendorRouteWithTransition(path) {
    if (!path) return

    const retryAction = () => openVendorRouteWithTransition(path)
    beginRouteTransition(retryAction)

    try {
      if (path.startsWith("/shop-detail")) {
        await prepareShopDetailTransition({
          shopId: activeShop.id,
          userId: user?.id || null,
        })
      } else {
        const [pathname] = path.split("?")
        const prefetchedData = await prepareVendorRouteTransition({
          path,
          userId: user?.id || null,
          shopId: activeShop.id,
        })

        if (!prefetchedData) {
          const loader = loadVendorRoutes[pathname]
          if (loader) {
            await loader()
          }
        }

        setRouteTransition({ pending: false, error: "" })
        navigate(path, {
          state: {
            fromVendorTransition: true,
            prefetchedData,
            verifiedSubscriptionActive: isSubscriptionActive,
          },
        })
        return
      }

      setRouteTransition({ pending: false, error: "" })
      navigate(path, {
        state: {
          fromVendorTransition: true,
          verifiedSubscriptionActive: isSubscriptionActive,
        },
      })
    } catch (error) {
      setRouteTransition({ pending: false, error: "" })
      notify({
        type: "error",
        title: "Access denied",
        message: getFriendlyErrorMessage(error, "We could not open that merchant tool right now. Please try again."),
      })
    }
  }

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
    } else if (path) {
      void openVendorRouteWithTransition(path)
    }
  }

  const showSubscriptionRequired = (message) => {
    notify({
      type: "error",
      title: "Subscription required",
      message,
    })
  }

  if (routeTransition.error) {
    throw new Error("RAW VENDORS PANEL ERROR: " + routeTransition.error)
  }

  return (
    <div
      className={`flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111] ${
        routeTransition.pending ? "pointer-events-none select-none" : ""
      }`}
    >
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

      <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 pb-8 pt-3">
        <div className="mb-4">
          <div className="inline-flex max-w-full rounded-full bg-pink-100 px-3 py-1.5 text-[0.9rem] font-extrabold leading-snug text-pink-700 ring-1 ring-pink-200">
            <span className="min-w-0 whitespace-normal break-words">
              Manage {activeShop.name}
            </span>
          </div>

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
            isLocked={!isSubscriptionActive}
            onClick={
              isSubscriptionActive
                ? () => handleCardClick(`/merchant-banner?shop_id=${activeShop.id}`)
                : () =>
                    showSubscriptionRequired(
                      "Please activate your service fee subscription to update your shop banner."
                    )
            }
          />

          <DashCard
            title="Shop Settings"
            icon={<FaGear />}
            colorClass="bg-[#FFEDD5] text-[#EA580C]"
            isLocked={!isSubscriptionActive}
            onClick={
              isSubscriptionActive
                ? () => handleCardClick(`/merchant-settings?shop_id=${activeShop.id}`)
                : () =>
                    showSubscriptionRequired(
                      "Please activate your service fee subscription to update shop settings."
                    )
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
            title="Promo Banner"
            subtitle="Custom Ad Studio"
            icon={<FaWandMagicSparkles />}
            colorClass="bg-[#FDF2F8] text-[#db2777]"
            isLocked={!isSubscriptionActive || !isVerified}
            onClick={
              !isSubscriptionActive
                ? () =>
                    notify({
                      type: "error",
                      title: "Subscription required",
                      message:
                        "Please activate your service fee subscription to access the promo banner studio.",
                    })
                : !isVerified
                ? () =>
                    notify({
                      type: "error",
                      title: "Verification required",
                      message:
                        "Your shop must be physically verified before you can generate a promo banner.",
                    })
                : () =>
                    handleCardClick(
                      `/merchant-promo-banner?shop_id=${activeShop.id}`,
                    )
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
              title="Verification Fee"
              subtitle="Physical Check"
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
