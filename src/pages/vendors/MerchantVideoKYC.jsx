import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaCamera,
  FaCloudArrowUp,
  FaLocationDot,
  FaMicrophone,
  FaRotateRight,
  FaShieldHalved,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { invalidateCachedFetchStore } from "../../hooks/useCachedFetch";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import { UPLOAD_RULES, formatBytes, getRuleLabel } from "../../lib/uploadRules";
import logoImage from "../../assets/images/logo.jpg";

const KYC_VIDEO_RULE = UPLOAD_RULES.kycVideos;
const KYC_VIDEO_BUCKET = KYC_VIDEO_RULE.bucket;
const KYC_VIDEO_MAX_BYTES = KYC_VIDEO_RULE.maxBytes;
const KYC_VIDEO_RULE_LABEL = getRuleLabel(KYC_VIDEO_RULE);
const MAX_KYC_SECONDS = 60;
const TARGET_KYC_FRAME_RATE = 24;
const TARGET_KYC_VIDEO_BITRATE = 220000;

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "CT";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

async function resolveBrowserLocationLabel(lat, lng, fallback = "") {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`
    );
    if (!response.ok) throw new Error("Reverse geocode failed");

    const payload = await response.json();
    const area =
      payload?.locality ||
      payload?.city ||
      payload?.principalSubdivisionCode?.split("-")?.[1] ||
      payload?.localityInfo?.administrative?.find?.((item) => item?.order === 5)?.name ||
      fallback ||
      "";
    const state =
      payload?.principalSubdivision ||
      payload?.localityInfo?.administrative?.find?.((item) => item?.order === 4)?.name ||
      "";

    if (!area && !state) return fallback || "";
    if (!state) return area || fallback || "";

    const normalizedArea = String(area || "").trim().toLowerCase();
    const normalizedState = String(state || "").trim().toLowerCase();
    if (!normalizedArea || normalizedArea === normalizedState) return state;

    return `${area} / ${state}`;
  } catch {
    return fallback || "";
  }
}

export default function MerchantVideoKYC() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  usePreventPullToRefresh();
  const { notify } = useGlobalFeedback();
  const { user, loading: authLoading, isOffline } = useAuthSession();
  const prefetchedData =
    routeLocation.state?.prefetchedData?.kind === "merchant-video-kyc"
      ? routeLocation.state.prefetchedData
      : null

  // Data State
  const [loading, setLoading] = useState(() => !prefetchedData);
  const [pageError, setPageError] = useState(null);
  const [shopData, setShopData] = useState(() => prefetchedData?.shopData || null);
  const [profileName, setProfileName] = useState(() => prefetchedData?.profileName || "Merchant");
  const [profileAvatar, setProfileAvatar] = useState(() => prefetchedData?.profileAvatar || "");
  const [cityName, setCityName] = useState(() => prefetchedData?.cityName || "");
  const [location, setLocation] = useState(null); // { lat, lng }
  const [setupState, setSetupState] = useState("idle"); // 'idle' | 'requesting' | 'ready' | 'failed'
  const [setupError, setSetupError] = useState("");
  const [hasAutoStartedSetup, setHasAutoStartedSetup] = useState(false);

  // Recording State
  const [recordingState, setRecordingState] = useState("ready"); // 'ready' | 'recording' | 'recorded' | 'uploading'
  const [timeLeft, setTimeLeft] = useState(MAX_KYC_SECONDS);
  const [uploadStatus, setUploadStatus] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState("");

  // Refs for DOM elements and Media objects
  const rawVideoRef = useRef(null); // Hidden video taking raw camera feed
  const canvasRef = useRef(null);   // Visible canvas drawing video + text
  const playbackVideoRef = useRef(null); // Visible video for playback
  
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedBlobRef = useRef(null);
  const playbackUrlRef = useRef("");
  const uploadInFlightRef = useRef(false);
  
  const timerIntervalRef = useRef(null);
  const clockIntervalRef = useRef(null);
  const animationFrameId = useRef(null);

  // Refs for Canvas Animation Loop to avoid stale state closures
  const locationRef = useRef(null);
  const dateRef = useRef("");
  const cityRef = useRef("");
  const recordingStateRef = useRef(recordingState);

  // Sync state to refs for the animation loop
  useEffect(() => { locationRef.current = location; }, [location]);
  useEffect(() => { dateRef.current = currentDateTime; }, [currentDateTime]);
  useEffect(() => { cityRef.current = cityName; }, [cityName]);
  useEffect(() => { recordingStateRef.current = recordingState; }, [recordingState]);

  const stopActiveMedia = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    timerIntervalRef.current = null;
    animationFrameId.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore recorder shutdown errors during resets.
      }
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;

    if (rawVideoRef.current) {
      rawVideoRef.current.pause();
      rawVideoRef.current.srcObject = null;
    }
  }, []);

  const clearPlaybackUrl = useCallback(() => {
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current);
      playbackUrlRef.current = "";
    }
  }, []);

  const getStoragePathFromUrl = (url, bucket) => {
    if (!url) return null;
    try {
      const cleanUrl = String(url).split("?")[0];
      const escapedBucket = bucket.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(`/storage/v1/object/(?:public|authenticated)/${escapedBucket}/(.+)$`);
      const match = cleanUrl.match(regex);
      return match?.[1] || null;
    } catch {
      return null;
    }
  };

  // 1. Initial Data Fetch & Validation
  useEffect(() => {
    const shouldUsePrefetchedData = Boolean(prefetchedData)

    if (shouldUsePrefetchedData) {
      setShopData(prefetchedData.shopData || null)
      setProfileName(prefetchedData.profileName || "Merchant")
      setProfileAvatar(prefetchedData.profileAvatar || "")
      setCityName(prefetchedData.cityName || "")
      setPageError(null)
      setLoading(false)
    }

    async function init() {
      if (!user) return;
      if (isOffline) {
        setPageError("Network unavailable. Retry.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setPageError(null);

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("full_name, avatar_url, is_suspended, city_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profErr || profile?.is_suspended) throw new Error("Account restricted.");
        if (profile?.full_name) setProfileName(profile.full_name);
        if (profile?.avatar_url) setProfileAvatar(profile.avatar_url);

        const { data: shop, error: shopErr } = await supabase
          .from("shops")
          .select("id, name, unique_id, address, city_id, is_verified, kyc_status, kyc_video_url, rejection_reason, cities(name)")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (shopErr || !shop) throw new Error("Shop not found.");

        if (shop.is_verified || shop.kyc_status === 'approved') {
          notify({ type: "info", title: "Already approved", message: "Your shop has already completed this verification step." });
          navigate("/vendor-panel", { replace: true });
          return;
        }

        setShopData(shop);

        const resolvedCityId = shop?.city_id || profile?.city_id;
        if (resolvedCityId) {
          const { data: city } = await supabase
            .from("cities")
            .select("name")
            .eq("id", resolvedCityId)
            .maybeSingle();
          if (city?.name) setCityName(city.name);
        }

      } catch (err) {
        setPageError(getFriendlyErrorMessage(err, "Could not load KYC details. Retry."));
      } finally {
        setLoading(false);
      }
    }

    if (!shouldUsePrefetchedData && !authLoading) init();

    // Start Live Clock
    const updateClock = () => {
      setCurrentDateTime(new Date().toLocaleString('en-GB', { 
        day: '2-digit', month: 'short', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      }));
    };
    updateClock();
    clockIntervalRef.current = setInterval(updateClock, 1000);

    // Cleanup function
    return () => {
      stopActiveMedia();
      clearPlaybackUrl();
      if (clockIntervalRef.current) clearInterval(clockIntervalRef.current);
    };
  }, [user, authLoading, isOffline, navigate, notify, stopActiveMedia, clearPlaybackUrl, prefetchedData]);

  useEffect(() => {
    if (!user?.id || !shopData?.id || isOffline) return undefined;

    const channel = supabase
      .channel(`public:shops:id=eq.${shopData.id}:merchant-kyc`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shops",
          filter: `id=eq.${shopData.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setPageError("Shop record is no longer available.");
            return;
          }

          const nextShop = payload.new || null;
          if (!nextShop) return;

          setShopData((prev) => ({ ...(prev || {}), ...nextShop }));

          if (nextShop.is_verified || nextShop.kyc_status === "approved") {
            notify({
              type: "success",
              title: "KYC approved",
              message: "Your shop verification has been approved.",
            });
            navigate("/vendor-panel", { replace: true });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, shopData?.id, isOffline, navigate, notify]);


  const startCanvasLoop = useCallback(() => {
    const drawFrame = () => {
      const video = rawVideoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && recordingStateRef.current !== "recorded") {
        const ctx = canvas.getContext('2d');
        
        // Sync canvas resolution to the camera's actual output resolution
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // 1. Draw the raw video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 2. Draw the Watermark Background Box
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(10, canvas.height - 98, 300, 88);

        // 3. Draw the Date/Time
        ctx.fillStyle = "#38BDF8"; // Light blue
        ctx.font = "bold 15px monospace";
        ctx.fillText(dateRef.current, 20, canvas.height - 68);

        // 4. Draw the City
        if (cityRef.current) {
          ctx.fillStyle = "#FBBF24";
          ctx.font = "bold 14px monospace";
          ctx.fillText(`CITY: ${cityRef.current}`, 20, canvas.height - 46);
        }

        // 5. Draw the Coordinates
        if (locationRef.current) {
          ctx.fillStyle = "#A3E635"; // Green
          ctx.font = "bold 13px monospace";
          ctx.fillText(`LAT: ${locationRef.current.lat}`, 20, canvas.height - 24);
          ctx.fillText(`LNG: ${locationRef.current.lng}`, 160, canvas.height - 24);
        } else {
          ctx.fillStyle = "#FBBF24"; // Yellow
          ctx.font = "bold 14px monospace";
          ctx.fillText("Acquiring GPS...", 20, canvas.height - 24);
        }
      }
      
      // Loop
      animationFrameId.current = requestAnimationFrame(drawFrame);
    };
    
    // Kick off the loop
    drawFrame();
  }, []);

  // 2. Permissions, Camera, and CANVAS BURNING Logic
  const requestPermissionsAndStart = useCallback(async () => {
    try {
      stopActiveMedia();
      setSetupState("requesting");
      setSetupError("");
      setLocation(null);

      // Step A: Request GPS Location
      if (!navigator.geolocation) throw new Error("Geolocation is not supported by your browser.");
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
      });
      
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      setLocation({ lat, lng });
      const resolvedLabel = await resolveBrowserLocationLabel(lat, lng, cityName || shopData?.cities?.name || "");
      if (resolvedLabel) {
        setCityName(resolvedLabel);
      }

      // Step B: Request Camera & Mic
      const constraints = {
        audio: true,
        video: {
          facingMode: "environment",
          width: { ideal: 640, max: 854 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: TARGET_KYC_FRAME_RATE, max: TARGET_KYC_FRAME_RATE },
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (rawVideoRef.current) {
        rawVideoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          rawVideoRef.current.onloadedmetadata = () => resolve();
        });
        await rawVideoRef.current.play().catch(() => undefined);
      }

      // Step C: Start the Canvas Drawing Loop
      startCanvasLoop();
      setSetupState("ready");

    } catch (err) {
      console.error("Permission denied", err);
      stopActiveMedia();
      setSetupState("failed");
      if (err.code === 1 || err.message?.includes("User denied Geolocation") || err.message?.includes("location")) {
        setSetupError("Please allow location access and retry.");
      } else {
        setSetupError("Please allow camera and microphone access and retry.");
      }
    }
  }, [cityName, shopData?.cities?.name, startCanvasLoop, stopActiveMedia]);

  useEffect(() => {
    if (loading || pageError || !shopData || isOffline || hasAutoStartedSetup) return;
    setHasAutoStartedSetup(true);
    requestPermissionsAndStart();
  }, [loading, pageError, shopData, isOffline, hasAutoStartedSetup, requestPermissionsAndStart]);

  const handleRecordToggle = () => {
    if (recordingState === "recording") stopRecording();
    else if (recordingState === "ready") startRecording();
  };

  const startRecording = () => {
    recordedChunksRef.current = [];
    
    // IMPORTANT: Capture the stream from the CANVAS, not the raw camera
    const canvasStream = canvasRef.current.captureStream(TARGET_KYC_FRAME_RATE);
    
    // Extract the audio track from the raw camera stream and mix it with the canvas video
    const audioTrack = streamRef.current.getAudioTracks()[0];
    const combinedStream = new MediaStream([canvasStream.getVideoTracks()[0]]);
    if (audioTrack) combinedStream.addTrack(audioTrack);

    let options = { mimeType: 'video/webm;codecs=vp8,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };
    options.videoBitsPerSecond = TARGET_KYC_VIDEO_BITRATE;

    try {
      mediaRecorderRef.current = new MediaRecorder(combinedStream, options);
    } catch {
      mediaRecorderRef.current = new MediaRecorder(combinedStream);
    }

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };

    mediaRecorderRef.current.onstop = processVideo;
    mediaRecorderRef.current.start();

    setRecordingState("recording");
    setTimeLeft(MAX_KYC_SECONDS);

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
    // Stop raw camera tracks
    stopActiveMedia();

    const mimeType = recordedChunksRef.current[0]?.type || 'video/mp4';
    const blob = new Blob(recordedChunksRef.current, { type: mimeType });
    recordedBlobRef.current = blob;

    setRecordingState("recorded");
    
    if (playbackVideoRef.current) {
      clearPlaybackUrl();
      playbackUrlRef.current = URL.createObjectURL(blob);
      playbackVideoRef.current.src = playbackUrlRef.current;
    }
  };

  const resetStudio = async () => {
    setRecordingState("ready");
    setTimeLeft(MAX_KYC_SECONDS);
    recordedBlobRef.current = null;
    recordedChunksRef.current = [];
    clearPlaybackUrl();
    if (playbackVideoRef.current) playbackVideoRef.current.src = "";
    setSetupState("idle");
    await requestPermissionsAndStart();
  };

  // 3. Upload Logic
  const uploadVideo = async () => {
    if (uploadInFlightRef.current || recordingState === "uploading") return;
    if (!recordedBlobRef.current) return;
    if (isOffline) {
      notify({ type: "error", title: "Network unavailable", message: "You must be online to upload." });
      return;
    }
    if (!shopData?.id) {
      notify({ type: "error", title: "Shop unavailable", message: "Shop data is not ready yet. Please retry." });
      return;
    }
    if (recordedBlobRef.current.size > KYC_VIDEO_MAX_BYTES) {
      notify({
        type: "error",
        title: "Video too large",
        message: `The video exceeds the upload limit (${formatBytes(
          recordedBlobRef.current.size
        )}). Please retake it with shorter duration or lower quality. Allowed: ${KYC_VIDEO_RULE_LABEL}.`,
      });
      return;
    }

    let uploadedPath = null;

    try {
      uploadInFlightRef.current = true;
      setRecordingState("uploading");
      setUploadStatus("Uploading burned video to secure vault...");

      const ext = recordedBlobRef.current.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `kyc_video_${Date.now()}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

      // A. Upload to Storage
      const { error: uploadErr } = await supabase.storage
        .from(KYC_VIDEO_BUCKET)
        .upload(filePath, recordedBlobRef.current, { cacheControl: '3600', upsert: false });

      if (uploadErr) throw new Error(`Storage Error: ${uploadErr.message}`);
      uploadedPath = filePath;

      const { data: { publicUrl } } = supabase.storage.from(KYC_VIDEO_BUCKET).getPublicUrl(filePath);

      // B. Update Shop KYC Status
      setUploadStatus("Finalizing submission...");
      const kycSubmissionMeta = {
        submitted_at: new Date().toISOString(),
        recorded_at: new Date().toISOString(),
        merchant_name: profileName || user?.user_metadata?.full_name || user?.email || "Merchant",
        shop_name: shopData?.name || "",
        shop_unique_id: shopData?.unique_id || "",
        shop_address: shopData?.address || "",
        city_name: shopData?.cities?.name || "",
        location_label: cityName || shopData?.cities?.name || "",
        latitude: locationRef.current?.lat || "",
        longitude: locationRef.current?.lng || "",
      };
      
      const { data: updatedShop, error: dbErr } = await supabase
        .from('shops')
        .update({ 
          kyc_status: 'submitted', 
          kyc_video_url: publicUrl, 
          kyc_submission_meta: kycSubmissionMeta,
          rejection_reason: null
        })
        .eq('owner_id', user.id)
        .select();

      if (dbErr) throw new Error(`Database Error: ${dbErr.message}`);
      if (!updatedShop || updatedShop.length === 0) throw new Error("Security Blocked Update. Contact Support.");

      const oldVideoPath = getStoragePathFromUrl(shopData?.kyc_video_url, KYC_VIDEO_BUCKET);
      if (oldVideoPath && oldVideoPath !== filePath) {
        const { error: cleanupError } = await supabase.storage
          .from(KYC_VIDEO_BUCKET)
          .remove([oldVideoPath]);
        if (cleanupError) {
          console.warn("Old KYC video cleanup failed:", cleanupError);
        }
      }

      notify({
        type: "success",
        title: "Video uploaded",
        message: "Your video was submitted successfully and is under review.",
      });

      // Clear relevant caches to reflect updated shop status
      clearCachedFetchStore((key) => 
        key.startsWith("vendor_panel_") ||
        key.startsWith("dashboard_dynamic_") ||
        key.startsWith("shop_detail_")
      );

      uploadInFlightRef.current = false;
      navigate("/vendor-panel", { replace: true });

    } catch (err) {
      if (uploadedPath) {
        try {
          await supabase.storage.from(KYC_VIDEO_BUCKET).remove([uploadedPath]);
        } catch (cleanupErr) {
          console.warn("Rollback cleanup failed for KYC upload:", cleanupErr);
        }
      }
      console.error(err);
      notify({ type: "error", title: "Upload failed", message: getFriendlyErrorMessage(err, "Upload failed. Please retry.") });
      setRecordingState("recorded"); // Let them try submitting again
      uploadInFlightRef.current = false;
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

  if (pageError) {
    return (
      <GlobalErrorScreen
        error={pageError}
        message={pageError}
        onRetry={() => window.location.reload()}
        onBack={() => navigate("/vendor-panel")}
      />
    );
  }

  return (
      <div
        className={`min-h-screen bg-[#050816] text-white ${
          routeLocation.state?.fromVendorTransition ? "ctm-page-enter" : ""
        }`}
      >
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1020]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[700px] items-center gap-3 px-4 py-4">
          <button
            onClick={() => navigate("/vendor-panel")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[1rem] transition hover:bg-white/10"
          >
            <FaArrowLeft />
          </button>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[#1A2237] text-[0.85rem] font-bold text-[#F9A8D4]">
            {profileAvatar ? (
              <img src={profileAvatar} alt={profileName} className="h-full w-full object-cover" />
            ) : (
              <span>{getInitials(profileName)}</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[1rem] font-extrabold text-[#F9A8D4]">Hello, {profileName}</div>
            <div className="text-[0.74rem] font-semibold text-[#FBBF24]">
              shop/store verification
            </div>
            {shopData?.name ? (
              <div className="truncate text-[0.8rem] text-[#CBD5E1]">{shopData.name}</div>
            ) : null}
            {cityName ? (
              <div className="truncate text-[0.75rem] text-[#94A3B8]">{cityName}</div>
            ) : null}
          </div>

          <img
            src={logoImage}
            alt="CTMerchant"
            className="h-11 w-11 shrink-0 rounded-full border border-white/10 object-cover"
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[700px] flex-1 flex-col px-4 pb-10 pt-4">
        {shopData?.rejection_reason ? (
          <div className="mb-4 rounded-2xl border border-[#7F1D1D] bg-[#2A1014] px-4 py-3 text-[0.88rem] text-[#FECACA] shadow-[0_10px_24px_rgba(0,0,0,0.22)]">
            <div className="mb-1 font-bold uppercase tracking-[0.12em] text-[#FCA5A5]">Rejection Reason</div>
            <div>{shopData.rejection_reason}</div>
          </div>
        ) : null}

        {/* Hidden Raw Video Feed */}
        <video ref={rawVideoRef} className="hidden" muted playsInline autoPlay />

        <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-[#08101E] shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
          
          {/* Visible Canvas playing the stamped footage */}
          <canvas 
            ref={canvasRef} 
            className={`h-full w-full object-cover ${recordingState === 'ready' || recordingState === 'recording' ? 'block' : 'hidden'} ${setupState === 'ready' ? '' : 'opacity-20'}`}
          />
          
          {/* Playback View */}
          <video 
            ref={playbackVideoRef} 
            className={`h-full w-full object-cover ${recordingState === 'recorded' ? 'block' : 'hidden'}`}
            playsInline 
            controls 
          />

          {recordingState === "ready" && setupState !== "ready" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-5 text-center backdrop-blur-sm">
              <div className="w-full max-w-[340px] rounded-3xl border border-white/10 bg-[#10192B]/95 p-5 shadow-xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1F2937] text-[#FBBF24]">
                  {setupState === "requesting" ? (
                    <FaRotateRight className="animate-spin text-2xl" />
                  ) : (
                    <FaShieldHalved className="text-2xl" />
                  )}
                </div>
                <h3 className="mb-2 text-[1.05rem] font-extrabold text-white">
                  {setupState === "requesting" ? "Waiting for permissions" : "Enable camera and location"}
                </h3>
                <p className="text-[0.9rem] leading-relaxed text-[#CBD5E1]">
                  {setupState === "requesting"
                    ? "Please complete the browser permission prompt. Once access is granted, the camera will start here."
                    : "Turn on the required permissions to start your KYC video."}
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={requestPermissionsAndStart}
                    disabled={setupState === "requesting"}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#db2777] px-4 py-3 font-bold text-white transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FaCamera />
                    {setupState === "requesting" ? "Waiting..." : "Enable Camera and Location"}
                  </button>
                  {setupError ? (
                    <p className="text-center text-[0.8rem] font-medium text-[#FCA5A5]">
                      {setupError}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-center gap-4 text-[0.78rem] font-semibold text-[#94A3B8]">
                    <span className="inline-flex items-center gap-1"><FaLocationDot /> GPS</span>
                    <span className="inline-flex items-center gap-1"><FaCamera /> Camera</span>
                    <span className="inline-flex items-center gap-1"><FaMicrophone /> Mic</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Recording Timer & UI */}
          {recordingState === 'recording' ? (
            <div className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2.5 py-1 text-[0.8rem] font-extrabold shadow-[0_2px_10px_rgba(220,38,38,0.5)] animate-[pulse_1.5s_infinite]">
              <div className="h-2 w-2 rounded-full bg-white"></div> REC
            </div>
          ) : null}

          {/* Uploading Overlay */}
          {recordingState === "uploading" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 p-5 text-center backdrop-blur-sm">
              <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-transparent border-t-[#db2777]"></div>
              <div className="text-[1.1rem] font-bold text-white">{uploadStatus}</div>
            </div>
          )}
        </div>

        {/* CONTROLS */}
        <div className="mt-4 flex flex-col gap-4 pb-10">
          <div className="flex items-center justify-between gap-3">
            <div className={`inline-flex min-w-[90px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 font-mono text-[0.95rem] font-extrabold ${timeLeft <= 10 ? 'text-red-400' : 'text-white'}`}>
              00:{timeLeft.toString().padStart(2, '0')}
            </div>

            {(recordingState === "ready" || recordingState === "recording") ? (
              <button
                onClick={handleRecordToggle}
                disabled={!location || setupState !== "ready"}
                className={`flex h-[58px] w-[58px] items-center justify-center rounded-full border-4 border-white bg-transparent transition-all ${recordingState === 'recording' ? 'scale-95' : ''} ${!location || setupState !== "ready" ? 'cursor-not-allowed border-gray-500 opacity-50' : ''}`}
              >
                <div className={`rounded-full bg-[#DC2626] transition-all ${recordingState === 'recording' ? 'h-[24px] w-[24px] rounded-md' : 'h-[40px] w-[40px]'} ${!location || setupState !== "ready" ? 'bg-gray-500' : ''}`}></div>
              </button>
            ) : null}
          </div>

          {recordingState === "recorded" ? (
            <div className="flex items-center gap-3">
              <button
                onClick={uploadVideo}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-3 text-[0.9rem] font-bold text-white shadow-[0_4px_10px_rgba(16,185,129,0.3)] transition hover:bg-[#059669]"
              >
                <FaCloudArrowUp /> Submit
              </button>

              <button
                onClick={resetStudio}
                className="flex-1 rounded-xl border border-[#f472b6]/50 bg-transparent px-4 py-3 text-[0.85rem] font-semibold text-[#f472b6] transition hover:bg-[#f472b6]/10"
              >
                Retake
              </button>
            </div>
          ) : null}

        </div>

      </main>
    </div>
  );
}
