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

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function calcExpiry(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

/* ── ID Card — portrait CR80 (340 × 540 px) ─────────────── */
function AgentCard({ agent, avatarUrl }) {
  const q          = agent.questionnaire || {};
  const name       = agent.full_name    || "Unknown Agent";
  const agentId    = agent.agent_id     || "CTM-AGT-?????";
  const email      = agent.email        || "";
  const phone      = agent.phone        || "";
  const region     = q.preferredRegion  || "";
  const issuedDate = fmtDate(agent.reviewed_at || agent.created_at);
  const expiryDate = calcExpiry(agent.reviewed_at || agent.created_at);
  const initials   = getInitials(name);
  const qrValue    = `https://ctmerchant.com.ng/verify-agent?id=${encodeURIComponent(agentId)}`;

  const lbl = { fontSize:9, fontWeight:800, color:"#94a3b8", letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:5 };
  const val = { fontSize:15, fontWeight:700, color:"#1e293b", lineHeight:1.3 };
  const divider = { height:1, background:"linear-gradient(90deg,transparent,#dde4ef,transparent)", marginTop:16 };

  return (
    <div style={{ width:340, height:540, fontFamily:"'Inter',system-ui,-apple-system,sans-serif", overflow:"hidden", background:"#fff", borderRadius:18, display:"flex", flexDirection:"column" }}>

      {/* ── HEADER ── */}
      <div style={{ height:130, background:"linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#3b82f6 100%)", display:"flex", alignItems:"center", padding:"0 16px", gap:12, flexShrink:0 }}>

        {/* Avatar */}
        <div style={{ width:80, height:80, borderRadius:"50%", border:"3px solid rgba(255,255,255,0.3)", overflow:"hidden", background:avatarUrl?"transparent":"linear-gradient(135deg,#2563eb,#1d4ed8)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {avatarUrl
            ? <img src={avatarUrl} alt={name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : <span style={{ fontSize:28, fontWeight:900, color:"#fff" }}>{initials}</span>
          }
        </div>

        {/* Brand text */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <div style={{ fontSize:20, fontWeight:900, letterSpacing:"0.04em", color:"#fff", lineHeight:1 }}>CTMerchant</div>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.28em", color:"#bfdbfe", textTransform:"uppercase" }}>Field Agent</div>
          <div style={{ fontSize:11, fontWeight:800, color:"#fff", fontFamily:"ui-monospace,monospace", letterSpacing:"0.1em", marginTop:5, background:"rgba(255,255,255,0.15)", borderRadius:5, padding:"3px 10px" }}>{agentId}</div>
          <div style={{ fontSize:8, fontWeight:700, color:"#fde68a", marginTop:3, letterSpacing:"0.08em" }}>www.ctmerchant.com.ng</div>
        </div>

        {/* QR */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, flexShrink:0 }}>
          <div style={{ background:"#fff", padding:4, borderRadius:8, border:"1.5px solid rgba(255,255,255,0.2)" }}>
            <QRCodeCanvas value={qrValue} size={68} level="H" includeMargin={false} bgColor="#ffffff" fgColor="#1e3a8a" />
          </div>
          <div style={{ fontSize:7, fontWeight:800, letterSpacing:"0.16em", color:"#fde68a", textTransform:"uppercase" }}>Verify ID</div>
        </div>
      </div>

      {/* ── ACCENT STRIPE ── */}
      <div style={{ height:5, background:"linear-gradient(90deg,#3b82f6 0%,#6366f1 52%,#1d4ed8 100%)", flexShrink:0 }} />

      {/* ── BODY — outer holds accent bars, inner holds flex content ── */}
      <div style={{ flex:1, position:"relative" }}>
        {/* Chocolate-pink accent bars — in plain container, not a flex parent */}
        <div style={{ position:"absolute", top:0, bottom:0, left:0, width:5, background:"linear-gradient(to bottom,#7b2d42,#c2607a,#8b3a52)", borderRadius:"0 3px 3px 0", zIndex:1 }} />
        <div style={{ position:"absolute", top:0, bottom:0, right:0, width:5, background:"linear-gradient(to bottom,#7b2d42,#c2607a,#8b3a52)", borderRadius:"3px 0 0 3px", zIndex:1 }} />

        {/* Flex content */}
        <div style={{ height:"100%", padding:"0 24px", display:"flex", flexDirection:"column", justifyContent:"space-evenly", boxSizing:"border-box" }}>

          {/* Name + Phone */}
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:16, alignItems:"end" }}>
              <div style={{ minWidth:0 }}>
                <div style={lbl}>Full Name</div>
                <div style={{ ...val, fontSize:18, fontWeight:900, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={lbl}>Phone</div>
                <div style={{ ...val, fontSize:14 }}>{phone || "—"}</div>
              </div>
            </div>
            <div style={divider} />
          </div>

          {/* Email + Location */}
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ minWidth:0 }}>
                <div style={lbl}>Email</div>
                <div style={{ ...val, fontSize:12, wordBreak:"break-all" }}>{email || "—"}</div>
              </div>
              <div style={{ minWidth:0 }}>
                <div style={lbl}>Region / Location</div>
                <div style={{ ...val, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{region || "—"}</div>
              </div>
            </div>
            <div style={divider} />
          </div>

          {/* Date Issued + Expiry */}
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <div style={lbl}>Date Issued</div>
                <div style={{ ...val, fontSize:14 }}>{issuedDate}</div>
              </div>
              <div>
                <div style={lbl}>Expiry Date</div>
                <div style={{ fontSize:14, fontWeight:800, color:"#dc2626" }}>{expiryDate}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER — flush below body ── */}
      <div style={{ height:48, background:"linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)", display:"flex", alignItems:"center", padding:"0 18px", gap:10, flexShrink:0 }}>
        <img
          src={ctmLogo}
          alt="CTM"
          crossOrigin="anonymous"
          style={{ width:26, height:26, borderRadius:6, border:"1px solid rgba(255,255,255,0.2)", background:"#fff", objectFit:"cover", padding:2, flexShrink:0 }}
        />
        <div>
          <div style={{ fontSize:10, fontWeight:800, color:"rgba(255,255,255,0.85)", letterSpacing:"0.05em" }}>CTMerchant Agent Network</div>
          <div style={{ fontSize:7.5, fontWeight:700, color:"#fde68a", letterSpacing:"0.1em", marginTop:1 }}>www.ctmerchant.com.ng</div>
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

  /* resolve avatar URL → convert to base64 data URL to sidestep CORS entirely.
     Priority: agent.profile_photo_url → RPC lookup by email → initials */
  useEffect(() => {
    if (!agent?.email) return;
    let cancelled = false;

    const toDataUrl = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror  = reject;
        reader.readAsDataURL(blob);
      });
    };

    const run = async () => {
      try {
        // 1. Prefer the manually-set photo on the agent record itself
        let rawUrl = agent.profile_photo_url || null;

        // 2. Fall back to profile avatar looked up by email via RPC
        if (!rawUrl) {
          const { data } = await supabase.rpc("get_agent_avatar_by_email", {
            p_email: agent.email,
          });
          rawUrl = data || null;
        }

        if (!rawUrl || cancelled) return;

        const dataUrl = await toDataUrl(rawUrl);
        if (!cancelled) setAvatarUrl(dataUrl);
      } catch {
        // silently fall back to initials
      }
    };

    run();
    return () => { cancelled = true; };
  }, [agent?.email, agent?.profile_photo_url]);

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
          Downloads as a 1700 × 2700 px PNG — print-ready and suitable for digital sharing.
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
