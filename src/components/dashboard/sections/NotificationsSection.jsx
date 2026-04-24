import {
  FaBell,
  FaBuildingCircleCheck,
  FaCircleCheck,
  FaFileInvoiceDollar,
  FaStore,
  FaTriangleExclamation,
  FaVideo,
} from "react-icons/fa6"

function inferNotificationKind(item) {
  const explicitKind = String(item?.kind || "").trim().toLowerCase()
  if (explicitKind) return explicitKind

  const title = String(item?.title || "").toLowerCase()
  const message = String(item?.message || "").toLowerCase()
  const combined = `${title} ${message}`

  if (combined.includes("service fee")) {
    return combined.includes("needs attention") || combined.includes("could not confirm")
      ? "service_fee_rejected"
      : "service_fee_confirmed"
  }

  if (combined.includes("verification fee") || combined.includes("verification payment") || combined.includes("promo code")) {
    return combined.includes("needs attention") || combined.includes("could not confirm")
      ? "verification_payment_rejected"
      : "verification_payment_confirmed"
  }

  if (combined.includes("video kyc")) {
    return combined.includes("needs attention") || combined.includes("not approved")
      ? "kyc_rejected"
      : "kyc_approved"
  }

  if (combined.includes("shop application")) {
    return combined.includes("approved") ? "shop_approved" : "shop_rejected"
  }

  if (combined.includes("verified")) return "kyc_approved"

  return "system"
}

function getNotificationMeta(item) {
  const kind = inferNotificationKind(item)

  switch (kind) {
    case "shop_approved":
      return {
        kind,
        icon: FaStore,
        eyebrow: "Shop Update",
        toneClass: "border-emerald-200 bg-emerald-50/90",
        iconWrapClass: "bg-emerald-100 text-emerald-700",
        eyebrowClass: "text-emerald-700",
        ctaLabel: "Open Merchant Dashboard",
      }
    case "shop_rejected":
      return {
        kind,
        icon: FaTriangleExclamation,
        eyebrow: "Action Required",
        toneClass: "border-amber-200 bg-amber-50/95",
        iconWrapClass: "bg-amber-100 text-amber-700",
        eyebrowClass: "text-amber-700",
        ctaLabel: "Review Application",
      }
    case "kyc_approved":
      return {
        kind,
        icon: FaCircleCheck,
        eyebrow: "Verification",
        toneClass: "border-emerald-200 bg-emerald-50/90",
        iconWrapClass: "bg-emerald-100 text-emerald-700",
        eyebrowClass: "text-emerald-700",
        ctaLabel: "Open Merchant Dashboard",
      }
    case "kyc_rejected":
      return {
        kind,
        icon: FaVideo,
        eyebrow: "Video KYC",
        toneClass: "border-rose-200 bg-rose-50/95",
        iconWrapClass: "bg-rose-100 text-rose-700",
        eyebrowClass: "text-rose-700",
        ctaLabel: "Record Video Again",
      }
    case "verification_payment_confirmed":
      return {
        kind,
        icon: FaBuildingCircleCheck,
        eyebrow: "Payment Confirmed",
        toneClass: "border-indigo-200 bg-indigo-50/95",
        iconWrapClass: "bg-indigo-100 text-indigo-700",
        eyebrowClass: "text-indigo-700",
        ctaLabel: "Continue To Video KYC",
      }
    case "verification_payment_rejected":
      return {
        kind,
        icon: FaTriangleExclamation,
        eyebrow: "Receipt Review",
        toneClass: "border-amber-200 bg-amber-50/95",
        iconWrapClass: "bg-amber-100 text-amber-700",
        eyebrowClass: "text-amber-700",
        ctaLabel: "Open Verification Fee",
      }
    case "service_fee_confirmed":
      return {
        kind,
        icon: FaFileInvoiceDollar,
        eyebrow: "Subscription",
        toneClass: "border-fuchsia-200 bg-fuchsia-50/95",
        iconWrapClass: "bg-fuchsia-100 text-fuchsia-700",
        eyebrowClass: "text-fuchsia-700",
        ctaLabel: "Open Merchant Dashboard",
      }
    case "service_fee_rejected":
      return {
        kind,
        icon: FaTriangleExclamation,
        eyebrow: "Subscription",
        toneClass: "border-amber-200 bg-amber-50/95",
        iconWrapClass: "bg-amber-100 text-amber-700",
        eyebrowClass: "text-amber-700",
        ctaLabel: "Review Service Fee",
      }
    default:
      return {
        kind,
        icon: FaBell,
        eyebrow: "Notification",
        toneClass: "border-slate-200 bg-white",
        iconWrapClass: "bg-slate-100 text-slate-600",
        eyebrowClass: "text-slate-500",
        ctaLabel: "Open",
      }
  }
}

function formatNotificationTime(value) {
  if (!value) return ""

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ""

  const now = new Date()
  const isSameDay =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()

  const timeLabel = parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })

  if (isSameDay) return `Today, ${timeLabel}`

  return `${parsed.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: parsed.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })} · ${timeLabel}`
}

function NotificationsSection({ notifications = [], onOpenNotification }) {
  const unreadCount = notifications.filter((item) => !item.is_read).length

  return (
    <div className="screen active">
      <div className="tool-block-wrap bg-white px-4 py-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="sec-title flex items-center gap-[10px] p-0 text-[1.35rem] font-extrabold text-[#0F1111]">
              Alerts & Notifications
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Professional updates on your shop application, verification, and payments.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
            <FaBell className="text-slate-500" />
            <span>{unreadCount} unread</span>
          </div>
        </div>

        <div className="flex max-w-[880px] flex-col gap-4">
          {notifications.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                <FaBell className="text-xl" />
              </div>
              <p className="mt-4 text-lg font-black text-slate-700">No notifications yet</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Shop, payment, and verification updates will appear here.
              </p>
            </div>
          ) : (
            notifications.map((item) => {
              const meta = getNotificationMeta(item)
              const Icon = meta.icon
              const canOpen = Boolean(item.action_path && typeof onOpenNotification === "function")

              return (
                <article
                  key={item.id}
                  className={`rounded-[28px] border p-5 shadow-sm transition ${meta.toneClass} ${
                    item.is_read ? "" : "ring-1 ring-slate-900/5"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg ${meta.iconWrapClass}`}>
                      <Icon />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className={`text-[0.72rem] font-black uppercase tracking-[0.22em] ${meta.eyebrowClass}`}>
                            {meta.eyebrow}
                          </div>
                          <h3 className="mt-1 text-[1rem] font-black leading-tight text-slate-950">
                            {item.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2">
                          {!item.is_read ? (
                            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-white">
                              New
                            </span>
                          ) : null}
                          <span className="whitespace-nowrap text-xs font-bold text-slate-500">
                            {formatNotificationTime(item.created_at)}
                          </span>
                        </div>
                      </div>

                      <p className="mt-3 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">
                        {item.message || ""}
                      </p>

                      {canOpen ? (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => onOpenNotification(item)}
                            className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-slate-800"
                          >
                            {meta.ctaLabel}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationsSection
