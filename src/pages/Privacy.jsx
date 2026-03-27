import { Link, useNavigate, useSearchParams } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import PageSeo from "../components/common/PageSeo"

function Privacy() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const handleBack = () => {
    if (searchParams.get("src") === "dash") {
      navigate("/user-dashboard?tab=services")
      return
    }

    navigate("/")
  }

  return (
    <MainLayout>
      <PageSeo
        title="Privacy Policy | CTMerchant"
        description="Read how CTMerchant collects, uses, and protects user and merchant data across the platform."
        canonicalPath="/privacy"
      />
      <section className="bg-pink-50 px-4 py-5 md:py-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm">
            <div className="rounded-[24px] border border-pink-100 bg-white">
              <div className="border-b border-pink-100 bg-slate-950 px-5 py-4 text-white md:px-6">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-pink-600"
                    aria-label="Go back"
                  >
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
                        d="M15 18l-6-6 6-6"
                      />
                    </svg>
                  </button>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-pink-300">
                      Legal
                    </p>
                    <h1 className="text-xl font-extrabold md:text-2xl">
                      Privacy Policy
                    </h1>
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-7">
                <div className="rounded-2xl border border-pink-200 bg-pink-50 p-5 md:p-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-600 text-white shadow-sm">
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
                          d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
                        />
                      </svg>
                    </div>

                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
                        Data Protection Commitment
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 md:text-[15px]">
                        This policy explains how CTMerchant collects, uses, and
                        protects personal information in compliance with the
                        Nigeria Data Protection Regulation (NDPR) and relevant
                        platform requirements.
                      </p>
                      <p className="mt-3 text-sm font-extrabold text-slate-900">
                        Last Updated: March 2026
                      </p>
                    </div>
                  </div>
                </div>

                <PolicyCard
                  title="1. Introduction"
                  icon={
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
                        d="M4 19.5A2.5 2.5 0 016.5 17H20"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    CTMerchant (“we”, “our”, or “us”) operates a digital
                    repository that lists physical shops, products, and
                    locations for discovery and informational purposes only.
                    This Privacy Policy describes how personal data is handled
                    when you use our web and mobile platforms.
                  </p>
                </PolicyCard>

                <PolicyCard
                  title="2. Information We Collect"
                  icon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <ellipse cx="12" cy="5" rx="8" ry="3" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    We collect limited information necessary to operate and
                    improve the platform securely, including:
                  </p>

                  <ul className="mt-4 space-y-4">
                    <ListItem
                      title="Account Information"
                      text="Name, email address, phone number, and authentication data used to access the platform, including third-party sign-in where applicable."
                    />
                    <ListItem
                      title="Business Data"
                      text="Shop listings, physical addresses, coordinates, and product details voluntarily provided by merchants."
                    />
                    <ListItem
                      title="Technical Data"
                      text="IP addresses, device types, and usage information used strictly for security profiling, abuse prevention, and platform reliability."
                    />
                    <ListItem
                      title="AI Interactions"
                      text="Non-sensitive prompts and usage interactions submitted to our AI Assistant to support discovery features and improve service quality."
                    />
                  </ul>
                </PolicyCard>

                <PolicyCard
                  title="3. How We Use Information"
                  icon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1 .6 1.65 1.65 0 00-.33 1V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-.33-1A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-.6-1 1.65 1.65 0 00-1-.33H3a2 2 0 110-4h.09a1.65 1.65 0 001-.33A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 008 4.6a1.65 1.65 0 001-.6 1.65 1.65 0 00.33-1V3a2 2 0 114 0v.09a1.65 1.65 0 00.33 1A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 8c0 .39.14.76.39 1.04.28.3.65.5 1.06.55H21a2 2 0 110 4h-.09c-.41.05-.78.25-1.06.55-.25.28-.39.65-.39 1.04z"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    We use collected information solely to:
                  </p>

                  <ul className="mt-4 space-y-4">
                    <SimpleItem text="Provide, secure, and maintain the digital repository." />
                    <SimpleItem text="Display accurate shop listings, product information, and map locations." />
                    <SimpleItem text="Enable direct communication between users and listed businesses through external channels such as WhatsApp or phone." />
                    <SimpleItem text="Enforce community rules, detect abuse, and block malicious access." />
                  </ul>

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-extrabold leading-7 text-slate-900">
                      Important: CTMerchant does not use personal data for
                      payment processing, credit decisions, or direct financial
                      transactions.
                    </p>
                  </div>
                </PolicyCard>

                <PolicyCard
                  title="4. Cookies & Local Storage"
                  icon={
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
                        d="M21 12a9 9 0 11-9-9c0 1.66 1.34 3 3 3s3-1.34 3-3c1.66 0 3 1.34 3 3 0 1.1-.9 2-2 2s-2 .9-2 2 .9 2 2 2h2z"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    CTMerchant uses local storage and related browser-based
                    technologies to improve performance, reduce repeated data
                    loads, and support limited usage controls for certain
                    features such as the AI Assistant. These tools are used to
                    enhance platform operation and do not track your activity
                    across other websites.
                  </p>
                </PolicyCard>

                <PolicyCard
                  title="5. Data Sharing"
                  icon={
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
                        d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16 6l-4-4-4 4"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 2v13"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    CTMerchant does not sell your personal data. Information may
                    be shared only in the following limited situations:
                  </p>

                  <ul className="mt-4 space-y-4">
                    <SimpleItem text="When users voluntarily choose to contact listed merchants through external channels." />
                    <SimpleItem text="With trusted infrastructure providers used strictly for hosting, storage, authentication, and platform operations." />
                    <SimpleItem text="When required by law, regulation, lawful requests, or to protect platform safety and legal rights." />
                  </ul>
                </PolicyCard>

                <PolicyCard
                  title="6. Data Security & Account Deletion"
                  icon={
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-5 w-5"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M7 11V7a5 5 0 0110 0v4"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    <span className="font-extrabold text-slate-900">
                      Security:
                    </span>{" "}
                    Data is hosted on secured cloud infrastructure with access
                    controls, encryption measures, and row-level restrictions
                    where applicable.
                  </p>

                  <p className="mt-4 text-sm leading-7 text-slate-600 md:text-[15px]">
                    <span className="font-extrabold text-slate-900">
                      Account Deletion:
                    </span>{" "}
                    You may request deletion of your account and associated
                    personal data by contacting{" "}
                    <a
                      href="mailto:support@ct-merchant.com.ng"
                      className="font-bold text-pink-600 underline underline-offset-2"
                    >
                      support@ct-merchant.com.ng
                    </a>
                    . Following verification, eligible data will be removed from
                    active systems within a reasonable compliance period.
                  </p>
                </PolicyCard>

                <PolicyCard
                  title="7. Your Privacy Rights"
                  icon={
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
                        d="M12 3l7 4v5c0 5-3.5 9-7 10-3.5-1-7-5-7-10V7l7-4z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12l2 2 4-4"
                      />
                    </svg>
                  }
                >
                  <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
                    Subject to applicable law, you may have the right to:
                  </p>

                  <ul className="mt-4 space-y-4">
                    <SimpleItem text="Request access to personal data we hold about you." />
                    <SimpleItem text="Request correction of inaccurate or incomplete data." />
                    <SimpleItem text="Request deletion of eligible personal data." />
                    <SimpleItem text="Object to or restrict certain forms of processing where legally applicable." />
                  </ul>
                </PolicyCard>

                <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
                  <div className="rounded-[22px] border border-pink-100 bg-slate-50 p-6 text-center md:p-8">
                    <h2 className="text-xl font-extrabold text-slate-900 md:text-2xl">
                      Questions regarding your privacy?
                    </h2>

                    <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-[15px]">
                      Our compliance and support team is available to help with
                      clarifications, privacy requests, and data-related
                      concerns.
                    </p>

                    <Link
                      to="/contact"
                      className="mt-6 inline-flex items-center justify-center rounded-xl bg-pink-600 px-6 py-3 text-sm font-extrabold text-white shadow-[0_2px_5px_rgba(219,39,119,0.3)] transition hover:bg-pink-700"
                    >
                      Contact Support
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  )
}

function PolicyCard({ title, icon, children }) {
  return (
    <div className="mt-6 rounded-3xl bg-pink-200 p-1 shadow-sm">
      <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
            {icon}
          </div>

          <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
        </div>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

function ListItem({ title, text }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <p className="text-sm leading-7 text-slate-600 md:text-[15px]">
        <span className="font-extrabold text-slate-900">{title}:</span> {text}
      </p>
    </li>
  )
}

function SimpleItem({ text }) {
  return (
    <li className="flex items-start gap-3">
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-50 text-pink-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <p className="text-sm leading-7 text-slate-600 md:text-[15px]">{text}</p>
    </li>
  )
}

export default Privacy
