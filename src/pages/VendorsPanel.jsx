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
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { FaRegSquarePlus } from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import useAuthSession from "../hooks/useAuthSession"

function MerchantDashboard() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuthSession()

  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [rejectedProductCount, setRejectedProductCount] = useState(0)
  const [hasPaidFee, setHasPaidFee] = useState(false)

  useEffect(() => {
    async function fetchMerchantData() {
      if (!user) return

      try {
        setLoading(true)

        // 1. Check Profile Suspension
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("is_suspended")
          .eq("id", user.id)
          .maybeSingle()

        if (profileErr) throw profileErr
        if (profile?.is_suspended) {
          throw new Error("Your account access has been restricted by administration.")
        }

        // 2. Fetch Shop Data
        const { data: shopData, error: shopErr } = await supabase
          .from("shops")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle()

        if (shopErr) throw shopErr
        if (!shopData) {
          navigate("/shop-registration", { replace: true })
          return
        }

        // Check if application was rejected (but not related to KYC)
        if (shopData.status === "rejected" && shopData.kyc_status !== "rejected") {
          throw new Error("Your shop application was rejected. Please contact support.")
        }

        setShop(shopData)

        // 3. Fetch Rejected Products Count
        const { count, error: rejectErr } = await supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("shop_id", shopData.id)
          .eq("is_approved", false)
          .not("rejection_reason", "is", null)

        if (!rejectErr && count) {
          setRejectedProductCount(count)
        }

        // 4. Check Payment Status
        const { data: paymentRecord } = await supabase
          .from("physical_verification_payments")
          .select("id")
          .eq("merchant_id", user.id)
          .eq("status", "success")
          .maybeSingle()

        setHasPaidFee(Boolean(paymentRecord))

      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (!authLoading) {
      fetchMerchantData()
    }
  }, [user, authLoading, navigate])

  if (authLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F3F4F6]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-pink-200 border-t-pink-600"></div>
        <p className="mt-4 font-semibold text-slate-500">Loading merchant workspace...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#F3F4F6]">
        <header className="sticky top-0 z-50 bg-[#131921] shadow-[0_4px_6px_rgba(0,0,0,0.1)]">
          <div className="mx-auto flex w-full max-w-[1000px] items-center gap-4 px-4 py-3 text-white">
            <button onClick={() => navigate("/user-dashboard")} className="p-1 text-[1.2rem] transition hover:text-pink-500">
              <FaArrowLeft />
            </button>
            <div className="text-[1.15rem] font-bold tracking-[0.5px]">Error</div>
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center px-5">
          <div className="rounded-[24px] border border-red-200 bg-white p-8 text-center shadow-lg w-full max-w-md">
            <FaTriangleExclamation className="mx-auto mb-4 text-5xl text-red-600" />
            <h3 className="mb-2 text-xl font-extrabold text-slate-900">Access Denied</h3>
            <p className="mb-6 text-sm font-medium text-slate-600">{error}</p>
            <button
              onClick={() => navigate("/user-dashboard")}
              className="rounded-xl bg-slate-900 px-6 py-3 font-bold text-white transition hover:bg-slate-800"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!shop) return null

  const isVerified = shop.is_verified || shop.kyc_status === "approved"
  const isSuspended = shop.is_open === false

  return (
    <div className="flex min-h-screen flex-col bg-[#F3F4F6] text-[#0F1111]">
      {/* HEADER */}
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

      {/* MAIN CONTAINER */}
      <main className="mx-auto w-full max-w-[1000px] flex-1 px-5 py-8">
        
        {/* WELCOME SECTION */}
        <div className="mb-8">
          <h1 className="mb-1 text-[1.8rem] font-extrabold leading-[1.2] text-[#0F1111]">
            Manage {shop.name}
          </h1>
          <p className="text-[0.95rem] font-medium text-[#565959]">
            Control your inventory and shop presence.
          </p>

          {shop.status === "pending" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FDE68A] border-l-4 border-l-[#D97706] bg-[#FEF3C7] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#92400E]">
              <FaTriangleExclamation className="shrink-0 text-[1.2rem]" />
              <span>Your shop application is pending digital approval.</span>
            </div>
          )}

          {shop.kyc_status === "rejected" && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FECACA] border-l-4 border-l-[#DC2626] bg-[#FEE2E2] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#991B1B]">
              <FaVideoSlash className="shrink-0 text-[1.2rem]" />
              <span>
                KYC REJECTED: {shop.rejection_reason || "Your video did not meet our standards."} Please click the red "Record Video" card below to try again.
              </span>
            </div>
          )}

          {isSuspended && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-[#FECACA] border-l-4 border-l-[#DC2626] bg-[#FEE2E2] px-4 py-3 text-[0.9rem] font-semibold leading-[1.4] text-[#991B1B]">
              <FaLock className="shrink-0 text-[1.2rem]" />
              <span>
                Your shop has been locked by administration. It is no longer visible to the public. Please contact support.
              </span>
            </div>
          )}
        </div>

        {/* DASHBOARD GRID */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-5">
          
          {/* Add Product */}
          <DashCard
            title="Add Product"
            icon={<FaRegSquarePlus />}
            colorClass="bg-[#DCFCE7] text-[#16A34A]"
            onClick={() => navigate(`/merchant-add-product?shop_id=${shop.id}`)}
          />

          {/* Edit Products */}
          <DashCard
            title="Edit Products"
            icon={<FaPenToSquare />}
            colorClass="bg-[#DBEAFE] text-[#2563EB]"
            badge={rejectedProductCount}
            onClick={() => navigate(`/merchant-products?shop_id=${shop.id}`)}
          />

          {/* Shop Banner */}
          <DashCard
            title="Shop Banner"
            icon={<FaCamera />}
            colorClass="bg-[#F3E8FF] text-[#9333EA]"
            onClick={() => navigate(`/merchant-banner?shop_id=${shop.id}`)}
          />

          {/* CT Studio */}
          <DashCard
            title="CT Studio"
            subtitle="Photo Editor"
            icon={<FaWandMagicSparkles />}
            colorClass="bg-[#CFFAFE] text-[#0891B2]"
            onClick={() => navigate("/ct-studio")}
          />

          {/* Shop Settings */}
          <DashCard
            title="Shop Settings"
            icon={<FaGear />}
            colorClass="bg-[#FFEDD5] text-[#EA580C]"
            onClick={() => navigate(`/merchant-settings?shop_id=${shop.id}`)}
          />

          {/* Post News */}
          <DashCard
            title="Post News"
            icon={<FaBullhorn />}
            colorClass="bg-[#FEE2E2] text-[#DC2626]"
            onClick={() => navigate(`/merchant-news?shop_id=${shop.id}`)}
          />

          {/* View Shop */}
          {isSuspended ? (
            <DashCard
              title="View Shop"
              subtitle="Suspended"
              icon={<FaStoreSlash />}
              isLocked={true}
              onClick={() => alert("🔒 Your shop access has been restricted by administration.")}
            />
          ) : (
            <DashCard
              title="View Shop"
              icon={<FaEye />}
              colorClass="bg-[#E0E7FF] text-[#4F46E5]"
              onClick={() => navigate(`/shop-detail?id=${shop.id}`)}
            />
          )}

          {/* Digital ID Card */}
          <DashCard
            title="Digital ID Card"
            subtitle="QR Code & Share"
            icon={<FaAddressCard />}
            colorClass="bg-[#FAE8FF] text-[#C026D3]"
            onClick={() => navigate(`/merchant-id-card?shop_id=${shop.id}`)}
          />

          {/* Promo Banner */}
          <DashCard
            title="Promo Banner"
            subtitle="Print & Broadcast"
            icon={<FaImage />}
            colorClass="bg-[#D1FAE5] text-[#059669]"
            onClick={() => navigate(`/merchant-promo-banner?shop_id=${shop.id}`)}
          />

          {/* Analytics */}
          <DashCard
            title="Analytics"
            icon={<FaChartLine />}
            colorClass="bg-[#CCFBF1] text-[#0D9488]"
            onClick={() => navigate(`/merchant-analytics?shop_id=${shop.id}`)}
          />

          {/* Verification / KYC Card */}
          {isVerified ? (
            <DashCard
              title="Verified Shop"
              subtitle="Active"
              icon={<FaCheckDouble />}
              colorClass="bg-[#DCFCE7] text-[#16A34A]"
              onClick={() => alert("Your shop is physically verified and your Digital ID is active!")}
            />
          ) : hasPaid ? (
            shop.kyc_status === "submitted" ? (
              <DashCard
                title="KYC Pending"
                subtitle="Under Review"
                icon={<FaHourglassHalf />}
                isLocked={true}
                onClick={() => alert("We are currently reviewing your Video KYC! We will notify you once approved.")}
              />
            ) : shop.kyc_status === "rejected" ? (
              <DashCard
                title="Re-record Video"
                subtitle="Action Required"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                onClick={() => navigate(`/merchant-video-kyc?shop_id=${shop.id}`)}
              />
            ) : (
              <DashCard
                title="Record KYC Video"
                subtitle="Action Required"
                icon={<FaVideo />}
                colorClass="bg-[#FEE2E2] text-[#DC2626]"
                onClick={() => navigate(`/merchant-video-kyc?shop_id=${shop.id}`)}
              />
            )
          ) : (
            <DashCard
              title="Digital ID & KYC"
              icon={<FaBuildingCircleCheck />}
              colorClass="bg-[#FEF3C7] text-[#D97706]"
              onClick={() => navigate(`/remita?shop_id=${shop.id}`)}
            />
          )}

          {/* Service Fee */}
          {isVerified ? (
            <DashCard
              title="Service Fee"
              icon={<FaFileInvoiceDollar />}
              colorClass="bg-pink-100 text-pink-600"
              onClick={() => navigate(`/service-fee?shop_id=${shop.id}`)}
            />
          ) : (
            <DashCard
              title="Service Fee"
              subtitle="Verification Req."
              icon={<FaLock />}
              isLocked={true}
              onClick={() => alert("🔒 You cannot subscribe to a service plan until your shop passes KYC Verification.")}
            />
          )}

        </div>
      </main>
    </div>
  )
}

