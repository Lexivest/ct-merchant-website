import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import MainLayout from "../layouts/MainLayout"
import useAuthSession from "../hooks/useAuthSession"
import PageSeo from "../components/common/PageSeo"
import AuthInput from "../components/auth/AuthInput"
import AuthButton from "../components/auth/AuthButton"
// Fixed the import below from FaCheckCircle to FaCircleCheck
import { FaEnvelope, FaUser, FaPhone, FaCircleInfo, FaGlobe, FaBullhorn, FaCircleQuestion, FaCircleCheck } from "react-icons/fa6"
import { supabase } from "../lib/supabase"
import { useGlobalFeedback } from "../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../lib/friendlyErrors"

function Affiliate() {
  const navigate = useNavigate()
  const { user, isOffline } = useAuthSession()
  const { notify } = useGlobalFeedback()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    email: user?.email || "",
    phone: "",
    bio: "",
    marketingExperience: "",
    socialMediaLinks: "",
    promotionPlan: "",
    questionnaire: {
      hasPromotedBefore: "no",
      availability: "part-time",
      preferredRegion: "",
    }
  })

  const [errors, setErrors] = useState({})

  // Sync email when user session is loaded
  useEffect(() => {
    if (user?.email && !formData.email) {
      setFormData(prev => ({ ...prev, email: user.email }))
    }
  }, [user, formData.email])

  const handleBack = () => {
    const ref = document.referrer.toLowerCase()
    if (ref.includes("user-dashboard") || ref.includes("merchant-dashboard")) {
      navigate("/user-dashboard?tab=services")
      return
    }
    navigate("/")
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name.startsWith("q_")) {
      const qKey = name.replace("q_", "")
      setFormData(prev => ({
        ...prev,
        questionnaire: { ...prev.questionnaire, [qKey]: value }
      }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required"
    if (!formData.email.trim()) newErrors.email = "Email is required"
    if (!formData.bio.trim()) newErrors.bio = "Bio is required"
    if (!formData.promotionPlan.trim()) newErrors.promotionPlan = "Promotion plan is required"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    try {
      setIsSubmitting(true)
      const { error } = await supabase.from("affiliate_applications").insert([{
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        bio: formData.bio.trim(),
        marketing_experience: formData.marketingExperience.trim(),
        social_media_links: formData.socialMediaLinks.trim(),
        promotion_plan: formData.promotionPlan.trim(),
        questionnaire: formData.questionnaire,
        user_id: user?.id || null,
      }])

      if (error) throw error
      
      setSubmitted(true)
      notify({
        type: "success",
        title: "Application Sent",
        message: "Your affiliate application has been submitted successfully."
      })
    } catch (err) {
      notify({
        type: "error",
        title: "Submission Failed",
        message: getFriendlyErrorMessage(err)
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <MainLayout>
        <PageSeo title="Application Successful | CTMerchant" />
        <section className="bg-pink-50 px-4 py-12 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-6 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
                {/* Updated icon tag here */}
                <FaCircleCheck className="text-4xl" />
              </div>
            </div>
            <h1 className="text-3xl font-black text-slate-900 md:text-4xl">Submission Successful!</h1>
            <p className="mt-4 text-lg font-medium leading-relaxed text-slate-600">
              Thank you for applying to the CTMerchant Affiliate Program. Our team will review your application and you will be contacted via email when shortlisted.
            </p>
            <div className="mt-10">
              <button
                onClick={() => navigate("/")}
                className="rounded-xl bg-slate-900 px-8 py-3 text-base font-bold text-white transition hover:bg-slate-800"
              >
                Back to Home
              </button>
            </div>
          </div>
        </section>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageSeo
        title="Affiliate Program | CTMerchant"
        description="Join the CTMerchant affiliate program and help merchants and shoppers discover verified local businesses."
        canonicalPath="/affiliate"
      />
      {isOffline && (
        <div className="z-[101] bg-amber-100 px-4 py-2 text-center text-sm font-bold text-amber-800 shadow-sm border-b border-amber-200 flex items-center justify-center gap-2">
          <i className="fa-solid fa-wifi-slash"></i>
          You are currently offline. Application submission may be unavailable.
        </div>
      )}

      <section className="bg-pink-50 px-4 py-5 md:py-8">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-[28px] bg-pink-200 p-1 shadow-sm">
            <div className="rounded-[24px] border border-pink-100 bg-white">
              <div className="border-b border-pink-100 bg-slate-950 px-5 py-4 text-white md:px-8 rounded-t-[24px]">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-pink-600"
                    aria-label="Go back"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>

                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.25em] text-pink-300">Partnerships (v2)</p>
                    <h1 className="text-xl font-extrabold md:text-2xl">Become an Affiliate</h1>
                  </div>
                </div>
              </div>

              <div className="p-6 md:p-10">
                <div className="mb-8">
                  <h2 className="text-lg font-black text-slate-900">Affiliate Application Form</h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Tell us about yourself and how you plan to help grow the CTMerchant ecosystem.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Basic Info */}
                  <div className="space-y-5">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-pink-600">
                      <FaUser className="text-xs" />
                      Contact Information
                    </h3>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <AuthInput
                        id="fullName"
                        label="Full Name"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        placeholder="John Doe"
                        error={errors.fullName}
                        required
                        icon={<FaUser />}
                      />
                      <AuthInput
                        id="email"
                        label="Email Address"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="john@example.com"
                        error={errors.email}
                        required
                        icon={<FaEnvelope />}
                      />
                    </div>
                    <AuthInput
                      id="phone"
                      label="Phone Number"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+234..."
                      icon={<FaPhone />}
                    />
                  </div>

                  {/* Professional Info */}
                  <div className="space-y-5">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-pink-600">
                      <FaCircleInfo className="text-xs" />
                      Professional Bio
                    </h3>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Tell us about yourself</label>
                      <textarea
                        name="bio"
                        rows="4"
                        value={formData.bio}
                        onChange={handleChange}
                        placeholder="A brief summary of your professional background..."
                        className={`w-full rounded-2xl border bg-slate-50 px-5 py-4 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white ${errors.bio ? 'border-red-500' : 'border-slate-200'}`}
                      />
                      {errors.bio && <p className="mt-1 text-xs font-bold text-red-500">{errors.bio}</p>}
                    </div>
                  </div>

                  {/* Marketing Experience */}
                  <div className="space-y-5">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-pink-600">
                      <FaBullhorn className="text-xs" />
                      Experience & Reach
                    </h3>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Marketing Experience</label>
                      <textarea
                        name="marketingExperience"
                        rows="3"
                        value={formData.marketingExperience}
                        onChange={handleChange}
                        placeholder="Describe your previous experience in marketing or affiliate programs..."
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white"
                      />
                    </div>
                    <AuthInput
                      id="socialMediaLinks"
                      label="Social Media Links"
                      name="socialMediaLinks"
                      value={formData.socialMediaLinks}
                      onChange={handleChange}
                      placeholder="Instagram, Twitter, LinkedIn profiles..."
                      icon={<FaGlobe />}
                    />
                  </div>

                  {/* Promotion Plan */}
                  <div className="space-y-5">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-pink-600">
                      <FaGlobe className="text-xs" />
                      Promotion Strategy
                    </h3>
                    <div>
                      <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">How do you plan to promote CTMerchant?</label>
                      <textarea
                        name="promotionPlan"
                        rows="4"
                        value={formData.promotionPlan}
                        onChange={handleChange}
                        placeholder="E.g. Through social media, local community groups, blog posts, etc..."
                        className={`w-full rounded-2xl border bg-slate-50 px-5 py-4 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white ${errors.promotionPlan ? 'border-red-500' : 'border-slate-200'}`}
                      />
                      {errors.promotionPlan && <p className="mt-1 text-xs font-bold text-red-500">{errors.promotionPlan}</p>}
                    </div>
                  </div>

                  {/* Questionnaire */}
                  <div className="space-y-6 rounded-3xl border border-pink-100 bg-pink-50/50 p-6">
                    <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-pink-600">
                      <FaCircleQuestion className="text-xs" />
                      Quick Questionnaire
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="mb-3 block text-[11px] font-bold text-slate-700">Have you promoted any digital platform before?</label>
                        <div className="flex gap-4">
                          {["yes", "no"].map(opt => (
                            <label key={opt} className="flex cursor-pointer items-center gap-2">
                              <input
                                type="radio"
                                name="q_hasPromotedBefore"
                                value={opt}
                                checked={formData.questionnaire.hasPromotedBefore === opt}
                                onChange={handleChange}
                                className="h-4 w-4 border-slate-300 text-pink-600 focus:ring-pink-500"
                              />
                              <span className="text-sm font-bold capitalize text-slate-600">{opt}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-3 block text-[11px] font-bold text-slate-700">What is your availability?</label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {["part-time", "full-time", "weekends-only"].map(opt => (
                            <label key={opt} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-pink-300">
                              <input
                                type="radio"
                                name="q_availability"
                                value={opt}
                                checked={formData.questionnaire.availability === opt}
                                onChange={handleChange}
                                className="h-4 w-4 border-slate-300 text-pink-600 focus:ring-pink-500"
                              />
                              <span className="text-sm font-bold capitalize text-slate-600">{opt.replace("-", " ")}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <AuthInput
                        id="preferredRegion"
                        label="Preferred region/city for promotion"
                        name="q_preferredRegion"
                        value={formData.questionnaire.preferredRegion}
                        onChange={handleChange}
                        placeholder="E.g. Jos, Kaduna, Abuja..."
                        icon={<FaGlobe />}
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <AuthButton type="submit" loading={isSubmitting}>
                      <span>Submit Affiliate Application</span>
                      <FaArrowRight className="ml-2" />
                    </AuthButton>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </MainLayout>
  )
}

function FaArrowRight({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 ${className}`}>
      <path fillRule="evenodd" d="M12.97 3.97a.75.75 0 011.06 0l7.5 7.5a.75.75 0 010 1.06l-7.5 7.5a.75.75 0 11-1.06-1.06l6.22-6.22H3a.75.75 0 010-1.5h16.19l-6.22-6.22a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  )
}

export default Affiliate