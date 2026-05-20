import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import html2canvas from "html2canvas";
import { FaArrowLeft, FaCircleNotch, FaDownload } from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import ctmLogo from "../../assets/images/logo.jpg";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import { useStaffPortalSession } from "./StaffPortalShared";

/* ── helpers ─────────────────────────────────────────────── */
function getInitials(name) {
  return String(name || "CT")
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() || "")
    .slice(0, 2)
    .join("");
}

function fmtIssueDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

/* ── ID Card (renders at exactly 370 × 430 px) ───────────── */
function AgentCard({ agent, avatarUrl }) {
  const q         = agent.questionnaire || {};
  const name      = agent.full_name    || "Unknown Agent";
  const agentId   = agent.agent_id     || "CTM-AGT-?????";
  const email     = agent.email        || "";
  const phone     = agent.phone        || "";
  const region    = q.preferredRegion  || "";
  const issueDate = fmtIssueDate(agent.reviewed_at || agent.created_at);
  const initials  = getInitials(name);
  const qrValue   = `https://ctmerchant.com.ng/verify-agent?id=${encodeURIComponent(agentId)}`;

  const card    = { width:370, height:430, fontFamily:"'Inter',system-ui,-apple-system,sans-serif", position:"relative", overflow:"hidden", background:"#fff", borderRadius:20 };
  const hdr     = { height:108, background:"linear-gradient(135deg,#020617 0%,#0f172a 50%,#1a1340 100%)", position:"relative", display:"flex", alignItems:"center", padding:"0 18px 0 20px", gap:13 };
  const stripe  = { height:5, background:"linear-gradient(90deg,#10b981 0%,#db2777 52%,#7c3aed 100%)" };
  const body    = { padding:"16px 22px 0", display:"flex", flexDirection:"column", alignItems:"center" };
  const divider = { width:"100%", height:1, background:"linear-gradient(90deg,transparent,#e2e8f0,transparent)", margin:"11px 0" };
  const ftr     = { position:"absolute", bottom:0, left:0, right:0, height:44, background:"linear-gradient(90deg,#020617 0%,#0f172a 100%)", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 20px" };

  return (
    <div style={card}>

      {/* ── HEADER ── */}
      <div style={hdr}>
        {/* Logo */}
        <img
          src={ctmLogo}
          alt="CTM"
          crossOrigin="anonymous"
          style={{ width:42, height:42, borderRadius:10, border:"2px solid rgba(255,255,255,0.18)", background:"#fff", objectFit:"cover", padding:2, flexShrink:0, zIndex:1 }}
        />

        {/* Brand text */}
        <div style={{ zIndex:1, flex:1 }}>
          <div style={{ fontSize:16.5, fontWeight:900, letterSpacing:"0.04em", color:"#fff", lineHeight:1 }}>
            CTMerchant
          </div>
          <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:"0.28em", color:"#6ee7b7", marginTop:5, textTransform:"uppercase" }}>
            Field Agent
          </div>
          <div style={{ fontSize:7.5, fontWeight:600, letterSpacing:"0.1em", color:"rgba(255,255,255,0.36)", marginTop:3 }}>
            www.ctmerchant.com.ng
          </div>
        </div>

        {/* QR code — top-right, replaces Active chip */}
        <div style={{ zIndex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
          <div style={{ background:"#fff", padding:5, borderRadius:8, border:"1.5px solid rgba(255,255,255,0.15)" }}>
            <QRCodeCanvas
              value={qrValue}
              size={62}
              level="H"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#0f172a"
            />
          </div>
          <div style={{ fontSize:6.5, fontWeight:800, letterSpacing:"0.18em", color:"rgba(255,255,255,0.4)", textTransform:"uppercase" }}>
            Verify ID
          </div>
        </div>
      </div>

      {/* ── ACCENT STRIPE ── */}
      <div style={stripe} />

      {/* ── BODY ── */}
      <div style={body}>

        {/* Profile photo / initials */}
        <div style={{ position:"relative" }}>
          <div style={{ width:76, height:76, borderRadius:"50%", border:"3px solid #10b981", overflow:"hidden", background:avatarUrl?"transparent":"linear-gradient(135deg,#059669,#0d9488)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt={name} crossOrigin="anonymous" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              : <span style={{ fontSize:25, fontWeight:900, color:"#fff" }}>{initials}</span>
            }
          </div>
          <div style={{ position:"absolute", inset:-4, borderRadius:"50%", border:"2px solid rgba(16,185,129,0.2)", pointerEvents:"none" }} />
        </div>

        {/* Name */}
        <div style={{ marginTop:10, fontSize:17, fontWeight:900, color:"#0f172a", textAlign:"center", lineHeight:1.2, maxWidth:306, wordBreak:"break-word" }}>
          {name}
        </div>

        {/* Agent ID pill */}
        <div style={{ marginTop:6, fontSize:11.5, fontWeight:800, color:"#059669", fontFamily:"ui-monospace,'Cascadia Code',monospace", letterSpacing:"0.16em", background:"rgba(16,185,129,0.08)", border:"1px solid rgba(16,185,129,0.28)", borderRadius:6, padding:"3px 11px" }}>
          {agentId}
        </div>

        {/* Divider */}
        <div style={divider} />

        {/* Contact rows */}
        <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:7, paddingLeft:6 }}>
          {email && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:10.5, color:"#10b981", width:15, flexShrink:0 }}>✉</span>
              <span style={{ fontSize:11, fontWeight:700, color:"#1e293b" }}>{email}</span>
            </div>
          )}
          {phone && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:10.5, color:"#10b981", width:15, flexShrink:0 }}>📱</span>
              <span style={{ fontSize:11, fontWeight:700, color:"#1e293b" }}>{phone}</span>
            </div>
          )}
          {region && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:10.5, color:"#10b981", width:15, flexShrink:0 }}>📍</span>
              <span style={{ fontSize:11, fontWeight:700, color:"#1e293b" }}>{region}</span>
            </div>
          )}
        </div>

      </div>

      {/* ── FOOTER ── */}
      <div style={ftr}>
        <div>
          <div style={{ fontSize:6.5, fontWeight:700, color:"rgba(255,255,255,0.36)", letterSpacing:"0.16em", textTransform:"uppercase" }}>Issued</div>
          <div style={{ fontSize:9.5, fontWeight:800, color:"rgba(255,255,255,0.82)", marginTop:2 }}>{issueDate}</div>
        </div>
        <div style={{ width:1, height:22, background:"rgba(255,255,255,0.1)" }} />
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:6.5, fontWeight:700, color:"rgba(255,255,255,0.36)", letterSpacing:"0.16em", textTransform:"uppercase" }}>CTMerchant</div>
          <div style={{ fontSize:9.5, fontWeight:800, color:"#6ee7b7", marginTop:2, letterSpacing:"0.08em" }}>Agent Network</div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function StaffAgentIDCard() {
  const navigate         = useNavigate();
  const { state }        = useLocation();
  const { fetchingStaff }= useStaffPortalSession();
  const { notify }       = useGlobalFeedback();
  usePreventPullToRefresh();

  const agent      = state?.agent ?? null;
  const exportRef  = useRef(null);

  const [avatarUrl,   setAvatarUrl]   = useState(null);
  const [downloading, setDownloading] = useState(false);

  /* redirect if arrived without data */
  useEffect(() => {
    if (!fetchingStaff && !agent) {
      navigate("/staff-agent-applications", { replace: true });
    }
  }, [agent, fetchingStaff, navigate]);

  /* fetch profile avatar once */
  useEffect(() => {
    if (!agent?.user_id) return;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", agent.user_id)
      .maybeSingle()
      .then(({ data }) => { if (data?.avatar_url) setAvatarUrl(data.avatar_url); });
  }, [agent?.user_id]);

  if (!agent) return null;

  const agentId = agent.agent_id || "CTM-AGT-?????";

  /* ── download ── */
  const handleDownload = async () => {
    if (!exportRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 5,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });
      const blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error("Blob generation failed"))), "image/png", 1.0)
      );
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href  = url;
      link.download = `CTM_Agent_${agentId.replace(/-/g, "_")}_ID.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notify({ type: "success", title: "Card downloaded", message: `${agentId} ID card saved as PNG.` });
    } catch (err) {
      console.error("ID card download error:", err);
      notify({ type: "error", title: "Download failed", message: "Could not generate the card image. Please retry." });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#020617] font-sans">

      {/* ── Header ── */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-[#334155] bg-[#020617] px-4 py-4 sm:px-6 shadow-md z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-xl text-white transition-colors hover:text-emerald-400"
          >
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-2 text-base font-black tracking-wide text-white">
            <span className="text-emerald-400">◈</span> AGENT ID CARD
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-50 shadow-md"
        >
          {downloading ? <FaCircleNotch className="animate-spin" /> : <FaDownload />}
          {downloading ? "Generating…" : "Download PNG"}
        </button>
      </header>

      {/* ── Preview area ── */}
      <div className="flex flex-1 flex-col items-center py-10 px-4 overflow-y-auto">

        <p className="mb-5 text-[0.6rem] font-black uppercase tracking-widest text-slate-500">
          Preview — {agentId}
        </p>

        {/* Visible card — scaled to fit narrow screens */}
        <div
          className="overflow-x-auto w-full flex justify-center"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div
            className="shadow-[0_24px_80px_rgba(0,0,0,0.7)] origin-top"
            style={{ borderRadius: 20, overflow: "hidden", flexShrink: 0 }}
          >
            <AgentCard agent={agent} avatarUrl={avatarUrl} />
          </div>
        </div>

        {/* Info text */}
        <p className="mt-7 text-[0.6rem] font-semibold text-slate-600 text-center max-w-xs leading-relaxed">
          Downloads as a 1850 × 2150 px PNG — print-ready and suitable for digital sharing.
        </p>

        {/* Agent meta */}
        <div className="mt-6 flex gap-3 text-[0.6rem] font-black uppercase tracking-widest text-slate-700">
          <span>{agent.email}</span>
          <span>·</span>
          <span>{agent.status === "approved" ? "Active Agent" : "Pending"}</span>
        </div>
      </div>

      {/* ── Off-screen export card (captured by html2canvas at scale 5) ── */}
      <div
        style={{ position: "fixed", top: -9999, left: -9999, zIndex: -1 }}
        aria-hidden="true"
      >
        <div ref={exportRef} style={{ borderRadius: 0 }}>
          <AgentCard agent={agent} avatarUrl={avatarUrl} />
        </div>
      </div>
    </div>
  );
}
