import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { FaArrowLeft, FaWhatsapp, FaPhone } from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import usePreventPullToRefresh from "../hooks/usePreventPullToRefresh"
import StableImage from "../components/common/StableImage"
import PageSeo from "../components/common/PageSeo"
import { PageLoadingScreen } from "../components/common/PageStatusScreen"
import RetryingNotice, { getRetryingMessage } from "../components/common/RetryingNotice"

export default function DiscoveryDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = searchParams.get("id")
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [discovery, setDiscovery] = useState(null)

  usePreventPullToRefresh()

  useEffect(() => {
    async function loadDiscovery() {
      if (!id) {
        setError("ID missing")
        setLoading(false)
        return
      }
      try {
        const { data, error: dbError } = await supabase
          .from("staff_discoveries")
          .select("*")
          .eq("id", id)
          .maybeSingle()
        
        if (dbError) throw dbError
        setDiscovery(Array.isArray(data) ? data[0] : data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadDiscovery()
  }, [id])

  if (loading) return <PageLoadingScreen title="Loading discovery..." />
  if (error) return <RetryingNotice message={getRetryingMessage(error)} onRetry={() => window.location.reload()} />
  if (!discovery) return <RetryingNotice message="Item not found." onRetry={() => navigate(-1)} />

  return (
    <div className="min-h-screen bg-white">
      <PageSeo 
        title={`${discovery.title} | Market Discovery`}
        description={discovery.description || "Discover unique fashion and lifestyle picks."}
      />
      
      {/* Fixed Top Nav */}
      <div className="sticky top-0 z-50 flex items-center justify-between bg-white/80 px-4 py-4 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-900 transition-all active:scale-90"
        >
          <FaArrowLeft />
        </button>
        <h1 className="text-sm font-black uppercase tracking-widest text-slate-400">Discovery</h1>
        <div className="w-10" />
      </div>

      <main className="mx-auto max-w-[600px] pb-24">
        {/* Main Portrait Image */}
        <div className="relative w-full overflow-hidden bg-slate-50 md:rounded-[40px]">
          <StableImage 
            src={discovery.image_url} 
            alt={discovery.title} 
            className="w-full object-cover" 
          />
        </div>

        <div className="px-6 py-8">
          <div className="mb-2 text-[0.7rem] font-black uppercase tracking-[0.2em] text-pink-600">Staff Selection</div>
          <h2 className="mb-4 text-3xl font-black leading-tight text-slate-900">{discovery.title}</h2>
          
          {discovery.price && (
            <div className="mb-6 text-2xl font-black text-slate-900">
              ₦{Number(discovery.price).toLocaleString()}
            </div>
          )}

          <div className="mb-8 h-px w-full bg-slate-100" />

          <h3 className="mb-3 text-[0.8rem] font-black uppercase tracking-widest text-slate-400">Description</h3>
          <p className="whitespace-pre-wrap text-[1.05rem] leading-relaxed text-slate-600">
            {discovery.description || "No description provided."}
          </p>
        </div>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 left-0 right-0 z-50 flex justify-center px-6">
        <a
          href={`https://wa.me/${discovery.contact_phone?.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full max-w-[400px] items-center justify-center gap-3 rounded-[24px] bg-[#25D366] py-5 text-[1.1rem] font-black text-white shadow-2xl shadow-green-200 transition-all hover:scale-[1.02] active:scale-95"
        >
          <FaWhatsapp className="text-2xl" />
          Chat to Purchase
        </a>
      </div>
    </div>
  )
}
