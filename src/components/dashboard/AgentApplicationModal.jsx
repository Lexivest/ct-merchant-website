import { useEffect, useState } from "react"
import {
  FaArrowRight,
  FaBullhorn,
  FaCircleCheck,
  FaCircleInfo,
  FaCircleQuestion,
  FaEnvelope,
  FaGlobe,
  FaHandshake,
  FaPhone,
  FaUser,
  FaXmark,
} from "react-icons/fa6"
import AuthInput from "../auth/AuthInput"
import AuthButton from "../auth/AuthButton"
import BrandText from "../common/BrandText"
import WordLimitCounter from "../common/WordLimitCounter"
import { useGlobalFeedback } from "../common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import { clampWords, getWordLimitError } from "../../lib/textLimits"
import { supabase } from "../../lib/supabase"

const WORD_LIMITS = {
  bio: 300,
  agentExperience: 300,
  agentPlan: 300,
  preferredRegion: 20,
}

const FIELD_LIMITS = {
  fullName: 80,
  phone: 30,
  socialMediaLinks: 500,
  platformNames: 500,
}

const TEXTAREA_CLASS =
  "w-full rounded-2xl border bg-slate-50 px-5 py-4 text-sm font-bold text-slate-900 outline-none transition focus:border-pink-500 focus:bg-white"

