import React, { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { FaArrowLeft, FaShieldHalved, FaCircleNotch, FaCircleCheck } from "react-icons/fa6";

export default function AbuseReportDashboardView({ onBack, user }) {
  const [targetName, setTargetName] = useState("");
  const [category, setCategory] = useState("");
  const [details, setDetails] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");

    if (!category) return setSubmitError("Please select a violation category.");
    if (!details.trim()) return setSubmitError("Please provide details about the abuse.");

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("abuse_reports").insert([
        {
          reporter_id: user.id, 
          reporter_email: user.email, // <-- NEW: Safely attaching their exact account email
          category: category,
          target_name: targetName.trim() || "Unspecified",
          details: details.trim(),
          status: "pending",
        },
      ]);

      if (error) throw error;

      setIsSuccess(true);
      setTargetName("");
      setCategory("");
      setDetails("");

    } catch (err) {
      console.error("Error submitting abuse report:", err);
      setSubmitError("Failed to submit report. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="screen active">
        <div className="bg-white px-4 py-8 text-center rounded-lg border border-[#D5D9D9] max-w-[600px] mx-auto mt-6">
          <FaCircleCheck className="mx-auto text-5xl text-[#059669] mb-4" />
          <h2 className="text-[1.5rem] font-extrabold text-[#0F1111] mb-2">Report Submitted Successfully</h2>
          <p className="text-[0.95rem] text-[#565959] mb-8 leading-relaxed max-w-md mx-auto">
            Thank you for helping keep CTMerchant safe. Our trust and safety team will review your report immediately.
          </p>
          <button 
            onClick={onBack}
            className="w-full sm:w-auto px-8 py-3 rounded-lg bg-[#F7CA00] border border-[#F2C200] font-bold text-[#0F1111] shadow-[0_1px_2px_rgba(15,17,17,0.15)] hover:bg-[#F3D03E]"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen active">
      <div className="tool-block-wrap bg-white px-4 py-6 max-w-[700px] mx-auto rounded-lg border border-[#D5D9D9] mt-6">
        
        <button onClick={onBack} className="mb-6 flex items-center gap-2 text-[0.9rem] font-bold text-[#007185] hover:text-[#C40000] hover:underline">
          <FaArrowLeft /> Back to Dashboard
        </button>

        <div className="mb-6 flex items-center gap-3 border-b border-[#D5D9D9] pb-4">
          <FaShieldHalved className="text-3xl text-[#C40000]" />
          <div>
            <h2 className="text-[1.4rem] font-extrabold text-[#0F1111] leading-tight">
              Report Abuse
            </h2>
            <p className="text-[0.85rem] text-[#565959]">
              If you notice a store, product, or behavior that violates our guidelines, please report it here.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="form-group text-left">
            <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
              Target Name (Optional)
            </label>
            <p className="text-[0.75rem] text-[#565959] mb-1.5">The name of the store, merchant, or product you are reporting.</p>
            <input
              type="text"
              placeholder="e.g. 'Abuja Electronics' or 'Fake iPhone 14'"
              className="form-input w-full rounded border border-[#888C8C] px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)] focus:border-[#007185] focus:outline-none"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
            />
          </div>

          <div className="form-group text-left">
            <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
              Violation Category <span className="text-[#C40000]">*</span>
            </label>
            <select
              className="form-input w-full rounded border border-[#888C8C] bg-white px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)] focus:border-[#007185] focus:outline-none"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="">Select a category</option>
              <option value="Fraud/Scam">Fraud or Scam Attempt</option>
              <option value="Counterfeit">Counterfeit/Fake Products</option>
              <option value="Harassment">Harassment or Hate Speech</option>
              <option value="Inappropriate Content">Inappropriate/Offensive Content</option>
              <option value="Other">Other Violation</option>
            </select>
          </div>

          <div className="form-group text-left">
            <label className="form-label mb-[6px] block text-[0.9rem] font-bold text-[#0F1111]">
              Detailed Description <span className="text-[#C40000]">*</span>
            </label>
            <p className="text-[0.75rem] text-[#565959] mb-1.5">Provide as much evidence and detail as possible.</p>
            <textarea
              rows="5"
              placeholder="Describe the issue clearly..."
              className="form-input w-full rounded border border-[#888C8C] px-[14px] py-[10px] text-base shadow-[inset_0_1px_2px_rgba(15,17,17,.15)] focus:border-[#007185] focus:outline-none resize-y"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              required
            ></textarea>
          </div>

          {submitError && (
            <div className="rounded border border-[#C40000] bg-[#FFF8F8] p-3 text-[0.9rem] text-[#C40000] font-semibold flex items-center gap-2">
              <FaTriangleExclamation /> {submitError}
            </div>
          )}

          <div className="mt-2 border-t border-[#D5D9D9] pt-5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-lg bg-[#C40000] font-bold text-white shadow-[0_1px_2px_rgba(15,17,17,0.15)] hover:bg-[#A10000] disabled:opacity-50 transition"
            >
              {isSubmitting ? <><FaCircleNotch className="animate-spin" /> Submitting...</> : "Submit Secure Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}