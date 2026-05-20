import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
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

/* ── Canvas helpers (mirrors MerchantPromoBanner approach) ── */
function fetchDataUrl(url) {
  if (!url) return Promise.resolve("");
  return fetch(url, { mode: "cors" })
    .then((r) => r.blob())
    .then((blob) => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(String(reader.result || ""));
      reader.onerror  = () => rej();
      reader.readAsDataURL(blob);
    }))
    .catch(() => "");
}

function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const img = new Image();
    img.onload  = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/* rounded-rect path used for clipping and filling */
function rrect(ctx, x, y, w, h, r) {
  const s = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + s, y);
  ctx.lineTo(x + w - s, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + s);
  ctx.lineTo(x + w, y + h - s);
  ctx.quadraticCurveTo(x + w, y + h, x + w - s, y + h);
  ctx.lineTo(x + s, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - s);
  ctx.lineTo(x, y + s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.closePath();
}

function clip(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1).trimEnd();
  return t + "…";
}

/* ── Canvas card generator ───────────────────────────────── */
async function generateAgentCardBlob(agent, avatarDataUrl, ctmLogoSrc) {
  const S  = 5;           // scale factor → print-ready 1700 × 2700 px
  const W  = 340 * S;
  const H  = 540 * S;

  const q          = agent.questionnaire || {};
  const name       = agent.full_name    || "Unknown Agent";
  const agentId    = agent.agent_id     || "CTM-AGT-?????";
  const email      = agent.email        || "—";
  const phone      = agent.phone        || "—";
  const region     = q.preferredRegion  || "—";
  const issuedDate = fmtDate(agent.reviewed_at || agent.created_at);
  const expiryDate = calcExpiry(agent.reviewed_at || agent.created_at);
  const initials   = getInitials(name);
  const qrApiUrl   = `https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent(`https://ctmerchant.com.ng/verify-agent?id=${encodeURIComponent(agentId)}`)}`;

  /* fetch QR + logo as data URLs in parallel */
  const [qrDataUrl, logoDataUrl] = await Promise.all([
    fetchDataUrl(qrApiUrl),
    fetchDataUrl(ctmLogoSrc),
  ]);
  const [avatarImg, qrImg, logoImg] = await Promise.all([
    loadImg(avatarDataUrl),
    loadImg(qrDataUrl),
    loadImg(logoDataUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  /* ── HEADER ──────────────────────────────────────────────── */
  const hdrH = 130 * S;
  const hg = ctx.createLinearGradient(0, 0, W, hdrH);
  hg.addColorStop(0,    "#1e3a8a");
  hg.addColorStop(0.55, "#1d4ed8");
  hg.addColorStop(1,    "#3b82f6");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, hdrH);

  /* avatar circle */
  const avD  = 80 * S;
  const avX  = 16 * S;
  const avY  = (hdrH - avD) / 2;
  const avCX = avX + avD / 2;
  const avCY = avY + avD / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avCX, avCY, avD / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    ctx.drawImage(avatarImg, avX, avY, avD, avD);
  } else {
    const ag = ctx.createLinearGradient(avX, avY, avX + avD, avY + avD);
    ag.addColorStop(0, "#2563eb");
    ag.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = ag;
    ctx.fillRect(avX, avY, avD, avD);
    ctx.font = `900 ${28 * S}px Inter,Arial,sans-serif`;
    ctx.fillStyle    = "#fff";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, avCX, avCY);
  }
  ctx.restore();
  /* avatar border ring */
  ctx.beginPath();
  ctx.arc(avCX, avCY, avD / 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth   = 3 * S;
  ctx.stroke();

  /* QR tile */
  const qrSz   = 68 * S;
  const qrPd   = 4 * S;
  const qrTile = qrSz + qrPd * 2;
  const qrX    = W - 16 * S - qrTile;
  const qrY    = (hdrH - qrTile) / 2;

  ctx.fillStyle = "#fff";
  rrect(ctx, qrX, qrY, qrTile, qrTile, 8 * S);
  ctx.fill();
  if (qrImg) ctx.drawImage(qrImg, qrX + qrPd, qrY + qrPd, qrSz, qrSz);

  ctx.font         = `800 ${7 * S}px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "#fde68a";
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillText("VERIFY ID", qrX + qrTile / 2, qrY + qrTile + 4 * S);

  /* brand text block, centered between avatar and QR */
  const brandCX = avX + avD + (qrX - avX - avD) / 2;
  ctx.textAlign = "center";

  const line1Size = 20 * S;
  const line2Size = 10 * S;
  const line3Size = 11 * S;
  const line4Size = 8 * S;
  const totalBrandH = line1Size * 1.25 + 3 * S
                    + line2Size * 1.25 + 5 * S
                    + 22 * S           + 3 * S  /* pill */
                    + line4Size * 1.25;
  let bY = (hdrH - totalBrandH) / 2;

  ctx.font         = `900 ${line1Size}px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "#fff";
  ctx.textBaseline = "top";
  ctx.fillText("CTMerchant", brandCX, bY);
  bY += line1Size * 1.25 + 3 * S;

  ctx.font      = `800 ${line2Size}px Inter,Arial,sans-serif`;
  ctx.fillStyle = "#bfdbfe";
  ctx.fillText("FIELD AGENT", brandCX, bY);
  bY += line2Size * 1.25 + 5 * S;

  /* agent ID pill */
  ctx.font = `800 ${line3Size}px ui-monospace,monospace`;
  const pillW = ctx.measureText(agentId).width + 20 * S;
  const pillH = 22 * S;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  rrect(ctx, brandCX - pillW / 2, bY, pillW, pillH, 5 * S);
  ctx.fill();
  ctx.fillStyle    = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(agentId, brandCX, bY + pillH / 2);
  bY += pillH + 3 * S;

  ctx.font         = `700 ${line4Size}px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "#fde68a";
  ctx.textBaseline = "top";
  ctx.fillText("www.ctmerchant.com.ng", brandCX, bY);

  /* ── ACCENT STRIPE ───────────────────────────────────────── */
  const strH = 5 * S;
  const strY = hdrH;
  const sg   = ctx.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0,    "#3b82f6");
  sg.addColorStop(0.52, "#6366f1");
  sg.addColorStop(1,    "#1d4ed8");
  ctx.fillStyle = sg;
  ctx.fillRect(0, strY, W, strH);

  /* ── FOOTER ──────────────────────────────────────────────── */
  const ftH = 48 * S;
  const ftY = H - ftH;
  const fg  = ctx.createLinearGradient(0, 0, W, 0);
  fg.addColorStop(0, "#1e3a8a");
  fg.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = fg;
  ctx.fillRect(0, ftY, W, ftH);

  /* footer logo */
  const lgSz = 26 * S;
  const lgX  = 18 * S;
  const lgY  = ftY + (ftH - lgSz) / 2;
  if (logoImg) {
    ctx.save();
    rrect(ctx, lgX, lgY, lgSz, lgSz, 6 * S);
    ctx.clip();
    ctx.drawImage(logoImg, lgX, lgY, lgSz, lgSz);
    ctx.restore();
  }

  const ftTX = lgX + lgSz + 10 * S;
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.font         = `800 ${10 * S}px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "rgba(255,255,255,0.85)";
  ctx.fillText("CTMerchant Agent Network", ftTX, ftY + ftH * 0.37);
  ctx.font      = `700 ${7.5 * S}px Inter,Arial,sans-serif`;
  ctx.fillStyle = "#fde68a";
  ctx.fillText("www.ctmerchant.com.ng", ftTX, ftY + ftH * 0.70);

  /* ── BODY ────────────────────────────────────────────────── */
  const bdY  = strY + strH;
  const bdH  = ftY - bdY;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, bdY, W, bdH);

  /* chocolate-pink vertical bars */
  const barW = 5 * S;
  const mkBar = () => {
    const g = ctx.createLinearGradient(0, bdY, 0, bdY + bdH);
    g.addColorStop(0,   "#7b2d42");
    g.addColorStop(0.5, "#c2607a");
    g.addColorStop(1,   "#8b3a52");
    return g;
  };
  ctx.fillStyle = mkBar(); ctx.fillRect(0,       bdY, barW, bdH);
  ctx.fillStyle = mkBar(); ctx.fillRect(W - barW, bdY, barW, bdH);

  /* body layout constants */
  const pad   = 24 * S;
  const cX    = pad;
  const cW    = W - pad * 2;
  const halfX = cX + cW / 2 + 8 * S;
  const halfW = cW / 2 - 8 * S;

  const lblSz  = 9  * S;
  const nameSz = 18 * S;
  const phSz   = 14 * S;
  const emSz   = 12 * S;
  const locSz  = 13 * S;
  const dtSz   = 14 * S;

  const lblH  = lblSz * 1.3;
  const lblMB = 5 * S;
  const divMT = 16 * S;
  const divH  = 1 * S;

  /* estimated heights of each section (label + margin + value) */
  const sec1H = lblH + lblMB + nameSz * 1.3 + divMT + divH;
  const sec2H = lblH + lblMB + emSz   * 1.3 + divMT + divH;
  const sec3H = lblH + lblMB + dtSz   * 1.3;
  const gap   = (bdH - sec1H - sec2H - sec3H) / 4;  /* space-evenly */

  /* helpers */
  const drawLbl = (text, x, y, align = "left") => {
    ctx.font         = `800 ${lblSz}px Inter,Arial,sans-serif`;
    ctx.fillStyle    = "#94a3b8";
    ctx.textAlign    = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  };
  const drawVal = (text, x, y, sz, color = "#1e293b", weight = 700, align = "left") => {
    ctx.font         = `${weight} ${sz}px Inter,Arial,sans-serif`;
    ctx.fillStyle    = color;
    ctx.textAlign    = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  };
  const drawDivider = (y) => {
    const dg = ctx.createLinearGradient(0, 0, W, 0);
    dg.addColorStop(0,   "rgba(221,228,239,0)");
    dg.addColorStop(0.5, "#dde4ef");
    dg.addColorStop(1,   "rgba(221,228,239,0)");
    ctx.fillStyle = dg;
    ctx.fillRect(barW, y, W - barW * 2, divH);
  };

  /* SECTION 1 — Name + Phone */
  const s1Top  = bdY + gap;
  const s1LblY = s1Top + lblH;
  const s1ValY = s1LblY + lblMB + nameSz * 1.2;

  ctx.font = `900 ${nameSz}px Inter,Arial,sans-serif`;
  drawLbl("FULL NAME", cX, s1LblY);
  drawVal(clip(ctx, name, cW * 0.56), cX, s1ValY, nameSz, "#1e293b", 900);

  ctx.font = `700 ${phSz}px Inter,Arial,sans-serif`;
  drawLbl("PHONE", cX + cW, s1LblY, "right");
  drawVal(phone, cX + cW, s1ValY, phSz, "#1e293b", 700, "right");

  drawDivider(s1ValY + divMT);

  /* SECTION 2 — Email + Location */
  const s2Top  = s1Top + sec1H + gap;
  const s2LblY = s2Top + lblH;
  const s2ValY = s2LblY + lblMB + emSz * 1.2;

  ctx.font = `700 ${emSz}px Inter,Arial,sans-serif`;
  drawLbl("EMAIL", cX, s2LblY);
  drawVal(clip(ctx, email, cW / 2 - 12 * S), cX, s2ValY, emSz);

  ctx.font = `700 ${locSz}px Inter,Arial,sans-serif`;
  drawLbl("REGION / LOCATION", halfX, s2LblY);
  drawVal(clip(ctx, region, halfW), halfX, s2ValY, locSz);

  drawDivider(s2ValY + divMT);

  /* SECTION 3 — Dates */
  const s3Top  = s2Top + sec2H + gap;
  const s3LblY = s3Top + lblH;
  const s3ValY = s3LblY + lblMB + dtSz * 1.2;

  ctx.font = `700 ${dtSz}px Inter,Arial,sans-serif`;
  drawLbl("DATE ISSUED", cX, s3LblY);
  drawVal(issuedDate, cX, s3ValY, dtSz);

  ctx.font = `800 ${dtSz}px Inter,Arial,sans-serif`;
  drawLbl("EXPIRY DATE", halfX, s3LblY);
  drawVal(expiryDate, halfX, s3ValY, dtSz, "#dc2626", 800);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Blob generation failed"))),
      "image/png",
      1,
    );
  });
}

