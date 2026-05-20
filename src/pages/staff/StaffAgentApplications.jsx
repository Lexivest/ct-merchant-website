import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  FaArrowLeft,
  FaBan,
  FaBuildingUser,
  FaCircleCheck,
  FaCircleNotch,
  FaHandshake,
  FaIdCard,
  FaInbox,
  FaUser,
  FaXmark,
} from "react-icons/fa6";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { useStaffPortalSession } from "./StaffPortalShared";

// Sort: pending first → active approved → suspended last
function sortApplications(list) {
  return [...list].sort((a, b) => {
    const rank = (item) => {
      if (item.status === "pending") return 0;
      if (item.status === "approved" && !item.is_suspended) return 1;
      return 2; // suspended
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function StatusBadge({ status, agentId, isSuspended }) {
  if (status === "approved" && isSuspended) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-100 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-rose-800 border border-rose-200">
        <FaBan className="text-rose-600" /> Suspended
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-emerald-800 border border-emerald-200">
        <FaCircleCheck className="text-emerald-600" /> {agentId || "Approved"}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-widest text-amber-800 border border-amber-200">
      Pending Review
    </span>
  );
}

function TypeBadge({ type }) {
  const isCorporate = type === "corporate";
  return (
    <span className={`inline-flex items-center gap-1 text-[0.6rem] font-black uppercase tracking-widest ${isCorporate ? "text-blue-600" : "text-pink-600"}`}>
      {isCorporate ? <FaBuildingUser /> : <FaUser />}
      {isCorporate ? "Business Entity" : "Individual"}
    </span>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs sm:text-sm">
      <span className="w-32 flex-shrink-0 font-black uppercase tracking-wider text-[0.65rem] text-slate-400 pt-0.5">
        {label}
      </span>
      <span className="font-bold text-slate-800 break-all">{value}</span>
    </div>
  );
}

function TextBlock({ label, value }) {
  if (!value) return null;
  return (
    <div className="relative mt-2">
      <span className="absolute -top-2.5 left-4 bg-white px-2 text-[0.6rem] sm:text-[0.65rem] font-black uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <div className="text-sm sm:text-base text-slate-700 whitespace-pre-wrap bg-slate-50/50 p-4 sm:p-5 pt-5 rounded-xl border border-slate-200 leading-relaxed font-medium">
        {value}
      </div>
    </div>
  );
}

export default function StaffAgentApplications() {
  const navigate = useNavigate();
  const { authUser, isSuperAdmin, fetchingStaff } = useStaffPortalSession();
  const { notify } = useGlobalFeedback();
  usePreventPullToRefresh();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [processing, setProcessing] = useState(false);

  const fetchApplications = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("agent_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems(sortApplications(data || []));
    } catch (err) {
      console.error("Error fetching agent applications:", err);
      notify({
        type: "error",
        title: "Load failed",
        message: "Could not load agent applications. Please retry.",
      });
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, notify]);

  useEffect(() => {
    if (!fetchingStaff) fetchApplications();
  }, [fetchApplications, fetchingStaff]);

  // Shared helper — update one row in both state slices
  const patchItem = (updated) => {
    setItems((prev) => sortApplications(prev.map((item) => (item.id === updated.id ? updated : item))));
    setSelectedItem(updated);
  };

  const handleApprove = async () => {
    if (!selectedItem || !authUser?.id) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase
        .from("agent_applications")
        .update({ status: "approved", reviewed_by: authUser.id })
        .eq("id", selectedItem.id)
        .select()
        .single();
      if (error) throw error;
      patchItem(data);
      notify({
        type: "success",
        title: "Application approved",
        message: `Agent ID ${data.agent_id} has been issued.`,
      });
    } catch (err) {
      console.error("Error approving application:", err);
      notify({
        type: "error",
        title: "Approval failed",
        message: "Could not approve this application. Please retry.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem) return;
    const name = selectedItem.full_name || "this applicant";
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("agent_applications")
        .delete()
        .eq("id", selectedItem.id);
      if (error) throw error;
      setItems((prev) => prev.filter((item) => item.id !== selectedItem.id));
      setSelectedItem(null);
      notify({
        type: "info",
        title: "Application rejected",
        message: `The application from ${name} has been removed.`,
      });
    } catch (err) {
      console.error("Error rejecting application:", err);
      notify({
        type: "error",
        title: "Rejection failed",
        message: "Could not reject this application. Please retry.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSuspend = async () => {
    if (!selectedItem || !authUser?.id) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase
        .from("agent_applications")
        .update({ is_suspended: true, suspended_by: authUser.id, suspended_at: new Date().toISOString() })
        .eq("id", selectedItem.id)
        .select()
        .single();
      if (error) throw error;
      patchItem(data);
      notify({
        type: "info",
        title: "Agent suspended",
        message: `${data.full_name || "Agent"} (${data.agent_id}) has been suspended.`,
      });
    } catch (err) {
      console.error("Error suspending agent:", err);
      notify({
        type: "error",
        title: "Suspension failed",
        message: "Could not suspend this agent. Please retry.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!selectedItem || !authUser?.id) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase
        .from("agent_applications")
        .update({ is_suspended: false, suspended_by: null, suspended_at: null })
        .eq("id", selectedItem.id)
        .select()
        .single();
      if (error) throw error;
      patchItem(data);
      notify({
        type: "success",
        title: "Agent reinstated",
        message: `${data.full_name || "Agent"} (${data.agent_id}) is active again.`,
      });
    } catch (err) {
      console.error("Error reinstating agent:", err);
      notify({
        type: "error",
        title: "Reinstatement failed",
        message: "Could not reinstate this agent. Please retry.",
      });
    } finally {
      setProcessing(false);
    }
  };

  const q = selectedItem?.questionnaire || {};
  const applicantType = q.agentApplicantType || "individual";
  const isCorporate = applicantType === "corporate";
  const isPending = selectedItem?.status === "pending";
  const isApproved = selectedItem?.status === "approved";
  const isSuspended = Boolean(selectedItem?.is_suspended);

  // Context banner colours
  const bannerStyle = isPending
    ? "bg-amber-50 border-amber-200 text-amber-800"
    : isSuspended
    ? "bg-rose-50 border-rose-200 text-rose-800"
    : "bg-emerald-50 border-emerald-200 text-emerald-800";

  const bannerSubtitle = isPending
    ? "Review the application carefully before making a decision."
    : isSuspended
    ? "This agent is currently suspended and cannot operate."
    : "This agent is active and approved.";

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50 font-sans">

      {/* HEADER */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[#334155] bg-[#020617] px-4 py-4 sm:px-6 shadow-md z-10">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={() => navigate("/staff-dashboard")}
            className="text-xl text-white transition-colors hover:text-pink-500"
          >
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-2 text-base sm:text-lg font-black tracking-wide text-white">
            <FaHandshake className="text-emerald-400" /> AGENT APPLICATIONS
          </div>
        </div>
      </header>

      {/* MAIN SPLIT VIEW */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* LEFT: APPLICATION LIST */}
        <div className={`w-full lg:w-1/3 flex-shrink-0 border-r border-slate-200 bg-white overflow-y-auto custom-scrollbar absolute inset-0 lg:relative z-10 transition-transform duration-300 ${selectedItem ? "-translate-x-full lg:translate-x-0" : "translate-x-0"}`}>
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <FaCircleNotch className="animate-spin text-2xl text-emerald-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center text-slate-400">
              <FaInbox className="text-4xl mb-2 opacity-50" />
              <p className="text-sm font-bold">No applications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const iq = item.questionnaire || {};
                const itemType = iq.agentApplicantType || "individual";
                const isSelected = selectedItem?.id === item.id;
                const itemSuspended = Boolean(item.is_suspended);

                const hoverClass = itemSuspended
                  ? "hover:bg-rose-50/40 border-transparent"
                  : item.status === "approved"
                  ? "hover:bg-emerald-50/40 border-transparent"
                  : "hover:bg-amber-50/40 border-transparent";

                const selectedClass = itemSuspended
                  ? "bg-rose-50 border-rose-500 hidden lg:block"
                  : item.status === "approved"
                  ? "bg-emerald-50 border-emerald-600 hidden lg:block"
                  : "bg-amber-50 border-amber-500 hidden lg:block";

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`cursor-pointer p-4 transition-all border-l-4 ${isSelected ? selectedClass : hoverClass}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <TypeBadge type={itemType} />
                      <StatusBadge status={item.status} agentId={item.agent_id} isSuspended={itemSuspended} />
                    </div>

                    <h4 className="font-bold text-slate-900 line-clamp-1 pr-2 text-sm mb-1">
                      {item.full_name || "Unknown Applicant"}
                    </h4>

                    <p className="text-xs font-semibold text-slate-500 mb-1.5 line-clamp-1">
                      {item.email}
                    </p>

                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {item.bio}
                    </p>

                    <p className="text-[0.65rem] font-bold text-slate-400 mt-2 uppercase tracking-wider">
                      {new Date(item.created_at).toLocaleDateString()} •{" "}
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT: DETAIL PANE */}
        <div className={`w-full lg:flex-1 flex flex-col bg-slate-50 overflow-y-auto custom-scrollbar absolute inset-0 lg:relative z-20 transition-transform duration-300 ${selectedItem ? "translate-x-0" : "translate-x-full lg:translate-x-0 lg:flex"}`}>
          {selectedItem ? (
            <div className="p-4 sm:p-8 max-w-3xl mx-auto w-full pb-32 lg:pb-10">

              {/* Mobile back */}
              <button
                onClick={() => setSelectedItem(null)}
                className="lg:hidden mb-4 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800"
              >
                <FaArrowLeft /> Back to list
              </button>

              {/* Agent ID banner — shows for all approved agents; red tint when suspended */}
              {isApproved && selectedItem.agent_id && (
                <div className={`mb-4 flex items-center gap-3 rounded-xl p-4 shadow-sm border ${isSuspended ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
                  {isSuspended
                    ? <FaBan className="text-2xl text-rose-500 flex-shrink-0" />
                    : <FaCircleCheck className="text-2xl text-emerald-500 flex-shrink-0" />
                  }
                  <div>
                    <p className={`text-[0.65rem] font-black uppercase tracking-widest ${isSuspended ? "text-rose-600" : "text-emerald-600"}`}>
                      {isSuspended ? "Agent Suspended" : "Agent ID Issued"}
                    </p>
                    <p className="text-lg font-black text-slate-900 tracking-widest">{selectedItem.agent_id}</p>
                  </div>
                </div>
              )}

              {/* Suspension audit info */}
              {isSuspended && selectedItem.suspended_at && (
                <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3">
                  <p className="text-[0.65rem] font-black uppercase tracking-widest text-rose-500 mb-0.5">Suspended on</p>
                  <p className="text-xs font-bold text-slate-700">
                    {new Date(selectedItem.suspended_at).toLocaleString("en-NG", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  </p>
                </div>
              )}

              {/* Context banner */}
              <div className={`rounded-xl p-4 mb-4 sm:mb-6 shadow-sm border flex items-center gap-3 ${bannerStyle}`}>
                {isSuspended ? <FaBan className="text-xl sm:text-2xl flex-shrink-0" /> : <FaHandshake className="text-xl sm:text-2xl flex-shrink-0" />}
                <div>
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-widest">
                    {isCorporate ? "Corporate / Business Entity Application" : "Individual Agent Application"}
                  </h3>
                  <p className="text-[0.65rem] sm:text-xs font-medium opacity-80 mt-0.5">
                    {bannerSubtitle}
                  </p>
                </div>
              </div>

              {/* Identity card */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 mb-4 sm:mb-6">
                <div className="flex justify-between items-start mb-5 border-b border-slate-100 pb-4">
                  <div>
                    <h2 className="text-lg sm:text-2xl font-black text-slate-900">
                      {selectedItem.full_name || "Unknown Applicant"}
                    </h2>
                    <TypeBadge type={applicantType} />
                  </div>
                  <StatusBadge status={selectedItem.status} agentId={selectedItem.agent_id} isSuspended={isSuspended} />
                </div>

                <div className="flex flex-col gap-3">
                  <InfoRow label="Email" value={selectedItem.email} />
                  <InfoRow label="Phone" value={selectedItem.phone} />
                  {selectedItem.social_media_links && (
                    <InfoRow label="Links" value={selectedItem.social_media_links} />
                  )}
                  <InfoRow
                    label="Submitted"
                    value={new Date(selectedItem.created_at).toLocaleString("en-NG", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  />
                </div>
              </div>

              {/* Corporate fields */}
              {isCorporate && (
                <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-blue-100 mb-4 sm:mb-6">
                  <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-blue-600 mb-4 flex items-center gap-2">
                    <FaBuildingUser /> Business Details
                  </h3>
                  <div className="flex flex-col gap-3">
                    <InfoRow label="Business" value={q.businessName} />
                    <InfoRow label="RC / CAC No." value={q.rcNumber} />
                    <InfoRow label="Business Type" value={q.businessType} />
                    <InfoRow label="Contact Person" value={q.contactPersonName} />
                    <InfoRow label="Their Role" value={q.contactPersonRole} />
                  </div>
                </div>
              )}

              {/* Bio / Experience / Plan */}
              <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-200 mb-4 sm:mb-6 space-y-5">
                <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Application Details
                </h3>
                <TextBlock label={isCorporate ? "Business Description" : "About the Applicant"} value={selectedItem.bio} />
                <TextBlock label="Agent Experience" value={selectedItem.marketing_experience} />
                <TextBlock label="Agent Strategy / Plan" value={selectedItem.promotion_plan} />
              </div>

              {/* Questionnaire */}
              <div className="bg-pink-50/60 border border-pink-100 rounded-2xl p-4 sm:p-6 shadow-sm mb-4 sm:mb-6">
                <h3 className="text-[0.65rem] font-black uppercase tracking-widest text-pink-600 mb-4">
                  Questionnaire Answers
                </h3>
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="w-52 flex-shrink-0 text-[0.7rem] font-bold text-slate-500">Onboarded businesses before?</span>
                    <span className={`text-xs font-black capitalize px-2 py-0.5 rounded-md ${q.hasOnboardedBefore === "yes" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {q.hasOnboardedBefore || "No"}
                    </span>
                  </div>
                  {q.hasOnboardedBefore === "yes" && q.platformNames && (
                    <div>
                      <p className="text-[0.7rem] font-bold text-slate-500 mb-1.5">Platforms / agencies worked with:</p>
                      <p className="text-sm font-semibold text-slate-700 leading-relaxed bg-white rounded-lg border border-slate-200 p-3">
                        {q.platformNames}
                      </p>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <span className="w-52 flex-shrink-0 text-[0.7rem] font-bold text-slate-500">CTMerchant shop owner / service provider?</span>
                    <span className={`text-xs font-black capitalize px-2 py-0.5 rounded-md ${q.isCtmMerchant === "yes" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                      {q.isCtmMerchant || "No"}
                    </span>
                  </div>
                  {q.isCtmMerchant === "yes" && q.ctmId && (
                    <InfoRow label="CT ID" value={q.ctmId} />
                  )}
                  <div className="flex items-start gap-3">
                    <span className="w-52 flex-shrink-0 text-[0.7rem] font-bold text-slate-500">Availability</span>
                    <span className="text-xs font-black capitalize bg-blue-100 text-blue-800 px-2 py-0.5 rounded-md">
                      {(q.availability || "part-time").replace(/-/g, " ")}
                    </span>
                  </div>
                  {q.preferredRegion && (
                    <InfoRow label="Preferred Region" value={q.preferredRegion} />
                  )}
                </div>
              </div>

              {/* ── ACTION BAR ── */}

              {/* Pending → Approve + Reject */}
              {isPending && (
                <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto bg-white lg:rounded-2xl p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] lg:shadow-sm border-t lg:border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 z-30">
                  <p className="text-[0.65rem] font-black uppercase tracking-widest text-slate-400 hidden sm:block">
                    Review Decision
                  </p>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button
                      onClick={handleReject}
                      disabled={processing}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-[0.7rem] sm:text-xs font-black uppercase tracking-widest transition disabled:opacity-50"
                    >
                      {processing ? <FaCircleNotch className="animate-spin" /> : <FaXmark />}
                      Reject &amp; Remove
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={processing}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-[0.7rem] sm:text-xs font-black uppercase tracking-widest shadow-md transition disabled:opacity-50"
                    >
                      {processing ? <FaCircleNotch className="animate-spin" /> : <FaCircleCheck />}
                      Approve &amp; Issue ID
                    </button>
                  </div>
                </div>
              )}

              {/* Approved + not suspended → Mint ID Card + Suspend */}
              {isApproved && !isSuspended && (
                <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto bg-white lg:rounded-2xl p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] lg:shadow-sm border-t lg:border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 z-30">
                  <button
                    onClick={() => navigate("/staff-agent-id-card", { state: { agent: selectedItem } })}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[0.7rem] sm:text-xs font-black uppercase tracking-widest shadow-md transition"
                  >
                    <FaIdCard /> Mint ID Card
                  </button>
                  <button
                    onClick={handleSuspend}
                    disabled={processing}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-[0.7rem] sm:text-xs font-black uppercase tracking-widest transition disabled:opacity-50"
                  >
                    {processing ? <FaCircleNotch className="animate-spin" /> : <FaBan />}
                    Suspend Agent
                  </button>
                </div>
              )}

              {/* Approved + suspended → Unsuspend */}
              {isApproved && isSuspended && (
                <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto lg:left-auto lg:right-auto bg-white lg:rounded-2xl p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] lg:shadow-sm border-t lg:border border-rose-200 flex flex-col sm:flex-row items-center justify-between gap-3 z-30">
                  <p className="text-[0.65rem] font-black uppercase tracking-widest text-rose-400 hidden sm:block">
                    Agent is suspended
                  </p>
                  <button
                    onClick={handleUnsuspend}
                    disabled={processing}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl text-[0.7rem] sm:text-xs font-black uppercase tracking-widest shadow-md transition disabled:opacity-50"
                  >
                    {processing ? <FaCircleNotch className="animate-spin" /> : <FaCircleCheck />}
                    Reinstate Agent
                  </button>
                </div>
              )}

            </div>
          ) : (
            <div className="hidden lg:flex h-full flex-col items-center justify-center text-slate-300">
              <FaHandshake className="text-7xl mb-4 opacity-30" />
              <p className="text-lg font-bold text-slate-400">Select an application to review</p>
            </div>
          )}
        </div>
      </div>

      {/* Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        @media (min-width: 1024px) {
          .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </div>
  );
}
