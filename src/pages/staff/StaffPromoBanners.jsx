import { useCallback, useEffect, useMemo, useState } from "react"
import {
  FaCircleNotch,
  FaImage,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrashCan,
  FaWandMagicSparkles,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { SectionHeading, StaffPortalShell, formatDateTime } from "./StaffPortalShared"
import { buildPromoBannerSvg, promoSvgToDataUrl, PROMO_EXTENDED_COLORS, PROMO_LAYOUTS } from "../../lib/promoBannerEngine"

function PromoBannerPreview({
  title,
  subtitle,
  backgroundKey,
  layout,
  products = [],
  isHotDeal = false,
}) {
  const svg = buildPromoBannerSvg({
    title,
    subtitle,
    backgroundKey,
    layout,
    products,
    isHotDeal,
  })

  return (
    <div className="overflow-hidden rounded-[32px] shadow-2xl">
      <img
        src={promoSvgToDataUrl(svg)}
        alt="Promo Banner Preview"
        className="block w-full"
      />
    </div>
  )
}

export default function StaffPromoBanners() {
  const { notify, confirm } = useGlobalFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [cities, setCities] = useState([])
  const [shops, setShops] = useState([])
  const [banners, setBanners] = useState([])
  const [shopProducts, setShopProducts] = useState([])
  
  const [selectedCityId, setSelectedCityId] = useState("")
  const [selectedShopId, setSelectedShopId] = useState("")
  const [backgroundKey, setBackgroundKey] = useState("lagoon-blue")
  const [layout, setLayout] = useState("split")
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [cta, setCta] = useState("Claim")
  const [externalLink, setExternalLink] = useState("")
  const [sortOrder, setSortOrder] = useState(0)

  const selectedShop = useMemo(() => 
    shops.find((shop) => String(shop.id) === String(selectedShopId)) || null
  , [shops, selectedShopId])

  useEffect(() => {
    if (selectedShop) {
      setTitle(selectedShop.name)
      setSubtitle(selectedShop.category || "Hot Deal at this store!")
      // Fetch shop products
      const fetchProducts = async () => {
        const { data } = await supabase
          .from("products")
          .select("id, image_url")
          .eq("shop_id", selectedShop.id)
          .eq("is_available", true)
          .not("image_url", "is", null)
          .limit(3)
        setShopProducts(data || [])
      }
      fetchProducts()
    } else {
      setShopProducts([])
    }
  }, [selectedShop])

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [citiesResult, bannersResult] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("name"),
        supabase
          .from("promo_banners")
          .select("*, cities(name)")
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ])
      if (citiesResult.error) throw citiesResult.error
      if (bannersResult.error) throw bannersResult.error
      setCities(citiesResult.data || [])
      setBanners(bannersResult.data || [])
    } catch (error) {
      notify({ type: "error", title: "Load failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }, [notify])

  const loadShops = useCallback(async (cityId) => {
    try {
      let query = supabase.from("shops").select("id, name, category").eq("status", "approved")
      if (cityId) query = query.eq("city_id", cityId)
      const { data, error } = await query.order("name").limit(200)
      if (error) throw error
      setShops(data || [])
    } catch (error) {
      console.error("Failed to load shops", error)
    }
  }, [])

  useEffect(() => { loadInitialData() }, [loadInitialData])
  useEffect(() => { loadShops(selectedCityId) }, [loadShops, selectedCityId])

  async function handlePublish() {
    if (!title.trim()) {
      notify({ type: "error", title: "Validation error", message: "Title is required." })
      return
    }

    try {
      setSaving(true)
      const { error } = await supabase.from("promo_banners").insert({
        city_id: selectedCityId ? Number(selectedCityId) : null,
        shop_id: selectedShopId ? Number(selectedShopId) : null,
        title: title.trim(),
        subtitle: subtitle.trim(),
        call_to_action: cta.trim(),
        external_link: externalLink.trim(),
        template_key: backgroundKey,
        layout: layout,
        sort_order: Number(sortOrder) || 0,
      })
      if (error) throw error
      notify({ type: "success", title: "Promo banner published", message: "The banner is now live." })
      setTitle(""); setSubtitle(""); setSelectedShopId(""); setExternalLink("");
      await loadInitialData()
    } catch (error) {
      notify({ type: "error", title: "Publish failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(banner, status) {
    try {
      const { error } = await supabase.from("promo_banners").update({ status }).eq("id", banner.id)
      if (error) throw error
      await loadInitialData()
    } catch (error) {
      notify({ type: "error", title: "Update failed", message: getFriendlyErrorMessage(error) })
    }
  }

  async function handleDelete(banner) {
    const ok = await confirm({ type: "error", title: "Delete promo banner?", message: "This action cannot be undone.", confirmText: "Delete" })
    if (!ok) return
    try {
      const { error } = await supabase.from("promo_banners").delete().eq("id", banner.id)
      if (error) throw error
      await loadInitialData()
    } catch (error) {
      notify({ type: "error", title: "Delete failed", message: getFriendlyErrorMessage(error) })
    }
  }

  return (
    <StaffPortalShell activeKey="promo-banners" title="Promo Banner Studio" description="Design striking marketplace widgets.">
      <SectionHeading eyebrow="Marketplace Feature" title="Professional Banner Engine" description="Choose layouts, professional colors, and link shops to automatically display their products." />
      {loading ? (
        <div className="flex h-64 items-center justify-center"><FaCircleNotch className="animate-spin text-4xl text-pink-600" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[450px_1fr]">
          <div className="space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-slate-900">Creation Tools</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Target City</label>
                <select value={selectedCityId} onChange={(e) => setSelectedCityId(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500">
                  <option value="">Global (All Cities)</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Link to Shop</label>
                <select value={selectedShopId} onChange={(e) => setSelectedShopId(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500">
                  <option value="">No Shop Link</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Layout Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {PROMO_LAYOUTS.map(l => (
                    <button key={l.key} onClick={() => setLayout(l.key)} className={`rounded-xl border px-2 py-2 text-[10px] font-black uppercase transition ${layout === l.key ? 'border-pink-500 bg-pink-50 text-pink-600' : 'border-slate-200 bg-white text-slate-600'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Banner Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mega Clearance Sale" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Subtitle</label>
                <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. Best prices in the city" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500" />
              </div>
              <div>
                <label className="mb-3 block text-xs font-black uppercase tracking-wider text-slate-500">Professional Backgrounds</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROMO_EXTENDED_COLORS.map((bg) => (
                    <button key={bg.key} onClick={() => setBackgroundKey(bg.key)} className={`h-10 rounded-xl bg-gradient-to-r ${bg.bg} p-1 transition ${backgroundKey === bg.key ? 'ring-2 ring-pink-500 ring-offset-2' : 'opacity-60 hover:opacity-100'}`} title={bg.label}>
                      <div className="h-full w-full rounded-lg bg-black/10" style={{ backgroundImage: bg.texture }} />
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handlePublish} disabled={saving || !title} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 py-4 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:bg-pink-700 disabled:bg-slate-300">
                {saving ? <FaCircleNotch className="animate-spin" /> : <FaPlus />} {saving ? "Publishing..." : "Publish Professional Banner"}
              </button>
            </div>
          </div>
          <div className="space-y-8">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-black text-slate-900">Real-time Preview</h3><FaWandMagicSparkles className="text-pink-600" /></div>
              <PromoBannerPreview title={title || "Professional Banner"} subtitle={subtitle || "Catchy description goes here"} backgroundKey={backgroundKey} layout={layout} products={shopProducts} isHotDeal={Boolean(selectedShopId)} />
            </div>
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-6 text-xl font-black text-slate-900">Live Promotions</h3>
              <div className="space-y-6">
                {banners.map(banner => (
                  <div key={banner.id} className="group relative rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-white hover:shadow-md">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${banner.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{banner.status}</span><span className="text-[10px] font-bold text-slate-400">{banner.cities?.name || 'Global'} • {formatDateTime(banner.created_at)}</span></div>
                        <h4 className="mt-1 font-black text-slate-900">{banner.title}</h4>
                      </div>
                      <div className="flex gap-2 opacity-0 transition group-hover:opacity-100">
                        <button onClick={() => updateStatus(banner, banner.status === 'published' ? 'paused' : 'published')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:text-pink-600">{banner.status === 'published' ? <FaPause /> : <FaPlay />}</button>
                        <button onClick={() => handleDelete(banner)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm hover:bg-rose-50"><FaTrashCan /></button>
                      </div>
                    </div>
                    <PromoBannerPreview title={banner.title} subtitle={banner.subtitle} backgroundKey={banner.template_key} layout={banner.layout || 'split'} isHotDeal={Boolean(banner.shop_id)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </StaffPortalShell>
  )
}