/* ── ID Card preview component (screen only) ─────────────── */
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

  const lbl     = { fontSize:9, fontWeight:800, color:"#94a3b8", letterSpacing:"0.18em", textTransform:"uppercase", marginBottom:5 };
  const val     = { fontSize:15, fontWeight:700, color:"#1e293b", lineHeight:1.3 };
  const divider = { height:1, background:"linear-gradient(90deg,transparent,#dde4ef,transparent)", marginTop:16 };

  return (
    <div style={{ width:340, height:540, fontFamily:"'Inter',system-ui,-apple-system,sans-serif", overflow:"hidden", background:"#fff", borderRadius:18, display:"flex", flexDirection:"column" }}>

      {/* ── HEADER ── */}
      <div style={{ height:130, background:"linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#3b82f6 100%)", display:"flex", alignItems:"center", padding:"0 16px", gap:12, flexShrink:0 }}>
        <div style={{ width:80, height:80, borderRadius:"50%", border:"3px solid rgba(255,255,255,0.3)", overflow:"hidden", background:avatarUrl?"transparent":"linear-gradient(135deg,#2563eb,#1d4ed8)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {avatarUrl
            ? <img src={avatarUrl} alt={name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : <span style={{ fontSize:28, fontWeight:900, color:"#fff" }}>{initials}</span>
          }
        </div>
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <div style={{ fontSize:20, fontWeight:900, letterSpacing:"0.04em", color:"#fff", lineHeight:1 }}>CTMerchant</div>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.28em", color:"#bfdbfe", textTransform:"uppercase" }}>Field Agent</div>
          <div style={{ fontSize:11, fontWeight:800, color:"#fff", fontFamily:"ui-monospace,monospace", letterSpacing:"0.1em", marginTop:5, background:"rgba(255,255,255,0.15)", borderRadius:5, padding:"3px 10px" }}>{agentId}</div>
          <div style={{ fontSize:8, fontWeight:700, color:"#fde68a", marginTop:3, letterSpacing:"0.08em" }}>www.ctmerchant.com.ng</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, flexShrink:0 }}>
          <div style={{ background:"#fff", padding:4, borderRadius:8, border:"1.5px solid rgba(255,255,255,0.2)" }}>
            <QRCodeCanvas value={qrValue} size={68} level="H" includeMargin={false} bgColor="#ffffff" fgColor="#1e3a8a" />
          </div>
          <div style={{ fontSize:7, fontWeight:800, letterSpacing:"0.16em", color:"#fde68a", textTransform:"uppercase" }}>Verify ID</div>
        </div>
      </div>

      {/* ── ACCENT STRIPE ── */}
      <div style={{ height:5, background:"linear-gradient(90deg,#3b82f6 0%,#6366f1 52%,#1d4ed8 100%)", flexShrink:0 }} />

      {/* ── BODY ── */}
      <div style={{ flex:1, position:"relative" }}>
        <div style={{ position:"absolute", top:0, bottom:0, left:0, width:5, background:"linear-gradient(to bottom,#7b2d42,#c2607a,#8b3a52)", borderRadius:"0 3px 3px 0", zIndex:1 }} />
        <div style={{ position:"absolute", top:0, bottom:0, right:0, width:5, background:"linear-gradient(to bottom,#7b2d42,#c2607a,#8b3a52)", borderRadius:"3px 0 0 3px", zIndex:1 }} />
        <div style={{ height:"100%", padding:"0 24px", display:"flex", flexDirection:"column", justifyContent:"space-evenly", boxSizing:"border-box" }}>
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

      {/* ── FOOTER ── */}
      <div style={{ height:48, background:"linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)", display:"flex", alignItems:"center", padding:"0 18px", gap:10, flexShrink:0 }}>
        <img src={ctmLogo} alt="CTM" crossOrigin="anonymous" style={{ width:26, height:26, borderRadius:6, border:"1px solid rgba(255,255,255,0.2)", background:"#fff", objectFit:"cover", padding:2, flexShrink:0 }} />
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

  const agent = state?.agent ?? null;

  const [avatarUrl,   setAvatarUrl]   = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!fetchingStaff && !agent) {
      navigate("/staff-agent-applications", { replace: true });
    }
  }, [agent, fetchingStaff, navigate]);

  /* resolve avatar → base64 data URL (CORS-free) */
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

    (async () => {
      try {
        let rawUrl = agent.profile_photo_url || null;
        if (!rawUrl) {
          const { data } = await supabase.rpc("get_agent_avatar_by_email", { p_email: agent.email });
          rawUrl = data || null;
        }
        if (!rawUrl || cancelled) return;
        const dataUrl = await toDataUrl(rawUrl);
        if (!cancelled) setAvatarUrl(dataUrl);
      } catch { /* fall back to initials */ }
    })();

    return () => { cancelled = true; };
  }, [agent?.email, agent?.profile_photo_url]);

  if (!agent) return null;

  const agentId = agent.agent_id || "CTM-AGT-?????";

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await generateAgentCardBlob(agent, avatarUrl, ctmLogo);
      const url  = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href     = url;
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

      <header className="flex flex-shrink-0 items-center justify-between border-b border-[#334155] bg-[#020617] px-4 py-4 sm:px-6 shadow-md z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-xl text-white transition-colors hover:text-emerald-400">
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

      <div className="flex flex-1 flex-col items-center py-10 px-4 overflow-y-auto">
        <p className="mb-5 text-[0.6rem] font-black uppercase tracking-widest text-slate-500">
          Preview — {agentId}
        </p>
        <div className="overflow-x-auto w-full flex justify-center" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="shadow-[0_24px_80px_rgba(0,0,0,0.7)] origin-top" style={{ borderRadius: 20, overflow: "hidden", flexShrink: 0 }}>
            <AgentCard agent={agent} avatarUrl={avatarUrl} />
          </div>
        </div>
        <p className="mt-7 text-[0.6rem] font-semibold text-slate-600 text-center max-w-xs leading-relaxed">
          Downloads as a 1700 × 2700 px PNG — print-ready and suitable for digital sharing.
        </p>
        <div className="mt-6 flex gap-3 text-[0.6rem] font-black uppercase tracking-widest text-slate-700">
          <span>{agent.email}</span>
          <span>·</span>
          <span>{agent.status === "approved" ? "Active Agent" : "Pending"}</span>
        </div>
      </div>
    </div>
  );
}
