import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import {
  FaArrowLeft,
  FaArrowsLeftRight,
  FaArrowsUpDown,
  FaBox,
  FaCloudArrowUp,
  FaCompress,
  FaCrop,
  FaDownload,
  FaDroplet,
  FaImage,
  FaMicrochip,
  FaPanorama,
  FaRotateLeft,
  FaRotateRight,
  FaShieldHalved,
  FaWandMagicSparkles,
} from "react-icons/fa6";

import { supabase } from "../../lib/supabase"; // Strict staff auth
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";

const MAX_UPLOAD_SIZE = 6 * 1024 * 1024; // 6MB for staff
const PRODUCT_MAX = 800; // 800x800
const BANNER_MAX_W = 1280; // 1280x720
const BANNER_MAX_H = 720;

export default function StaffStudio() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  
  const [authLoading, setAuthLoading] = useState(true);

  const [mode, setMode] = useState("product"); 
  const [fitMode, setFitMode] = useState("cover"); 
  const [imageSrc, setImageSrc] = useState("");
  const [fileName, setFileName] = useState("");
  const [originalSize, setOriginalSize] = useState(0);

  // --- Color Correction ---
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // --- Transform State ---
  const [scaleX, setScaleX] = useState(1);
  const [scaleY, setScaleY] = useState(1);

  // --- Watermark State ---
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkText, setWatermarkText] = useState("CTMerchant");

  // --- Output State ---
  const [finalPreview, setFinalPreview] = useState(null);
  const [stats, setStats] = useState({ newSize: "-- KB", dim: "-- x --", savings: "Awaiting processing...", color: "#10b981" });

  const cropperRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- STRICT STAFF AUTHENTICATION ---
  useEffect(() => {
    async function verifyStaff() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/staff-portal");
        return;
      }

      // Verify it's an actual staff member to prevent user dashboard redirects
      const { data: staff } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("id", session.user.id)
        .single();

      if (!staff) {
        navigate("/staff-portal");
      } else {
        setAuthLoading(false);
      }
    }
    verifyStaff();
  }, [navigate]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please select a valid image file.");
    if (file.size > MAX_UPLOAD_SIZE) return alert("File is too large! Maximum 6MB.");

    setOriginalSize(file.size);
    setFileName(file.name.replace(/\.[^/.]+$/, ""));
    
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result);
      resetOutput();
    };
    reader.readAsDataURL(file);
    e.target.value = ""; 
  };

  const resetOutput = () => {
    setFinalPreview(null);
    setStats({ newSize: "-- KB", dim: "-- x --", savings: "Awaiting processing...", color: "#10b981" });
  };

  const handleStartOver = () => {
    setImageSrc("");
    setOriginalSize(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setScaleX(1);
    setScaleY(1);
    setFitMode("cover");
    resetOutput();
  };

  const rotateImage = (degree) => {
    if (cropperRef.current?.cropper) cropperRef.current.cropper.rotate(degree);
  };

  const flipImage = (axis) => {
    if (!cropperRef.current?.cropper) return;
    if (axis === 'x') {
      const newScale = scaleX === 1 ? -1 : 1;
      setScaleX(newScale);
      cropperRef.current.cropper.scaleX(newScale);
    } else {
      const newScale = scaleY === 1 ? -1 : 1;
      setScaleY(newScale);
      cropperRef.current.cropper.scaleY(newScale);
    }
  };

  const processImage = () => {
    if (!cropperRef.current || !cropperRef.current.cropper) return;
    const cropper = cropperRef.current.cropper;

    let targetW = mode === "product" ? PRODUCT_MAX : BANNER_MAX_W;
    let targetH = mode === "product" ? PRODUCT_MAX : BANNER_MAX_H;

    const croppedCanvas = cropper.getCroppedCanvas({
      fillColor: "#FFFFFF",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    if (!croppedCanvas) return;

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const ctx = finalCanvas.getContext("2d");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

    if (fitMode === "contain") {
      const scale = Math.min(targetW / croppedCanvas.width, targetH / croppedCanvas.height);
      const scaledW = croppedCanvas.width * scale;
      const scaledH = croppedCanvas.height * scale;
      const dx = (targetW - scaledW) / 2; 
      const dy = (targetH - scaledH) / 2; 
      ctx.drawImage(croppedCanvas, dx, dy, scaledW, scaledH);
    } else {
      ctx.drawImage(croppedCanvas, 0, 0, targetW, targetH);
    }

    if (watermarkEnabled && watermarkText.trim() !== "") {
      ctx.filter = "none";
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)"; 
      ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.font = '900 28px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(watermarkText.trim(), targetW - 20, targetH - 20);
    }

    let quality = 0.95;
    const maxBytes = mode === "product" ? 120 * 1024 : 250 * 1024; 

    const attemptCompress = () => {
      finalCanvas.toBlob((blob) => {
        if (!blob) return;

        if (blob.size <= maxBytes || quality <= 0.4) {
          setFinalPreview(URL.createObjectURL(blob));
          
          const savedBytes = originalSize - blob.size;
          let savingsMsg = "Optimized for platform.";
          let savingsCol = "#94a3b8";
          
          if (savedBytes > 0) {
            const percent = Math.round((savedBytes / originalSize) * 100);
            savingsMsg = `✅ Saved ${percent}%`;
            savingsCol = "#10b981";
          }

          setStats({
            newSize: (blob.size / 1024).toFixed(1) + " KB",
            dim: `${targetW} x ${targetH}`,
            savings: savingsMsg,
            color: savingsCol
          });
        } else {
          quality -= 0.05;
          attemptCompress();
        }
      }, "image/jpeg", quality);
    };

    attemptCompress();
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f172a]">
        <div className="animate-spin text-pink-500 text-4xl border-4 border-t-pink-500 border-slate-700 rounded-full w-12 h-12"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0f172a] text-[#f8fafc] font-sans">
      
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#334155] bg-[#020617] px-4 sm:px-5 py-3 shadow-lg">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={() => navigate("/staff-dashboard")} className="text-xl transition-colors hover:text-pink-500">
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-2 text-base sm:text-lg font-black tracking-wide">
            <FaWandMagicSparkles className="text-pink-500" /> STAFF STUDIO
          </div>
        </div>
      </header>

      {/* STUDIO LAYOUT - Flex changes on mobile */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        
        {/* CENTER: WORKSPACE (Moved to Order 1 on Mobile so you can see it!) */}
        <div 
          className="relative flex h-[350px] sm:h-[400px] flex-none flex-col lg:h-auto lg:flex-1 order-1 lg:order-2"
          style={{ background: "repeating-conic-gradient(#0f172a 0% 25%, #1e293b 0% 50%) 50% / 20px 20px" }}
        >
          {!imageSrc ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[rgba(15,23,42,0.9)] p-5 text-center">
              <div className="bg-[#1e293b] p-4 sm:p-6 rounded-full border-4 border-[#334155] mb-4 sm:mb-6">
                 <FaCloudArrowUp className="text-4xl sm:text-5xl text-pink-500" />
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl bg-white px-6 sm:px-8 py-3 text-xs sm:text-sm font-black uppercase tracking-widest text-[#0f172a] shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-slate-200"
              >
                <FaImage className="text-lg" /> Select Source Image
              </button>
              <p className="mt-4 sm:mt-5 text-[0.65rem] sm:text-xs font-bold uppercase tracking-widest text-[#94a3b8]">Formats: JPG, PNG, WEBP • Max 6MB</p>
              <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileUpload} />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center p-3 sm:p-8">
              <div className="w-full h-full shadow-[0_0_40px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden border border-white/10">
                <Cropper
                  key={`${mode}-${fitMode}`}
                  ref={cropperRef}
                  src={imageSrc}
                  style={{ 
                    height: "100%", 
                    width: "100%", 
                    filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)` 
                  }}
                  aspectRatio={fitMode === "cover" ? (mode === "product" ? 1 : 16 / 9) : NaN}
                  viewMode={1}
                  dragMode="move"
                  background={false}
                  autoCropArea={1}
                  responsive={true}
                  checkOrientation={false}
                  guides={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* LEFT: MASTER CONTROLS (Order 2 on Mobile) */}
        <div className="flex w-full flex-shrink-0 flex-col gap-5 overflow-y-auto border-b border-[#334155] bg-[#1e293b] p-4 sm:p-5 lg:w-[340px] lg:border-b-0 lg:border-r custom-scrollbar order-2 lg:order-1">
          
          {/* Section 1: Frame */}
          <div>
            <div className="mb-2.5 text-[0.65rem] sm:text-xs font-black uppercase tracking-[0.15em] text-[#94a3b8]">
              1. Output Frame
            </div>
            <div className="flex gap-2 rounded-xl border border-[#334155] bg-[#0f172a] p-1.5 shadow-inner">
              <button onClick={() => setMode("product")} className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg p-2 text-[0.65rem] font-black uppercase tracking-wider transition-all ${mode === "product" ? "bg-[#1e293b] text-pink-500 shadow" : "text-[#94a3b8] hover:text-white"}`}>
                <FaBox className="text-base" /> Product 1:1
              </button>
              <button onClick={() => setMode("banner")} className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg p-2 text-[0.65rem] font-black uppercase tracking-wider transition-all ${mode === "banner" ? "bg-[#1e293b] text-pink-500 shadow" : "text-[#94a3b8] hover:text-white"}`}>
                <FaPanorama className="text-base" /> Banner 16:9
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => setFitMode("cover")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#334155] p-2 text-xs font-bold transition-all ${fitMode === "cover" ? "bg-[#334155] text-white" : "bg-transparent text-[#94a3b8] hover:bg-[#334155]/50 hover:text-white"}`}>
                <FaCrop /> Fill Cut
              </button>
              <button onClick={() => setFitMode("contain")} className={`flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#334155] p-2 text-xs font-bold transition-all ${fitMode === "contain" ? "bg-[#334155] text-white" : "bg-transparent text-[#94a3b8] hover:bg-[#334155]/50 hover:text-white"}`}>
                <FaCompress /> Pad
              </button>
            </div>
          </div>

          {/* Section 2: Transform */}
          <div>
            <div className="mb-2.5 text-[0.65rem] sm:text-xs font-black uppercase tracking-[0.15em] text-[#94a3b8]">
              2. Transform
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button onClick={() => rotateImage(-90)} className="flex flex-col items-center gap-1 rounded-lg bg-[#334155] p-2 text-[#94a3b8] hover:bg-[#475569] hover:text-white transition"><FaRotateLeft /> <span className="text-[0.5rem] font-black uppercase">-90°</span></button>
              <button onClick={() => rotateImage(90)} className="flex flex-col items-center gap-1 rounded-lg bg-[#334155] p-2 text-[#94a3b8] hover:bg-[#475569] hover:text-white transition"><FaRotateRight /> <span className="text-[0.5rem] font-black uppercase">+90°</span></button>
              <button onClick={() => flipImage('x')} className="flex flex-col items-center gap-1 rounded-lg bg-[#334155] p-2 text-[#94a3b8] hover:bg-[#475569] hover:text-white transition"><FaArrowsLeftRight /> <span className="text-[0.5rem] font-black uppercase">Flip X</span></button>
              <button onClick={() => flipImage('y')} className="flex flex-col items-center gap-1 rounded-lg bg-[#334155] p-2 text-[#94a3b8] hover:bg-[#475569] hover:text-white transition"><FaArrowsUpDown /> <span className="text-[0.5rem] font-black uppercase">Flip Y</span></button>
            </div>
          </div>

          {/* Section 3: Color Grading */}
          <div>
            <div className="mb-2.5 text-[0.65rem] sm:text-xs font-black uppercase tracking-[0.15em] text-[#94a3b8]">
              3. Color Grading
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-[#334155] bg-[#0f172a] p-4">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5"><FaDroplet className="text-blue-400" /> Saturation</span> <span>{saturation}%</span>
                </div>
                <input type="range" min="0" max="200" value={saturation} onChange={(e) => setSaturation(e.target.value)} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#334155] accent-blue-500" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5"><FaImage className="text-yellow-400" /> Brightness</span> <span>{brightness}%</span>
                </div>
                <input type="range" min="50" max="150" value={brightness} onChange={(e) => setBrightness(e.target.value)} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#334155] accent-yellow-500" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5"><FaArrowsLeftRight className="text-white" /> Contrast</span> <span>{contrast}%</span>
                </div>
                <input type="range" min="50" max="150" value={contrast} onChange={(e) => setContrast(e.target.value)} className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#334155] accent-white" />
              </div>
            </div>
          </div>

          {/* Section 4: Watermark Control */}
          <div>
            <div className="mb-2.5 text-[0.65rem] sm:text-xs font-black uppercase tracking-[0.15em] text-[#94a3b8]">
              4. Watermark Settings
            </div>
            <div className="rounded-xl border border-[#334155] bg-[#0f172a] p-4">
              <label className="flex items-center gap-3 cursor-pointer mb-3">
                <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} className="w-4 h-4 accent-pink-600 cursor-pointer" />
                <span className="text-sm font-bold text-white">Apply Watermark</span>
              </label>
              {watermarkEnabled && (
                <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="Watermark text..." className="w-full bg-[#1e293b] border border-[#334155] text-white rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-pink-500 transition" />
              )}
            </div>
          </div>

          <button onClick={processImage} disabled={!imageSrc} className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 p-4 text-sm font-black uppercase tracking-wider text-white shadow-[0_4px_15px_rgba(219,39,119,0.3)] transition-all hover:-translate-y-0.5 hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-[#334155] disabled:text-[#94a3b8] disabled:shadow-none disabled:hover:translate-y-0">
            <FaMicrochip className="text-lg" /> Render Output
          </button>
        </div>

        {/* RIGHT: OUTPUT INSPECTOR (Order 3 on Mobile) */}
        <div className="flex w-full flex-shrink-0 flex-col border-t border-[#334155] bg-[#1e293b] p-4 sm:p-5 lg:w-[320px] lg:border-l lg:border-t-0 overflow-y-auto custom-scrollbar order-3">
          <div className="mb-4 flex items-center justify-between border-b border-[#334155] pb-2">
            <div className="text-[0.65rem] sm:text-xs font-black uppercase tracking-[0.15em] text-[#94a3b8]">
              Final Inspector
            </div>
            <FaShieldHalved className="text-[#10b981]" />
          </div>
          
          <div className="mb-5 sm:mb-6 flex w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[#334155] bg-[#0f172a] shadow-inner relative group" style={{ aspectRatio: mode === "product" ? "1/1" : "16/9" }}>
            {finalPreview ? (
              <img src={finalPreview} alt="Processed output" className="h-full w-full object-contain" />
            ) : (
              <div className="text-center text-[#334155]">
                 <FaImage className="mx-auto text-3xl sm:text-4xl mb-2" />
                 <span className="text-[0.6rem] sm:text-[0.65rem] font-bold uppercase tracking-widest">No Render Yet</span>
              </div>
            )}
          </div>

          <div className="mb-5 sm:mb-6 rounded-xl border border-[#334155] bg-[#0f172a] p-3 sm:p-4 shadow-sm">
            <div className="mb-2 flex justify-between text-[0.65rem] sm:text-xs font-bold">
              <span className="text-[#94a3b8]">Raw Source Size:</span>
              <span className="text-white">{originalSize ? (originalSize / 1024).toFixed(1) + " KB" : "-- KB"}</span>
            </div>
            <div className="mb-2 flex justify-between text-[0.65rem] sm:text-xs font-bold">
              <span className="text-[#94a3b8]">Optimized Size:</span>
              <span className="text-pink-500">{stats.newSize}</span>
            </div>
            <div className="flex justify-between text-[0.65rem] sm:text-xs font-bold">
              <span className="text-[#94a3b8]">Target Resolution:</span>
              <span className="text-white">{stats.dim}</span>
            </div>
            <div className="mt-3 sm:mt-4 rounded-lg bg-[#1e293b] py-2 text-center text-[0.65rem] sm:text-xs font-black uppercase tracking-wider" style={{ color: stats.color }}>
              {stats.savings}
            </div>
          </div>

          {finalPreview && (
            <a href={finalPreview} download={`${fileName || 'ctm-asset'}-verified.jpg`} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#10b981] p-3.5 text-xs sm:text-sm font-black uppercase tracking-wider text-white shadow-[0_4px_15px_rgba(16,185,129,0.2)] transition-colors hover:bg-[#059669]">
              <FaDownload className="text-lg" /> Download Asset
            </a>
          )}
          
          <button onClick={handleStartOver} className="mt-3 sm:mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[#334155] p-2.5 sm:p-3 text-[0.65rem] sm:text-xs font-black uppercase tracking-wider text-[#94a3b8] transition-colors hover:bg-[#334155] hover:text-white">
            <FaRotateLeft /> Reset Workspace
          </button>
        </div>

      </div>
      
      <style dangerouslySetOrigin={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </div>
  );
}