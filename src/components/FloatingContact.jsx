import { useState } from "react"
import { supabase } from "../lib/supabase"

function FloatingContact() {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState({
    type: "",
    message: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successModalOpen, setSuccessModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    subject: "General Inquiry",
    message: "",
  })

  const togglePopup = () => {
    setIsOpen((prev) => !prev)
    if (!isOpen) {
      setStatus({ type: "", message: "" })
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const resetForm = () => {
    setFormData({
      fullName: "",
      email: "",
      subject: "General Inquiry",
      message: "",
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (
      !formData.fullName.trim() ||
      !formData.email.trim() ||
      !formData.message.trim()
    ) {
      setStatus({
        type: "error",
        message: "Please fill in your name, email, and message.",
      })
      return
    }

    const emailPattern = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/

    if (!emailPattern.test(formData.email.trim())) {
      setStatus({
        type: "error",
        message: "Please enter a valid email address.",
      })
      return
    }

    try {
      setIsSubmitting(true)
      setStatus({ type: "", message: "" })

      const payload = {
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        subject: formData.subject,
        message: formData.message.trim(),
      }

      const { error } = await supabase.from("contact_messages").insert([payload])

      if (error) throw error

      resetForm()
      setIsOpen(false)
      setSuccessModalOpen(true)
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Could not send message. Please try again.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={togglePopup}
        title="Need Help? Contact Support"
        className="fixed bottom-20 left-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-pink-600 text-2xl text-white shadow-[0_10px_25px_rgba(219,39,119,0.35)] transition hover:scale-105 hover:bg-pink-700"
      >
        🎧
      </button>

      <div
        className={`fixed bottom-36 left-6 z-40 w-[calc(100%-3rem)] max-w-[290px] overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-2xl transition-all duration-300 ${
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-5 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between bg-slate-900 px-3.5 py-2.5 text-white">
          <span className="text-[13px] font-bold">Message Us</span>

          <button
            type="button"
            onClick={togglePopup}
            className="text-lg text-white/70 transition hover:text-white"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5 p-3.5">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Full Name
            </label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="e.g. John Doe"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="name@example.com"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Subject
            </label>
            <select
              name="subject"
              value={formData.subject}
              onChange={handleChange}
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white"
            >
              <option>General Inquiry</option>
              <option>Merchant Support</option>
              <option>Report an Issue</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Message
            </label>
            <textarea
              name="message"
              rows="3"
              value={formData.message}
              onChange={handleChange}
              placeholder="How can we help you?"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
            />
          </div>

          {status.message ? (
            <div
              className={`rounded-lg px-3 py-2 text-[11px] font-medium ${
                status.type === "success"
                  ? "border border-green-200 bg-green-50 text-green-700"
                  : "border border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {status.message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-[13px] font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Sending..." : "Send Message"}
            <span>{isSubmitting ? "⟳" : "→"}</span>
          </button>
        </form>
      </div>

      {successModalOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-[350px] rounded-[20px] bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 text-5xl text-green-600">✓</div>
            <div className="mb-2 text-xl font-extrabold text-slate-900">
              Message Sent
            </div>
            <div className="mb-6 text-sm leading-6 text-slate-500">
              Thank you for contacting CTMerchant. Our team has received your
              message and will respond as soon as possible.
            </div>
            <button
              type="button"
              onClick={() => setSuccessModalOpen(false)}
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

export default FloatingContact