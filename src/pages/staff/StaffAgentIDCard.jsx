import React, { useEffect, useRef, useState } from "react";
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

/* ── Canvas helpers (same pattern as MerchantPromoBanner) ── */
function fetchDataUrl(url) {
  if (!url) return Promise.resolve("");
  return fetch(url, { cache: "force-cache", mode: "cors" })
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
function clipText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1).trimEnd();
  return t + "…";
}

/* ── Canvas card — 800 × 1080 px (matches promo banner exactly) ── */
async function generateAgentCardBlob(agent, avatarDataUrl, ctmLogoSrc, qrDataUrl) {
  await document.fonts.ready;

  /* dimensions mirror MerchantPromoBanner exactly */
  const W       = 800;
  const H       = 1080;
  const hdrH    = 240;   /* same as promobanner headerHeight */
  const ftH     = 88;    /* same as promobanner footerHeight */
  const strH    = 6;     /* accent stripe */
  const bdY     = hdrH + strH;
  const bdH     = H - hdrH - strH - ftH;   /* 746 px */
  const ftY     = H - ftH;

  const q          = agent.questionnaire || {};
  const name       = agent.full_name    || "Unknown Agent";
  const agentId    = agent.agent_id     || "CTM-AGT-?????";
  const email      = agent.email        || "—";
  const phone      = agent.phone        || "—";
  const region     = q.preferredRegion  || "—";
  const issuedDate = fmtDate(agent.reviewed_at || agent.created_at);
  const expiryDate = calcExpiry(agent.reviewed_at || agent.created_at);
  const initials   = getInitials(name);

  const logoDataUrl = await fetchDataUrl(ctmLogoSrc);
  const [avatarImg, qrImg, logoImg] = await Promise.all([
    loadImg(avatarDataUrl),
    loadImg(qrDataUrl),
    loadImg(logoDataUrl),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  /* ── HEADER (0 – 240 px) ───────────────────────────────── */
  const hg = ctx.createLinearGradient(0, 0, W, hdrH);
  hg.addColorStop(0,    "#1e3a8a");
  hg.addColorStop(0.55, "#1d4ed8");
  hg.addColorStop(1,    "#3b82f6");
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, hdrH);

  /* avatar — mirrors promobanner logoSize=152, logoX=24 */
  const avD  = 152;
  const avX  = 24;
  const avY  = (hdrH - avD) / 2;   /* 44 */
  const avCX = avX + avD / 2;
  const avCY = avY + avD / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avCX, avCY, avD / 2, 0, Math.PI * 2);
  ctx.clip();
  if (avatarImg) {
    /* object-fit:cover — scale to fill circle, crop excess edges */
    const scale  = Math.max(avD / avatarImg.naturalWidth, avD / avatarImg.naturalHeight);
    const drawW  = avatarImg.naturalWidth  * scale;
    const drawH  = avatarImg.naturalHeight * scale;
    const drawX  = avX + (avD - drawW) / 2;
    const drawY  = avY + (avD - drawH) / 2;
    ctx.drawImage(avatarImg, drawX, drawY, drawW, drawH);
  } else {
    const ag = ctx.createLinearGradient(avX, avY, avX + avD, avY + avD);
    ag.addColorStop(0, "#2563eb");
    ag.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = ag;
    ctx.fillRect(avX, avY, avD, avD);
    ctx.font = `900 56px Inter,Arial,sans-serif`;
    ctx.fillStyle    = "#fff";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, avCX, avCY);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(avCX, avCY, avD / 2, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth   = 4;
  ctx.stroke();

  /* QR tile — mirrors promobanner qrX = W - logoX - logoSize */
  const qrTile = 152;
  const qrPad  = 10;
  const qrSz   = qrTile - qrPad * 2;   /* 132 */
  const qrX    = W - avX - qrTile;     /* 624 */
  const qrY    = (hdrH - qrTile) / 2;  /* 44 */

  ctx.fillStyle = "#fff";
  rrect(ctx, qrX, qrY, qrTile, qrTile, 12);
  ctx.fill();
  if (qrImg) ctx.drawImage(qrImg, qrX + qrPad, qrY + qrPad, qrSz, qrSz);

  ctx.font         = `800 19px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "#fde68a";
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillText("VERIFY ID", qrX + qrTile / 2, qrY + qrTile + 7);

  /* brand text — centered in the band between avatar and QR */
  const brandCX = (avX + avD + qrX) / 2;  /* 400 — exact center */
  let bY = 35;

  ctx.textAlign = "center";

  ctx.font         = `900 52px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "#fff";
  ctx.textBaseline = "top";
  ctx.fillText("CTMerchant", brandCX, bY);
  bY += 65;

  ctx.font      = `800 24px Inter,Arial,sans-serif`;
  ctx.fillStyle = "#fde68a";
  ctx.fillText("FIELD AGENT", brandCX, bY);
  bY += 35;

  /* agent ID pill */
  ctx.font = `800 23px ui-monospace,monospace`;
  const pillW = ctx.measureText(agentId).width + 32;
  const pillH = 42;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  rrect(ctx, brandCX - pillW / 2, bY, pillW, pillH, 8);
  ctx.fill();
  ctx.fillStyle    = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(agentId, brandCX, bY + pillH / 2);
  bY += pillH + 7;

  ctx.font         = `700 23px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "#fde68a";
  ctx.textBaseline = "top";
  ctx.fillText("www.ctmerchant.com.ng", brandCX, bY);

  /* ── ACCENT STRIPE ──────────────────────────────────────── */
  const sg = ctx.createLinearGradient(0, 0, W, 0);
  sg.addColorStop(0,    "#3b82f6");
  sg.addColorStop(0.52, "#6366f1");
  sg.addColorStop(1,    "#1d4ed8");
  ctx.fillStyle = sg;
  ctx.fillRect(0, hdrH, W, strH);

  /* ── FOOTER ─────────────────────────────────────────────── */
  const fg = ctx.createLinearGradient(0, 0, W, 0);
  fg.addColorStop(0, "#1e3a8a");
  fg.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = fg;
  ctx.fillRect(0, ftY, W, ftH);

  const lgSz = 44;
  const lgX  = 28;
  const lgY  = ftY + (ftH - lgSz) / 2;
  if (logoImg) {
    ctx.save();
    rrect(ctx, lgX, lgY, lgSz, lgSz, 8);
    ctx.clip();
    ctx.drawImage(logoImg, lgX, lgY, lgSz, lgSz);
    ctx.restore();
  }
  const ftTX = lgX + lgSz + 14;
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.font         = `800 18px Inter,Arial,sans-serif`;
  ctx.fillStyle    = "rgba(255,255,255,0.88)";
  ctx.fillText("CTMerchant Agent Network", ftTX, ftY + ftH * 0.36);
  ctx.font      = `700 13px Inter,Arial,sans-serif`;
  ctx.fillStyle = "#fde68a";
  ctx.fillText("www.ctmerchant.com.ng", ftTX, ftY + ftH * 0.70);

  /* ── BODY (246 – 992 px = 746 px) ──────────────────────── */
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, bdY, W, bdH);

  /* chocolate-pink vertical bars */
  const barW = 8;
  const mkBar = () => {
    const g = ctx.createLinearGradient(0, bdY, 0, bdY + bdH);
    g.addColorStop(0,   "#7b2d42");
    g.addColorStop(0.5, "#c2607a");
    g.addColorStop(1,   "#8b3a52");
    return g;
  };
  ctx.fillStyle = mkBar(); ctx.fillRect(0,       bdY, barW, bdH);
  ctx.fillStyle = mkBar(); ctx.fillRect(W - barW, bdY, barW, bdH);

  /* body content */
  const pad  = 40;
  const cX   = pad;
  const cW   = W - pad * 2;
  const half = cX + cW / 2 + 12;
  const halfW = cW / 2 - 12;

  /* font sizes — sized for legibility at 800 × 1080 */
  const lblSz  = 18;
  const nameSz = 48;
  const phSz   = 36;
  const emSz   = 28;
  const locSz  = 30;
  const dtSz   = 34;
  const lblMB  = 12;
  const divMT  = 32;
  const divH   = 2;

  /* section heights for space-evenly calculation */
  const sec1H = lblSz * 1.3 + lblMB + nameSz * 1.3 + divMT + divH;
  const sec2H = lblSz * 1.3 + lblMB + locSz  * 1.3 + divMT + divH;
  const sec3H = lblSz * 1.3 + lblMB + dtSz   * 1.3;
  const gap   = (bdH - sec1H - sec2H - sec3H) / 4;

  const drawLbl = (text, x, align = "left") => (y) => {
    ctx.font         = `800 ${lblSz}px Inter,Arial,sans-serif`;
    ctx.fillStyle    = "#94a3b8";
    ctx.textAlign    = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
    return y + lblSz * 1.3 + lblMB;
  };
  const drawVal = (text, x, sz, color, weight, align = "left") => (y) => {
    ctx.font         = `${weight} ${sz}px Inter,Arial,sans-serif`;
    ctx.fillStyle    = color;
    ctx.textAlign    = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
    return y + sz * 1.3;
  };
  const drawDiv = (y) => {
    const dg = ctx.createLinearGradient(0, 0, W, 0);
    dg.addColorStop(0,   "rgba(221,228,239,0)");
    dg.addColorStop(0.5, "#dde4ef");
    dg.addColorStop(1,   "rgba(221,228,239,0)");
    ctx.fillStyle = dg;
    ctx.fillRect(barW, y, W - barW * 2, divH);
  };

  /* SECTION 1 — Name + Phone */
  let y = bdY + gap;
  ctx.font = `900 ${nameSz}px Inter,Arial,sans-serif`;
  const nameAvail = cW * 0.55;
  y = drawLbl("FULL NAME", cX)(y);
  y = drawVal(clipText(ctx, name, nameAvail), cX, nameSz, "#1e293b", 900)(y);
  /* phone aligned right */
  const phLblY = bdY + gap;
  const phValY = phLblY + lblSz * 1.3 + lblMB;
  drawLbl("PHONE", cX + cW, "right")(phLblY);
  ctx.font = `700 ${phSz}px Inter,Arial,sans-serif`;
  drawVal(phone, cX + cW, phSz, "#1e293b", 700, "right")(phValY);
  drawDiv(y + divMT - divH);

  /* SECTION 2 — Email + Location */
  y = bdY + gap + sec1H + gap;
  const s2LblY = y;
  const s2ValY = y + lblSz * 1.3 + lblMB;
  ctx.font = `700 ${emSz}px Inter,Arial,sans-serif`;
  drawLbl("EMAIL", cX)(s2LblY);
  drawVal(clipText(ctx, email, cW / 2 - 16), cX, emSz, "#1e293b", 700)(s2ValY);
  drawLbl("REGION / LOCATION", half)(s2LblY);
  ctx.font = `700 ${locSz}px Inter,Arial,sans-serif`;
  drawVal(clipText(ctx, region, halfW), half, locSz, "#1e293b", 700)(s2ValY);
  drawDiv(s2ValY + locSz * 1.3 + divMT - divH);

  /* SECTION 3 — Dates */
  y = bdY + gap + sec1H + gap + sec2H + gap;
  const s3LblY = y;
  const s3ValY = y + lblSz * 1.3 + lblMB;
  drawLbl("DATE ISSUED", cX)(s3LblY);
  drawVal(issuedDate, cX, dtSz, "#1e293b", 700)(s3ValY);
  drawLbl("EXPIRY DATE", half)(s3LblY);
  drawVal(expiryDate, half, dtSz, "#dc2626", 800)(s3ValY);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Blob generation failed"))),
      "image/png",
      1,
    );
  });
}

/* ── Screen preview — 340 × 459 px (800:1080 scaled at 0.425×) ── */
function AgentCard({ agent, avatarUrl, qrCanvasRef }) {
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

  /* all px values = canvas values × 0.425 */
  const lbl = { fontSize:7.5, fontWeight:800, color:"#94a3b8", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:5 };
  const val = { fontWeight:700, color:"#1e293b", lineHeight:1.3 };
  const div = { height:1, background:"linear-gradient(90deg,transparent,#dde4ef,transparent)", marginTop:14 };

  return (
    <div style={{ width:340, height:459, fontFamily:"'Inter',system-ui,-apple-system,sans-serif", overflow:"hidden", background:"#fff", borderRadius:14, display:"flex", flexDirection:"column" }}>

      {/* HEADER — 102 px */}
      <div style={{ height:102, background:"linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 55%,#3b82f6 100%)", display:"flex", alignItems:"center", padding:"0 10px", gap:8, flexShrink:0 }}>
        {/* avatar — 64 px */}
        <div style={{ width:64, height:64, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", overflow:"hidden", background:avatarUrl?"transparent":"linear-gradient(135deg,#2563eb,#1d4ed8)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {avatarUrl
            ? <img src={avatarUrl} alt={name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            : <span style={{ fontSize:23, fontWeight:900, color:"#fff" }}>{initials}</span>
          }
        </div>
        {/* brand */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
          <div style={{ fontSize:22, fontWeight:900, letterSpacing:"0.04em", color:"#fff", lineHeight:1 }}>CTMerchant</div>
          <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.22em", color:"#fde68a", textTransform:"uppercase" }}>Field Agent</div>
          <div style={{ fontSize:10, fontWeight:800, color:"#fff", fontFamily:"ui-monospace,monospace", letterSpacing:"0.1em", marginTop:3, background:"rgba(255,255,255,0.15)", borderRadius:4, padding:"3px 9px" }}>{agentId}</div>
          <div style={{ fontSize:10, fontWeight:700, color:"#fde68a", marginTop:2, letterSpacing:"0.07em" }}>www.ctmerchant.com.ng</div>
        </div>
        {/* QR — 64 px tile */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flexShrink:0 }}>
          <div style={{ background:"#fff", padding:4, borderRadius:6, border:"1px solid rgba(255,255,255,0.2)" }}>
            <QRCodeCanvas ref={qrCanvasRef} value={qrValue} size={56} level="H" includeMargin={false} bgColor="#ffffff" fgColor="#1e3a8a" />
          </div>
          <div style={{ fontSize:8, fontWeight:800, letterSpacing:"0.14em", color:"#fde68a", textTransform:"uppercase" }}>Verify ID</div>
        </div>
      </div>

      {/* ACCENT STRIPE — 3 px */}
      <div style={{ height:3, background:"linear-gradient(90deg,#3b82f6 0%,#6366f1 52%,#1d4ed8 100%)", flexShrink:0 }} />

      {/* BODY — flex:1 */}
      <div style={{ flex:1, position:"relative" }}>
        <div style={{ position:"absolute", top:0, bottom:0, left:0, width:3, background:"linear-gradient(to bottom,#7b2d42,#c2607a,#8b3a52)", zIndex:1 }} />
        <div style={{ position:"absolute", top:0, bottom:0, right:0, width:3, background:"linear-gradient(to bottom,#7b2d42,#c2607a,#8b3a52)", zIndex:1 }} />
        <div style={{ height:"100%", padding:"0 17px", display:"flex", flexDirection:"column", justifyContent:"space-evenly", boxSizing:"border-box" }}>

          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end" }}>
              <div style={{ minWidth:0 }}>
                <div style={lbl}>Full Name</div>
                <div style={{ ...val, fontSize:20, fontWeight:900, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{name}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <div style={lbl}>Phone</div>
                <div style={{ ...val, fontSize:15 }}>{phone || "—"}</div>
              </div>
            </div>
            <div style={div} />
          </div>

          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <div style={{ minWidth:0 }}>
                <div style={lbl}>Email</div>
                <div style={{ ...val, fontSize:12, wordBreak:"break-all" }}>{email || "—"}</div>
              </div>
              <div style={{ minWidth:0 }}>
                <div style={lbl}>Region / Location</div>
                <div style={{ ...val, fontSize:13, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{region || "—"}</div>
              </div>
            </div>
            <div style={div} />
          </div>

          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
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

      {/* FOOTER — 37 px */}
      <div style={{ height:37, background:"linear-gradient(90deg,#1e3a8a 0%,#1d4ed8 100%)", display:"flex", alignItems:"center", padding:"0 10px", gap:7, flexShrink:0 }}>
        <img src={ctmLogo} alt="CTM" crossOrigin="anonymous" style={{ width:19, height:19, borderRadius:4, border:"1px solid rgba(255,255,255,0.2)", background:"#fff", objectFit:"cover", padding:1.5, flexShrink:0 }} />
        <div>
          <div style={{ fontSize:7, fontWeight:800, color:"rgba(255,255,255,0.88)", letterSpacing:"0.04em" }}>CTMerchant Agent Network</div>
          <div style={{ fontSize:5, fontWeight:700, color:"#fde68a", letterSpacing:"0.08em", marginTop:1 }}>www.ctmerchant.com.ng</div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */
export default function StaffAgentIDCard() {
  const navigate          = useNavigate();
  const { state }         = useLocation();
  const { fetchingStaff } = useStaffPortalSession();
  const { notify }        = useGlobalFeedback();
  usePreventPullToRefresh();

  const agent      = state?.agent ?? null;
  const qrCanvasRef = useRef(null);

  const [avatarUrl,   setAvatarUrl]   = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!fetchingStaff && !agent) navigate("/staff-agent-applications", { replace: true });
  }, [agent, fetchingStaff, navigate]);

  /* resolve avatar → base64 data URL */
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
      /* capture QR from the in-DOM QRCodeCanvas — instant, no network */
      const qrDataUrl = qrCanvasRef.current?.toDataURL("image/png") ?? "";
      const blob = await generateAgentCardBlob(agent, avatarUrl, ctmLogo, qrDataUrl);
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
        <div className="overflow-x-auto w-full flex justify-center" style={{ WebkitOverflowScrolling:"touch" }}>
          <div className="shadow-[0_24px_80px_rgba(0,0,0,0.7)]" style={{ borderRadius:14, overflow:"hidden", flexShrink:0 }}>
            <AgentCard agent={agent} avatarUrl={avatarUrl} qrCanvasRef={qrCanvasRef} />
          </div>
        </div>
        <p className="mt-7 text-[0.6rem] font-semibold text-slate-600 text-center max-w-xs leading-relaxed">
          Downloads as an 800 × 1080 px PNG — same format as the promo banner.
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
