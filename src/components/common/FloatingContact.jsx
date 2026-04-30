import { useState } from "react"
import { FaHeadset, FaEnvelope } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { useGlobalFeedback } from "./GlobalFeedbackProvider"
import { clampWords, getWordLimitError } from "../../lib/textLimits"
import WordLimitCounter from "./WordLimitCounter"

const CONTACT_MESSAGE_WORD_LIMIT = 300

function FloatingContact() {
  const [isOpen, setIsOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { notify } = useGlobalFeedback()
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    subject: "General Inquiry",
    message: "",
  })

  const togglePopup = () => {
    setIsOpen((prev) => !prev)
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === "message" ? clampWords(value, CONTACT_MESSAGE_WORD_LIMIT) : value,
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
      notify({
        type: "error",
        title: "Missing Details",
        message: "Please fill in your name, email, and message.",
      })
      return
    }

    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

    if (!emailPattern.test(formData.email.trim())) {
      notify({
        type: "error",
        title: "Invalid Email",
        message: "Please enter a valid email address.",
      })
      return
    }

    const messageLimitError = getWordLimitError("Message", formData.message, CONTACT_MESSAGE_WORD_LIMIT)
    if (messageLimitError) {
      notify({
        type: "error",
        title: "Message too long",
        message: messageLimitError,
      })
      return
    }

    try {
      setIsSubmitting(true)

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
      notify({
        type: "success",
        title: "Message Sent",
        message:
          "Thank you for contacting CTMerchant. Our team has received your message and will respond as soon as possible.",
      })
    } catch (error) {
      notify({
        type: "error",
        title: "Message Not Sent",
        message: getFriendlyErrorMessage(error, "Could not send message. Please try again."),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed bottom-20 left-6 z-40 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={togglePopup}
          title="Need Help? Contact Support"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-pink-600 text-[1.35rem] text-white shadow-[0_10px_25px_rgba(219,39,119,0.35)] transition hover:scale-105 hover:bg-pink-700"
        >
          <FaEnvelope />
        </button>
        <span className="pointer-events-none whitespace-nowrap rounded-xl border border-pink-100 bg-white px-2.5 py-1 text-[0.7rem] font-extrabold text-pink-600 shadow-sm">
          Message Us
        </span>
      </div>

      <div
        className={`fixed bottom-36 left-6 z-40 w-[calc(100%-3rem)] max-w-[290px] overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-2xl transition-all duration-300 ${
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-5 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between bg-slate-900 px-3.5 py-2.5 text-white">
          <span className="flex items-center gap-2 text-[13px] font-bold">
            <FaHeadset />
            Message Us
          </span>

          <button
            type="button"
            onClick={togglePopup}
            className="text-lg text-white/70 transition hover:text-white"
          >
            &times;
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
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Message
              </label>
              <WordLimitCounter value={formData.message} limit={CONTACT_MESSAGE_WORD_LIMIT} className="text-[9px]" />
            </div>
            <textarea
              name="message"
              rows="3"
              value={formData.message}
              onChange={handleChange}
              placeholder="How can we help you?"
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-[13px] font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Sending..." : "Send Message"}
            <span>{isSubmitting ? "..." : "->"}</span>
          </button>
        </form>
      </div>
    </>
  )
}

export default FloatingContact
