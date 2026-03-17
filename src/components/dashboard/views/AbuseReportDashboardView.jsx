import { useState } from "react"
import {
  FaArrowLeft,
  FaCircleCheck,
  FaShieldHalved,
  FaTriangleExclamation,
} from "react-icons/fa6"
import { supabase } from "../../../lib/supabase"

function AbuseReportDashboardView({ onBack, user }) {
  const [formData, setFormData] = useState({
    category: "Scam / Fraud",
    target: "",
    details: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!user?.id) {
      setErrorMessage("Please login to submit a report.")
      return
    }

    if (!formData.target.trim() || !formData.details.trim()) {
      setErrorMessage("Please complete all required fields.")
      return
    }

    try {
      setSubmitting(true)
      setErrorMessage("")

      const { error } = await supabase.from("abuse_reports").insert({
        reporter_id: user.id,
        category: formData.category,
        target_name: formData.target.trim(),
        details: formData.details.trim(),
        status: "pending",
      })

      if (error) throw error

      setShowSuccess(true)
      setFormData({
        category: "Scam / Fraud",
        target: "",
        details: "",
      })
    } catch (err) {
      setErrorMessage(err.message || "Could not submit report.")
    } finally {
      setSubmitting(false)
    }
  }

  function closeSuccess() {
    setShowSuccess(false)
    onBack()
  }

  return (
    <>
      <div className="screen active">
        <section className="bg-pink-50 px-4 py-5 md:py-6">
          <div className="mx-auto max-w-[600px]">
            <div className="mb-6 flex items-center gap-4 rounded-2xl bg-red-700 px-4 py-4 text-white shadow-sm">
              <button
                type="button"
                onClick={onBack}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white transition hover:bg-white/30"
                aria-label="Go back"
              >
                <FaArrowLeft />
              </button>

              <div className="text-xl font-extrabold">Report Abuse</div>
            </div>

            <div className="mb-8 flex items-start gap-4 rounded-xl border border-red-300 bg-red-50 p-4">
              <FaShieldHalved className="mt-1 text-2xl text-red-700" />
              <div className="text-sm font-medium leading-6 text-red-900">
                We take safety seriously. Please provide details about the shop
                or user violating our policies so we can investigate.
              </div>
            </div>

            <form
              onSubmit={handleSubmit}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="mb-6">
                <label className="mb-2 block text-sm font-bold text-slate-900">
                  What type of issue is this?
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-red-700 focus:bg-white"
                >
                  <option value="Scam / Fraud">Scam / Fraud</option>
                  <option value="Fake Products">Fake Products</option>
                  <option value="Harassment">Harassment</option>
                  <option value="Inappropriate Content">
                    Inappropriate Content
                  </option>
                  <option value="Impersonation">Impersonation</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-bold text-slate-900">
                  Who are you reporting?
                </label>
                <span className="mb-2 block text-xs text-slate-500">
                  Enter the Shop Name or Business Name
                </span>
                <input
                  type="text"
                  name="target"
                  value={formData.target}
                  onChange={handleChange}
                  placeholder="e.g. Divine Electronics"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-700 focus:bg-white"
                />
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-bold text-slate-900">
                  Details
                </label>
                <textarea
                  name="details"
                  value={formData.details}
                  onChange={handleChange}
                  placeholder="Please describe what happened..."
                  required
                  rows={6}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-700 focus:bg-white"
                />
              </div>

              {errorMessage ? (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-5 py-4 text-sm font-extrabold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submitting ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FaTriangleExclamation />
                    Submit Report
                  </>
                )}
              </button>
            </form>
          </div>
        </section>
      </div>

      {showSuccess ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[350px] rounded-[20px] bg-white p-8 text-center shadow-2xl">
            <FaCircleCheck className="mx-auto mb-4 text-5xl text-green-600" />
            <div className="mb-2 text-xl font-extrabold text-slate-900">
              Report Received
            </div>
            <div className="mb-6 text-sm leading-6 text-slate-500">
              Thank you for keeping our community safe. We will investigate this
              matter immediately.
            </div>
            <button
              type="button"
              onClick={closeSuccess}
              className="w-full rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-900 transition hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default AbuseReportDashboardView