export default function AgentApplicationModal({ isOpen, onClose, user }) {
  const { notify } = useGlobalFeedback()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    fullName: "",
    email: user?.email || "",
    phone: "",
    bio: "",
    agentExperience: "",
    socialMediaLinks: "",
    agentPlan: "",
    questionnaire: {
      hasOnboardedBefore: "no",
      platformNames: "",
      availability: "part-time",
      preferredRegion: "",
    },
  })
  const [errors, setErrors] = useState({})

  // Sync email once auth resolves
  useEffect(() => {
    if (user?.email && !formData.email) {
      setFormData((prev) => ({ ...prev, email: user.email }))
    }
  }, [user, formData.email])

  // Reset form state whenever the modal closes
  useEffect(() => {
    if (!isOpen) {
      setSubmitted(false)
      setErrors({})
    }
  }, [isOpen])

  if (!isOpen) return null

  function handleChange(e) {
    const { name, value } = e.target
    if (name.startsWith("q_")) {
      const qKey = name.replace("q_", "")
      setFormData((prev) => ({
        ...prev,
        questionnaire: {
          ...prev.questionnaire,
          [qKey]:
            qKey === "preferredRegion"
              ? clampWords(value, WORD_LIMITS.preferredRegion)
              : qKey === "platformNames"
              ? value.slice(0, FIELD_LIMITS.platformNames)
              : value,
        },
      }))
    } else {
      const wordLimit = WORD_LIMITS[name]
      const charLimit = FIELD_LIMITS[name]
      const nextValue = wordLimit
        ? clampWords(value, wordLimit)
        : charLimit
        ? value.slice(0, charLimit)
        : value
      setFormData((prev) => ({ ...prev, [name]: nextValue }))
    }
  }

  function validate() {
    const newErrors = {}
    if (!formData.fullName.trim()) newErrors.fullName = "Full name is required"
    if (!formData.email.trim()) newErrors.email = "Email is required"
    if (!formData.bio.trim()) newErrors.bio = "This field is required"
    if (!formData.agentPlan.trim()) newErrors.agentPlan = "This field is required"

    const bioErr = getWordLimitError("Bio", formData.bio, WORD_LIMITS.bio)
    if (bioErr) newErrors.bio = bioErr
    const expErr = getWordLimitError("Agent experience", formData.agentExperience, WORD_LIMITS.agentExperience)
    if (expErr) newErrors.agentExperience = expErr
    const planErr = getWordLimitError("Agent plan", formData.agentPlan, WORD_LIMITS.agentPlan)
    if (planErr) newErrors.agentPlan = planErr
    const regionErr = getWordLimitError(
      "Preferred region",
      formData.questionnaire.preferredRegion,
      WORD_LIMITS.preferredRegion,
    )
    if (regionErr) newErrors.preferredRegion = regionErr

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!validate()) return

    try {
      setIsSubmitting(true)
      const { error } = await supabase.from("affiliate_applications").insert([
        {
          full_name: formData.fullName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          bio: formData.bio.trim(),
          marketing_experience: formData.agentExperience.trim(),
          social_media_links: formData.socialMediaLinks.trim(),
          promotion_plan: formData.agentPlan.trim(),
          questionnaire: {
            hasOnboardedBefore: formData.questionnaire.hasOnboardedBefore,
            platformNames:
              formData.questionnaire.hasOnboardedBefore === "yes"
                ? formData.questionnaire.platformNames.trim()
                : "",
            availability: formData.questionnaire.availability,
            preferredRegion: formData.questionnaire.preferredRegion,
            applicationType: "agent",
          },
          user_id: user?.id || null,
        },
      ])
      if (error) throw error

      setSubmitted(true)
      notify({
        type: "success",
        title: "Application Sent!",
        message: "Your agent application has been submitted. We'll be in touch.",
      })
    } catch (err) {
      notify({
        type: "error",
        title: "Submission Failed",
        message: getFriendlyErrorMessage(err),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between gap-4 bg-slate-950 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-600">
              <FaHandshake className="text-base" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-pink-300">
                Partnerships
              </p>
              <h2 className="text-lg font-extrabold leading-tight">
                Become a CTM Agent
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/20"
            aria-label="Close"
          >
            <FaXmark />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {submitted ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <FaCircleCheck className="text-4xl" />
              </div>
              <h3 className="text-2xl font-black text-slate-900">
                Application Submitted!
              </h3>
              <p className="mt-3 max-w-sm text-sm font-medium leading-relaxed text-slate-600">
                Thank you for applying to the <BrandText /> Agent Program. Our
                team will review your application and contact you via email when
                shortlisted.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-8 rounded-xl bg-slate-900 px-8 py-3 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          ) : (
            /* ── Form ── */
            <div className="px-6 py-6 md:px-8">
              <div className="mb-6">
                <h3 className="text-base font-black text-slate-900">
                  Agent Application Form
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Tell us about yourself and how you plan to help grow the{" "}
                  <BrandText /> ecosystem as a field agent.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-7">

                {/* ── Contact Information ── */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-pink-600">
                    <FaUser className="text-[10px]" />
                    Contact Information
                  </h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AuthInput
                      id="agent-fullName"
                      label="Full Name"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      placeholder="John Doe"
                      error={errors.fullName}
                      maxLength={FIELD_LIMITS.fullName}
                      required
                      icon={<FaUser />}
                    />
                    <AuthInput
                      id="agent-email"
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
                    id="agent-phone"
                    label="Phone Number"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+234..."
                    maxLength={FIELD_LIMITS.phone}
                    icon={<FaPhone />}
                  />
                </div>

                {/* ── About You ── */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-pink-600">
                    <FaCircleInfo className="text-[10px]" />
                    About You
                  </h4>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Tell us about yourself
                      </label>
                      <WordLimitCounter value={formData.bio} limit={WORD_LIMITS.bio} />
                    </div>
                    <textarea
                      name="bio"
                      rows="3"
                      value={formData.bio}
                      onChange={handleChange}
                      placeholder="Your background, community involvement, and why you want to be an agent..."
                      className={`${TEXTAREA_CLASS} ${errors.bio ? "border-red-500" : "border-slate-200"}`}
                    />
                    {errors.bio && (
                      <p className="mt-1 text-xs font-bold text-red-500">{errors.bio}</p>
                    )}
                  </div>
                </div>

                {/* ── Experience & Reach ── */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-pink-600">
                    <FaBullhorn className="text-[10px]" />
                    Experience & Reach
                  </h4>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Agent Experience
                      </label>
                      <WordLimitCounter
                        value={formData.agentExperience}
                        limit={WORD_LIMITS.agentExperience}
                      />
                    </div>
                    <textarea
                      name="agentExperience"
                      rows="3"
                      value={formData.agentExperience}
                      onChange={handleChange}
                      placeholder="Describe your experience helping businesses, onboarding merchants, or working with local communities..."
                      className={`${TEXTAREA_CLASS} ${errors.agentExperience ? "border-red-500" : "border-slate-200"}`}
                    />
                    {errors.agentExperience && (
                      <p className="mt-1 text-xs font-bold text-red-500">
                        {errors.agentExperience}
                      </p>
                    )}
                  </div>
                  <AuthInput
                    id="agent-socialMediaLinks"
                    label="Social Media / Contact Links"
                    name="socialMediaLinks"
                    value={formData.socialMediaLinks}
                    onChange={handleChange}
                    placeholder="WhatsApp, Facebook, Instagram, LinkedIn..."
                    maxLength={FIELD_LIMITS.socialMediaLinks}
                    icon={<FaGlobe />}
                  />
                </div>

                {/* ── Agent Strategy ── */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-pink-600">
                    <FaGlobe className="text-[10px]" />
                    Agent Strategy
                  </h4>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        How do you plan to help businesses join and grow on{" "}
                        <BrandText className="normal-case" />?
                      </label>
                      <WordLimitCounter
                        value={formData.agentPlan}
                        limit={WORD_LIMITS.agentPlan}
                      />
                    </div>
                    <textarea
                      name="agentPlan"
                      rows="4"
                      value={formData.agentPlan}
                      onChange={handleChange}
                      placeholder="E.g. Visit local markets, refer shop owners, organise community meetups, etc..."
                      className={`${TEXTAREA_CLASS} ${errors.agentPlan ? "border-red-500" : "border-slate-200"}`}
                    />
                    {errors.agentPlan && (
                      <p className="mt-1 text-xs font-bold text-red-500">
                        {errors.agentPlan}
                      </p>
                    )}
                  </div>
                </div>

                {/* ── Questionnaire ── */}
                <div className="space-y-5 rounded-3xl border border-pink-100 bg-pink-50/50 p-5">
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-pink-600">
                    <FaCircleQuestion className="text-[10px]" />
                    Quick Questionnaire
                  </h4>

                  <div className="space-y-5">
                    <div>
                      <label className="mb-3 block text-[11px] font-bold text-slate-700">
                        Have you helped onboard businesses to any digital
                        platform before?
                      </label>
                      <div className="flex gap-4">
                        {["yes", "no"].map((opt) => (
                          <label
                            key={opt}
                            className="flex cursor-pointer items-center gap-2"
                          >
                            <input
                              type="radio"
                              name="q_hasOnboardedBefore"
                              value={opt}
                              checked={
                                formData.questionnaire.hasOnboardedBefore === opt
                              }
                              onChange={handleChange}
                              className="h-4 w-4 border-slate-300 text-pink-600 focus:ring-pink-500"
                            />
                            <span className="text-sm font-bold capitalize text-slate-600">
                              {opt}
                            </span>
                          </label>
                        ))}
                      </div>

                      {formData.questionnaire.hasOnboardedBefore === "yes" && (
                        <div className="mt-4">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <label className="block text-[11px] font-bold text-slate-700">
                              Which platform(s) or agency/agencies? (e.g. CAC,
                              SCUML, Tax Promax, Trademark Registry, etc.)
                            </label>
                            <span className="shrink-0 text-[10px] font-semibold text-slate-400">
                              {formData.questionnaire.platformNames.length}/{FIELD_LIMITS.platformNames}
                            </span>
                          </div>
                          <textarea
                            name="q_platformNames"
                            rows="3"
                            value={formData.questionnaire.platformNames}
                            onChange={handleChange}
                            placeholder="List the platforms or government agencies you have worked with, e.g. CAC registration, SCUML onboarding, Tax Promax, Trademark Registry, NAFDAC, etc."
                            className={`${TEXTAREA_CLASS} border-slate-200`}
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-3 block text-[11px] font-bold text-slate-700">
                        What is your availability?
                      </label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {["part-time", "full-time", "weekends-only"].map(
                          (opt) => (
                            <label
                              key={opt}
                              className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-pink-300"
                            >
                              <input
                                type="radio"
                                name="q_availability"
                                value={opt}
                                checked={
                                  formData.questionnaire.availability === opt
                                }
                                onChange={handleChange}
                                className="h-4 w-4 border-slate-300 text-pink-600 focus:ring-pink-500"
                              />
                              <span className="text-xs font-bold capitalize text-slate-600">
                                {opt.replace("-", " ")}
                              </span>
                            </label>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <AuthInput
                        id="agent-preferredRegion"
                        label="Preferred region/city for agent activities"
                        name="q_preferredRegion"
                        value={formData.questionnaire.preferredRegion}
                        onChange={handleChange}
                        placeholder="E.g. Jos, Kaduna, Abuja..."
                        error={errors.preferredRegion}
                        icon={<FaGlobe />}
                      />
                      <div className="mt-1 flex justify-end">
                        <WordLimitCounter
                          value={formData.questionnaire.preferredRegion}
                          limit={WORD_LIMITS.preferredRegion}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pb-2">
                  <AuthButton type="submit" loading={isSubmitting}>
                    <span>Submit Agent Application</span>
                    <FaArrowRight />
                  </AuthButton>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
