import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import PageSeo from "../components/common/PageSeo"

const jobs = [
  {
    title: "CTMerchant Growth Lead",
    type: "Full Time",
    typeColor: "bg-emerald-500",
    location: "Kaduna (Hybrid)",
    department: "Operations",
    locationIcon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21s-6-4.35-6-10a6 6 0 1112 0c0 5.65-6 10-6 10z"
        />
        <circle cx="12" cy="11" r="2" />
      </svg>
    ),
    departmentIcon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4h18v4H3zm0 6h8v10H3zm10 0h8v4h-8zm0 6h8v4h-8z"
        />
      </svg>
    ),
  },
  {
    title: "Flutter Application Engineer",
    type: "Contract",
    typeColor: "bg-sky-500",
    location: "Remote",
    department: "Engineering",
    locationIcon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4"
      >
        <circle cx="12" cy="12" r="9" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18"
        />
      </svg>
    ),
    departmentIcon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-4 w-4"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16 18l6-6-6-6M8 6l-6 6 6 6"
        />
      </svg>
    ),
  },
]

function Careers() {
  const navigate = useNavigate()
  const [selectedJob, setSelectedJob] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleBack = () => {
    const ref = document.referrer.toLowerCase()

    if (ref.includes("user-dashboard") || ref.includes("merchant-dashboard")) {
      navigate("/user-dashboard?tab=services")
      return
    }

    navigate("/")
  }

  const openClosedNotice = (jobTitle) => {
    setSelectedJob(jobTitle)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  useEffect(() => {
    document.body.style.overflow = isModalOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [isModalOpen])

  return (
    <MainLayout>
      <PageSeo
        title="Careers at CTMerchant | Join the Team"
        description="Explore career opportunities at CTMerchant and help build trusted local commerce discovery tools."
        canonicalPath="/careers"
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
                      Careers
                    </p>
                    <h1 className="text-xl font-extrabold md:text-2xl">
                      Join CTMerchant
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
                          d="M5 17l4.5-4.5L13 16l6-7"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7h-5m5 0v5"
                        />
                      </svg>
                    </div>

                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
                        Build Digital Infrastructure
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 md:text-[15px]">
                        At CTMerchant, we are building a trusted digital
                        repository of real physical businesses within cities.
                        Join a team focused on mapping, structuring, and
                        maintaining accurate commercial data.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
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
                        d="M3 7h18M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2m-9 6h8"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 7h14v11a2 2 0 01-2 2H7a2 2 0 01-2-2V7z"
                      />
                    </svg>
                  </div>

                  <h2 className="text-xl font-extrabold text-slate-900">
                    Current Openings
                  </h2>
                </div>

                <div className="mt-5 space-y-4">
                  {jobs.map((job) => (
                    <div
                      key={job.title}
                      className="rounded-3xl bg-pink-200 p-1 shadow-sm"
                    >
                      <div className="flex flex-col gap-5 rounded-[22px] border border-pink-100 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-3">
                          <h3 className="text-lg font-extrabold text-slate-900">
                            {job.title}
                          </h3>

                          <div className="flex flex-wrap gap-3 text-sm font-semibold text-slate-600">
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5">
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${job.typeColor}`}
                              />
                              {job.type}
                            </span>

                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5">
                              {job.locationIcon}
                              {job.location}
                            </span>

                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5">
                              {job.departmentIcon}
                              {job.department}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => openClosedNotice(job.title)}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-100 px-5 py-3 text-sm font-extrabold text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 sm:min-w-[180px]"
                        >
                          Application Closed
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`fixed inset-0 z-[999] flex items-center justify-center bg-slate-950/80 px-4 transition-all duration-300 ${
          isModalOpen
            ? "visible opacity-100"
            : "invisible opacity-0 pointer-events-none"
        }`}
        onClick={closeModal}
      >
        <div
          className={`w-full max-w-md rounded-3xl border border-pink-100 bg-white p-8 shadow-2xl transition-all duration-300 ${
            isModalOpen ? "scale-100" : "scale-95"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pink-100 text-pink-600">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-6 w-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6l4 2"
              />
              <circle cx="12" cy="12" r="9" />
            </svg>
          </div>

          <h2 className="mt-4 text-center text-2xl font-extrabold text-slate-900">
            Applications Paused
          </h2>

          <p className="mt-2 text-center text-sm font-bold text-slate-700">
            Role:{" "}
            <span className="text-pink-600">
              {selectedJob}
            </span>
          </p>

          <p className="mt-4 text-center text-sm leading-7 text-slate-600">
            Thank you for your interest in joining CTMerchant. We have reached
            our current intake capacity for this position. Please check back
            soon or follow our updates for future opportunities.
          </p>

          <button
            type="button"
            onClick={closeModal}
            className="mt-6 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </MainLayout>
  )
}

export default Careers
