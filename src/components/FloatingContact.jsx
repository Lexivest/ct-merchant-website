import { useState } from "react"

function FloatingContact() {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState("")
  const [statusType, setStatusType] = useState("")
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    subject: "General Inquiry",
    message: "",
  })

  const togglePopup = () => {
    setIsOpen((prev) => !prev)
    if (!isOpen) {
      setStatus("")
      setStatusType("")
    }
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (
      !formData.fullName.trim() ||
      !formData.email.trim() ||
      !formData.message.trim()
    ) {
      setStatus("Please fill in your name, email, and message.")
      setStatusType("error")
      return
    }

    setStatus("Message UI ready. Supabase connection will be added next.")
    setStatusType("success")

    setFormData({
      fullName: "",
      email: "",
      subject: "General Inquiry",
      message: "",
    })
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
        className={`fixed bottom-34 left-6 z-40 w-[calc(100%-3rem)] max-w-[290px] overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-2xl transition-all duration-300 ${
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
              rows="2"
              value={formData.message}
              onChange={handleChange}
              placeholder="How can we help you?"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
            />
          </div>

          {status ? (
            <div
              className={`rounded-lg px-3 py-2 text-[11px] font-medium ${
                statusType === "success"
                  ? "border border-green-200 bg-green-50 text-green-700"
                  : "border border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {status}
            </div>
          ) : null}

          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-[13px] font-extrabold text-white transition hover:bg-pink-700"
          >
            Send Message
            <span>→</span>
          </button>
        </form>
      </div>
    </>
  )
}

export default FloatingContact