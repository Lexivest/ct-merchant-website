import { FaArrowLeft } from "react-icons/fa6"

const faqs = [
  {
    question: "How do I register my shop?",
    answer:
      "Go to the Services menu and tap on Register Shop. You will need to provide your business details, a storefront image, and valid identification (NIN, Passport, or Voter's Card). For Limited companies, a CAC certificate is required.",
  },
  {
    question: "How long does verification take?",
    answer:
      "Our admin team typically reviews applications within 24-48 hours. You will receive a notification once your shop status changes from Pending to Approved.",
  },
  {
    question: "Why is my shop 'Pending Physical Verification'?",
    answer:
      "After your online application is approved, your shop becomes visible but marked as Unverified. To get the Blue Badge and remove the warning, our field agents must visit your physical address to confirm its existence.",
  },
  {
    question: "How do I upload products?",
    answer:
      "Once your shop is approved, go to Services > My Shop (or Manage Shop from your shop details). Click Add Product to upload images, set prices, and add descriptions.",
  },
  {
    question: "Can I edit my shop details later?",
    answer:
      "Yes. Navigate to your Shop Dashboard and select Shop Settings. You can update your phone number, WhatsApp, address, and business description there.",
  },
  {
    question: "How do customers contact me?",
    answer:
      "Customers can call you directly or chat via WhatsApp using the buttons on your product and shop pages. We log these interactions to help protect you from spam.",
  },
  {
    question: "What happens if I forget my password?",
    answer:
      "On the Login screen, tap Forgot Password?. Enter your registered email address to receive a 6-digit reset code.",
  },
  {
    question: "Is there a fee to use this platform?",
    answer:
      "Registration is currently free. However, premium features like Featured Shop placement or Promo Banners may attract a subscription fee in the future.",
  },
]

function FaqDashboardView({ onBack, onOpenSupport }) {
  return (
    <div className="screen active">
      <section className="bg-slate-50 px-4 py-5 md:py-6">
        <div className="mx-auto flex max-w-[600px] flex-col gap-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 transition hover:bg-slate-200"
              aria-label="Go back"
            >
              <FaArrowLeft />
            </button>
            <div className="text-xl font-extrabold text-slate-900">
              Frequently Asked Questions
            </div>
          </div>

          <div className="max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
            <div className="flex flex-col gap-4">
              {faqs.map((item) => (
                <div
                  key={item.question}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-2 text-base font-extrabold leading-6 text-slate-900">
                    {item.question}
                  </div>
                  <div className="text-sm leading-7 text-slate-500">
                    {item.answer}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <div className="mb-3 text-sm text-slate-500">Still have questions?</div>
            <button
              type="button"
              onClick={onOpenSupport}
              className="w-full rounded-xl border-2 border-purple-700 bg-transparent px-4 py-3 font-bold text-purple-700 transition hover:bg-purple-700 hover:text-white"
            >
              Contact Support
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default FaqDashboardView