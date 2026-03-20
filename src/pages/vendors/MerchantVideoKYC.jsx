import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaCloudArrowUp,
  FaLocationCrosshairs,
  FaMicrophone,
  FaShieldHalved,
  FaTriangleExclamation,
  FaMapLocationDot,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";

export default function MerchantVideoKYC() {
  const navigate = useNavigate();
  usePreventPullToRefresh();
  const { user, loading: authLoading, isOffline } = useAuthSession();

  // Data State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shopData, setShopData] = useState(null);
  const [profileName, setProfileName] = useState("Merchant");
  const [location, setLocation] = useState(null); // { lat, lng, city }

  // Recording State
  const [recordingState, setRecordingState] = useState("ready"); // 'ready' | 'recording' | 'recorded' | 'uploading'
  const [timeLeft, setTimeLeft] = useState(60);
  const [uploadStatus, setUploadStatus] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(new Date().toLocaleString());

  // Refs for DOM elements and Media objects
  const liveVideoRef = useRef(null);
  const playbackVideoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedBlobRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const clockIntervalRef = useRef(null);

  // 1. Initial Data Fetch & Validation
  useEffect(() => {
    async function init() {
      if (!user) return;
      if (isOffline) {
        setError("Network offline. Please connect to the internet to complete KYC.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const { data: profile, error: profErr } = await supabase.from("profiles").select("full_name, is_suspended").eq("id", user.id).maybeSingle();
        if (profErr || profile?.is_suspended) throw new Error("Account restricted.");
        if (profile?.full_name) setProfileName(profile.full_name);

        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("id, name, unique_id, is_verified, kyc_status")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (shopErr || !shop) throw new Error("Shop not found.");

        if (shop.is_verified || shop.kyc_status === 'approved') {
          alert("Your shop is already verified!");
          navigate("/vendor-panel", { replace: true });
          return;
        }

        setShopData(shop);
        
        // Request Permissions (Location first, then Camera)
        await requestPermissionsAndStart();

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) init();

    // Start Live Clock
    clockIntervalRef.current = setInterval(() => {
      setCurrentDateTime(new Date().toLocaleString('en-GB', { 
        day: '2-digit', month: 'short', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      }));
    }, 1000);

    // Cleanup function
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [user, authLoading, isOffline, navigate]);


  // 2. Permissions & Camera Logic
  const requestPermissionsAndStart = async () => {
    try {
      // Step A: Request GPS Location (High Accuracy)
      if (!navigator.geolocation) throw new Error("Geolocation is not supported by your browser.");
      
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
      });
      
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);

      setLocation({ lat, lng, city: "Detecting city..." });

      // Step B: Reverse Geocode via OpenStreetMap (Targeting Major City)
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
        if (res.ok) {
          const data = await res.json();
          const address = data.address || {};
          
          // Prioritize city, then state (which acts as a major city indicator in many regions), then fallback to town/county
          let detectedCity = address.city || address.state || address.town || address.county || "Unknown Area";
          
          // Clean up formatting (e.g., converts "Kaduna State" -> "Kaduna")
          detectedCity = detectedCity.replace(' State', '').trim();
          
          setLocation(prev => ({ ...prev, city: detectedCity }));
        } else {
          setLocation(prev => ({ ...prev, city: "City unavailable" }));
        }
      } catch (e) {
        console.warn("Reverse geocoding failed:", e);
        setLocation(prev => ({ ...prev, city: "City unavailable" }));
      }

      // Step C: Request Camera & Mic
      const constraints = {
        audio: true,
        video: { facingMode: "environment", width: { ideal: 640, max: 854 }, height: { ideal: 480, max: 480 } }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Permission denied", err);
      if (err.code === 1 || err.message?.includes("User denied Geolocation") || err.message?.includes("location")) {
        setError("Location access is required for KYC fraud prevention. Please enable GPS permissions for this site and reload.");
      } else {
        setError("Camera and microphone access is required. Please check your browser permissions and reload.");
      }
    }
  };

  const handleRecordToggle = () => {
    if (recordingState === "recording") stopRecording();
    else if (recordingState === "ready") startRecording();
  };

  const startRecording = () => {
    recordedChunksRef.current = [];
    
    let options = { mimeType: 'video/webm;codecs=vp8,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };
    options.videoBitsPerSecond = 500000;

    try {
      mediaRecorderRef.current = new MediaRecorder(streamRef.current, options);
    } catch (e) {
      mediaRecorderRef.current = new MediaRecorder(streamRef.current);
    }

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    mediaRecorderRef.current.onstop = processVideo;
    mediaRecorderRef.current.start();

    setRecordingState("recording");
    setTimeLeft(60);

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };

  const processVideo = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    const mimeType = recordedChunksRef.current[0]?.type || 'video/mp4';
    const blob = new Blob(recordedChunksRef.current, { type: mimeType });
    recordedBlobRef.current = blob;

    setRecordingState("recorded");
    
    if (playbackVideoRef.current) {
      playbackVideoRef.current.src = URL.createObjectURL(blob);
    }
  };

  const resetStudio = async () => {
    setRecordingState("ready");
    setTimeLeft(60);
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];
    if (playbackVideoRef.current) playbackVideoRef.current.src = "";
    await requestPermissionsAndStart();
  };

  // 3. Upload Logic
  const uploadVideo = async () => {
    if (!recordedBlobRef.current) return;
    if (isOffline) return alert("You must be online to upload.");

    try {
      setRecordingState("uploading");
      setUploadStatus("Uploading video to secure vault... Please wait.");

      const ext = recordedBlobRef.current.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `kyc_video.${ext}`;
      const filePath = `${user.id}/${fileName}`;

      // A. Upload to Storage
      const { error: uploadErr } = await supabase.storage
        .from('kyc_videos')
        .upload(filePath, recordedBlobRef.current, { cacheControl: '3600', upsert: true });

      if (uploadErr) throw new Error(`Storage Error: ${uploadErr.message}`);

      const { data: { publicUrl } } = supabase.storage.from('kyc_videos').getPublicUrl(filePath);

      // B. Update Shop KYC Status
      setUploadStatus("Finalizing submission...");
      
      const { data: updatedShop, error: dbErr } = await supabase
        .from('shops')
        .update({ 
          kyc_status: 'submitted', 
          kyc_video_url: publicUrl, 
          rejection_reason: null
        })
        .eq('owner_id', user.id)
        .select();

      if (dbErr) throw new Error(`Database Error: ${dbErr.message}`);
      if (!updatedShop || updatedShop.length === 0) throw new Error("Security Blocked Update. Contact Support.");

      alert("Video Uploaded Successfully! Our admins will review your shop and activate your Digital ID card within 24 hours.");
      navigate("/vendor-panel", { replace: true });

    } catch (err) {
      console.error(err);
      alert(`Upload Failed!\n\nReason: ${err.message}`);
      setRecordingState("recorded"); // Let them try submitting again
    }
  };


  // --- UI RENDERING ---
  if (authLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0F172A]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#db2777]/30 border-t-[#db2777]"></div>
        <p className="mt-4 font-semibold text-white">Acquiring GPS and Camera access...</p>
        <p className="mt-2 text-xs text-[#94A3B8]">Please accept the permissions prompt.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col bg-[#131921] text-white">
        <header className="flex w-full items-center gap-4 bg-[#131921] p-4 shadow-md">
          <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
          <div className="text-[1.15rem] font-bold">Verification Error</div>
        </header>
        <div className="flex flex-1 items-center justify-center p-5 text-center">
          <div className="rounded-xl border border-red-800 bg-[#1E293B] p-8 shadow-sm">
            <FaTriangleExclamation className="mx-auto mb-4 text-4xl text-red-500" />
            <h3 className="mb-2 font-bold text-white">Setup Failed</h3>
            <p className="text-sm text-[#CBD5E1] max-w-sm mx-auto">{error}</p>
            <button onClick={() => navigate("/vendor-panel")} className="mt-5 rounded-md border border-[#334155] bg-[#0F172A] px-6 py-2.5 font-semibold transition hover:bg-[#1E293B]">Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const scriptText = `"My name is ${profileName}, today is ${today}, and this is my physical shop ${shopData?.name} on CTMerchant."`;

  return (
    <div className="flex min-h-screen flex-col items-center bg-black text-white">
      
      <header className="sticky top-0 z-40 flex w-full items-center gap-4 bg-[#131921] p-4 shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
        <button onClick={() => navigate("/vendor-panel")} className="text-xl transition hover:text-[#db2777]"><FaArrowLeft /></button>
        <div className="text-[1.15rem] font-bold">Video KYC Verification</div>
      </header>

      <main className="flex w-full max-w-[600px] flex-1 flex-col p-5">
        
        {recordingState !== "recorded" && recordingState !== "uploading" && (
          <>
            <div className="mb-4 rounded-xl border border-[#334155] bg-[#1E293B] p-4">
              <h4 className="mb-2 flex items-center gap-2 text-[1.05rem] font-bold text-[#38BDF8]">
                <FaShieldHalved /> Secure Verification
              </h4>
              <ul className="list-inside list-disc text-[0.85rem] leading-relaxed text-[#CBD5E1]">
                <li>Ensure your device Location (GPS) is turned ON.</li>
                <li>Show your face and your physical shop items.</li>
                <li>Read the text in the yellow box below out loud.</li>
                <li>You have exactly 60 seconds. Keep it short!</li>
              </ul>
            </div>

            <div className="mb-5 rounded-xl border-2 border-dashed border-[#FBBF24] bg-[#0F172A] p-4 text-center shadow-[0_4px_15px_rgba(251,191,36,0.15)]">
              <div className="mb-2 flex items-center justify-center gap-2 text-[0.85rem] font-extrabold uppercase tracking-[1px] text-[#FBBF24]">
                <FaMicrophone /> Read This Aloud:
              </div>
              <div className="text-[1.1rem] font-bold leading-relaxed text-white">
                {scriptText}
              </div>
            </div>
          </>
        )}

        <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-[#334155] bg-[#0F172A] shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
          
          {/* Live Camera View */}
          <video 
            ref={liveVideoRef} 
            className={`h-full w-full object-cover ${recordingState === 'ready' || recordingState === 'recording' ? 'block' : 'hidden'}`}
            autoPlay 
            playsInline 
            muted 
          />
          
          {/* Playback View */}
          <video 
            ref={playbackVideoRef} 
            className={`h-full w-full object-cover ${recordingState === 'recorded' ? 'block' : 'hidden'}`}
            playsInline 
            controls 
          />

          {/* GPS, City & Timestamp Overlay (Permanently visible on the video) */}
          {(recordingState === 'ready' || recordingState === 'recording') && (
            <div className="absolute bottom-3 left-3 z-10 rounded-md bg-black/60 p-2 text-left font-mono text-[0.6rem] font-bold text-white shadow-md backdrop-blur-sm">
              <div className="text-[#38BDF8]">{currentDateTime}</div>
              {location ? (
                <>
                  <div className="mt-0.5 text-[#FBBF24]">
                    <FaMapLocationDot className="inline mr-1" />
                    {location.city}
                  </div>
                  <div className="mt-0.5 text-[#A3E635]">
                    <FaLocationCrosshairs className="inline mr-1" />
                    LAT {location.lat} <br />
                    LNG {location.lng}
                  </div>
                </>
              ) : (
                <div className="mt-0.5 text-[#FBBF24] animate-pulse">Acquiring GPS...</div>
              )}
            </div>
          )}

          {/* Recording Timer & UI */}
          {(recordingState === 'ready' || recordingState === 'recording') && (
            <>
              {recordingState === 'recording' && (
                <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[0.8rem] font-extrabold shadow-[0_2px_10px_rgba(220,38,38,0.5)] animate-[pulse_1.5s_infinite]">
                  <div className="h-2 w-2 rounded-full bg-white"></div> REC
                </div>
              )}
              <div className={`absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 font-mono text-[1.2rem] font-extrabold ${timeLeft <= 10 ? 'text-red-500' : 'text-white'}`}>
                00:{timeLeft.toString().padStart(2, '0')}
              </div>
            </>
          )}

          {/* Uploading Overlay */}
          {recordingState === "uploading" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-5 text-center backdrop-blur-sm">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-transparent border-t-[#db2777]"></div>
              <div className="text-[1.1rem] font-bold text-white">{uploadStatus}</div>
            </div>
          )}
        </div>

        {/* CONTROLS */}
        <div className="mt-5 flex flex-col items-center gap-4 pb-10">
          
          {(recordingState === "ready" || recordingState === "recording") && (
            <button 
              onClick={handleRecordToggle}
              disabled={!location}
              className={`flex h-[70px] w-[70px] items-center justify-center rounded-full border-4 border-white bg-transparent transition-all ${recordingState === 'recording' ? 'scale-95' : ''} ${!location ? 'opacity-50 cursor-not-allowed border-gray-500' : ''}`}
            >
              <div className={`rounded-full bg-[#DC2626] transition-all ${recordingState === 'recording' ? 'h-[30px] w-[30px] rounded-md' : 'h-[50px] w-[50px]'} ${!location ? 'bg-gray-500' : ''}`}></div>
            </button>
          )}

          {recordingState === "recorded" && (
            <>
              <button 
                onClick={uploadVideo}
                className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#10B981] p-4 text-[1.05rem] font-extrabold text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)] transition hover:bg-[#059669]"
              >
                <FaCloudArrowUp /> Submit Video for Approval
              </button>

              <button 
                onClick={resetStudio}
                className="text-[0.9rem] font-bold text-[#94A3B8] underline transition hover:text-white"
              >
                Retake Video
              </button>
            </>
          )}

        </div>

      </main>
    </div>
  );
}