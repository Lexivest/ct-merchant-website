import { useCallback, useEffect, useMemo, useState } from "react"
import {
  FaArrowRight,
  FaBolt,
  FaCircleNotch,
  FaImage,
  FaPause,
  FaPlay,
  FaPlus,
  FaTrashCan,
  FaMagnifyingGlass,
  FaXmark,
} from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { SectionHeading, StaffPortalShell, formatDateTime } from "./StaffPortalShared"
import StableImage from "../../components/common/StableImage"

function SponsoredProductPreview({ product }) {
  if (!product) {
    return (
      <div className="flex h-40 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
        <FaImage className="mb-2 text-2xl" />
        <p className="text-xs font-bold">Select a product to preview</p>
      </div>
    )
  }

  return (
    <div className="group relative overflow-hidden rounded-[24px] bg-white shadow-xl border border-slate-100 flex flex-col p-3 w-[160px] mx-auto">
      <div className="absolute top-2 left-2 z-10">
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-600 text-white text-[8px] font-black uppercase tracking-tighter shadow-lg">
          <FaBolt className="text-[7px]" /> Sponsored
        </span>
      </div>
      
      <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-50 mb-3">
        <StableImage 
          src={product.image_url} 
          alt={product.name} 
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
        />
      </div>

      <div className="space-y-1">
        <div className="text-[10px] font-black text-slate-900 truncate">{product.name}</div>
        <div className="text-[9px] font-bold text-pink-600">₦{Number(product.price).toLocaleString()}</div>
        <div className="pt-1 border-t border-slate-50 flex items-center justify-between">
           <span className="text-[7px] font-bold text-slate-400 truncate max-w-[70%]">{product.shops?.name}</span>
           <FaArrowRight className="text-[7px] text-slate-300" />
        </div>
      </div>
    </div>
  )
}

