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
  return (
    <header className="sticky top-0 z-50 shadow-md">
      <div className="bg-black text-white">
        <div className="mx-auto max-w-7xl px-4 py-1">
          <HeaderMarquee />
        </div>
      </div>

      <div className="border-b border-white/10 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
          <Link to="/" className="flex items-center gap-3" title="Home Screen">
            <img
              src="https://goodtvrhszsnhcyigfoi.supabase.co/storage/v1/object/public/ctm_web_files/CT-Merchant.jpg"
              alt="CTMerchant Logo"
              className="h-9 w-9 rounded-lg object-cover"
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
                className="text-sm font-semibold text-white/90 transition hover:text-pink-400"
              >
                {link.label}
              </Link>
            ))}

            <Link
              to="/staff-portal"
              className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-700"
            >
              Staff Portal
            </Link>
          </nav>

          <button
            type="button"
            className="rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 lg:hidden"
          >
            Menu
          </button>
        </div>
      </div>
    </header>
  )
}

export default Navbar