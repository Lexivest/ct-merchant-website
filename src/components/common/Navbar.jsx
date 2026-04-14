import { useState } from "react"
import { Link } from "react-router-dom"
import { FaChartLine } from "react-icons/fa6"
import ScrollingTicker from "./ScrollingTicker"

// --- LOCAL ASSET IMPORT ---
import ctmLogo from "../../assets/images/logo.jpg"

function MarketPulseTicker() {
  const stats = [
    { label: "Active Shops", value: "1,240+", trend: "+12%" },
    { label: "Verified Products", value: "8,500+", trend: "+5%" },
    { label: "Market Activity", value: "High", trend: "Steady" },
    { label: "City: Jos", value: "Active", trend: "+8%" },
    { label: "City: Kaduna", value: "Growing", trend: "+15%" },
    { label: "City: Abuja", value: "Hub", trend: "+20%" },
  ]

  const tickerText = stats
    .map((s) => `${s.label.toUpperCase()}: ${s.value} (${s.trend})`)
    .join("  |  ")

  return (
    <div className="bg-slate-950 py-2.5 text-white">
      <div className="mx-auto flex max-w-7xl items-center px-4">
        <div className="mr-4 flex shrink-0 items-center gap-2 border-r border-white/20 pr-4 text-[10px] font-black uppercase tracking-tighter text-emerald-400">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Live Market Pulse
        </div>
        <div className="min-w-0 flex-1">
          <ScrollingTicker
            text={tickerText}
            textClassName="text-xs font-mono font-bold tracking-wider text-slate-300"
            speedFactor={0.15}
          />
        </div>
        <div className="ml-4 hidden shrink-0 items-center gap-2 text-[10px] font-black uppercase text-pink-500 md:flex">
          <FaChartLine />
          Index: CT-240
        </div>
      </div>
    </div>
  )
}

const navLinks = [
  { label: "Home", to: "/" },
  { label: "About", to: "/about" },
  { label: "Services", to: "/services" },
  { label: "Affiliate", to: "/affiliate" },
  { label: "Careers", to: "/careers" },
  { label: "Contact", to: "/contact" },
]

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMenu = () => setMobileOpen(false)

  return (
    <header className="sticky top-0 z-50 shadow-md">
      <MarketPulseTicker />

      <div className="relative border-b-2 border-pink-200 bg-white text-slate-800">
        {/* Adjusted padding: py-2 on mobile, py-3 on desktop */}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 md:gap-4 md:py-3">
          
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 md:gap-3"
            title="Home Screen"
            onClick={closeMenu}
          >
            {/* Adjusted logo size: 8x8 on mobile, 10x10 on desktop */}
            <img
              src={ctmLogo}
              alt="CTMerchant Logo"
              className="h-8 w-8 rounded-lg object-cover md:h-10 md:w-10"
            />
            {/* Value Proposition Text */}
            <span className="truncate text-sm font-extrabold tracking-wide text-slate-900 md:text-base">
              Best Deals Near You!
            </span>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-semibold text-slate-700 no-underline transition hover:text-pink-600"
              >
                {link.label}
              </Link>
            ))}

            <Link
              to="/staff-portal"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white no-underline shadow-sm transition hover:bg-slate-800"
            >
              Staff Portal
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 md:py-2 lg:hidden"
            aria-label="Toggle mobile menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-5 w-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {mobileOpen && (
          <>
            <button
              type="button"
              onClick={closeMenu}
              className="fixed inset-0 z-40 bg-black/30 lg:hidden"
              aria-label="Close mobile menu overlay"
            />
            <div className="absolute inset-x-0 top-full z-50 border-t border-pink-100 bg-white px-4 py-3 shadow-xl lg:hidden">
              <nav className="flex flex-col gap-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={closeMenu}
                    className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 no-underline transition hover:bg-pink-50 hover:text-pink-600"
                  >
                    {link.label}
                  </Link>
                ))}

                <Link
                  to="/staff-portal"
                  onClick={closeMenu}
                  className="mt-2 inline-flex items-center justify-center rounded-xl bg-slate-900 px-3 py-3 text-sm font-bold text-white no-underline transition hover:bg-slate-800"
                >
                  Staff Portal
                </Link>
              </nav>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

export default Navbar