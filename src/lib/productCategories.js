import { SERVICE_CATEGORY_ROWS, filterShopCategoriesForSelect, isServiceCategory } from "./serviceCategories";

const PRODUCT_CATEGORY_SEED = [
  { name: "Mobile Phones & Accessories", groupKey: "tech", sortOrder: 10 },
  { name: "Computers & IT Services", groupKey: "tech", sortOrder: 20 },
  { name: "Electronics & Appliances", groupKey: "tech", sortOrder: 30 },
  { name: "Fashion & Apparel", groupKey: "fashion", sortOrder: 40 },
  { name: "Groceries & Supermarkets", groupKey: "consumables", sortOrder: 50 },
  { name: "Beauty & Personal Care", groupKey: "consumables", sortOrder: 60 },
  { name: "Pharmacies & Health Shops", groupKey: "consumables", sortOrder: 70 },
  { name: "Food & Drinks", groupKey: "consumables", sortOrder: 80 },
  { name: "Agriculture & Agro-Allied", groupKey: "consumables", sortOrder: 90 },
  { name: "Real Estate & Properties", groupKey: "property", sortOrder: 100 },
  { name: "Hotels & Accommodations", groupKey: "property", sortOrder: 110 },
  { name: "Home & Kitchen", groupKey: "general", sortOrder: 120 },
  { name: "Sports", groupKey: "general", sortOrder: 130 },
  { name: "Health & Fitness", groupKey: "general", sortOrder: 140 },
  { name: "Logistics & Delivery", groupKey: "general", sortOrder: 150 },
  { name: "Education & Training", groupKey: "general", sortOrder: 160 },
  { name: "Artisans", groupKey: "general", sortOrder: 170 },
];

const CATEGORY_GROUPS = {
  tech: ["Mobile Phones & Accessories", "Computers & IT Services", "Electronics & Appliances"],
  fashion: ["Fashion & Apparel"],
  consumables: [
    "Groceries & Supermarkets",
    "Beauty & Personal Care",
    "Pharmacies & Health Shops",
    "Food & Drinks",
    "Agriculture & Agro-Allied",
  ],
  property: ["Real Estate & Properties", "Hotels & Accommodations"],
};

const FALLBACK_GROUP_BY_NAME = new Map(
  [...PRODUCT_CATEGORY_SEED, ...SERVICE_CATEGORY_ROWS].map((row) => [row.name.trim().toLowerCase(), row.groupKey]),
);

function normalizeName(value) {
  return String(value || "").trim();
}

function normalizeGroupKey(value, name) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue) return normalizedValue;
  return FALLBACK_GROUP_BY_NAME.get(name.trim().toLowerCase()) || "general";
}

export function normalizeProductCategoryRows(rows = []) {
  const unique = new Map();

  rows.forEach((row, index) => {
    const name = normalizeName(typeof row === "string" ? row : row?.name);
    if (!name || name.toLowerCase() === "other") return;

    const sortOrder = Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : index;
    const normalized = {
      name,
      groupKey: normalizeGroupKey(row?.group_key, name),
      sortOrder,
    };

    unique.set(name.toLowerCase(), normalized);
  });

  return Array.from(unique.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.name.localeCompare(b.name);
  });
}

export const fallbackProductCategoryRows = normalizeProductCategoryRows(
  PRODUCT_CATEGORY_SEED,
);

export async function loadProductCategoryRows(supabaseClient) {
  const primary = await supabaseClient
    .from("product_categories")
    .select("name, group_key, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!primary.error && primary.data?.length) {
    return normalizeProductCategoryRows(filterShopCategoriesForSelect(primary.data));
  }

  const legacy = await supabaseClient.from("categories").select("name").order("name", { ascending: true });
  if (!legacy.error && legacy.data?.length) {
    return normalizeProductCategoryRows(filterShopCategoriesForSelect(legacy.data));
  }

  return fallbackProductCategoryRows;
}

export function toProductCategoryOptions(rows = [], currentCategory = "") {
  const normalizedRows = normalizeProductCategoryRows(rows.length > 0 ? rows : fallbackProductCategoryRows);
  const values = normalizedRows.map((row) => row.name);
  const current = normalizeName(currentCategory);

  if (current && !values.some((value) => value.toLowerCase() === current.toLowerCase())) {
    values.push(current);
  }

  return values
    .filter((value) => value.toLowerCase() !== "other" && !isServiceCategory(value))
    .map((value) => ({ value, label: value }));
}

export function toServiceCategoryOptions(currentCategory = "") {
  const values = SERVICE_CATEGORY_ROWS.map((row) => row.name);
  const current = normalizeName(currentCategory);

  if (current && isServiceCategory(current) && !values.some((value) => value.toLowerCase() === current.toLowerCase())) {
    values.push(current);
  }

  return values.map((value) => ({ value, label: value }));
}

export function resolveProductCategoryGroup(category, rows = []) {
  const normalizedName = normalizeName(category).toLowerCase();
  if (!normalizedName) return "general";

  const normalizedRows = normalizeProductCategoryRows(rows.length > 0 ? rows : fallbackProductCategoryRows);
  const match = normalizedRows.find((row) => row.name.toLowerCase() === normalizedName);
  return match?.groupKey || FALLBACK_GROUP_BY_NAME.get(normalizedName) || "general";
}

export { CATEGORY_GROUPS };
