import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"

const SITE_URL = "https://www.ctmerchant.com.ng"
const OUTPUT_DIR = resolve(process.cwd(), "public")
const LASTMOD = new Date().toISOString().split("T")[0]

const sitemapRoutes = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/services", changefreq: "weekly", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", changefreq: "monthly", priority: "0.8" },
  { path: "/careers", changefreq: "weekly", priority: "0.6" },
  { path: "/affiliate", changefreq: "weekly", priority: "0.7" },
  { path: "/create-account", changefreq: "weekly", priority: "0.8" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
]

const disallowRoutes = [
  "/staff-portal",
  "/staff-dashboard",
  "/staff-traffic",
  "/staff-users",
  "/staff-community",
  "/staff-verifications",
  "/staff-payments",
  "/staff-city-banners",
  "/staff-sponsored-products",
  "/staff-discoveries",
  "/staff-issue-id",
  "/staff-studio",
  "/staff-inbox",
  "/staff-security-radar",
  "/staff-products",
  "/staff-shop-content",
  "/staff-announcements",
  "/staff-notifications",
  "/user-dashboard",
  "/vendor-panel",
  "/shop-registration",
  "/remita",
  "/merchant-video-kyc",
  "/merchant-promo-banner",
  "/merchant-settings",
  "/merchant-banner",
  "/merchant-products",
  "/merchant-edit-product",
  "/merchant-add-product",
  "/service-fee",
  "/merchant-analytics",
  "/merchant-news",
  "/search",
  "/reposearch",
  "/area",
  "/cat",
  "/shop-index",
]

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function buildSitemapXml(routes) {
  const items = routes
    .map(({ path, changefreq, priority }) => {
      const url = new URL(path, SITE_URL).toString()
      return [
        "  <url>",
        `    <loc>${escapeXml(url)}</loc>`,
        `    <lastmod>${LASTMOD}</lastmod>`,
        `    <changefreq>${changefreq}</changefreq>`,
        `    <priority>${priority}</priority>`,
        "  </url>",
      ].join("\n")
    })
    .join("\n")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</urlset>",
    "",
  ].join("\n")
}

function buildRobotsTxt() {
  return [
    "User-agent: *",
    "Allow: /",
    ...disallowRoutes.map((route) => `Disallow: ${route}`),
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    `Host: ${SITE_URL.replace(/^https?:\/\//, "")}`,
    "",
  ].join("\n")
}

mkdirSync(OUTPUT_DIR, { recursive: true })
writeFileSync(resolve(OUTPUT_DIR, "sitemap.xml"), buildSitemapXml(sitemapRoutes), "utf8")
writeFileSync(resolve(OUTPUT_DIR, "robots.txt"), buildRobotsTxt(), "utf8")

console.log(`SEO files generated at ${OUTPUT_DIR}`)
