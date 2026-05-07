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
import useCachedFetch, {
  clearCachedFetchStore,
  primeCachedFetchStore,
} from "../hooks/useCachedFetch"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import { supabase } from "../lib/supabase"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import { prepareShopDetailTransition } from "../lib/detailPageTransitions"
import { fetchLatestPaymentProof, fetchVerificationAccessStatus } from "../lib/offlinePayments"
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
  "/service-provider": () => import("./ServiceProvider"),
}

function isFutureDate(value) {
  if (!value) return false
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

function formatSubscriptionLabel(value) {
  const rawValue = String(value || "").trim()
  if (!rawValue) return "Active Plan"
  if (rawValue === "Free Trial") return "Free Trial"
  return rawValue.replace(/_/g, " ")
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
  const [verificationAccessOverride, setVerificationAccessOverride] = useState(null)
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
      .select("*, subscription_end_date")
      .eq("owner_id", user.id)
      .maybeSingle()

    if (shopErr) throw shopErr
    if (!shopData) {
      throw new Error("SHOP_NOT_FOUND")
    }

    if (shopData.status === "rejected" && shopData.kyc_status !== "rejected") {
      const rejectedEntity = shopData.is_service ? "service" : "shop"
      throw new Error(
        `Your ${rejectedEntity} application was rejected. Please contact support.`,
      )
    }

    const { count, error: rejectErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopData.id)
      .eq("is_approved", false)
      .not("rejection_reason", "is", null)

    const rejectedCount = !rejectErr && count ? count : 0

    const [verificationAccess, latestServiceFeeProof] = await Promise.all([
      fetchVerificationAccessStatus({
        userId: user.id,
        shopId: shopData.id,
        shopCreatedAt: shopData.created_at,
      }),
      fetchLatestPaymentProof({
        userId: user.id,
        shopId: shopData.id,
        paymentKind: "service_fee",
        shopCreatedAt: shopData.created_at,
      }),
    ])

    return {
      shop: shopData,
      rejectedProductCount: rejectedCount,
      hasVerificationAccess: verificationAccess.hasVerificationAccess,
      verificationProofStatus: verificationAccess.verificationProofStatus,
      paymentConfirmed: verificationAccess.paymentConfirmed,
      serviceFeeProofStatus: latestServiceFeeProof?.status || null,
      serviceFeeProofPlan: latestServiceFeeProof?.plan || null,
    }
  }

  const { data, loading, error, mutate } = useCachedFetch(
    `vendor_panel_${user?.id}`,
    fetchMerchantData,
    { dependencies: [user?.id], ttl: 1000 * 60 * 5 },
  )

  useEffect(() => {
    setVerificationAccessOverride(
      data
        ? {
            hasVerificationAccess: Boolean(data.hasVerificationAccess),
            verificationProofStatus: data.verificationProofStatus || null,
            paymentConfirmed: Boolean(data.paymentConfirmed),
          }
        : null,
    )
  }, [data])

  useEffect(() => {
    if (!data?.shop?.id) return

    const missingConfirmedFlag =
      !Object.prototype.hasOwnProperty.call(data, "paymentConfirmed")
    const needsVerificationRefresh =
      missingConfirmedFlag &&
      (data.verificationProofStatus === "approved" ||
        data.hasVerificationAccess === true)

    if (needsVerificationRefresh) {
      mutate()
    }
  }, [
    data,
    data?.hasVerificationAccess,
    data?.shop?.id,
    data?.verificationProofStatus,
    mutate,
  ])

  useEffect(() => {
    if (!user || !data?.shop?.id || isOffline) return

    const shopId = data.shop.id
    const vendorPanelCacheKey = `vendor_panel_${user.id}`

    const shopChannel = supabase
      .channel(`public:shops:id=eq.${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shops",
          filter: `id=eq.${shopId}`,
        },
        (payload) => {
          const nextShop = payload.new || null
          setRealtimeShop(nextShop)
          if (nextShop) {
            primeCachedFetchStore(vendorPanelCacheKey, {
              ...data,
              shop: {
                ...(data?.shop || {}),
                ...nextShop,
              },
            })
          }
          mutate()
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
          clearCachedFetchStore(
            (key) =>
              key.startsWith("dashboard_cache_") ||
              key.startsWith("shop_detail_") ||
              key.startsWith("shop_detail_v2_") ||
              key.startsWith("dir_city_") ||
              key.startsWith("search_city_") ||
              key.startsWith("merchant_products_") ||
              key.startsWith("vendor_panel_"),
          )
          mutate()
        },
      )
      .subscribe()

    const paymentChannel = supabase
      .channel(`public:physical_verification_payments:merchant_id=eq.${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "physical_verification_payments",
          filter: `merchant_id=eq.${user.id}`,
        },
        () => {
          mutate()
        },
      )
      .subscribe()

    const verificationProofChannel = supabase
      .channel(`public:offline_payment_proofs:merchant_id=eq.${user.id}:vendor-panel`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offline_payment_proofs",
          filter: `merchant_id=eq.${user.id}`,
        },
        () => {
          mutate()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(shopChannel)
      supabase.removeChannel(productChannel)
      supabase.removeChannel(paymentChannel)
      supabase.removeChannel(verificationProofChannel)
    }
  }, [user, data, data?.shop?.id, isOffline, mutate])

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

  const isServiceMode = activeShop.is_service === true
  const entityName = isServiceMode ? "service" : "shop"
  const entityTitle = isServiceMode ? "Service" : "Shop"
  const itemNamePlural = isServiceMode ? "services" : "products"
  const itemTitle = isServiceMode ? "Service" : "Product"
  const dashboardTitle = isServiceMode ? "Service Dashboard" : "Merchant Dashboard"
  const viewRoute = isServiceMode
    ? `/service-provider?id=${activeShop.id}&service=${encodeURIComponent(activeShop.category || "")}`
    : `/shop-detail?id=${activeShop.id}`

  const isApplicationApproved = activeShop.status === "approved"
  const isVerified = Boolean(activeShop.is_verified)
  const verificationProofStatus =
    verificationAccessOverride?.verificationProofStatus ?? data.verificationProofStatus ?? null
  const isSuspended = activeShop.is_open === false
  const isSubscriptionActive = isFutureDate(activeShop.subscription_end_date)
  const serviceFeeProofStatus = data.serviceFeeProofStatus ?? null
  const currentSubscriptionLabel = formatSubscriptionLabel(activeShop.subscription_plan)
  const verificationPaymentConfirmed = Boolean(
    verificationAccessOverride?.paymentConfirmed ??
      data.paymentConfirmed ??
      verificationProofStatus === "approved",
  )
  const canOpenKycVideo =
    verificationPaymentConfirmed ||
    activeShop.kyc_status === "submitted" ||
    activeShop.kyc_status === "rejected" ||
    isVerified

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

  async function handleVerificationGateway() {
    if (!user?.id || !activeShop?.id) return

    if (isOffline) {
      failRouteTransition("Network unavailable. Retry.", () =>
        handleVerificationGateway(),
      )
      return
    }

    const retryAction = () => handleVerificationGateway()
    beginRouteTransition(retryAction)

    try {
      const { data: latestShop, error: latestShopError } = await supabase
        .from("shops")
        .select("id, owner_id, created_at, status, is_verified, kyc_status, rejection_reason, subscription_end_date, is_open, name, is_service, category")
        .eq("id", activeShop.id)
        .eq("owner_id", user.id)
        .maybeSingle()

      if (latestShopError || !latestShop) {
        throw latestShopError || new Error("Shop not found or access denied.")
      }

      const latestVerificationAccess = await fetchVerificationAccessStatus({
        userId: user.id,
        shopId: latestShop.id,
        shopCreatedAt: latestShop.created_at,
      })

      setRealtimeShop((current) => ({
        ...(current || {}),
        ...latestShop,
      }))
      setVerificationAccessOverride({
        hasVerificationAccess: latestVerificationAccess.hasVerificationAccess,
        verificationProofStatus: latestVerificationAccess.verificationProofStatus || null,
        paymentConfirmed: latestVerificationAccess.paymentConfirmed,
      })

      primeCachedFetchStore(`vendor_panel_${user.id}`, {
        ...(data || {}),
        shop: {
          ...(data?.shop || {}),
          ...latestShop,
        },
        hasVerificationAccess: latestVerificationAccess.hasVerificationAccess,
        verificationProofStatus:
          latestVerificationAccess.verificationProofStatus || null,
        paymentConfirmed: latestVerificationAccess.paymentConfirmed,
      })

      if (latestShop.status !== "approved") {
        setRouteTransition({ pending: false, error: "" })
        notify({
          kind: "toast",
          type: "info",
          title: "Application pending",
          message:
            `Your ${entityName} must be digitally approved before you can continue to physical verification.`,
        })
        return
      }

      if (latestShop.is_verified || latestShop.kyc_status === "submitted") {
        setRouteTransition({ pending: false, error: "" })
        notify({
          kind: "toast",
          type: "info",
          title: "KYC in review",
          message:
            "Your video KYC is already under review. We will notify you once approved.",
        })
        return
      }

      if (latestVerificationAccess.verificationProofStatus === "pending") {
        setRouteTransition({ pending: false, error: "" })
        notify({
          kind: "toast",
          type: "info",
          title: "Receipt under review",
          message:
            "Your verification receipt has been submitted and is waiting for staff confirmation.",
        })
        return
      }

      const targetPath =
        latestVerificationAccess.paymentConfirmed ||
        latestShop.kyc_status === "rejected"
          ? `/merchant-video-kyc?shop_id=${latestShop.id}`
          : `/remita?shop_id=${latestShop.id}`

      const [pathname] = targetPath.split("?")
      const prefetchedData = await prepareVendorRouteTransition({
        path: targetPath,
        userId: user.id,
        shopId: latestShop.id,
      })

      if (!prefetchedData) {
        const loader = loadVendorRoutes[pathname]
        if (loader) {
          await loader()
        }
      }

      setRouteTransition({ pending: false, error: "" })
      navigate(targetPath, {
        state: {
          fromVendorTransition: true,
          prefetchedData,
          verifiedSubscriptionActive: isFutureDate(
            latestShop.subscription_end_date,
          ),
        },
      })
    } catch (error) {
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open that verification step right now. Please try again.",
        ),
        retryAction,
      )
    }
  }

  async function openVendorRouteWithTransition(path) {
    if (!path) return

    const retryAction = () => openVendorRouteWithTransition(path)
    beginRouteTransition(retryAction)

    try {
      if (path.startsWith("/service-provider")) {
        const [pathname] = path.split("?")
        const loader = loadVendorRoutes[pathname]
        if (loader) {
          await loader()
        }
      } else if (path.startsWith("/shop-detail")) {
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
      failRouteTransition(
        getFriendlyErrorMessage(
          error,
          "We could not open that merchant tool right now. Please try again.",
        ),
        retryAction,
      )
    }
  }

  const handleCardClick = (path, action) => {
    if (isOffline) {
      if (path) {
        failRouteTransition("Network unavailable. Retry.", () =>
          openVendorRouteWithTransition(path),
        )
        return
      }

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

  return (
    <>
      <PageTransitionOverlay
        visible={routeTransition.pending}
        error={routeTransition.error}
        onRetry={() => {
          if (typeof retryRouteTransitionRef.current === "function") {
            retryRouteTransitionRef.current()
          }
        }}
        onDismiss={() => setRouteTransition({ pending: false, error: "" })}
      />
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
            {dashboardTitle}
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
              <span>Your {entityName} application is pending digital approval.</span>
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
                Your {entityName} has been locked by administration. It is no longer
                visible to the public. Please contact support.
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-5">
          {!isApplicationApproved ? (
            <DashCard
              title="Application Pending"
              subtitle="Staff Review"
              icon={<FaHourglassHalf />}
              isLocked={true}
              featured
              onClick={() =>
                notify({
                  type: "info",
                  title: "Application under review",
                  message:
                    `Your ${entityName} application is waiting for digital approval from CTMerchant staff.`,
                })
              }
            />
          ) : isVerified ? (
            <DashCard
              title={`Verified ${entityTitle}`}
              subtitle="Verification Complete"
              icon={<FaCheckDouble />}
              colorClass="bg-[#DCFCE7] text-[#16A34A]"
              featured
              onClick={() =>
                handleCardClick(null, () =>
                  notify({
                    type: "success",
                    title: `${entityTitle} verified`,
                    message: `Your ${entityName} has completed physical verification and your free trial is active.`,
                  }),
                )
              }
            />
          ) : activeShop.kyc_status === "submitted" ? (
            <DashCard
              title="Physical Verification"
              subtitle="Video Pending Approval"
              icon={<FaHourglassHalf />}
              isLocked={true}
              featured
              onClick={() =>
                notify({
                  type: "info",
                  title: "KYC in review",
                  message:
                    "We are currently reviewing your video KYC. We will notify you once approved.",
                })
              }
            />
          ) : verificationProofStatus === "pending" ? (
            <DashCard
              title="Physical Verification"
              subtitle="Pending Receipt Confirmation"
              icon={<FaHourglassHalf />}
              isLocked={true}
              featured
              onClick={() =>
                notify({
                  type: "info",
                  title: "Receipt under review",
                  message:
                    "Your verification receipt has been submitted and is waiting for staff confirmation.",
                })
              }
            />
          ) : canOpenKycVideo ? (
            activeShop.kyc_status === "rejected" ? (
              <DashCard
                title="Physical Verification"
                subtitle="Re-record Video"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                featured
                onClick={() => handleCardClick(null, handleVerificationGateway)}
              />
            ) : (
              <DashCard
                title="Physical Verification"
                subtitle="Open Video KYC"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                featured
                onClick={() => handleCardClick(null, handleVerificationGateway)}
              />
            )
          ) : (
            <DashCard
              title="Physical Verification"
              subtitle={
                verificationProofStatus === "rejected"
                    ? "Upload Receipt Again"
                    : "Verification Fee"
              }
              icon={<FaBuildingCircleCheck />}
              colorClass="bg-[#FEF3C7] text-[#D97706]"
              featured
              onClick={() => handleCardClick(null, handleVerificationGateway)}
            />
          )}

          {!isVerified ? (
            <DashCard
              title="Service Fee"
              subtitle="KYC Required"
              icon={<FaLock />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "error",
                  title: "Approval required",
                  message:
                    `You cannot subscribe to a service plan until your ${entityName} passes KYC approval.`,
                })
              }
            />
          ) : serviceFeeProofStatus === "pending" ? (
            <DashCard
              title="Service Fee"
              subtitle="Pending Receipt Confirmation"
              icon={<FaHourglassHalf />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "info",
                  title: "Receipt under review",
                  message:
                    "Your subscription receipt has been submitted and is waiting for staff confirmation.",
                })
              }
            />
          ) : (
            <DashCard
              title="Service Fee"
              subtitle={
                isSubscriptionActive
                  ? `${currentSubscriptionLabel} Active`
                  : serviceFeeProofStatus === "rejected"
                    ? "Upload Receipt Again"
                    : "Choose Plan"
              }
              icon={<FaFileInvoiceDollar />}
              colorClass="bg-pink-100 text-pink-600"
              onClick={() =>
                handleCardClick(`/service-fee?shop_id=${activeShop.id}`)
              }
            />
          )}

          <DashCard
            title={`Add ${itemTitle}`}
            icon={<FaRegSquarePlus />}
            colorClass="bg-[#DCFCE7] text-[#16A34A]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () =>
                    handleCardClick(
                      `/merchant-add-product?shop_id=${activeShop.id}`,
                    )
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can add ${itemNamePlural}.`,
                    })
            }
          />

          <DashCard
            title={`Edit ${itemNamePlural.charAt(0).toUpperCase()}${itemNamePlural.slice(1)}`}
            icon={<FaPenToSquare />}
            colorClass="bg-[#DBEAFE] text-[#2563EB]"
            badge={activeRejectedCount}
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () =>
                    handleCardClick(`/merchant-products?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can edit ${itemNamePlural}.`,
                    })
            }
          />

          <DashCard
            title={`${entityTitle} Banner`}
            icon={<FaCamera />}
            colorClass="bg-[#F3E8FF] text-[#9333EA]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () => handleCardClick(`/merchant-banner?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can manage your banner.`,
                    })
            }
          />

          <DashCard
            title={`${entityTitle} Settings`}
            icon={<FaGear />}
            colorClass="bg-[#FFEDD5] text-[#EA580C]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () => handleCardClick(`/merchant-settings?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can update ${entityName} settings.`,
                    })
            }
          />

          <DashCard
            title={isServiceMode ? "Service News" : "Post News"}
            icon={<FaBullhorn />}
            colorClass="bg-[#FEE2E2] text-[#DC2626]"
            isLocked={!isApplicationApproved || isSuspended}
            onClick={
              isApplicationApproved && !isSuspended
                ? () => handleCardClick(`/merchant-news?shop_id=${activeShop.id}`)
                : () =>
                    notify({
                      type: "error",
                      title: isSuspended ? `${entityTitle} restricted` : "Approval required",
                      message:
                        isSuspended
                          ? `Your ${entityName} access has been restricted by administration.`
                          : `Your ${entityName} must be approved before you can publish ${entityName} news.`,
                    })
            }
          />

          {isSuspended ? (
            <DashCard
              title={`View ${entityTitle}`}
              subtitle="Suspended"
              icon={<FaStoreSlash />}
              isLocked={true}
              onClick={() =>
                notify({
                  type: "error",
                  title: `${entityTitle} restricted`,
                  message:
                    `Your ${entityName} access has been restricted by administration.`,
                })
              }
            />
          ) : (
            <DashCard
              title={`View ${entityTitle}`}
              icon={<FaEye />}
              colorClass="bg-[#E0E7FF] text-[#4F46E5]"
              onClick={() => handleCardClick(viewRoute)}
            />
          )}

          <DashCard
            title="Promo Banner"
            subtitle="Custom Ad Studio"
            icon={<FaWandMagicSparkles />}
            colorClass="bg-[#FDF2F8] text-[#db2777]"
            isLocked={!isSubscriptionActive}
            onClick={
              !isSubscriptionActive
                ? () =>
                    showSubscriptionRequired(
                      "An active service plan is required before you can open the promo banner studio."
                    )
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
                    showSubscriptionRequired(
                      "An active service plan is required before you can access analytics."
                    )
            }
          />
        </div>
      </main>
      </div>
    </>
  )
}

function DashCard({
  title,
  subtitle,
  icon,
  colorClass,
  badge,
  isLocked,
  onClick,
  featured = false,
}) {
  const outerClass = featured ? "col-span-2 sm:col-span-2" : ""
  const lockedHeightClass = featured ? "min-h-[148px] sm:min-h-[156px]" : "min-h-[125px] sm:min-h-[140px]"
  const activeHeightClass = featured ? "min-h-[148px] sm:min-h-[156px]" : "min-h-[125px] sm:min-h-[140px]"
  const activeIconClass = featured
    ? "mb-4 h-[52px] w-[52px] text-[1.45rem] sm:h-[58px] sm:w-[58px] sm:text-[1.55rem]"
    : "mb-3 h-[42px] w-[42px] text-[1.2rem] sm:h-[50px] sm:w-[50px] sm:text-[1.4rem]"
  const lockedIconClass = featured
    ? "mb-4 h-[52px] w-[52px] text-[1.45rem] sm:h-[58px] sm:w-[58px] sm:text-[1.55rem]"
    : "mb-3 h-[42px] w-[42px] text-[1.2rem] sm:h-[50px] sm:w-[50px] sm:text-[1.4rem]"
  const titleClass = featured
    ? "text-[0.95rem] font-extrabold sm:text-[1.05rem]"
    : "text-[0.85rem] font-extrabold sm:text-[0.95rem]"
  const subtitleClass = featured
    ? "mt-1.5 text-[0.78rem] font-semibold sm:text-[0.82rem]"
    : "mt-1 text-[0.7rem] font-semibold sm:text-[0.75rem]"

  if (isLocked) {
    return (
      <div
        onClick={onClick}
        className={`${outerClass} cursor-not-allowed rounded-[22px] bg-slate-200 p-1 transition-all`}
      >
        <div className={`relative flex h-full flex-col items-center justify-center rounded-[18px] border border-slate-200 bg-[#F7F7F7] p-4 text-center text-[#565959] ${lockedHeightClass}`}>
          <div className={`flex items-center justify-center rounded-full bg-[#E2E8F0] text-[#888C8C] ${lockedIconClass}`}>
            {icon}
          </div>
          <div className={titleClass}>
            {title}
          </div>
          {subtitle && (
            <div className={subtitleClass}>
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
      className={`${outerClass} cursor-pointer rounded-[22px] bg-pink-200 p-1 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:bg-pink-300 hover:shadow-[0_8px_16px_rgba(219,39,119,0.15)]`}
    >
      <div className={`relative flex h-full flex-col items-center justify-center rounded-[18px] border border-pink-100 bg-white p-4 text-center ${activeHeightClass}`}>
        {badge > 0 && (
          <div className="absolute right-3 top-3 flex h-6 min-w-[24px] animate-[popIn_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards] items-center justify-center rounded-full border-2 border-white bg-[#DC2626] px-1.5 text-[0.75rem] font-extrabold text-white shadow-[0_2px_6px_rgba(220,38,38,0.5)]">
            {badge}
          </div>
        )}

        <div
          className={`flex items-center justify-center rounded-full ${activeIconClass} ${colorClass}`}
        >
          {icon}
        </div>

        <div className={`${titleClass} text-[#0F1111]`}>
          {title}
        </div>

        {subtitle && (
          <div className={`${subtitleClass} text-[#565959]`}>
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
