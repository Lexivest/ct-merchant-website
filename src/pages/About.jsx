import { useNavigate, useSearchParams } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import BrandText from "../components/common/BrandText"
import PageSeo from "../components/common/PageSeo"

const grainTexture = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg viewBox=%270 0 512 512%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.75%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.08%27/%3E%3C/svg%3E")',
}

const identityCards = [
  {
    eyebrow: "Vision",
    title: "A trusted map of local commerce",
    text: "To serve as a definitive digital architecture for urban commercial discovery, making physical storefronts and service providers accessible to modern consumers.",
  },
  {
    eyebrow: "Mission",
    title: "Structure, verify, and expose real businesses",
    text: "To deploy a location-aware repository that gives merchants professional visibility while preserving direct merchant-customer relationships.",
  },
]

const departments = [
  { tier: "Governing Body", title: "Board of Directors" },
  { tier: "Director General", title: "Chief Executive Officer" },
  { tier: "Operations Management", title: "Chief Operating Officer" },
  { tier: "Technology", title: "ICT & Engineering", subRole: "Developers & Support" },
  { tier: "Finance", title: "Finance & Accounts" },
  { tier: "Field Operations", title: "Regional Operations", subRole: "City Administrators" },
  { tier: "Growth", title: "Marketing Directorate", subRole: "Field Marketers" },
]

function GoldDivider({ label }) {
  return (
    <div className="flex items-center gap-4 py-7 text-[#C9A84C]">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#C9A84C] to-transparent" />
      <span className="shrink-0 text-[0.65rem] font-black uppercase tracking-[0.32em]">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#C9A84C] to-transparent" />
    </div>
  )
}

function AboutIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
    </svg>
  )
}

