import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import PageSeo from "../components/common/PageSeo"
import { supabase } from "../lib/supabase"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"
import useAuthSession from "../hooks/useAuthSession"

function Contact() {
  const navigate = useNavigate()
  
  // 1. Hook into our global offline detection
  const { isOffline } = useAuthSession()

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    subject: "General Inquiry",
    message: "",
  })

  const [status, setStatus] = useState({
    type: "",
    message: "",
  })

  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleBack = () => {
    navigate("/")
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    // 2. Proactive Offline Guard
    if (isOffline) {
      setStatus({
        type: "error",
        message: "Network Offline: Please connect to the internet to send a message.",
      })
      return
    }

    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

    if (!emailPattern.test(formData.email.trim())) {
      setStatus({
        type: "error",
        message:
          "Invalid Email: Please enter a valid email address (e.g., name@example.com).",
      })
      return
    }

    setIsSubmitting(true)
    setStatus({ type: "", message: "" })

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        subject: formData.subject,
        message: formData.message.trim(),
      }

      const { error } = await supabase.from("contact_messages").insert([payload])

      if (error) throw error

      setStatus({
        type: "success",
        message: "SUCCESS: Message sent successfully.",
      })

      setFormData({
        full_name: "",
        email: "",
        subject: "General Inquiry",
        message: "",
      })
    } catch (error) {
      setStatus({
        type: "error",
        message: getFriendlyErrorMessage(error, "Could not send message. Please try again."),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <MainLayout>
      <PageSeo
        title="Contact CTMerchant | Support and Enquiries"
        description="Send enquiries, requests, or partnership questions to the CTMerchant team."
        canonicalPath="/contact"
      />
      {/* 3. Global Offline Banner */}
      {isOffline && (
        <div className="z-[101] bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-800 shadow-sm border-b border-amber-200 flex items-center justify-center gap-2">
          <i className="fa-solid fa-wifi-slash"></i>
          You are currently offline. Reconnect to send a message.
        </div>
      )}
      
      <section className="bg-pink-50 px-4 py-5 md:py-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm">
            <div className="rounded-[24px] border border-pink-100 bg-white">
              <div className="border-b border-pink-100 bg-slate-950 px-5 py-4 text-white md:px-6 rounded-t-[24px]">
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
                      Support
                    </p>
                    <h1 className="text-xl font-extrabold md:text-2xl">
                      Contact Us
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
                          d="M22 12h-4l-3 7-4-14-3 7H2"
                        />
                      </svg>
                    </div>

                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 md:text-lg">
                        Get In Touch
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-600 md:text-[15px]">
                        Our team is ready to assist you. Reach out through the
                        contact form below or use our direct contact channels
                        for merchant support and general inquiries.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-3xl bg-pink-200 p-1 shadow-sm">
                    <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
                      <div className="flex items-center gap-3">
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
                              d="M4 6h16v12H4z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M22 6l-10 7L2 6"
                            />
                          </svg>
                        </div>

                        <h2 className="text-xl font-extrabold text-slate-900">
                          Send a Message
                        </h2>
                      </div>

                      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                        <div className="grid gap-5 md:grid-cols-2">
                          <div>
                            <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                              Full Name
                            </label>
                            <input
                              type="text"
                              name="full_name"
                              value={formData.full_name}
                              onChange={handleChange}
                              required
                              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:ring-2 focus:ring-pink-100"
                            />
                          </div>

                          <div>
                            <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                              Email Address
                            </label>
                            <input
                              type="email"
                              name="email"
                              value={formData.email}
                              onChange={handleChange}
                              required
                              pattern="^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
                              title="Please enter a valid email address (e.g., name@example.com)"
                              className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:ring-2 focus:ring-pink-100"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                            Subject
                          </label>
                          <select
                            name="subject"
                            value={formData.subject}
                            onChange={handleChange}
                            className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white focus:ring-2 focus:ring-pink-100"
                          >
                            <option value="General Inquiry">General Inquiry</option>
                            <option value="Merchant Support">Merchant Support</option>
                            <option value="Report an Issue">Report an Issue</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                            Message
                          </label>
                          <textarea
                            name="message"
                            value={formData.message}
                            onChange={handleChange}
                            required
                            rows="5"
                            className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white focus:ring-2 focus:ring-pink-100"
                          />
                        </div>

                        {/* 4. Disable Button while Offline */}
                        <button
                          type="submit"
                          disabled={isSubmitting || isOffline}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-pink-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(219,39,119,0.28)] transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-70 disabled:shadow-none"
                        >
                          <span>{isSubmitting ? "Sending..." : "Send Message"}</span>
                          <span>{isSubmitting ? "⟳" : "➜"}</span>
                        </button>

                        {status.message ? (
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
                              status.type === "success"
                                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border border-red-200 bg-red-50 text-red-700"
                            }`}
                          >
                            {status.message}
                          </div>
                        ) : null}
                      </form>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-3xl bg-pink-200 p-1 shadow-sm">
                      <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
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
                                d="M4 6h16v12H4z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M22 6l-10 7L2 6"
                              />
                            </svg>
                          </div>

                          <div>
                            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                              Email Support
                            </p>
                            <a
                              href="mailto:admin@ct-merchant.com.ng"
                              className="mt-2 block text-base font-extrabold text-slate-900 transition hover:text-pink-600"
                            >
                              admin@ct-merchant.com.ng
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-pink-200 p-1 shadow-sm">
                      <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
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
                                d="M22 16.92v3a2 2 0 01-2.18 2 19.86 19.86 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.86 19.86 0 012.08 4.18 2 2 0 014.06 2h3a2 2 0 012 1.72c.12.9.32 1.78.59 2.64a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.44-1.2a2 2 0 012.11-.45c.86.27 1.74.47 2.64.59A2 2 0 0122 16.92z"
                              />
                            </svg>
                          </div>

                          <div>
                            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                              Call Us
                            </p>
                            <a
                              href="tel:+2349040978688"
                              className="mt-2 block text-base font-extrabold text-slate-900 transition hover:text-pink-600"
                            >
                              +234 904 097 8688
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-pink-200 p-1 shadow-sm">
                      <div className="rounded-[22px] border border-pink-100 bg-white p-6 md:p-7">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-50 text-pink-600">
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
                                d="M12 21s-6-4.35-6-10a6 6 0 1112 0c0 5.65-6 10-6 10z"
                              />
                              <circle cx="12" cy="11" r="2" />
                            </svg>
                          </div>

                          <div>
                            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">
                              Head Office
                            </p>
                            <h3 className="mt-2 text-base font-extrabold text-slate-900">
                              No. 110, Gidan Gomna Tsphon Bagado
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-slate-600">
                              Kamazou, Kaduna State, Nigeria.
                            </p>
                            <p className="text-sm font-semibold leading-7 text-slate-700">
                              Landmark: EES KAMAZOU/BAGADO
                            </p>
                          </div>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                          <div className="h-[260px] w-full">
                            <iframe
                              title="CTMerchant Head Office Map"
                              width="100%"
                              height="100%"
                              frameBorder="0"
                              style={{ border: 0 }}
                              src="https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d15707.037841575!2d7.472!3d10.457!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sen!2sng!4v1700000000000"
                              allowFullScreen
                              loading="lazy"
                            />
                          </div>
                        </div>

                        <a
                          href="https://www.google.com/maps/search/?api=1&query=10.457,7.472"
                          target="_blank"
                          rel="noreferrer"
                          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-extrabold text-slate-900 transition hover:bg-slate-50 hover:border-slate-400"
                        >
                          <span>📍</span>
                          <span>Navigate to Office</span>
                        </a>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-pink-200 p-1 shadow-sm">
                      <div className="rounded-[22px] border border-pink-100 bg-slate-50 p-6">
                        <h3 className="text-lg font-extrabold text-slate-900">
                          Need something else?
                        </h3>
                        <p className="mt-2 text-sm leading-7 text-slate-600">
                          For merchant onboarding, technical issues, abuse
                          reports, or operational support, our team will direct
                          your inquiry to the right channel.
                        </p>

                        <div className="mt-4">
                          <Link
                            to="/services"
                            className="inline-flex items-center gap-2 text-sm font-extrabold text-pink-600 transition hover:text-pink-700 hover:underline"
                          >
                            <span>Explore Platform Services</span>
                            <span>→</span>
                          </Link>
                        </div>
                      </div>
                    </div>
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

export default Contact
