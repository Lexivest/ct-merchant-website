import { useState } from "react"
import { Link } from "react-router-dom"
import HeaderMarquee from "./HeaderMarquee"

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
      <div className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 py-1">
          <HeaderMarquee />
        </div>
      </div>

      <div className="relative border-b border-slate-200 bg-white text-slate-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-3"
            title="Home Screen"
            onClick={closeMenu}
          >
            <img
              src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/CT-Merchant.jpg"
              alt="CTMerchant Logo"
              className="h-10 w-10 rounded-lg object-cover"
            />
            <span className="text-sm font-extrabold tracking-wide md:text-base">
              CTMerchant
            </span>
          </Link>

          <nav className="hidden items-center gap-5 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm font-semibold text-slate-700 transition hover:text-pink-600"
              >
                {link.label}
              </Link>
            ))}

            <Link
              to="/staff-portal"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Staff Portal
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 lg:hidden"
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
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
            <div className="absolute inset-x-0 top-full z-50 border-t border-slate-200 bg-white px-4 py-3 shadow-xl lg:hidden">
              <nav className="flex flex-col gap-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={closeMenu}
                    className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 transition hover:bg-pink-50 hover:text-pink-600"
                  >
                    {link.label}
                  </Link>
                ))}

                <Link
                  to="/staff-portal"
                  onClick={closeMenu}
                  className="mt-2 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
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