export default function StaffPromoBanners() {
  const { notify, confirm } = useGlobalFeedback()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fetchingProducts, setFetchingProducts] = useState(false)
  
  const [cities, setCities] = useState([])
  const [banners, setBanners] = useState([])
  const [availableProducts, setAvailableProducts] = useState([])
  
  const [selectedCityId, setSelectedCityId] = useState("")
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortOrder, setSortOrder] = useState(0)

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    try {
      const [citiesResult, bannersResult] = await Promise.all([
        supabase.from("cities").select("id, name, state").order("name"),
        supabase
          .from("promo_banners")
          .select(`
            *,
            cities(name),
            shops(name)
          `)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false }),
      ])
      
      if (citiesResult.error) throw citiesResult.error
      if (bannersResult.error) throw bannersResult.error
      
      // For each banner, we need to fetch the product details
      const enrichedBanners = await Promise.all((bannersResult.data || []).map(async (b) => {
        if (!b.template_key) return b
        const { data: p } = await supabase
          .from("products")
          .select("id, name, price, image_url, shops(name)")
          .eq("id", b.template_key)
          .single()
        return { ...b, product: p }
      }))

      setCities(citiesResult.data || [])
      setBanners(enrichedBanners)
    } catch (error) {
      notify({ type: "error", title: "Load failed", message: getFriendlyErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }, [notify])

  const loadProducts = useCallback(async () => {
    setFetchingProducts(true)
    try {
      let query = supabase
        .from("products")
        .select(`
          id, 
          name, 
          price, 
          image_url, 
          shop_id,
          shops!inner(id, name, status, city_id)
        `)
        .eq("shops.status", "approved")
        .eq("is_available", true)
        .order("created_at", { ascending: false })
        .limit(50)

      if (selectedCityId) {
        query = query.eq("shops.city_id", selectedCityId)
      }

      if (searchQuery.trim()) {
        query = query.ilike("name", `%${searchQuery}%`)
      }

      const { data, error } = await query

      if (error) throw error
      setAvailableProducts(data || [])
    } catch (error) {
      console.error("Failed to load products", error)
    } finally {
      setFetchingProducts(false)
    }
  }, [selectedCityId, searchQuery])

  useEffect(() => { loadInitialData() }, [loadInitialData])
  useEffect(() => { 
    const timer = setTimeout(() => {
      loadProducts()
    }, 300)
    return () => clearTimeout(timer)
  }, [loadProducts])

  async function handlePublish() {
    if (!selectedProduct) {
      notify({ type: "error", title: "Validation error", message: "Please select a product first." })
      return
    }

    try {
      setSaving(true)
      const { error } = await supabase.from("promo_banners").insert({
        city_id: selectedCityId ? Number(selectedCityId) : null,
        shop_id: selectedProduct.shop_id,
        title: selectedProduct.name,
        subtitle: `Sponsored from ${selectedProduct.shops.name}`,
        template_key: String(selectedProduct.id), 
        layout: "product",
        sort_order: Number(sortOrder) || 0,
        status: "published"
      })
      
      if (error) throw error
      notify({ type: "success", title: "Product Sponsored", message: "The product is now featured in the marketplace." })
      setSelectedProduct(null)
      await loadInitialData()
    } catch (error) {
      notify({ type: "error", title: "Action failed", message: getFriendlyErrorMessage(error) })
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
    const ok = await confirm({ type: "error", title: "Remove sponsorship?", message: "This product will no longer be featured.", confirmText: "Remove" })
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
    <StaffPortalShell activeKey="promo-banners" title="Sponsored Products" description="Select products to feature in the marketplace.">
      <SectionHeading eyebrow="Marketplace Feature" title="Product Sponsorship" description="Choose available products from approved shops to feature them directly to users." />
      
      {loading ? (
        <div className="flex h-64 items-center justify-center"><FaCircleNotch className="animate-spin text-4xl text-pink-600" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[450px_1fr]">
          <div className="space-y-6 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-slate-900">Selection Tools</h3>
            
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Step 1: Filter by City</label>
                <select value={selectedCityId} onChange={(e) => setSelectedCityId(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500">
                  <option value="">Global (All Cities)</option>
                  {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Step 2: Browse & Select Product</label>
                <div className="mb-3 relative">
                  <input 
                    type="text" 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in available list..." 
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm font-bold outline-none focus:border-pink-500" 
                  />
                  <FaMagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <FaXmark />
                    </button>
                  )}
                </div>

                <div className="max-h-[400px] overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-2 scrollbar-thin">
                  {fetchingProducts ? (
                    <div className="flex h-20 items-center justify-center"><FaCircleNotch className="animate-spin text-pink-600" /></div>
                  ) : availableProducts.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {availableProducts.map(p => (
                        <button 
                          key={p.id} 
                          onClick={() => setSelectedProduct(p)}
                          className={`flex items-center gap-3 p-2 rounded-xl transition-all border-2 ${selectedProduct?.id === p.id ? 'border-pink-500 bg-white shadow-sm' : 'border-transparent hover:bg-white'}`}
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-200">
                            <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="truncate text-xs font-black text-slate-900">{p.name}</div>
                            <div className="text-[10px] font-bold text-slate-400">{p.shops.name} • ₦{Number(p.price).toLocaleString()}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center text-xs font-bold text-slate-400">No products found for this city.</div>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Display Order</label>
                <input 
                  type="number" 
                  value={sortOrder} 
                  onChange={(e) => setSortOrder(e.target.value)} 
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-pink-500" 
                />
              </div>

              <button 
                onClick={handlePublish} 
                disabled={saving || !selectedProduct} 
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 py-4 text-sm font-black text-white shadow-lg shadow-pink-200 transition hover:bg-pink-700 disabled:bg-slate-300"
              >
                {saving ? <FaCircleNotch className="animate-spin" /> : <FaPlus />} 
                {saving ? "Processing..." : "Sponsor this Product"}
              </button>
            </div>
          </div>

          <div className="space-y-8">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xl font-black text-slate-900 text-center">Preview of Selection</h3>
              <SponsoredProductPreview product={selectedProduct} />
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-6 text-xl font-black text-slate-900">Current Sponsorships</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {banners.map(banner => (
                  <div key={banner.id} className="group relative rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-white hover:shadow-md">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${banner.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {banner.status}
                          </span>
                          <span className="truncate text-[8px] font-bold text-slate-400">
                            {banner.cities?.name || 'Global'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => updateStatus(banner, banner.status === 'published' ? 'paused' : 'published')} className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm hover:text-pink-600">
                          {banner.status === 'published' ? <FaPause className="text-[10px]" /> : <FaPlay className="text-[10px]" />}
                        </button>
                        <button onClick={() => handleDelete(banner)} className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm hover:bg-rose-50">
                          <FaTrashCan className="text-[10px]" />
                        </button>
                      </div>
                    </div>
                    <SponsoredProductPreview product={banner.product} />
                  </div>
                ))}
              </div>
              {banners.length === 0 && (
                <div className="py-12 text-center text-slate-400 font-bold">No products are currently sponsored.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </StaffPortalShell>
  )
}
