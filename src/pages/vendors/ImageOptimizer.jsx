import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Cropper from "react-cropper";
import "cropperjs/dist/cropper.css";
import {
  FaArrowLeft,
  FaBox,
  FaCloudArrowUp,
  FaDownload,
  FaImage,
  FaMicrochip,
  FaPanorama,
  FaRotateLeft,
  FaShieldHalved,
  FaWandMagicSparkles,
} from "react-icons/fa6";

// NOTICE: Updated relative paths for the new folder structure!
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";

const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB
const PRODUCT_MAX = 800; // 800x800
const BANNER_MAX_W = 1280; // 1280x720
const BANNER_MAX_H = 720;

export default function ImageOptimizer() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const { user, loading: authLoading } = useAuthSession();

  const [mode, setMode] = useState("product"); // 'product' | 'banner'
  const [imageSrc, setImageSrc] = useState("");
  const [fileName, setFileName] = useState("");
  const [originalSize, setOriginalSize] = useState(0);

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);

  const [finalPreview, setFinalPreview] = useState(null);
  const [stats, setStats] = useState({ newSize: "-- KB", dim: "-- x --", savings: "Awaiting processing...", color: "#10b981" });

  const cropperRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [authLoading, user, navigate]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      alert("File is too large! The maximum allowed upload size is 4MB.");
      return;
    }

    setOriginalSize(file.size);
    setFileName(file.name.replace(/\.[^/.]+$/, "")); // Strip extension
    
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result);
      resetOutput();
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset input
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
    resetOutput();
  };

  const processImage = () => {
    if (!cropperRef.current || !cropperRef.current.cropper) return;
    const cropper = cropperRef.current.cropper;

    let targetW, targetH;
    if (mode === "product") {
      targetW = PRODUCT_MAX;
      targetH = PRODUCT_MAX;
    } else {
      targetW = BANNER_MAX_W;
      targetH = BANNER_MAX_H;
    }

    const croppedCanvas = cropper.getCroppedCanvas({
      width: targetW,
      height: targetH,
      fillColor: "#FFFFFF",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    });

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const ctx = finalCanvas.getContext("2d");

    // Apply Lighting Filters natively to canvas
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.drawImage(croppedCanvas, 0, 0);

    // PERMANENT WATERMARK LOGIC
    ctx.filter = "none";
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("CTMerchant", targetW - 20, targetH - 20);

    // AUTO-TUNING COMPRESSION LOOP
    let quality = 0.92;
    const maxBytes = mode === "product" ? 100 * 1024 : 200 * 1024;

    const attemptCompress = () => {
      finalCanvas.toBlob(
        (blob) => {
          if (!blob) return;

          if (blob.size <= maxBytes || quality <= 0.4) {
            // Success
            setFinalPreview(URL.createObjectURL(blob));
            
            const savedBytes = originalSize - blob.size;
            let savingsMsg = "Image optimized for web.";
            let savingsCol = "#94a3b8";
            
            if (savedBytes > 0) {
              const percent = Math.round((savedBytes / originalSize) * 100);
              savingsMsg = `🎉 You saved ${percent}%!`;
              savingsCol = "#10b981";
            }

            setStats({
              newSize: (blob.size / 1024).toFixed(1) + " KB",
              dim: `${targetW} x ${targetH}`,
              savings: savingsMsg,
              color: savingsCol
            });

          } else {
            // Reduce quality and try again recursively
            quality -= 0.05;
            attemptCompress();
          }
        },
        "image/jpeg",
        quality
      );
    };

    attemptCompress();
  };

  if (authLoading) return null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0f172a] text-[#f8fafc]">
      
      {/* HEADER */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[#334155] bg-[#020617] px-5 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition-colors hover:text-[#db2777]">
            <FaArrowLeft />
          </button>
          <div className="flex items-center gap-2 text-lg font-extrabold">
            <FaWandMagicSparkles className="text-[#db2777]" /> CT Studio
          </div>
        </div>
        <div className="hidden text-xs font-semibold text-[#94a3b8] sm:block">
          Zero Server Cost • Local Processing
        </div>
      </header>

      {/* STUDIO LAYOUT */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        
        {/* LEFT: CONTROLS */}
        <div className="flex w-full flex-shrink-0 flex-col gap-6 overflow-y-auto border-b border-[#334155] bg-[#1e293b] p-5 lg:w-[320px] lg:border-b-0 lg:border-r">
          
          <div>
            <div className="mb-3 border-b border-[#334155] pb-2 text-sm font-extrabold uppercase tracking-wide text-[#94a3b8]">
              1. Select Format
            </div>
            <div className="flex gap-2 rounded-lg border border-[#334155] bg-[#0f172a] p-1">
              <button
                onClick={() => setMode("product")}
                className={`flex flex-1 flex-col items-center gap-1 rounded-md p-2.5 text-xs font-bold transition-all ${
                  mode === "product" ? "bg-[#1e293b] text-[#db2777] shadow-sm" : "text-[#94a3b8] hover:text-white"
                }`}
              >
                <FaBox className="text-lg" /> Product (1:1)
              </button>
              <button
                onClick={() => setMode("banner")}
                className={`flex flex-1 flex-col items-center gap-1 rounded-md p-2.5 text-xs font-bold transition-all ${
                  mode === "banner" ? "bg-[#1e293b] text-[#db2777] shadow-sm" : "text-[#94a3b8] hover:text-white"
                }`}
              >
                <FaPanorama className="text-lg" /> Banner (16:9)
              </button>
            </div>
          </div>

          <div>
            <div className="mb-3 border-b border-[#334155] pb-2 text-sm font-extrabold uppercase tracking-wide text-[#94a3b8]">
              2. Lighting Fixes
            </div>
            <div className="mb-4 flex flex-col gap-1.5">
              <div className="flex justify-between text-sm font-semibold">
                <span>Brightness</span> <span>{brightness}%</span>
              </div>
              <input
                type="range"
                min="50" max="150" value={brightness}
                onChange={(e) => setBrightness(e.target.value)}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#334155] accent-[#db2777]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm font-semibold">
                <span>Contrast</span> <span>{contrast}%</span>
              </div>
              <input
                type="range"
                min="50" max="150" value={contrast}
                onChange={(e) => setContrast(e.target.value)}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#334155] accent-[#db2777]"
              />
            </div>
          </div>

          <div>
            <div className="mb-3 border-b border-[#334155] pb-2 text-sm font-extrabold uppercase tracking-wide text-[#94a3b8]">
              3. Branding
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-[rgba(219,39,119,0.2)] bg-[rgba(219,39,119,0.1)] p-3">
              <FaShieldHalved className="mt-0.5 shrink-0 text-[#db2777]" />
              <p className="text-xs font-medium leading-relaxed text-[#f8fafc]">
                All exported images carry a subtle <strong>CTMerchant</strong> watermark to protect our copyright across platforms.
              </p>
            </div>
          </div>

          <button
            onClick={processImage}
            disabled={!imageSrc}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg bg-[#10b981] p-3.5 text-base font-extrabold text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-0.5 hover:bg-[#059669] disabled:cursor-not-allowed disabled:bg-[#334155] disabled:text-[#94a3b8] disabled:shadow-none disabled:hover:translate-y-0"
          >
            <FaMicrochip /> Process & Compress
          </button>
        </div>

        {/* CENTER: WORKSPACE */}
        <div 
          className="relative flex h-[400px] flex-none flex-col lg:h-auto lg:flex-1"
          style={{ background: "repeating-conic-gradient(#0f172a 0% 25%, #1e293b 0% 50%) 50% / 20px 20px" }}
        >
          {!imageSrc ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[rgba(15,23,42,0.9)] p-5 text-center">
              <FaCloudArrowUp className="mb-5 text-6xl text-[#334155]" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-lg bg-[#db2777] px-8 py-4 text-lg font-extrabold text-white shadow-[0_4px_15px_rgba(219,39,119,0.4)] transition-transform hover:-translate-y-0.5 hover:bg-[#be185d]"
              >
                <FaImage /> Select Photo
              </button>
              <p className="mt-4 text-sm text-[#94a3b8]">High-res photos accepted (Max 4MB). Processed locally.</p>
              <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleFileUpload} />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center p-5">
              <Cropper
                ref={cropperRef}
                src={imageSrc}
                style={{ height: "100%", width: "100%", filter: `brightness(${brightness}%) contrast(${contrast}%)` }}
                aspectRatio={mode === "product" ? 1 : 16 / 9}
                viewMode={1}
                dragMode="move"
                background={false}
                autoCropArea={0.9}
                responsive={true}
                checkOrientation={false}
              />
            </div>
          )}
        </div>

        {/* RIGHT: OUTPUT */}
        <div className="flex w-full flex-shrink-0 flex-col border-t border-[#334155] bg-[#1e293b] p-5 lg:w-[340px] lg:border-l lg:border-t-0 overflow-y-auto">
          <div className="mb-3 border-b border-[#334155] pb-2 text-sm font-extrabold uppercase tracking-wide text-[#94a3b8]">
            Web-Ready Output
          </div>
          
          <div 
            className="mb-5 flex w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-[#334155] bg-[#0f172a]"
            style={{ aspectRatio: mode === "product" ? "1/1" : "16/9" }}
          >
            {finalPreview ? (
              <img src={finalPreview} alt="Processed output" className="h-full w-full object-contain" />
            ) : (
              <FaImage className="text-5xl text-[#334155]" />
            )}
          </div>

          <div className="mb-5 rounded-lg border border-[#334155] bg-[#0f172a] p-4">
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-[#94a3b8]">Original File Size:</span>
              <span className="font-extrabold text-white">{originalSize ? (originalSize / 1024).toFixed(1) + " KB" : "-- KB"}</span>
            </div>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-[#94a3b8]">Processed Size:</span>
              <span className="font-extrabold text-[#db2777]">{stats.newSize}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[#94a3b8]">Output Dimensions:</span>
              <span className="font-extrabold text-white">{stats.dim}</span>
            </div>
            <div className="mt-3 border-t border-[#334155] pt-3 text-center text-lg font-extrabold" style={{ color: stats.color }}>
              {stats.savings}
            </div>
          </div>

          {finalPreview && (
            <a
              href={finalPreview}
              download={`${fileName || 'ctmerchant'}-optimized.jpg`}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#db2777] p-3.5 text-base font-extrabold text-white shadow-[0_4px_10px_rgba(219,39,119,0.3)] transition-colors hover:bg-[#be185d]"
            >
              <FaDownload /> Download Web-Ready
            </a>
          )}
          
          <button 
            onClick={handleStartOver}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[#334155] p-2.5 text-sm font-semibold transition-colors hover:bg-[#334155]"
          >
            <FaRotateLeft /> Start Over
          </button>
        </div>

      </div>
    </div>
  );
}