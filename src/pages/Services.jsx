import { Link, useNavigate } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import BrandText from "../components/common/BrandText"
import PageSeo from "../components/common/PageSeo"

const services = [
  {
    title: "Business & Product Indexing",
    text: "Structured cataloging of physical shops, services, and available listings so every city has a cleaner local discovery layer.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7m-9 4v10" />
      </svg>
    ),
  },
  {
    title: "Data Accuracy Framework",
    text: "A practical review process that keeps business identity, city, area, contacts, and marketplace visibility consistent over time.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    ),
  },
  {
    title: "Availability Signaling",
    text: "Merchants can signal active inventory and active services without CTMerchant becoming an intermediary in the transaction.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 18V6m4 8V6m4 12V6m4 8V6m4 12V6" />
      </svg>
    ),
  },
  {
    title: "Catalog Management Tools",
    text: "A controlled vendor workspace for products, services, pricing, media, banners, news, and storefront presentation.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3l3 3M7 21l-4-4 11-11 4 4L7 21z" />
      </svg>
    ),
  },
  {
    title: "Merchant Enablement",
    text: "Onboarding guidance that helps real businesses publish accurate profiles, complete KYC, and remain discoverable.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 8a5 5 0 00-10 0v2H5a2 2 0 00-2 2v2a7 7 0 0014 0v-2a2 2 0 00-2-2h-2V8zm0 6h4m-2-2v4" />
      </svg>
    ),
  },
  {
    title: "Discovery Insights",
    text: "Aggregated visibility signals that help vendors understand how people find their shops, services, and listings.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m5 14V9m5 10V3m5 16v-6" />
      </svg>
    ),
  },
]

const principles = [
  "Real businesses first",
  "City and area aware",
  "No hidden transaction layer",
  "Staff-reviewed trust signals",
]

const grainTexture = {
  backgroundImage:
    'url("data:image/svg+xml,%3Csvg viewBox=%270 0 512 512%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.75%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.08%27/%3E%3C/svg%3E")',
}

