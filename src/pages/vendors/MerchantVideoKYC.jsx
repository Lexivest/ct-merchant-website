import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaCamera,
  FaCloudArrowUp,
  FaLocationDot,
  FaMicrophone,
  FaRotateRight,
} from "react-icons/fa6";
import { supabase } from "../../lib/supabase";
import useAuthSession from "../../hooks/useAuthSession";
import usePreventPullToRefresh from "../../hooks/usePreventPullToRefresh";
import { clearCachedFetchStore, invalidateCachedFetchStore } from "../../hooks/useCachedFetch";
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider";
import GlobalErrorScreen from "../../components/common/GlobalErrorScreen";
import InlineErrorState from "../../components/common/InlineErrorState";
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors";
import { fetchVerificationAccessStatus } from "../../lib/offlinePayments";
import { UPLOAD_RULES, formatBytes, getRuleLabel } from "../../lib/uploadRules";
import logoImage from "../../assets/images/logo.jpg";

const KYC_VIDEO_RULE = UPLOAD_RULES.kycVideos;
const KYC_VIDEO_BUCKET = KYC_VIDEO_RULE.bucket;
const KYC_VIDEO_BUCKETS = Array.from(new Set([KYC_VIDEO_BUCKET, "kyc_videos"]));
const KYC_VIDEO_MAX_BYTES = KYC_VIDEO_RULE.maxBytes;
const KYC_VIDEO_RULE_LABEL = getRuleLabel(KYC_VIDEO_RULE);
const MAX_KYC_SECONDS = 60;
const TARGET_KYC_FRAME_RATE = 24;
const TARGET_KYC_VIDEO_BITRATE = 220000;

const SETUP_STATES = {
  IDLE: "idle",
  REQUESTING: "requesting",
  WAITING_LOCATION: "waiting_location",
  STARTING_CAMERA: "starting_camera",
  READY: "ready",
  FAILED: "failed",
};

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

function isBucketNotFoundError(error) {
  const combined = [
    error?.message,
    error?.error,
    error?.statusCode,
    error?.status,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    combined.includes("bucket not found") ||
    combined.includes("bucket_not_found") ||
    combined.includes("not found")
  );
}

async function uploadKycVideoToAvailableBucket(filePath, blob, options) {
  let lastError = null;

  for (const bucket of KYC_VIDEO_BUCKETS) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, blob, options);

    if (!error) {
      return { bucket };
    }

    lastError = error;
    if (!isBucketNotFoundError(error)) {
      break;
    }
  }

  throw lastError || new Error("KYC video bucket was not found.");
}

function getSetupCopy(setupState) {
  if (setupState === SETUP_STATES.REQUESTING) {
    return {
      title: "Allow access to continue",
      message: "Approve the browser prompt so CTMerchant can prepare your verification studio.",
    };
  }

  if (setupState === SETUP_STATES.WAITING_LOCATION) {
    return {
      title: "Getting location",
      message: "We are waiting for your phone location to turn active before the preview opens.",
    };
  }

  if (setupState === SETUP_STATES.STARTING_CAMERA) {
    return {
      title: "Opening camera",
      message: "Location is ready. We are now starting your camera and microphone.",
    };
  }

  return {
    title: "Start video KYC",
    message: "Tap continue and we will request location, camera, and microphone, then open your preview.",
  };
}

