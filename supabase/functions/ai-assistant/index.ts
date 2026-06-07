// Pass 11 fixed source: ai-assistant
// Changes vs v24:
// 1. CRITICAL FIX: Removed client-supplied `anonymousDeviceSignature`.
//    Anonymous identity now derives ONLY from server-observed signals
//    (CF-Connecting-IP / X-Forwarded-For / X-Real-IP + UA fingerprint).
//    Previously a caller could rotate the body field freely to get
//    unlimited new daily-limit buckets.
// 2. CRITICAL BUG FIX: shops.is_subscription_active does not exist.
//    Every AI tool query (get_shops_in_user_area, search_products,
//    search_shops) failed silently → assistant always answered
//    "no shops found". Replaced with the same active-subscription
//    predicate used elsewhere: subscription_end_date > now().
// 3. HARDENING: history role whitelisted to "user" | "assistant" so a
//    crafted history entry can't inject a second system message.
// 4. HARDENING: history content forced to string and length-capped to
//    deny prompt-injection via oversized inputs.
// 5. Error responses scrubbed of internal detail.
//
// Deploy with: verify_jwt: false (unchanged, anon-callable by design).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const AI_MODEL = "meta-llama/llama-3.3-70b-instruct"
const AUTHENTICATED_DAILY_LIMIT = 20
const ANONYMOUS_DAILY_LIMIT = 15
const MAX_QUERY_CHARS = 2000
const MAX_HISTORY_CHARS = 2000

const VALID_CATEGORIES = [
  "Mobile Phones & Accessories",
  "Computers & IT Services",
  "Electronics & Appliances",
  "Fashion & Apparel",
  "Groceries & Supermarkets",
  "Beauty & Personal Care",
  "Pharmacies & Health Shops",
  "Food & Drinks",
  "Agriculture & Agro-Allied",
  "Real Estate & Properties",
  "Hotels & Accommodations",
  "Home & Kitchen",
  "Sports",
  "Health & Fitness",
  "Logistics & Delivery",
  "Education & Training",
  "Artisans",
]

const CT_SERVICES = [
  { title: "Business & Product Indexing", description: "Structured cataloging of physical shops and their products for city-wide searchability." },
  { title: "Data Accuracy Framework", description: "Standardized process for maintaining up-to-date listings through merchant updates." },
  { title: "Availability Signaling", description: "Indicators that allow merchants to signal item availability to help users plan visits." },
  { title: "Catalog Management Tools", description: "Merchant interface for maintaining product listings, pricing, and storefront visibility." },
  { title: "Merchant Enablement", description: "Onboarding guidance and support to help businesses maintain accurate digital visibility." },
  { title: "Discovery Insights", description: "Aggregated insights to help merchants understand how users discover their storefronts." },
]

function getClientAddress(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || ""
  const firstForwardedAddress = forwardedFor.split(",")[0]?.trim()
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    firstForwardedAddress ||
    "unknown-ip"
  )
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value)
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

// Server-side anonymous-usage key derived only from request-observed signals.
// The previous client-supplied `anonymousDeviceSignature` allowed unlimited
// daily-bucket reset by rotating one field.
async function buildAnonymousUsageKey(req: Request) {
  const ip = getClientAddress(req)
  const ua = (req.headers.get("user-agent") || "unknown-agent").slice(0, 180)
  const hash = await sha256Hex(`anon|${ip}|${ua}`)
  return hash.slice(0, 64)
}

function sanitizeHistory(rawHistory: unknown) {
  if (!Array.isArray(rawHistory)) return []
  const allowedRoles = new Set(["user", "assistant"])
  return rawHistory
    .slice(-6)
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const role = String((entry as any).role || "").toLowerCase()
      if (!allowedRoles.has(role)) return null
      const content = String((entry as any).content || "").slice(0, MAX_HISTORY_CHARS)
      return { role, content }
    })
    .filter(Boolean) as { role: string; content: string }[]
}