function GoldDivider({ label }) {
  return (
    <div className="flex items-center gap-4 py-7 text-[#8A6A2A]">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#8A6A2A] to-transparent" />
      <span className="shrink-0 text-[0.65rem] font-black uppercase tracking-[0.32em]">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[#8A6A2A] to-transparent" />
    </div>
  )
}

function Services() {
  const navigate = useNavigate()

  const handleBack = () => {
    const ref = document.referrer.toLowerCase()

    if (ref.includes("user-dashboard") || ref.includes("merchant-dashboard")) {
      navigate("/user-dashboard?tab=services")
      return
    }

    navigate("/")
  }

  return (
    <MainLayout>
      <PageSeo
        title="CTMerchant Services | Merchant Discovery Tools"
        description="Explore CTMerchant's marketplace services for merchant indexing, product visibility, data accuracy, and discovery insights."
        canonicalPath="/services"
      />

      <style>
        {`
          @keyframes ctmServicesFadeUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>

      <section className="relative isolate min-h-screen overflow-hidden bg-[#0D0800] px-4 py-8 text-[#F5EDD8] [font-family:Georgia,serif] sm:py-12">
        <div className="pointer-events-none absolute inset-0 opacity-50" style={grainTexture} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,168,76,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(219,39,119,0.18),transparent_32%)]" />

        <div className="relative z-10 mx-auto max-w-6xl">
          <header
            className="mx-auto max-w-3xl border-b border-[#8A6A2A]/80 px-1 pb-10 pt-6 text-center opacity-0 sm:pb-12 sm:pt-10"
            style={{ animation: "ctmServicesFadeUp 900ms ease forwards" }}
          >
            <button
              type="button"
              onClick={handleBack}
              className="mx-auto mb-8 inline-flex items-center justify-center rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-4 py-2 text-[0.7rem] font-black uppercase tracking-[0.22em] text-[#E8C97A] transition hover:border-[#E8C97A] hover:bg-[#C9A84C]/20"
            >
              Back
            </button>

            <p className="mb-5 text-[0.72rem] font-black uppercase tracking-[0.38em] text-[#C9A84C]">
              Platform Capabilities
            </p>
            <h1 className="text-[clamp(2.4rem,7vw,4.8rem)] font-black leading-[0.98] tracking-tight text-[#F5EDD8]">
              Services built for <span className="font-normal italic text-[#E8C97A]">real commerce</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-[1.05rem] italic leading-8 text-[#C0A87A] sm:text-[1.18rem]">
              A refined discovery layer for city markets, verified service providers, and the everyday businesses people need to find with confidence.
            </p>
          </header>

          <main className="mx-auto max-w-5xl py-6 sm:py-9">
            <section
              className="mx-auto max-w-3xl opacity-0"
              style={{ animation: "ctmServicesFadeUp 900ms ease forwards", animationDelay: "120ms" }}
            >
              <p className="text-center text-[1.05rem] leading-9 text-[#D8C8A8] sm:text-[1.12rem]">
                <BrandText /> is not trying to replace the marketplace on the street. It organizes it. The goal is simple: help people locate trustworthy shops and service providers while giving merchants a professional digital presence they can maintain.
              </p>

              <div className="mt-8 border-l-4 border-[#C9A84C] bg-[#C9A84C]/[0.07] px-6 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] sm:px-8">
                <p className="m-0 text-[1.18rem] italic leading-8 text-[#E8C97A]">
                  The platform remains a discovery and visibility system. Customers contact businesses directly, staff protect trust signals, and city listings stay clean.
                </p>
              </div>
            </section>

            <GoldDivider label="Operating Principles" />

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {principles.map((principle, index) => (
                <div
                  key={principle}
                  className="opacity-0"
                  style={{
                    animation: "ctmServicesFadeUp 800ms ease forwards",
                    animationDelay: `${220 + index * 80}ms`,
                  }}
                >
                  <div className="h-full border border-[#C9A84C]/25 bg-[#F5EDD8]/[0.04] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.14)]">
                    <div className="mb-4 text-[0.62rem] font-black uppercase tracking-[0.32em] text-[#C9A84C]">
                      0{index + 1}
                    </div>
                    <div className="text-xl font-bold leading-7 text-[#F5EDD8]">
                      {principle}
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <GoldDivider label="Service Stack" />

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {services.map((service, index) => (
                <article
                  key={service.title}
                  className="opacity-0"
                  style={{
                    animation: "ctmServicesFadeUp 800ms ease forwards",
                    animationDelay: `${360 + index * 80}ms`,
                  }}
                >
                  <div className="group h-full border border-[#C9A84C]/25 bg-gradient-to-br from-[#C9A84C]/[0.08] to-white/[0.02] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#E8C97A]/70 hover:bg-[#C9A84C]/[0.1]">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center border border-[#C9A84C]/40 bg-[#0D0800]/70 text-[#E8C97A] transition group-hover:scale-105">
                      {service.icon}
                    </div>
                    <h2 className="text-[0.75rem] font-black uppercase tracking-[0.28em] text-[#C9A84C]">
                      {service.title}
                    </h2>
                    <p className="mt-4 text-[1rem] leading-8 text-[#D8C8A8]">
                      {service.text}
                    </p>
                  </div>
                </article>
              ))}
            </section>

            <section
              className="mt-10 border-y border-[#8A6A2A]/80 px-4 py-10 text-center opacity-0 sm:mt-14 sm:px-8 sm:py-14"
              style={{ animation: "ctmServicesFadeUp 900ms ease forwards", animationDelay: "820ms" }}
            >
              <p className="mb-4 text-[0.68rem] font-black uppercase tracking-[0.34em] text-[#C9A84C]">
                Marketplace Discipline
              </p>
              <h2 className="mx-auto max-w-3xl text-[clamp(1.9rem,5vw,3rem)] font-black leading-tight text-[#E8C97A]">
                A professional directory for shops, services, and city discovery.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-[1.04rem] leading-8 text-[#D8C8A8]">
                This design direction can be extended into other public pages, but testing it here first lets us judge readability, performance, and brand fit before a wider refactor.
              </p>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/contact"
                  className="inline-flex items-center justify-center border border-[#E8C97A] bg-[#E8C97A] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#1A0F00] transition hover:-translate-y-0.5 hover:bg-[#F5EDD8]"
                >
                  Contact Support
                </Link>
                <Link
                  to="/"
                  className="inline-flex items-center justify-center border border-[#C9A84C]/40 bg-transparent px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-[#E8C97A] transition hover:-translate-y-0.5 hover:bg-[#C9A84C]/10"
                >
                  Visit Marketplace
                </Link>
              </div>
            </section>
          </main>
        </div>
      </section>
    </MainLayout>
  )
}

export default Services