function getCurrentPositionOnce(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function requestLocationWithFallback() {
  try {
    return await getCurrentPositionOnce({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  } catch (error) {
    if (error?.code === 1) {
      throw error;
    }

    return getCurrentPositionOnce({
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 120000,
    });
  }
}

async function requestCameraStreamWithFallback() {
  const attempts = [
    {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 640, max: 854 },
        height: { ideal: 480, max: 480 },
        frameRate: { ideal: TARGET_KYC_FRAME_RATE, max: TARGET_KYC_FRAME_RATE },
      },
    },
    {
      audio: true,
      video: {
        facingMode: { ideal: "environment" },
      },
    },
    {
      audio: true,
      video: true,
    },
  ];

  let lastError = null;

  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not start camera and microphone.");
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
  const [setupState, setSetupState] = useState(SETUP_STATES.IDLE);
  const [setupError, setSetupError] = useState("");

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
          .select("id, name, unique_id, address, city_id, created_at, status, is_verified, kyc_status, kyc_video_url, rejection_reason, cities(name)")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (shopErr || !shop) throw new Error("Shop not found.");

        const verificationAccess = await fetchVerificationAccessStatus({
          userId: user.id,
          shopId: shop.id,
          shopCreatedAt: shop.created_at,
        });

        if (shop.is_verified) {
          notify({ kind: "toast", type: "info", title: "Already approved", message: "Your shop has already completed this verification step." });
          navigate("/vendor-panel", { replace: true });
          return;
        }

        if (shop.status !== "approved") {
          notify({
            kind: "toast",
            type: "info",
            title: "Application pending",
            message: "Your shop must be digitally approved before you can submit video KYC.",
          });
          navigate("/vendor-panel", { replace: true });
          return;
        }

        if (shop.kyc_status === "submitted") {
          notify({
            kind: "toast",
            type: "info",
            title: "KYC in review",
            message: "Your video KYC is already under review. We will notify you once approved.",
          });
          navigate("/vendor-panel", { replace: true });
          return;
        }

        const canRecordVideoKyc =
          verificationAccess.paymentConfirmed ||
          shop.kyc_status === "rejected";

        if (!canRecordVideoKyc) {
          notify({
            kind: "toast",
            type: "info",
            title: "Verification fee required",
            message: "Complete your physical verification payment step before recording video KYC.",
          });
          navigate(`/remita?shop_id=${shop.id}`, { replace: true });
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

          if (nextShop.is_verified) {
            notify({
              kind: "toast",
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
    let failedPhase = "location";
    try {
      stopActiveMedia();
      setRecordingState("ready");
      setSetupState(SETUP_STATES.REQUESTING);
      setSetupError("");
      setLocation(null);

      // Step A: Request GPS Location
      if (!navigator.geolocation) throw new Error("Geolocation is not supported by your browser.");
      setSetupState(SETUP_STATES.WAITING_LOCATION);
      const pos = await requestLocationWithFallback();
      
      const lat = pos.coords.latitude.toFixed(6);
      const lng = pos.coords.longitude.toFixed(6);
      setLocation({ lat, lng });
      void resolveBrowserLocationLabel(lat, lng, cityName || shopData?.cities?.name || "").then((resolvedLabel) => {
        if (resolvedLabel) {
          setCityName(resolvedLabel);
        }
      });

      // Step B: Request Camera & Mic
      failedPhase = "camera";
      setSetupState(SETUP_STATES.STARTING_CAMERA);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera and microphone are not supported by this browser.");
      }
      const stream = await requestCameraStreamWithFallback();
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
      setSetupState(SETUP_STATES.READY);

    } catch (err) {
      console.error("Permission denied", err);
      stopActiveMedia();
      setSetupState(SETUP_STATES.FAILED);
      if (failedPhase === "location") {
        if (err?.code === 1 || err?.message?.includes("User denied Geolocation")) {
          setSetupError("Please allow location access, then try again.");
        } else {
          setSetupError("Turn on your phone location service and wait a moment for GPS to lock.");
        }
      } else if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setSetupError("Please allow camera and microphone access to continue.");
      } else if (err?.name === "NotFoundError") {
        setSetupError("This phone could not find a working camera or microphone.");
      } else if (err?.name === "NotReadableError") {
        setSetupError("Your camera may be busy in another app. Close other camera apps and retry.");
      } else {
        setSetupError("We could not start the camera right now. Please try again.");
      }
    }
  }, [cityName, shopData?.cities?.name, startCanvasLoop, stopActiveMedia]);

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
    let uploadedBucket = KYC_VIDEO_BUCKET;

    try {
      uploadInFlightRef.current = true;
      setRecordingState("uploading");
      setUploadStatus("Uploading your KYC video to secure vault...");

      const ext = recordedBlobRef.current.type.includes('mp4') ? 'mp4' : 'webm';
      const contentType = ext === 'mp4' ? 'video/mp4' : 'video/webm';
      const fileName = `kyc_video_${Date.now()}.${ext}`;
      const filePath = `${user.id}/${fileName}`;

      // A. Upload to Storage. Some production projects still have the legacy
      // kyc_videos bucket, so fall back only when the preferred bucket is absent.
      const uploadResult = await uploadKycVideoToAvailableBucket(filePath, recordedBlobRef.current, {
        cacheControl: '3600',
        contentType,
        upsert: false,
      });
      uploadedBucket = uploadResult.bucket;
      uploadedPath = filePath;

      const { data: { publicUrl } } = supabase.storage.from(uploadedBucket).getPublicUrl(filePath);

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

      const oldVideoTarget = KYC_VIDEO_BUCKETS
        .map((bucket) => ({ bucket, path: getStoragePathFromUrl(shopData?.kyc_video_url, bucket) }))
        .find((target) => Boolean(target.path));
      if (oldVideoTarget?.path && oldVideoTarget.path !== filePath) {
        const { error: cleanupError } = await supabase.storage
          .from(oldVideoTarget.bucket)
          .remove([oldVideoTarget.path]);
        if (cleanupError) {
          console.warn("Old KYC video cleanup failed:", cleanupError);
        }
      }

      notify({
        type: "success",
        title: "Video uploaded",
        message: "Your video was submitted successfully and is under review.",
        confirmText: "Back to Dashboard",
        onClose: () => navigate("/user-dashboard?tab=services", { replace: true }),
      });

      try {
        localStorage.setItem(
          `ctm_my_shop_${user.id}`,
          JSON.stringify({
            ...(shopData || {}),
            id: shopData?.id,
            status: shopData?.status || "approved",
            rejection_reason: null,
            is_open: shopData?.is_open !== false,
            is_verified: false,
            kyc_status: "submitted",
            kyc_video_url: publicUrl,
          })
        );
      } catch {
        // Dashboard status will re-sync from Supabase when local storage is unavailable.
      }

      // Clear specific vendor panel cache to force immediate fresh state there
      clearCachedFetchStore((key) => 
        key.startsWith("vendor_panel_")
      );

      // Invalidate dashboard and shop details so they re-fetch in background 
      // but keep showing stale data to avoid a blank screen (Stale-While-Revalidate)
      invalidateCachedFetchStore((key) => 
        key.startsWith("dashboard_dynamic_") ||
        key.startsWith("shop_detail_")
      );

      uploadInFlightRef.current = false;

    } catch (err) {
      if (uploadedPath) {
        try {
          await supabase.storage.from(uploadedBucket).remove([uploadedPath]);
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

  const setupReady =
    setupState === SETUP_STATES.READY &&
    Boolean(location) &&
    Boolean(streamRef.current);
  const setupCopy = getSetupCopy(setupState);
  const setupBusy =
    setupState === SETUP_STATES.REQUESTING ||
    setupState === SETUP_STATES.WAITING_LOCATION ||
    setupState === SETUP_STATES.STARTING_CAMERA;


  // --- UI RENDERING ---
  if (authLoading || loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#0F172A]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#db2777]/30 border-t-[#db2777]"></div>
        <p className="mt-4 font-semibold text-white">Loading video KYC...</p>
        <p className="mt-2 text-xs text-[#94A3B8]">Preparing your verification studio.</p>
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
            <div className="text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-[#FBBF24]">Video KYC</div>
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
            className={`h-full w-full object-cover ${recordingState === 'ready' || recordingState === 'recording' ? 'block' : 'hidden'} ${setupReady ? '' : 'opacity-0'}`}
          />
          
          {/* Playback View */}
          <video 
            ref={playbackVideoRef} 
            className={`h-full w-full object-cover ${recordingState === 'recorded' ? 'block' : 'hidden'}`}
            playsInline 
            controls 
          />

          {recordingState === "ready" && !setupReady && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-5 text-center backdrop-blur-sm">
              <div className="w-full max-w-[340px] rounded-3xl border border-white/10 bg-[#10192B]/95 p-5 shadow-xl">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#1F2937] text-[#FBBF24]">
                  {setupBusy ? (
                    <FaRotateRight className="animate-spin text-2xl" />
                  ) : (
                    <FaCamera className="text-2xl" />
                  )}
                </div>
                <h3 className="mb-2 text-[1.05rem] font-extrabold text-white">{setupCopy.title}</h3>
                <p className="text-[0.9rem] leading-relaxed text-[#CBD5E1]">{setupCopy.message}</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[0.78rem] font-semibold text-[#CBD5E1]">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <FaLocationDot /> Location
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <FaCamera /> Camera
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                    <FaMicrophone /> Mic
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={requestPermissionsAndStart}
                    disabled={setupBusy}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#db2777] px-4 py-3 font-bold text-white transition hover:bg-[#be185d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <FaCamera />
                    {setupBusy ? "Preparing..." : setupState === SETUP_STATES.FAILED ? "Try Again" : "Continue"}
                  </button>
                  {setupError ? (
                    <InlineErrorState
                      title="Could not start yet"
                      message={setupError}
                      surface="dark"
                      compact
                    />
                  ) : null}
                  <div className="text-center text-[0.78rem] font-semibold text-[#94A3B8]">
                    We wait for location first, then open the live preview.
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
                disabled={!setupReady}
                className={`flex h-[58px] w-[58px] items-center justify-center rounded-full border-4 border-white bg-transparent transition-all ${recordingState === 'recording' ? 'scale-95' : ''} ${!setupReady ? 'cursor-not-allowed border-gray-500 opacity-50' : ''}`}
              >
                <div className={`rounded-full bg-[#DC2626] transition-all ${recordingState === 'recording' ? 'h-[24px] w-[24px] rounded-md' : 'h-[40px] w-[40px]'} ${!setupReady ? 'bg-gray-500' : ''}`}></div>
              </button>
            ) : null}
          </div>

          {recordingState === "ready" && !setupReady ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-[0.82rem] font-semibold text-[#CBD5E1]">
              {setupState === SETUP_STATES.WAITING_LOCATION
                ? "Waiting for location to turn active before the video preview starts."
                : setupBusy
                  ? "Preparing your studio..."
                  : "Tap Continue above to start camera, microphone, and location setup."}
            </div>
          ) : null}

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
