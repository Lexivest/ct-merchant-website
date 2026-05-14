import { useState } from "react"
import { Link, NavLink } from "react-router-dom"
import ScrollingTicker from "./ScrollingTicker"
import StableImage from "./StableImage"

// --- LOCAL ASSET IMPORT ---
import ctmLogo from "../../assets/images/logo.jpg"

function MarketPulseTicker() {
  const cities = ["Jos", "Kaduna", "Lokoja", "Minna", "Asaba", "Enugu", "Makurdi"]
  const message = "city commerce - discover business and offerings in your neighbourhood before you step out - bridging the gap between digital convenience and physical reality"
  const tickerText = `${cities.join("  |  ").toUpperCase()}  |  ${message.toUpperCase()}`

  return (
    <div className="border-b border-[#C9A84C]/25 bg-[#0D0800] py-2.5 text-[#F7EED8]">
      <div className="mx-auto flex max-w-7xl items-center px-4">
        <div className="mr-4 flex shrink-0 items-center gap-2 border-r border-[#C9A84C]/25 pr-4">
          <div className="flex h-[12px] w-[18px] flex-col overflow-hidden rounded-[2px] border border-white/20">
            <div className="flex-1 bg-green-600" />
            <div className="flex-1 bg-white" />
            <div className="flex-1 bg-green-600" />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#F2DCA4]">
            NG
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <ScrollingTicker
            text={tickerText}
            textClassName="font-serif text-[11px] font-semibold uppercase tracking-[0.28em] text-[#F2DCA4]"
            speedFactor={0.15}
          />
        </div>
      </div>
    </div>
  )
}

const navLinks = [
  { label: "Home", to: "/" },
  { label: "About", to: "/about", preload: () => import("../../pages/About") },
  { label: "Services", to: "/services", preload: () => import("../../pages/Services") },
  { label: "Affiliate", to: "/affiliate", preload: () => import("../../pages/Affiliate") },
  { label: "Careers", to: "/careers", preload: () => import("../../pages/Careers") },
  { label: "Contact", to: "/contact", preload: () => import("../../pages/Contact") },
]

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  const closeMenu = () => setMobileOpen(false)

  return (
    <header className="sticky top-0 z-50 shadow-md">
      <MarketPulseTicker />

      <div className="relative border-b border-pink-200 bg-white text-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-1.5 md:gap-4 md:py-2">
          
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 md:gap-3"
            title="Home Screen"
            onClick={closeMenu}
          >
            {/* Adjusted logo size: 8x8 on mobile, 10x10 on desktop */}
            <StableImage
              src={ctmLogo}
              alt="CTMerchant Logo"
              containerClassName="h-7 w-7 rounded-lg md:h-8 md:w-8"
              className="h-full w-full object-cover"
              loading="eager"
              fetchPriority="high"
            />
            {/* Value Proposition Text */}
            <span className="truncate text-xs font-extrabold tracking-wide text-slate-900 md:text-sm">
              Best Deals Near You!
            </span>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === "/"}
                onPointerEnter={link.preload}
                className={({ isActive }) =>
                  `text-sm no-underline transition ${
                    isActive
                      ? "font-extrabold text-pink-600"
                      : "font-semibold text-slate-700 hover:text-pink-600"
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}

            <Link
              to="/staff-portal"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white no-underline shadow-sm transition hover:bg-slate-800"
            >
              Staff Portal
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 lg:hidden"
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
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/"}
                    onClick={closeMenu}
                    onPointerEnter={link.preload}
                    className={({ isActive }) =>
                      `rounded-xl px-3 py-3 text-sm no-underline transition ${
                        isActive
                          ? "bg-pink-50 font-extrabold text-pink-600"
                          : "font-semibold text-slate-700 hover:bg-pink-50 hover:text-pink-600"
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
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