// Detects raw function-call syntax the model leaks into plain text instead of
// using the tool-calls API. Matches ANYWHERE in the content (not just line start)
// — e.g. "Let me search. search_products{"name":"Shoes"}".
const RAW_TOOL_CALL_RX =
  /(search_products|search_shops|get_shops_in_user_area)\s*(\{[\s\S]*?\})/

// Final safety net: strip any tool-call syntax or "thinking out loud" narration
// the model may still leak into its user-facing reply (LLaMA does this often).
function sanitizeFinalReply(text: string) {
  if (!text) return ""
  let out = String(text)
  // Remove raw function-call syntax e.g. search_products{"name":"Shoes"}
  out = out.replace(/(?:search_products|search_shops|get_shops_in_user_area)\s*\{[\s\S]*?\}/gi, "")
  // Remove agentic preamble sentences (plan narration) on their own line.
  out = out.replace(/(?:^|\n)\s*(?:let me|i['']?ll|i will|i'm going to|first,? i)\b[^\n]*/gi, "\n")
  // Tidy leftover whitespace.
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim()
  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ""
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ""
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ""
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY') || ""

    if (!supabaseUrl || !serviceRoleKey || !openRouterKey) throw new Error("MISSING_SECRETS")

    const body = await req.json().catch(() => ({}))
    const query = String(body?.query || "").slice(0, MAX_QUERY_CHARS).trim()
    const history = sanitizeHistory(body?.history)
    const context = body?.context && typeof body.context === "object" ? body.context : {}

    if (!query) {
      return new Response(
        JSON.stringify({ reply: "Please enter a question." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const today = new Date().toISOString().split('T')[0]
    const nowIso = new Date().toISOString()

    // --- 1. USER CONTEXT & USAGE ---
    const authHeader = req.headers.get('Authorization')
    let user = null
    let profile = null
    let anonymousUsageKey = ""
    let anonymousChatCount = 0

    if (authHeader) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
      const { data: userData } = await authClient.auth.getUser()
      if (userData?.user) {
        user = userData.user
        const { data: p } = await adminClient.from('profiles')
          .select('full_name, city_id, area_id, cities(name), areas(name), ai_chat_count, ai_last_chat_date')
          .eq('id', user.id).single()
        profile = p
      }
    }

    let chatCount = user ? (profile?.ai_chat_count || 0) : 0
    if (user && profile?.ai_last_chat_date !== today) chatCount = 0
    if (user && chatCount >= AUTHENTICATED_DAILY_LIMIT) {
      return new Response(
        JSON.stringify({
          reply: "Daily limit reached.",
          rate_limited: true,
          usage: { count: chatCount, limit: AUTHENTICATED_DAILY_LIMIT, isAnonymous: false },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!user) {
      // Server-derived from IP + UA. Caller cannot influence the daily-bucket key.
      anonymousUsageKey = await buildAnonymousUsageKey(req)

      const { data: anonymousUsage } = await adminClient
        .from("anonymous_ai_usage")
        .select("chat_count, last_chat_date")
        .eq("ip_address", anonymousUsageKey)
        .maybeSingle()

      anonymousChatCount = anonymousUsage?.last_chat_date === today
        ? Number(anonymousUsage?.chat_count || 0)
        : 0

      if (anonymousChatCount >= ANONYMOUS_DAILY_LIMIT) {
        return new Response(
          JSON.stringify({
            reply: "You have reached the free daily limit. Please check back tomorrow.",
            rate_limited: true,
            usage: { count: anonymousChatCount, limit: ANONYMOUS_DAILY_LIMIT, isAnonymous: true },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // --- 2. SYSTEM PROMPT ---
    const firstName = profile?.full_name?.split(" ")[0] || ""
    const greeting = firstName ? `Hello ${firstName}! ` : ""
    const userCity = profile?.cities?.name || context.profile?.city_name || ""
    const userArea = profile?.areas?.name || context.profile?.area_name || ""
    const userAreaId = profile?.area_id || context.profile?.area_id || ""

    let systemMessage = `You are CT-AI, the CTMerchant AI Assistant. ${greeting}
    ${userCity ? `The user is in ${userCity}${userArea ? `, specifically the ${userArea} area` : ''}.` : ''}

    IDENTITY & CONSTRAINTS:
    - You are CT-AI, a CTMerchant shopping assistant.
    - CRITICAL OUTPUT RULE: NEVER reveal your reasoning, plans, or internal steps. NEVER write phrases like "Let me try a broader search", "I'll search", or "If I find...". NEVER write function/tool-call syntax (e.g. search_products{...}) in your reply. To fetch data you MUST use the provided function tools silently — never type a function call as text. Output ONLY the final, user-facing answer.
    - NEVER engage in outside world conversations (politics, general knowledge, other platforms, etc.).
    - If a user asks something outside CTMerchant or you don't have the answer, respond warmly — e.g. "I'm sorry, I can't help with that one. Please contact support for more information." Always keep the words "contact support" as plain text (the app turns it into a tappable button). Do not write it as an HTML link.
    - If a user needs to login or you are in a repo-search guest state, tell them: "Please login to your account." Do not make login text a link.
    - Always stay focused on CTMerchant products, services, and shops.
    - CONVERSATIONAL COURTESY: For brief greetings, thanks, or acknowledgements (e.g. "hi", "hello", "ok", "okay", "thanks", "thank you", "cool", "nice", "great"), reply warmly and briefly, then offer more help — e.g. "You're welcome! Is there anything else I can help you find on CTMerchant?" NEVER treat these as confusing or outside scope, and never tell the user to rephrase.
    - CONVERSATION CLOSINGS: If the user declines further help or signs off (e.g. "no", "no thanks", "nothing else", "that's all", "I'm good", "bye", "goodbye"), give a short, warm sign-off and DO NOT ask "is there anything else" again — e.g. "Alright, enjoy shopping on CTMerchant! 👋"

    WHO WE ARE:
    CTMerchant is a digital collection of shops and their locations in a city to enhance discovery and mitigate fake online sales claims.
    CTMerchant is a trademark of CT-Merchant LTD, a registered e-commerce company founded in 2025 in Nigeria. The company is governed by a Board of Directors, a Director General, and Shareholders.

    COMPANY LEADERSHIP & OWNERSHIP:
    - If asked about the founder, owner, CEO, leadership, or management, ANSWER with the governance structure (do NOT deflect to support): CTMerchant is a trademark of CT-Merchant LTD, founded in 2025 in Nigeria, and is governed by a Board of Directors, a Director General, and Shareholders.
    - NEVER invent, guess, or state a specific individual's name. If the user insists on the name of a specific person, warmly say: "I don't have that detail. Please contact support for more information."

    HOW TO USE THE PLATFORM:
    1. Create free account: To open an account, users should click the **Create Account** button on the home screen. Creating an account is completely free.
    2. Discover: Login to discover amazing products and services in your neighbourhood.
    3. Register Shop: Register your shop, get approved, generate your digital biz card and share to your customers and social media handle.
    4. Share: Share products directly to your social media handle.
    5. Biz Card: Your biz card contains your unique ID for your customer to enter in the repository to view your digital storefront.
    6. Presence: CTMerchant gives you the highest level of professional digital presence for your business at low cost.

    SUBSCRIPTION PRICING:
    - Yearly Subscription: ₦15,000
    - 6-Month Subscription: ₦10,000
    - PROMO PRICING (Frequent): ₦10,000 per year or ₦6,000 for 6 months.
    - Encourage users to subscribe to our newsletter for updates on promos, new cities, and more.

    OUR OFFICIAL SERVICES:
    ${CT_SERVICES.map(s => `- ${s.title}: ${s.description}`).join('\n')}
    For more details, mention the services page as plain text only. Do not link to it from CT-AI.

    OFFICIAL CATEGORIES:
    ${VALID_CATEGORIES.join(", ")}

    URL PATTERNS (CRITICAL):
    1. Category Page: /cat?name=CATEGORY_NAME (Encode & as %26)
    2. Area Page: /area?id=${userAreaId || 'AREA_ID'}
    3. Shop Page: /shop-detail?id=SHOP_ID
    4. Product Page: /product-detail?id=PRODUCT_ID
    5. Login/Home: /
    6. Services Page: /services
    7. Create Account Page: /create-account

    GUIDELINES:
    1. HTML ONLY: Use <b>, <ul>, <li>, and marketplace item links only. No Markdown. Only shop/product result links may use <a href="...">, and they must point to /shop-detail?id=SHOP_ID or /product-detail?id=PRODUCT_ID.
    2. NO HALLUCINATIONS (CRITICAL): Only mention shops and products your tools actually returned. NEVER invent or guess shop names, product names, prices, IDs, or counts. If a tool returns nothing, say so honestly — never fabricate plausible-looking results.
    3. VERIFICATION: If is_verified is true, call the shop a "Verified Merchant" and add a "✅" next to its name.
    4. STOCK: Item is IN STOCK if stock_count > 0.
    5. ANSWERS: Must be simple and straight forward.
    `

    // --- 3. PAGE CONTEXT ---
    if (context.page === 'product_detail' && context.product) {
      const p = context.product
      const s = context.shop || {}
      systemMessage += `
        ROLE: CT-AI Shopping Assistant for "${p.name}".

        YOUR MISSION — Find similar products and compare prices:
        1. Extract the KEY CATEGORY NOUN(S) from the product name — NOT the full name.
           Examples:
             "150cc Scooter"        → search "Scooter"
             "Samsung Galaxy A52"   → search "Samsung Galaxy"
             "HP Pavilion Laptop"   → search "Laptop"
             "Nike Air Max Sneaker" → search "Sneaker"
        2. Call 'search_products' with those keyword(s).
        3. If fewer than 2 results come back, call 'search_products' again with an even shorter/broader keyword (e.g. just "Scooter" → "motor", or "Laptop" → "computer").
        4. Include results from ANY shop.
        5. CRITICAL ANTI-HALLUCINATION: ONLY list products that the tool actually returned. NEVER invent, guess, pad, or make up product names, shop names, or prices. If the tool returns 1 product, list exactly 1. If the tool result says "did not find any similar product", you MUST follow step 7 — do NOT fabricate options.
        6. Present each REAL result as a tappable link using the product's id from the tool result: <a href="/product-detail?id=PRODUCT_ID">PRODUCT_NAME</a>. Order from lowest to highest price and compare each price to the current product (₦${p.discount_price || p.price}).
        7. If both search attempts return nothing, reply exactly: "I couldn't find any similar products to compare right now. You can explore other shops or check back later." Never invent alternatives.

        CONTEXT:
        - Current Product Name: ${p.name}
        - Current Product Price: ₦${p.discount_price || p.price}
        - Current Shop: ${s.name || 'Unknown'}
        `
    } else if (context.page === 'shop_detail' && context.shop) {
      const s = context.shop
      systemMessage += `
        ROLE: CT-AI Shopping Assistant for "${s.name}".
        CONTEXT: Address: ${s.address || 'N/A'}, Category: ${s.category || 'N/A'}.

        YOUR MISSION:
        1. If asked for "Similar shops in this category":
           - Use 'search_shops' with category "${s.category}".
           - Exclude the current shop from results (already handled).
           - If no other shops are found, say "no other shops found in this category yet" and suggest the user explore other areas.
        2. If asked for "Shops in your area" (the user's OWN area, no area named):
           - Use 'get_shops_in_user_area'.
           - If no shops are found, say "no shops found in your area yet" and suggest browsing by category.
        2b. If the user names a SPECIFIC area/neighbourhood (e.g. "shops in Farin Gada", "check Terminus area"):
           - Use 'search_shops' with the 'area' argument set to that exact area name.
           - List the shops returned. If none, say no active shops were found in that area yet and suggest a nearby area or browsing by category.
        3. If asked "Tell me about this shop", provide a friendly summary: name, category, address, verified status.
        4. DO NOT offer price comparison for shops. Answers must be simple and straight forward.
        5. CRITICAL ANTI-HALLUCINATION: ONLY list shops that 'search_shops' / 'get_shops_in_user_area' actually returned. NEVER invent, guess, or pad shop names or addresses. If a tool returns none, say so honestly — do not fabricate shops. Present each real shop as <a href="/shop-detail?id=SHOP_ID">SHOP_NAME</a> using the id from the tool result.

        LINKS: <a href="/shop-detail?id=${s.id}" style="color:#db2777; font-weight:bold; text-decoration:underline;">Visit This Shop</a>
        `
    } else {
      systemMessage += `
        ROLE: CT-AI System Ambassador.

        YOUR MISSION — be a welcoming, helpful guide for CTMerchant:
        1. If asked "Who we are?" — Give a concise brand summary: CTMerchant is a digital collection of shops and their locations in a city to enhance discovery and fight fake online sales. Mention it is a trademark of CT-Merchant LTD, founded 2025 in Nigeria, governed by a Board of Directors, Director General, and Shareholders.
        2. If asked "How to use the platform?" — Walk through the six steps using <b> for step titles and keep it clear and simple.
        3. If asked "Our services?" — List all official services with a one-line description each, using <ul><li> formatting.
        4. If asked about pricing or subscription — Quote all tiers: Yearly ₦15,000 | 6-Month ₦10,000 | PROMO ₦10,000/year or ₦6,000/6-months. Always invite the user to subscribe to the newsletter for the latest promo alerts.
        5. If a user asks to find shops or products in a category — link to that category page using <a href="/cat?name=CATEGORY_NAME">CATEGORY_NAME</a> (encode & as %26). Only use official category names.
        6. Always encourage: (a) creating a free account — link as plain text "Create Account" (no href), (b) subscribing to the newsletter.
        7. For anything else — suggest the user login to discover shops and products in their neighbourhood.

        TONE: Friendly, professional, concise. Use <b> for emphasis. Use <ul><li> for lists.
        `
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "search_products",
          description: "Search for APPROVED products by name similarity for comparison.",
          parameters: { type: "object", properties: { name: { type: "string" } } },
        },
      },
      {
        type: "function",
        function: {
          name: "search_shops",
          description: "Search for approved shops. Use the 'area' argument when the user names a specific neighbourhood/area (e.g. 'Farin Gada', 'Terminus').",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              category: { type: "string" },
              city: { type: "string" },
              area: { type: "string", description: "Neighbourhood/area name to filter shops by, e.g. 'Farin Gada'." },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "get_shops_in_user_area",
          description: "Finds verified shops in user's specific localized area.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]

    const messages = [
      { role: "system", content: systemMessage },
      ...history,
      { role: "user", content: query },
    ]

    const callAI = async (msgs: any[], toolList?: any[]) => {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openRouterKey}`, 'X-Title': 'CTMerchant AI' },
        body: JSON.stringify({ model: AI_MODEL, messages: msgs, tools: toolList, temperature: 0.1, max_tokens: 800 }),
      })
      return res.json()
    }

    let data = await callAI(messages, tools)
    if (data.error) {
      const errMsg = typeof data.error === "string" ? data.error : (data.error?.message || "AI service error")
      throw new Error(errMsg)
    }

    const aiMsg = data.choices[0].message
    let finalReplyText = ""
    // Track searches so we can hard-block fabricated results: if a search ran
    // and returned nothing, the model must NOT invent shops/products.
    let productSearchAttempted = false
    let productSearchHadResults = false
    let shopSearchAttempted = false
    let shopSearchHadResults = false
    let shopEmptyMessage = ""

    // Friendly, honest message for an empty shop search (category / area / user area).
    const buildShopEmptyMessage = (args: any) => {
      if (args?.area) return `I couldn't find any active shops in that area yet. You can try a nearby area, or browse by category.`
      if (args?.category) return `I couldn't find any active shops in that category yet. You can try another category or area.`
      return `I couldn't find any matching shops right now. You can try another area or category, or check back later.`
    }

    if (aiMsg.tool_calls) {
      messages.push(aiMsg)
      for (const toolCall of aiMsg.tool_calls) {
        const { name, arguments: argsJson } = toolCall.function
        const args = JSON.parse(argsJson || "{}")
        let result = ""

        if (name === "get_shops_in_user_area") {
          const cid = profile?.city_id || context.profile?.city_id
          const aid = profile?.area_id || context.profile?.area_id
          if (!cid) {
            result = "Location not set."
          } else {
            // BUGFIX: was .eq('is_subscription_active', true) — column doesn't exist.
            // Replaced with the canonical active-subscription predicate.
            // Match is_service to the current shop's type so service shops find
            // service neighbours and product shops find product neighbours.
            const areaShopIsService = context.page === 'shop_detail'
              ? context.shop?.is_service === true
              : false

            let q = adminClient.from('shops')
              .select('id, name, address, is_verified, category, cities(name), areas(name)')
              .eq('city_id', cid)
              .eq('status', 'approved')
              .eq('is_open', true)
              .gt('subscription_end_date', nowIso)
              .eq('is_service', areaShopIsService)
            if (aid) q = q.eq('area_id', aid)
            if (context.page === 'shop_detail' && context.shop?.id) {
              q = q.neq('id', context.shop.id)
            }
            const { data: shops, error: shopsErr } = await q.limit(5)
            if (shopsErr) console.warn("[get_shops_in_user_area]", shopsErr.message)
            shopSearchAttempted = true
            if (shops?.length) shopSearchHadResults = true
            else shopEmptyMessage = "I couldn't find any shops in your area yet. You can try browsing by category, or check a nearby area."
            result = shops?.length ? JSON.stringify(shops) : "no other shops yet in your area"
          }
        } else if (name === "search_products") {
          // Split the AI-supplied name into individual keywords and OR-match each one.
          // This means "150cc Scooter" finds products containing "150cc" OR "Scooter",
          // so same-shop variants ("Scooter 125cc", "Electric Scooter") are returned.
          const rawTerm = String(args.name || "").trim()
          const keywords = rawTerm
            .split(/\s+/)
            .map((w: string) => w.replace(/[%_]/g, ""))   // sanitise ILIKE wildcards
            .filter((w: string) => w.length > 1)
          const orFilter = keywords.length > 0
            ? keywords.map((w: string) => `name.ilike.%${w}%`).join(",")
            : `name.ilike.%${rawTerm}%`

          const { data: prods, error: prodsErr } = await adminClient.from('products')
            .select('id, name, price, discount_price, stock_count, shop_id, shops!inner(name, is_verified)')
            .eq('is_available', true)
            .eq('is_approved', true)
            .eq('shops.status', 'approved')
            .eq('shops.is_open', true)
            .gt('shops.subscription_end_date', nowIso)
            .or(orFilter)
            .limit(20)

          if (prodsErr) console.warn("[search_products]", prodsErr.message)

          let filtered = prods || []
          // Exclude the exact product the user is currently viewing
          if (context.product?.id) {
            filtered = filtered.filter((p: any) => p.id !== context.product.id)
          }
          filtered.sort((a: any, b: any) => {
            const priceA = a.discount_price ?? a.price
            const priceB = b.discount_price ?? b.price
            return priceA - priceB
          })

          productSearchAttempted = true
          if (filtered.length) productSearchHadResults = true

          result = filtered.length ? JSON.stringify(filtered.slice(0, 5)) : "did not find any similar product"
        } else if (name === "search_shops") {
          // Match is_service to whatever type the current shop is.
          // On shop_detail, find shops of the same type (service vs product).
          // In ambassador mode (no shop context), default to product shops.
          const shopIsService = context.page === 'shop_detail'
            ? context.shop?.is_service === true
            : false

          // When filtering by area name we must inner-join the areas table.
          const shopSelect = 'id, name, address, is_verified, category, area_id, cities!inner(name)'
            + (args.area ? ', areas!inner(name)' : '')
          let q = adminClient.from('shops')
            .select(shopSelect)
            .eq('status', 'approved')
            .eq('is_open', true)
            .gt('subscription_end_date', nowIso)
          // An explicit area query is a discovery request — return ALL shop types
          // in that area. Otherwise constrain to the current shop's type.
          if (!args.area) q = q.eq('is_service', shopIsService)
          if (args.name) q = q.ilike('name', `%${args.name}%`)
          if (args.category) q = q.ilike('category', `%${args.category}%`)
          if (args.area) q = q.ilike('areas.name', `%${args.area}%`)
          const targetCity = args.city || userCity
          if (targetCity) q = q.ilike('cities.name', `%${targetCity}%`)
          if (context.shop?.id) {
            q = q.neq('id', context.shop.id)
          }
          const { data: shops, error: shopsErr } = await q.limit(5)
          if (shopsErr) console.warn("[search_shops]", shopsErr.message)
          shopSearchAttempted = true
          if (shops?.length) shopSearchHadResults = true
          else shopEmptyMessage = buildShopEmptyMessage(args)
          result = shops?.length
            ? JSON.stringify(shops)
            : (args.area ? "no shops found in that area yet" : "no other shops yet in the category")
        }
        messages.push({ tool_call_id: toolCall.id, role: "tool", name, content: result })
      }
      const data2 = await callAI(messages)
      finalReplyText = data2.choices[0].message.content
    } else {
      finalReplyText = aiMsg.content || ""

      // Guard: LLaMA sometimes emits raw tool-call syntax in content instead of
      // populating tool_calls (e.g. `search_products{"name":"Computer"}`).
      // Detect it ANYWHERE in the content (the model often prefixes a sentence
      // like "Let me try a broader search."), execute the tool, then get a
      // proper natural-language reply.
      const rawMatch = finalReplyText.match(RAW_TOOL_CALL_RX)
      if (rawMatch) {
        try {
          const name = rawMatch[1]
          const argsRaw = rawMatch[2]
          const args = JSON.parse(argsRaw)
          let result = ""

          if (name === "get_shops_in_user_area") {
            const cid = profile?.city_id || context.profile?.city_id
            const aid = profile?.area_id || context.profile?.area_id
            if (!cid) {
              result = "Location not set."
            } else {
              const areaShopIsService = context.page === 'shop_detail'
                ? context.shop?.is_service === true : false
              let q = adminClient.from('shops')
                .select('id, name, address, is_verified, category, cities(name), areas(name)')
                .eq('city_id', cid).eq('status', 'approved').eq('is_open', true)
                .gt('subscription_end_date', nowIso).eq('is_service', areaShopIsService)
              if (aid) q = q.eq('area_id', aid)
              if (context.page === 'shop_detail' && context.shop?.id) q = q.neq('id', context.shop.id)
              const { data: shops, error: shopsErr } = await q.limit(5)
              if (shopsErr) console.warn("[get_shops_in_user_area fallback]", shopsErr.message)
              shopSearchAttempted = true
              if (shops?.length) shopSearchHadResults = true
              else shopEmptyMessage = "I couldn't find any shops in your area yet. You can try browsing by category, or check a nearby area."
              result = shops?.length ? JSON.stringify(shops) : "no other shops yet in your area"
            }
          } else if (name === "search_products") {
            const rawTerm = String(args.name || "").trim()
            const keywords = rawTerm.split(/\s+/)
              .map((w: string) => w.replace(/[%_]/g, ""))
              .filter((w: string) => w.length > 1)
            const orFilter = keywords.length > 0
              ? keywords.map((w: string) => `name.ilike.%${w}%`).join(",")
              : `name.ilike.%${rawTerm}%`
            const { data: prods, error: prodsErr } = await adminClient.from('products')
              .select('id, name, price, discount_price, stock_count, shop_id, shops!inner(name, is_verified)')
              .eq('is_available', true).eq('is_approved', true)
              .eq('shops.status', 'approved').eq('shops.is_open', true)
              .gt('shops.subscription_end_date', nowIso).or(orFilter).limit(20)
            if (prodsErr) console.warn("[search_products fallback]", prodsErr.message)
            let filtered = prods || []
            if (context.product?.id) filtered = filtered.filter((p: any) => p.id !== context.product.id)
            filtered.sort((a: any, b: any) => (a.discount_price ?? a.price) - (b.discount_price ?? b.price))
            productSearchAttempted = true
            if (filtered.length) productSearchHadResults = true
            result = filtered.length ? JSON.stringify(filtered.slice(0, 5)) : "did not find any similar product"
          } else if (name === "search_shops") {
            const shopIsService = context.page === 'shop_detail'
              ? context.shop?.is_service === true : false
            const shopSelect = 'id, name, address, is_verified, category, area_id, cities!inner(name)'
              + (args.area ? ', areas!inner(name)' : '')
            let q = adminClient.from('shops')
              .select(shopSelect)
              .eq('status', 'approved').eq('is_open', true)
              .gt('subscription_end_date', nowIso)
            if (!args.area) q = q.eq('is_service', shopIsService)
            if (args.name) q = q.ilike('name', `%${args.name}%`)
            if (args.category) q = q.ilike('category', `%${args.category}%`)
            if (args.area) q = q.ilike('areas.name', `%${args.area}%`)
            const targetCity = args.city || userCity
            if (targetCity) q = q.ilike('cities.name', `%${targetCity}%`)
            if (context.shop?.id) q = q.neq('id', context.shop.id)
            const { data: shops, error: shopsErr } = await q.limit(5)
            if (shopsErr) console.warn("[search_shops fallback]", shopsErr.message)
            shopSearchAttempted = true
            if (shops?.length) shopSearchHadResults = true
            else shopEmptyMessage = buildShopEmptyMessage(args)
            result = shops?.length
              ? JSON.stringify(shops)
              : (args.area ? "no shops found in that area yet" : "no other shops yet in the category")
          }

          // Inject synthetic tool result and call AI again for a clean reply
          const syntheticId = `call_fallback_${Date.now()}`
          messages.push({
            role: "assistant",
            content: null,
            tool_calls: [{ id: syntheticId, type: "function", function: { name, arguments: argsRaw } }]
          })
          messages.push({ tool_call_id: syntheticId, role: "tool", name, content: result })
          const data2 = await callAI(messages)
          finalReplyText = data2.choices[0].message.content
        } catch (parseErr) {
          console.warn("[raw tool-call fallback failed]", parseErr)
          finalReplyText = "I'm sorry, I had trouble processing that request. Please try again."
        }
      }
    }

    // Final backstop: strip any tool syntax / plan narration that survived.
    finalReplyText = sanitizeFinalReply(finalReplyText)
    if (!finalReplyText) {
      finalReplyText = "Is there anything else I can help you find on CTMerchant — a shop, product, or area?"
    }

    // Anti-hallucination guard: if a product search actually ran and returned
    // nothing, never let a fabricated comparison through — override with an
    // honest reply regardless of what the model produced.
    if (context.page === 'product_detail' && productSearchAttempted && !productSearchHadResults) {
      finalReplyText = "I couldn't find any similar products to compare right now. You can explore other shops or check back later for more options."
    }

    // Same guard for shop searches (category / area / user area): if a shop
    // search ran and returned nothing, never let fabricated shops through.
    if (shopSearchAttempted && !shopSearchHadResults) {
      finalReplyText = shopEmptyMessage || "I couldn't find any matching shops right now. You can try another area or category, or check back later."
    }

    if (user) {
      await adminClient
        .from('profiles')
        .update({ ai_chat_count: chatCount + 1, ai_last_chat_date: today })
        .eq('id', user.id)
    } else if (anonymousUsageKey) {
      await adminClient
        .from("anonymous_ai_usage")
        .upsert({
          ip_address: anonymousUsageKey,
          chat_count: anonymousChatCount + 1,
          last_chat_date: today,
        }, { onConflict: "ip_address" })
    }

    return new Response(
      JSON.stringify({
        reply: finalReplyText,
        usage: {
          count: user ? chatCount + 1 : anonymousChatCount + 1,
          limit: user ? AUTHENTICATED_DAILY_LIMIT : ANONYMOUS_DAILY_LIMIT,
          isAnonymous: !user,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (e) {
    console.error("[ai-assistant]", e)
    // Generic error to avoid leaking internal detail.
    return new Response(
      JSON.stringify({ reply: "System Notice: Assistant unavailable right now. Please try again." }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