function DashCard({ title, subtitle, icon, colorClass, badge, isLocked, onClick }) {
  const baseClasses = "relative flex h-[135px] sm:h-[150px] cursor-pointer flex-col items-center justify-center rounded-lg border p-4 text-center transition-all duration-200"
  
  const stateClasses = isLocked
    ? "border-[#E2E8F0] bg-[#F7F7F7] text-[#565959] hover:border-[#E2E8F0] cursor-not-allowed"
    : "border-[#D5D9D9] bg-white hover:-translate-y-[3px] hover:border-[#B0B5B5] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"

  return (
    <div onClick={onClick} className={`${baseClasses} ${stateClasses}`}>
      {badge > 0 && !isLocked && (
        <div className="absolute right-3 top-3 flex h-6 min-w-[24px] animate-[popIn_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards] items-center justify-center rounded-full border-2 border-white bg-[#DC2626] px-1.5 text-[0.75rem] font-extrabold text-white shadow-[0_2px_6px_rgba(220,38,38,0.5)]">
          {badge}
        </div>
      )}
      
      <div className={`mb-3 flex h-[42px] w-[42px] sm:h-[50px] sm:w-[50px] items-center justify-center rounded-full text-[1.2rem] sm:text-[1.4rem] ${isLocked ? "bg-[#E2E8F0] text-[#888C8C]" : colorClass}`}>
        {icon}
      </div>
      
      <div className="text-[0.85rem] sm:text-[0.95rem] font-extrabold text-[#0F1111]">
        {title}
      </div>
      
      {subtitle && (
        <div className="mt-1 text-[0.7rem] sm:text-[0.75rem] font-semibold text-[#565959]">
          {subtitle}
        </div>
      )}

      <style dangerouslySetOrigin={{__html: `
        @keyframes popIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}}/>
    </div>
  )
}

export default MerchantDashboard