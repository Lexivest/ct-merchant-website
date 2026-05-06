export const SERVICE_CATEGORY_GROUPS = [
  {
    key: "home-repairs",
    title: "Home & Property Repairs",
    description: "Trusted hands for repairs, installations, and home maintenance.",
    categories: [
      "Plumbing & Borehole Services",
      "Electrical Wiring & Fault Tracing",
      "AC & Refrigerator Technicians",
      "POP Ceiling Design & Installation",
      "Carpentry & Furniture Making",
      "Fumigation & Pest Control",
      "Office, Industrial & Home Cleaning",
      "Waste Management",
    ],
  },
  {
    key: "power-security",
    title: "Power, Solar & Security",
    description: "Power backup, surveillance, and safety installation services.",
    categories: [
      "Solar & Inverter Installation",
      "CCTV & Security System Setup",
      "Car Security & Tracking",
    ],
  },
  {
    key: "devices-auto",
    title: "Device & Auto Services",
    description: "Repairs, mobility, car care, and technical support.",
    categories: [
      "Phone & Tablet Repair",
      "Laptop & Computer Repair",
      "Auto Mechanic",
      "Driving Schools",
      "Car Hire",
    ],
  },
  {
    key: "food-events",
    title: "Food, Events & Hospitality",
    description: "Food spots, event support, and celebration services.",
    categories: [
      "Shawarma & Pizza Spots",
      "Catering, Event Planning & Decorations",
      "DJ & Sound System Rental",
      "Suya & Kilishi Spots",
      "Bakeries & Confectioneries",
      "Grill & Barbecue Spots",
      "Photography & Videography",
    ],
  },
  {
    key: "fashion-lifestyle",
    title: "Fashion, Beauty & Lifestyle",
    description: "Personal care, fashion, grooming, and daily convenience.",
    categories: [
      "Laundry & Dry Cleaning",
      "Tailoring & Fashion Design",
      "Hair Styling & Wig Making",
    ],
  },
  {
    key: "education-training",
    title: "Education & Training",
    description: "Learning support, exam preparation, and skills development.",
    categories: [
      "Tutorial Centers (JAMB, WAEC & NECO Prep)",
      "Home Tutors",
      "School of Health",
      "Language Training Centers",
    ],
  },
  {
    key: "health-wellness",
    title: "Health & Wellness",
    description: "Clinics, diagnostics, wellness, and health support services.",
    categories: [
      "Dental Clinics & Services",
      "Eye Care & Ophthalmology",
      "Pharmacy & Chemist Services",
      "Herbal & Traditional Medicine",
      "Medical Laboratories & Diagnostics",
      "Physiotherapy & Massage Therapy",
    ],
  },
  {
    key: "logistics-essential",
    title: "Logistics & Essential Services",
    description: "Movement, printing, and practical services for daily work.",
    categories: [
      "Dispatch & Delivery Riders",
      "Printing Services",
    ],
  },
  {
    key: "counseling-welfare",
    title: "Counseling, Welfare & Relationships",
    description: "Private support for family, career, welfare, and relationships.",
    categories: [
      "Matchmaking & Matrimonial Services",
      "Marriage & Relationship Counseling",
      "Mental Health & Psychological Therapy",
      "Career & Educational Counseling",
      "Guardian & Child Welfare Services",
      "Spiritual & Pastoral Counseling",
    ],
  },
]

export const SERVICE_CATEGORY_ROWS = SERVICE_CATEGORY_GROUPS.flatMap((group, groupIndex) =>
  group.categories.map((name, categoryIndex) => ({
    name,
    groupKey: "services",
    serviceGroupKey: group.key,
    serviceGroupTitle: group.title,
    sortOrder: 1000 + groupIndex * 100 + categoryIndex,
  })),
)

const SERVICE_CATEGORY_MAP = new Map(
  SERVICE_CATEGORY_ROWS.map((row) => [row.name.trim().toLowerCase(), row]),
)

export function normalizeServiceCategoryName(value) {
  return String(value || "").trim()
}

export function isServiceCategory(value) {
  return SERVICE_CATEGORY_MAP.has(normalizeServiceCategoryName(value).toLowerCase())
}

export function getServiceCategoryMeta(value) {
  return SERVICE_CATEGORY_MAP.get(normalizeServiceCategoryName(value).toLowerCase()) || null
}

export function getAllServiceCategoryNames() {
  return SERVICE_CATEGORY_ROWS.map((row) => row.name)
}

export function mergeServiceCategoryRows(rows = []) {
  const merged = new Map()

  rows.forEach((row, index) => {
    const name = normalizeServiceCategoryName(typeof row === "string" ? row : row?.name)
    if (!name || name.toLowerCase() === "other") return

    merged.set(name.toLowerCase(), {
      ...row,
      name,
      groupKey: row?.groupKey || row?.group_key || row?.groupKey || "general",
      sortOrder: Number.isFinite(Number(row?.sortOrder ?? row?.sort_order))
        ? Number(row.sortOrder ?? row.sort_order)
        : index,
    })
  })

  SERVICE_CATEGORY_ROWS.forEach((row) => {
    if (!merged.has(row.name.toLowerCase())) {
      merged.set(row.name.toLowerCase(), row)
    }
  })

  return Array.from(merged.values()).sort((a, b) => {
    const aService = isServiceCategory(a.name)
    const bService = isServiceCategory(b.name)

    if (aService !== bService) return aService ? 1 : -1

    const aOrder = Number.isFinite(Number(a.sortOrder ?? a.sort_order))
      ? Number(a.sortOrder ?? a.sort_order)
      : 0
    const bOrder = Number.isFinite(Number(b.sortOrder ?? b.sort_order))
      ? Number(b.sortOrder ?? b.sort_order)
      : 0

    if (aOrder !== bOrder) return aOrder - bOrder
    return String(a.name || "").localeCompare(String(b.name || ""))
  })
}

export function mergeServiceCategoriesForSelect(rows = []) {
  return mergeServiceCategoryRows(rows).map((row) => ({ name: row.name }))
}

export function isActiveMarketplaceShop(shop, cityId = null, now = new Date()) {
  if (!shop) return false
  if (cityId && String(shop.city_id) !== String(cityId)) return false
  if (shop.status && String(shop.status).toLowerCase() !== "approved") return false
  if (shop.is_verified !== true) return false
  if (shop.is_open !== true) return false

  const subscriptionEndDate = shop.subscription_end_date
    ? new Date(shop.subscription_end_date)
    : null

  return Boolean(subscriptionEndDate && subscriptionEndDate > now)
}

export function getServiceProviderImage(shop, products = []) {
  if (shop?.image_url) return shop.image_url
  if (shop?.storefront_url) return shop.storefront_url

  const productWithImage = products.find((product) => product?.image_url)
  return productWithImage?.image_url || ""
}