function OrgCard({ tier, title, subRole, index }) {
  return (
    <article
      className="opacity-0"
      style={{
        animation: "ctmAboutFadeUp 760ms ease forwards",
        animationDelay: `${260 + index * 70}ms`,
      }}
    >
      <div className="h-full border border-[#C9A84C]/25 bg-[#F5EDD8]/[0.045] p-5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.14)] transition hover:-translate-y-1 hover:border-[#E8C97A]/70">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center border border-[#C9A84C]/40 bg-[#0D0800]/70 text-[#E8C97A]">
          <AboutIcon />
        </div>
        <div className="text-[0.62rem] font-black uppercase tracking-[0.28em] text-[#C9A84C]">
          {tier}
        </div>
        <h3 className="mt-3 text-xl font-black leading-7 text-[#F5EDD8]">
          {title}
        </h3>
        {subRole ? (
          <p className="mt-3 border-t border-[#C9A84C]/20 pt-3 text-sm font-bold text-[#F0E4C8]">
            {subRole}
          </p>
        ) : null}
      </div>
    </article>
  )
}

function About() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const handleBack = () => {
    if (searchParams.get("src") === "dash") {
      navigate("/user-dashboard?tab=services", { replace: true })
      return
    }

    navigate("/", { replace: true })
  }

  return (
    <MainLayout>
      <PageSeo
        title="About CTMerchant | Company Profile"
        description="Learn how CTMerchant organizes verified physical shops, products, and services into a trusted local discovery network."
        canonicalPath="/about"
      />

      <style>
        {`
          @keyframes ctmAboutFadeUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      <section className="relative isolate min-h-screen overflow-hidden bg-[#0D0800] px-4 py-8 text-[#F5EDD8] [font-family:Georgia,serif] sm:py-12">
        <div className="pointer-events-none absolute inset-0 opacity-50" style={grainTexture} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,168,76,0.2),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(29,78,216,0.18),transparent_34%)]" />

        <div className="relative z-10 mx-auto max-w-6xl">
          <header
            className="mx-auto max-w-3xl border-b border-[#C9A84C]/70 px-1 pb-10 pt-6 text-center opacity-0 sm:pb-12 sm:pt-10"
            style={{ animation: "ctmAboutFadeUp 900ms ease forwards" }}
          >
            <button
              type="button"
              onClick={handleBack}
              className="mx-auto mb-8 inline-flex items-center justify-center rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2 text-[0.7rem] font-black uppercase tracking-[0.22em] text-[#E8C97A] transition hover:border-[#E8C97A] hover:bg-[#C9A84C]/20"
            >
              Back
            </button>

            <p className="mb-5 text-[0.72rem] font-black uppercase tracking-[0.38em] text-[#C9A84C]">
              Corporate Profile
            </p>
            <h1 className="text-[clamp(2.4rem,7vw,4.8rem)] font-black leading-[0.98] tracking-tight text-[#F5EDD8]">
              About <span className="font-normal italic text-[#E8C97A]"><BrandText /></span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[1.05rem] italic leading-8 text-[#F2DCA4] sm:text-[1.18rem]">
              Bridging localized commerce and digital accessibility across Nigeria's urban centers.
            </p>
          </header>

          <main className="mx-auto max-w-5xl py-6 sm:py-9">
            <section
              className="mx-auto max-w-3xl opacity-0"
              style={{ animation: "ctmAboutFadeUp 900ms ease forwards", animationDelay: "120ms" }}
            >
              <div className="border-l-4 border-[#C9A84C] bg-[#C9A84C]/[0.075] px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:px-8">
                <p className="m-0 text-[1.12rem] leading-9 text-[#F0E4C8]">
                  <BrandText /> is a specialized information technology company building critical data infrastructure for local trade ecosystems. We translate real business locations, listings, and service providers into a structured discovery experience.
                </p>
              </div>
            </section>

            <GoldDivider label="Identity" />

            <section className="grid gap-5 md:grid-cols-2">
              {identityCards.map((card, index) => (
                <article
                  key={card.eyebrow}
                  className="opacity-0"
                  style={{
                    animation: "ctmAboutFadeUp 800ms ease forwards",
                    animationDelay: `${220 + index * 100}ms`,
                  }}
                >
                  <div className="h-full border border-[#C9A84C]/25 bg-gradient-to-br from-[#C9A84C]/[0.09] to-white/[0.025] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.14)]">
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.3em] text-[#C9A84C]">
                      {card.eyebrow}
                    </p>
                    <h2 className="mt-4 text-2xl font-black leading-tight text-[#E8C97A]">
                      {card.title}
                    </h2>
                    <p className="mt-4 text-[1rem] leading-8 text-[#F0E4C8]">
                      {card.text}
                    </p>
                  </div>
                </article>
              ))}
            </section>

            <GoldDivider label="Institutional Profile" />

            <section
              className="opacity-0"
              style={{ animation: "ctmAboutFadeUp 900ms ease forwards", animationDelay: "420ms" }}
            >
              <div className="border border-[#C9A84C]/25 bg-[#F5EDD8]/[0.045] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:p-8">
                <div className="mb-6 flex h-12 w-12 items-center justify-center border border-[#C9A84C]/40 bg-[#0D0800]/70 text-[#E8C97A]">
                  <AboutIcon />
                </div>
                <div className="space-y-5 text-[1.03rem] leading-9 text-[#F0E4C8]">
                  <p>
                    Our operational framework prioritizes <strong className="text-[#F5EDD8]">data accuracy</strong>, <strong className="text-[#F5EDD8]">merchant verification</strong>, and <strong className="text-[#F5EDD8]">discovery optimization</strong>. The goal is to reduce friction in local commerce while keeping the traditional merchant-customer relationship intact.
                  </p>
                  <p>
                    <BrandText /> operates strictly as a neutral information repository. We remain independent of financial settlements and logistics so the platform can focus on search quality, identity integrity, and trustworthy local visibility.
                  </p>
                </div>
              </div>
            </section>

            <section
              className="mt-6 border border-[#C9A84C]/30 bg-[#C9A84C]/[0.075] p-6 opacity-0 sm:p-8"
              style={{ animation: "ctmAboutFadeUp 900ms ease forwards", animationDelay: "520ms" }}
            >
              <p className="text-[0.68rem] font-black uppercase tracking-[0.3em] text-[#C9A84C]">
                Legal Registration
              </p>
              <p className="mt-4 text-[1rem] leading-8 text-[#F0E4C8]">
                CT-MERCHANT LTD is registered with the Corporate Affairs Commission (CAC) of Nigeria under the Companies and Allied Matters Act 2020 (CAMA), RC Number 8879163.
              </p>
              <p className="mt-4 text-[1rem] leading-8 text-[#F0E4C8]">
                The company is registered with Dun & Bradstreet (D&B) and assigned a Data Universal Numbering System (DUNS) number.
              </p>
            </section>

            <GoldDivider label="Organizational Structure" />

            <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {departments.map((department, index) => (
                <OrgCard
                  key={`${department.tier}-${department.title}`}
                  index={index}
                  tier={department.tier}
                  title={department.title}
                  subRole={department.subRole}
                />
              ))}
            </section>
          </main>
        </div>
      </section>
    </MainLayout>
  )
}

export default About
