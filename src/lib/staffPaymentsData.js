import { supabase } from "./supabase"

function parseDateValue(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function getLatestBy(items, getKey) {
  const latest = new Map()

  for (const item of Array.isArray(items) ? items : []) {
    const key = getKey(item)
    if (!key) continue

    const current = latest.get(key)
    const currentDate = parseDateValue(current?.created_at)?.getTime() || 0
    const nextDate = parseDateValue(item?.created_at)?.getTime() || 0

    if (!current || nextDate >= currentDate) {
      latest.set(key, item)
    }
  }

  return latest
}

export function getDaysUntil(value) {
  const parsed = parseDateValue(value)
  if (!parsed) return null
  const diffMs = parsed.getTime() - Date.now()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

function buildPhysicalState(shop, latestPhysicalPayment, latestPhysicalProof) {
  if (shop?.status !== "approved") {
    if (shop?.status === "rejected") {
      return {
        key: "application_rejected",
        label: "Application Rejected",
        detail: "Merchant must correct and resubmit.",
        tone: "danger",
      }
    }

    return {
      key: "application_pending",
      label: "Application Pending",
      detail: "Waiting for digital approval.",
      tone: "muted",
    }
  }

  if (shop?.is_verified) {
    return {
      key: "verified",
      label: "Verified",
      detail: "Physical verification complete.",
      tone: "success",
    }
  }

  if (shop?.kyc_status === "submitted") {
    return {
      key: "video_pending",
      label: "Video Pending Approval",
      detail: "Staff review required.",
      tone: "warning",
    }
  }

  if (latestPhysicalPayment || latestPhysicalProof?.status === "approved") {
    return {
      key: "kyc_ready",
      label: "Ready For Video KYC",
      detail: "Physical payment is confirmed. Merchant can now record video KYC.",
      tone: "success",
    }
  }

  if (latestPhysicalProof?.status === "pending") {
    return {
      key: "receipt_pending",
      label: "Receipt Pending Confirmation",
      detail: "Receipt uploaded and awaiting staff confirmation.",
      tone: "warning",
    }
  }

  if (latestPhysicalProof?.status === "rejected") {
    return {
      key: "receipt_rejected",
      label: "Receipt Rejected",
      detail: "Merchant needs to upload a clearer receipt.",
      tone: "danger",
    }
  }

  return {
    key: "payment_due",
    label: "Payment Expected",
    detail: "Approved shop should pay physical verification fee.",
    tone: "warning",
  }
}

function buildSubscriptionState(shop, latestServiceProof) {
  if (!(shop?.is_verified || shop?.kyc_status === "approved")) {
    return {
      key: "kyc_required",
      label: "KYC Required",
      detail: "Service subscription stays locked until shop is verified.",
      tone: "muted",
      daysRemaining: null,
      isActive: false,
    }
  }

  if (latestServiceProof?.status === "pending") {
    return {
      key: "receipt_pending",
      label: "Receipt Pending",
      detail: "Subscription receipt uploaded and awaiting confirmation.",
      tone: "warning",
      daysRemaining: null,
      isActive: false,
    }
  }

  if (latestServiceProof?.status === "rejected") {
    return {
      key: "receipt_rejected",
      label: "Receipt Rejected",
      detail: "Merchant needs to upload a clearer subscription proof.",
      tone: "danger",
      daysRemaining: null,
      isActive: false,
    }
  }

  const daysRemaining = getDaysUntil(shop?.subscription_end_date)
  if (daysRemaining === null) {
    return {
      key: "no_plan",
      label: "No Active Plan",
      detail: "Service fee expected after verification.",
      tone: "danger",
      daysRemaining: null,
      isActive: false,
    }
  }

  if (daysRemaining < 0) {
    return {
      key: "expired",
      label: "Expired",
      detail: `Expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} ago.`,
      tone: "danger",
      daysRemaining,
      isActive: false,
    }
  }

  if (daysRemaining <= 7) {
    return {
      key: "expiring",
      label: "Expiring Soon",
      detail: `Expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
      tone: "warning",
      daysRemaining,
      isActive: true,
    }
  }

  return {
    key: "active",
    label: "Active",
    detail: `Plan valid for ${daysRemaining} more day${daysRemaining === 1 ? "" : "s"}.`,
    tone: "success",
    daysRemaining,
    isActive: true,
  }
}

function getShopPriority(row) {
  const physicalKey = row.physicalState?.key
  const subscriptionKey = row.subscriptionState?.key

  if (physicalKey === "receipt_pending") return 0
  if (physicalKey === "payment_due") return 1
  if (physicalKey === "kyc_ready") return 2
  if (physicalKey === "video_pending") return 3
  if (subscriptionKey === "expired") return 4
  if (subscriptionKey === "expiring") return 5
  if (subscriptionKey === "receipt_pending") return 6
  return 10
}

export async function fetchStaffPaymentsOverview() {
  const [proofsResult, shopsResult, physicalResult, serviceResult] = await Promise.all([
    supabase
      .from("offline_payment_proofs")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("shops")
      .select(`
        id,
        owner_id,
        name,
        unique_id,
        status,
        is_verified,
        kyc_status,
        subscription_end_date,
        subscription_plan,
        is_service,
        phone,
        whatsapp,
        created_at,
        profiles ( full_name, phone ),
        cities ( name, state )
      `)
      .order("created_at", { ascending: false }),
    supabase
      .from("physical_verification_payments")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("service_fee_payments")
      .select("*")
      .order("created_at", { ascending: false }),
  ])

  if (proofsResult.error) throw proofsResult.error
  if (shopsResult.error) throw shopsResult.error
  if (physicalResult.error) throw physicalResult.error
  if (serviceResult.error) throw serviceResult.error

  const shops = shopsResult.data || []
  const proofs = proofsResult.data || []
  const physicalPayments = physicalResult.data || []
  const servicePayments = serviceResult.data || []

  const shopsById = new Map(shops.map((shop) => [shop.id, shop]))
  const shopsByMerchantId = new Map(shops.map((shop) => [shop.owner_id, shop]))

  const latestPhysicalPaymentsByMerchant = getLatestBy(
    physicalPayments.filter((payment) => payment.status === "success"),
    (payment) => payment.merchant_id
  )
  const latestServicePaymentsByShop = getLatestBy(
    servicePayments.filter((payment) => payment.status === "success"),
    (payment) => String(payment.shop_id)
  )
  const servicePaymentsByRef = new Map(
    servicePayments
      .filter((payment) => payment.status === "success" && payment.payment_ref)
      .map((payment) => [payment.payment_ref, payment])
  )
  const latestPhysicalProofsByShop = getLatestBy(
    proofs.filter((proof) => proof.payment_kind === "physical_verification"),
    (proof) => String(proof.shop_id)
  )
  const latestServiceProofsByShop = getLatestBy(
    proofs.filter((proof) => proof.payment_kind === "service_fee"),
    (proof) => String(proof.shop_id)
  )

  const enrichedProofs = proofs.map((proof) => {
    const shop =
      shopsById.get(proof.shop_id) ||
      shopsByMerchantId.get(proof.merchant_id) ||
      null
    const paymentRef = proof.approval_payment_ref || proof.transfer_reference || ""
    const matchingServicePayment =
      proof.payment_kind === "service_fee"
        ? servicePaymentsByRef.get(paymentRef) || latestServicePaymentsByShop.get(String(proof.shop_id)) || null
        : null

    return {
      ...proof,
      merchant_name: proof.merchant_name || shop?.profiles?.full_name || "Merchant",
      merchant_phone: shop?.profiles?.phone || "",
      shop_name: proof.shop_name || shop?.name || "",
      shop_phone: shop?.phone || "",
      shop_whatsapp: shop?.whatsapp || "",
      subscription_end_date: shop?.subscription_end_date || null,
      subscription_plan_current: shop?.subscription_plan || "",
      payment_effective_at: matchingServicePayment?.created_at || null,
      is_service: shop?.is_service === true,
    }
  })

  const shopRows = shops
    .map((shop) => {
      const latestPhysicalPayment = latestPhysicalPaymentsByMerchant.get(shop.owner_id) || null
      const latestServicePayment = latestServicePaymentsByShop.get(String(shop.id)) || null
      const latestPhysicalProof = latestPhysicalProofsByShop.get(String(shop.id)) || null
      const latestServiceProof = latestServiceProofsByShop.get(String(shop.id)) || null

      const physicalState = buildPhysicalState(shop, latestPhysicalPayment, latestPhysicalProof)
      const subscriptionState = buildSubscriptionState(shop, latestServiceProof)

      return {
        shop,
        merchantName: shop?.profiles?.full_name || "Merchant",
        merchantPhone: shop?.profiles?.phone || "",
        cityName: shop?.cities?.name || "Unknown City",
        latestPhysicalPayment,
        latestServicePayment,
        latestPhysicalProof,
        latestServiceProof,
        physicalState,
        subscriptionState,
        canManuallyConfirmPhysical:
          shop.status === "approved" &&
          !shop.is_verified &&
          shop.kyc_status !== "submitted" &&
          !latestPhysicalPayment &&
          latestPhysicalProof?.status !== "pending" &&
          latestPhysicalProof?.status !== "approved",
        canManuallyConfirmService:
          (shop.is_verified || shop.kyc_status === "approved") &&
          latestServiceProof?.status !== "pending",
      }
    })
    .sort((a, b) => {
      const priorityDiff = getShopPriority(a) - getShopPriority(b)
      if (priorityDiff !== 0) return priorityDiff

      const aCreated = parseDateValue(a.shop?.created_at)?.getTime() || 0
      const bCreated = parseDateValue(b.shop?.created_at)?.getTime() || 0
      return bCreated - aCreated
    })

  return {
    proofs: enrichedProofs,
    shops,
    shopRows,
    physicalPayments,
    servicePayments,
  }
}
