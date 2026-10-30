"use client";

import React, { useState, useRef, useEffect } from "react";
import { Youtube } from "@/components/icons/Youtube";
import {
  X,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Eye,
  Sliders,
  Move,
  Film,
  Type,
  Image as ImageIcon,
  Layers,
  ShieldCheck,
  CheckCheck,
  Trash2,
  Sparkles,
  Clock,
} from "lucide-react";

export interface StudioRecording {
  fileId: string;
  zoom_file_id?: string;
  topic: string;
  startTime: string;
  recording_start?: string;
  durationMinutes?: number;
  duration_minutes?: number;
  fileSizeBytes?: number;
  file_size_bytes?: number;
  downloadUrl: string;
  zoomAccountId: string;
  hostName?: string;
}

interface WatermarkStudioProps {
  recording: StudioRecording;
  onClose: () => void;
  onSuccess?: (result: { youtubeUrl: string; youtubeVideoId: string }) => void;
}

export const LOGO_PRESETS = [
  {
    id: "crest",
    name: "Union Crest (Square)",
    path: "/assets/images/logo_main.png",
    aspectRatio: "1 / 1",
    previewSrc: "/assets/images/logo_main.png",
    recommendedScale: 0.12,
  },
  {
    id: "banner",
    name: "Union Banner (Horizontal)",
    path: "/assets/images/logo1.png",
    aspectRatio: "1551 / 395",
    previewSrc: "/assets/images/logo1.png",
    recommendedScale: 0.22,
  },
  {
    id: "compact",
    name: "Union Compact Banner",
    path: "/assets/images/logo.png",
    aspectRatio: "247 / 65",
    previewSrc: "/assets/images/logo.png",
    recommendedScale: 0.20,
  },
  {
    id: "badge",
    name: "Union Seal Badge",
    path: "/assets/images/logo2.png",
    aspectRatio: "1 / 1",
    previewSrc: "/assets/images/logo2.png",
    recommendedScale: 0.12,
  },
];

export function WatermarkStudio({ recording, onClose, onSuccess }: WatermarkStudioProps) {
  const fileId = recording.fileId || recording.zoom_file_id || "";
  const rawDate = recording.startTime || recording.recording_start || new Date().toISOString();
  const dateFormatted = new Date(rawDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const defaultTitle = `${recording.topic || "Class Recording"} | ${dateFormatted}`.slice(0, 100);

  // Watermark Settings
  const [watermarkType, setWatermarkType] = useState<"image" | "text" | "both" | "none">("image");
  const [selectedResolution, setSelectedResolution] = useState<"1080p" | "720p" | "480p">("720p");
  const [selectedLogo, setSelectedLogo] = useState(LOGO_PRESETS[0]);
  const [imageScale, setImageScale] = useState(0.18);
  const [imageOpacity, setImageOpacity] = useState(0.85);
  const [imagePosX, setImagePosX] = useState(0.78);
  const [imagePosY, setImagePosY] = useState(0.04);

  const [watermarkText, setWatermarkText] = useState("Union Education");
  const [fontSize, setFontSize] = useState(24);
  const [textScale, setTextScale] = useState(0.22);
  const [textOpacity, setTextOpacity] = useState(0.85);
  const [textPosX, setTextPosX] = useState(0.04);
  const [textPosY, setTextPosY] = useState(0.90);

  // YouTube Metadata
  const [customTitle, setCustomTitle] = useState(defaultTitle);
  const [privacyStatus, setPrivacyStatus] = useState<"unlisted" | "public" | "private">("unlisted");
  const [customDescription, setCustomDescription] = useState(
    `Class Recording: ${recording.topic}\nDate: ${dateFormatted}\nProvided by Union Education.`
  );

  // UI state
  const [activeTab, setActiveTab] = useState<"watermark" | "youtube">("watermark");
  const [showGridGuides, setShowGridGuides] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Dragging state
  const [isDragging, setIsDragging] = useState<"image" | "text" | null>(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, initPosX: 0, initPosY: 0 });

  // Two-Step Decoupled Workflow States
  // Step 1: Watermarking
  const [watermarkStatus, setWatermarkStatus] = useState<"idle" | "rendering" | "done" | "error">("idle");
  const [watermarkProgressMsg, setWatermarkProgressMsg] = useState("");
  const [watermarkProgressPercent, setWatermarkProgressPercent] = useState(0);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [watermarkError, setWatermarkError] = useState("");

  // Step 2: YouTube Upload
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState<{ youtubeUrl: string; youtubeVideoId: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSavedMsg, setTemplateSavedMsg] = useState(false);

  // Load saved template defaults on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("zoomyt_auto_watermark_template");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed) {
          if (parsed.watermarkType) setWatermarkType(parsed.watermarkType);
          if (parsed.selectedResolution && ["1080p", "720p", "480p"].includes(parsed.selectedResolution)) {
            setSelectedResolution(parsed.selectedResolution);
          }
          if (parsed.logoPresetId) {
            const l = LOGO_PRESETS.find((p) => p.id === parsed.logoPresetId);
            if (l) setSelectedLogo(l);
          }
          if (typeof parsed.imageScale === "number") setImageScale(parsed.imageScale);
          if (typeof parsed.imageOpacity === "number") setImageOpacity(parsed.imageOpacity);
          if (typeof parsed.imagePosX === "number") setImagePosX(parsed.imagePosX);
          if (typeof parsed.imagePosY === "number") setImagePosY(parsed.imagePosY);
          if (parsed.watermarkText) setWatermarkText(parsed.watermarkText);
          if (typeof parsed.fontSize === "number") setFontSize(parsed.fontSize);
          if (typeof parsed.textOpacity === "number") setTextOpacity(parsed.textOpacity);
          if (typeof parsed.textPosX === "number") setTextPosX(parsed.textPosX);
          if (typeof parsed.textPosY === "number") setTextPosY(parsed.textPosY);
        }
      }
    } catch {}
  }, []);

  const handleSaveAsAutoTemplate = async () => {
    setSavingTemplate(true);
    try {
      const templateData = {
        watermarkType,
        selectedResolution,
        logoPresetId: selectedLogo.id,
        logoPath: selectedLogo.path,
        imageScale,
        imageOpacity,
        imagePosX,
        imagePosY,
        watermarkText,
        fontSize,
        textOpacity,
        textPosX,
        textPosY,
      };
      await fetch("/api/zoom-youtube/watermark-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateData),
      });
      localStorage.setItem("zoomyt_auto_watermark_template", JSON.stringify(templateData));
      localStorage.setItem("zoomyt_queue_resolution", selectedResolution);
      localStorage.setItem("zoomyt_queue_watermark_preset", watermarkType);
      setTemplateSavedMsg(true);
      setTimeout(() => setTemplateSavedMsg(false), 2500);
    } catch (err: unknown) {
      alert("Failed to save template: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingTemplate(false);
    }
  };

  const [enqueuingCloud, setEnqueuingCloud] = useState(false);

  const handleAddToQueue = async () => {
    try {
      setEnqueuingCloud(true);
      const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordings: [
            {
              fileId,
              topic: customTitle.trim() || recording.topic,
              startTime: recording.startTime || recording.recording_start,
              downloadUrl: recording.downloadUrl,
              zoomAccountId: recording.zoomAccountId,
              customTitle: customTitle.trim() || defaultTitle,
              customDescription: customDescription.trim(),
              privacyStatus,
              fileSizeBytes: recording.fileSizeBytes || recording.file_size_bytes,
              durationMinutes: recording.durationMinutes || recording.duration_minutes,
            },
          ],
          resolution: selectedResolution,
          watermark: {
            type: watermarkType,
            resolution: selectedResolution,
            logoPath: selectedLogo.path,
            imageScale,
            imageOpacity,
            imagePosX,
            imagePosY,
            text: watermarkText,
            fontSize,
            textScale,
            textOpacity,
            textPosX,
            textPosY,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to enqueue video");
      }

      alert("⚡ Video successfully queued for Cloud Processing!\n\nThe GitHub Actions cloud runner will download, watermark, and upload it to YouTube.");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to queue video";
      alert(msg);
    } finally {
      setEnqueuingCloud(false);
    }
  };

  // Video stream source URL (plays processed video if watermark done, else raw proxy stream)
  const currentVideoSrc = processedVideoUrl
    ? processedVideoUrl
    : `/api/zoom-youtube/recordings/preview-stream?downloadUrl=${encodeURIComponent(
        recording.downloadUrl
      )}&zoomAccountId=${encodeURIComponent(recording.zoomAccountId)}`;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Preset Position Helpers
  const applyImagePreset = (preset: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center") => {
    switch (preset) {
      case "top-right": setImagePosX(0.78); setImagePosY(0.04); break;
      case "top-left": setImagePosX(0.04); setImagePosY(0.04); break;
      case "bottom-right": setImagePosX(0.78); setImagePosY(0.88); break;
      case "bottom-left": setImagePosX(0.04); setImagePosY(0.88); break;
      case "center": setImagePosX(0.40); setImagePosY(0.44); break;
    }
  };

  const applyTextPreset = (preset: "bottom-left" | "bottom-right" | "top-left" | "top-right" | "center") => {
    switch (preset) {
      case "bottom-left": setTextPosX(0.04); setTextPosY(0.90); break;
      case "bottom-right": setTextPosX(0.72); setTextPosY(0.90); break;
      case "top-left": setTextPosX(0.04); setTextPosY(0.04); break;
      case "top-right": setTextPosX(0.72); setTextPosY(0.04); break;
      case "center": setTextPosX(0.38); setTextPosY(0.46); break;
    }
  };

  // Drag handlers
  const handlePointerDown = (type: "image" | "text", e: React.PointerEvent) => {
    if (watermarkStatus === "done") return; // Locked once rendered
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(type);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initPosX: type === "image" ? imagePosX : textPosX,
      initPosY: type === "image" ? imagePosY : textPosY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const deltaX = (e.clientX - dragStartRef.current.startX) / rect.width;
    const deltaY = (e.clientY - dragStartRef.current.startY) / rect.height;

    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

    if (isDragging === "image") {
      setImagePosX(clamp(dragStartRef.current.initPosX + deltaX, 0.01, 0.90));
      setImagePosY(clamp(dragStartRef.current.initPosY + deltaY, 0.01, 0.90));
    } else if (isDragging === "text") {
      setTextPosX(clamp(dragStartRef.current.initPosX + deltaX, 0.01, 0.90));
      setTextPosY(clamp(dragStartRef.current.initPosY + deltaY, 0.01, 0.90));
    }
  };

  const handlePointerUp = () => setIsDragging(null);

  // Helper to consume Server-Sent Events (SSE) stream for frame-accurate real-time progress
  const readSseStream = async (res: Response, onEvent: (event: any) => void) => {
    if (!res.body) throw new Error("No response body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastEvent: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            try {
              const data = JSON.parse(trimmed.slice(5).trim());
              lastEvent = data;
              onEvent(data);
            } catch {}
          }
        }
      }
    }

    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          try {
            const data = JSON.parse(trimmed.slice(5).trim());
            lastEvent = data;
            onEvent(data);
          } catch {}
        }
      }
    }

    return lastEvent;
  };

  // STEP 1: Execute Watermarking Only
  const handleRenderWatermark = async () => {
    setWatermarkStatus("rendering");
    setWatermarkProgressPercent(0);
    setWatermarkProgressMsg("Connecting to Zoom & initiating download...");
    setWatermarkError("");

    try {
      const payload = {
        recording: {
          fileId,
          topic: recording.topic,
          startTime: recording.startTime || recording.recording_start,
          downloadUrl: recording.downloadUrl,
          zoomAccountId: recording.zoomAccountId,
        },
        resolution: selectedResolution,
        watermark: {
          type: watermarkType,
          resolution: selectedResolution,
          logoPath: selectedLogo.path,
          imageScale,
          imageOpacity,
          imagePosX,
          imagePosY,
          text: watermarkText,
          fontSize,
          textScale,
          textOpacity,
          textPosX,
          textPosY,
        },
      };

      const res = await fetch("/api/zoom-youtube/recordings/watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const errJson = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(errJson.error || `Watermarking failed (${res.status})`);
      }

      let finalData: any = null;
      await readSseStream(res, (data) => {
        finalData = data;
        if (typeof data.percent === "number") {
          setWatermarkProgressPercent(data.percent);
        }
        if (data.msg) {
          setWatermarkProgressMsg(data.msg);
        }
      });

      if (finalData?.success) {
        setWatermarkProgressPercent(100);
        setWatermarkStatus("done");
        setProcessedVideoUrl(finalData.previewUrl);
        setWatermarkProgressMsg("Watermarking complete! Review video preview below.");
        // Automatically switch to YouTube tab to prepare upload
        setActiveTab("youtube");
      } else {
        setWatermarkStatus("error");
        setWatermarkProgressPercent(0);
        setWatermarkError(finalData?.error || "Watermarking failed");
      }
    } catch (err: unknown) {
      setWatermarkStatus("error");
      setWatermarkProgressPercent(0);
      setWatermarkError(err instanceof Error ? err.message : "Network error during watermarking");
    }
  };

  // STEP 2: Execute YouTube Upload & Local Cleanup
  const handleUploadToYouTube = async () => {
    if (uploadStatus === "uploading") return;

    setUploadStatus("uploading");
    setUploadProgressPercent(0);
    setUploadError("");

    try {
      const payload = {
        fileId,
        topic: recording.topic,
        startTime: recording.startTime || recording.recording_start,
        customTitle: customTitle.trim() || defaultTitle,
        customDescription: customDescription.trim(),
        privacyStatus,
      };

      const res = await fetch("/api/zoom-youtube/recordings/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const errJson = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(errJson.error || `YouTube upload failed (${res.status})`);
      }

      let finalData: any = null;
      await readSseStream(res, (data) => {
        finalData = data;
        if (typeof data.percent === "number") {
          setUploadProgressPercent(data.percent);
        }
      });

      if (finalData?.success) {
        setUploadProgressPercent(100);
        setUploadStatus("done");
        setUploadResult({
          youtubeUrl: finalData.youtubeUrl,
          youtubeVideoId: finalData.youtubeVideoId,
        });
        if (onSuccess) {
          onSuccess({
            youtubeUrl: finalData.youtubeUrl,
            youtubeVideoId: finalData.youtubeVideoId,
          });
        }
      } else {
        setUploadStatus("error");
        setUploadProgressPercent(0);
        setUploadError(finalData?.error || "Upload to YouTube failed");
      }
    } catch (err: unknown) {
      setUploadStatus("error");
      setUploadProgressPercent(0);
      setUploadError(err instanceof Error ? err.message : "Network error during YouTube upload");
    }
  };

  const handleCopyLink = () => {
    if (!uploadResult?.youtubeUrl) return;
    navigator.clipboard.writeText(uploadResult.youtubeUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const toMB = (bytes?: number) => (bytes ? `${Math.round(bytes / (1024 * 1024))} MB` : "~");

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-7xl bg-black border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh] text-slate-100">
        
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-black/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-600/20 text-red-500 rounded-lg border border-red-500/30">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-red-400">
                  Video Watermark & YouTube Studio
                </span>
                <span className="text-[10px] bg-zinc-900 text-zinc-300 px-2 py-0.5 rounded-full border border-zinc-800">
                  1080p Canvas
                </span>
                {watermarkStatus === "done" && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/40 font-semibold flex items-center gap-1">
                    <CheckCheck className="w-3 h-3" /> Watermark Ready
                  </span>
                )}
              </div>
              <h2 className="text-base font-bold text-white max-w-xl truncate">
                {recording.topic || "Class Recording"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAsAutoTemplate}
              disabled={savingTemplate}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 transition flex items-center gap-1.5"
              title="Save current layout as default Auto-Watermark template">
              {savingTemplate ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : templateSavedMsg ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>{templateSavedMsg ? "Template Saved!" : "Save as Auto Template"}</span>
            </button>

            <button
              onClick={() => setShowGridGuides(!showGridGuides)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition flex items-center gap-1.5 ${
                showGridGuides
                  ? "bg-zinc-800 text-cyan-400 border-cyan-500/40"
                  : "bg-zinc-950 text-slate-400 border-zinc-800 hover:text-slate-200"
              }`}
              title="Toggle Safe Area Guides">
              <Eye className="w-3.5 h-3.5" />
              <span>Safe Guides</span>
            </button>

            <button
              onClick={onClose}
              disabled={watermarkStatus === "rendering" || uploadStatus === "uploading"}
              className="p-2 text-slate-400 hover:text-white hover:bg-zinc-900 rounded-lg transition disabled:opacity-30">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Studio Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto min-h-0">
          
          {/* Left Column: 16:9 Video Canvas */}
          <div className="lg:col-span-7 bg-black p-6 flex flex-col justify-center items-center border-b lg:border-b-0 lg:border-r border-zinc-800 relative">
            
            {/* The 16:9 Video Frame */}
            <div
              ref={canvasContainerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="w-full relative aspect-video rounded-xl overflow-hidden border border-zinc-800 shadow-2xl bg-gradient-to-br from-zinc-900 via-zinc-950 to-black select-none touch-none">
              
              {/* Native Video Player */}
              <video
                key={currentVideoSrc}
                ref={videoRef}
                src={currentVideoSrc}
                playsInline
                preload="metadata"
                controls={watermarkStatus === "done"}
                onLoadedData={() => setVideoLoaded(true)}
                onEnded={() => setIsPlaying(false)}
                className="w-full h-full object-contain absolute inset-0 z-0 bg-black/90"
              />

              {/* Placeholder backdrop if video stream loading */}
              {!videoLoaded && (
                <div className="absolute inset-0 z-0 flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black">
                  <div className="w-16 h-16 rounded-full bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center mb-3 shadow-inner">
                    <Film className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200 text-center max-w-md">
                    {recording.topic || "Class Recording"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {dateFormatted} • {recording.durationMinutes || recording.duration_minutes || 0} mins
                  </p>
                </div>
              )}

              {/* Safe Margins Guide (only before rendering) */}
              {showGridGuides && watermarkStatus !== "done" && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                  <div className="absolute inset-[4%] border border-dashed border-cyan-500/25 rounded pointer-events-none">
                    <span className="absolute top-1 left-2 text-[9px] font-mono text-cyan-400/60 uppercase">
                      Title Safe Margin (92%)
                    </span>
                  </div>
                  <div className="absolute top-1/2 left-0 right-0 border-t border-zinc-800/40"></div>
                  <div className="absolute left-1/2 top-0 bottom-0 border-l border-zinc-800/40"></div>
                </div>
              )}

              {/* Interactive Watermark Overlay (Only active while previewing before ffmpeg burn-in) */}
              {watermarkStatus !== "done" && (
                <>
                  {/* Logo Watermark */}
                  {(watermarkType === "image" || watermarkType === "both") && selectedLogo && (
                    <div
                      onPointerDown={(e) => handlePointerDown("image", e)}
                      style={{
                        position: "absolute",
                        left: `${imagePosX * 100}%`,
                        top: `${imagePosY * 100}%`,
                        width: `${imageScale * 100}%`,
                        opacity: imageOpacity,
                        cursor: isDragging === "image" ? "grabbing" : "grab",
                      }}
                      className={`z-20 transition-transform group ${
                        isDragging === "image" ? "ring-2 ring-blue-500 scale-105" : "hover:ring-1 hover:ring-blue-400/50"
                      }`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedLogo.previewSrc}
                        alt="Logo Watermark"
                        draggable={false}
                        className="w-full h-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] pointer-events-none"
                      />
                      <div className="absolute -top-3 -right-3 bg-blue-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow">
                        <Move className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  )}

                  {/* Text Badge Watermark */}
                  {(watermarkType === "text" || watermarkType === "both") && watermarkText && (
                    <div
                      onPointerDown={(e) => handlePointerDown("text", e)}
                      style={{
                        position: "absolute",
                        left: `${textPosX * 100}%`,
                        top: `${textPosY * 100}%`,
                        opacity: textOpacity,
                        cursor: isDragging === "text" ? "grabbing" : "grab",
                      }}
                      className={`z-20 transition-transform group ${
                        isDragging === "text" ? "ring-2 ring-emerald-500 scale-105" : "hover:ring-1 hover:ring-emerald-400/50"
                      }`}>
                      <div
                        style={{ fontSize: `${Math.round(fontSize * 0.65)}px` }}
                        className="inline-flex items-center gap-2 bg-black/65 backdrop-blur-sm text-white font-semibold px-3 py-1.5 rounded-lg border border-white/20 shadow-lg tracking-wide whitespace-nowrap">
                        <span>{watermarkText}</span>
                      </div>
                      <div className="absolute -top-3 -right-3 bg-emerald-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow">
                        <Move className="w-2.5 h-2.5" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Banner when Watermarking is 100% complete */}
              {watermarkStatus === "done" && (
                <div className="absolute top-4 left-4 z-20 bg-emerald-950/80 border border-emerald-500/60 backdrop-blur-md text-emerald-300 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold">Actual Watermarked MP4 Rendered & Ready for Playback!</span>
                </div>
              )}
            </div>

            {/* Video Controls & Info Bar */}
            <div className="w-full mt-3 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-slate-200 rounded-lg transition">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
                <span>
                  {watermarkStatus === "done"
                    ? "Playing finalized watermarked video"
                    : "Drag watermark directly on frame to reposition"}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                Duration: {recording.durationMinutes || recording.duration_minutes || 0} mins • Size: {toMB(recording.fileSizeBytes || recording.file_size_bytes)}
              </div>
            </div>
          </div>

          {/* Right Column: 2-Step Controls */}
          <div className="lg:col-span-5 bg-black p-6 flex flex-col justify-between overflow-y-auto space-y-5">
            
            <div className="space-y-5">
              {/* Tabs */}
              <div className="flex rounded-lg bg-zinc-950 p-1 border border-zinc-800">
                <button
                  onClick={() => setActiveTab("watermark")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                    activeTab === "watermark" ? "bg-zinc-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                  }`}>
                  <Sliders className="w-3.5 h-3.5" />
                  1. Watermark Settings
                </button>
                <button
                  onClick={() => setActiveTab("youtube")}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                    activeTab === "youtube" ? "bg-zinc-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                  }`}>
                  <Youtube className="w-3.5 h-3.5 text-red-500" />
                  2. YouTube Metadata
                </button>
              </div>

              {/* TAB 1: Watermark Configuration */}
              {activeTab === "watermark" && (
                <div className="space-y-4">
                  {/* Mode Picker */}
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">Watermark Type</label>
                    <div className="grid grid-cols-4 gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                      {[
                        { id: "image", label: "Logo", icon: ImageIcon },
                        { id: "text", label: "Text", icon: Type },
                        { id: "both", label: "Both", icon: Layers },
                        { id: "none", label: "None", icon: X },
                      ].map((item) => {
                        const Icon = item.icon;
                        const active = watermarkType === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={watermarkStatus === "done"}
                            onClick={() => setWatermarkType(item.id as any)}
                            className={`py-2 px-2 rounded-lg text-xs font-semibold transition flex flex-col items-center gap-1 ${
                              active ? "bg-red-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                            } disabled:opacity-50`}>
                            <Icon className="w-4 h-4" />
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Video Quality / Resolution Picker */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">Video Quality & Speed</label>
                      <span className="text-[11px] text-indigo-400 font-medium">
                        {selectedResolution === "720p" ? "⚡ 50% Faster + Half Upload Size" : selectedResolution === "1080p" ? "Full HD (Original)" : "🚀 Ultra Fast (Small File)"}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                      {[
                        { id: "720p", label: "720p HD", desc: "⚡ Fast (Recommended)" },
                        { id: "1080p", label: "1080p", desc: "Original Native" },
                        { id: "480p", label: "480p SD", desc: "🚀 Ultra Fast" },
                      ].map((item) => {
                        const active = selectedResolution === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            disabled={watermarkStatus === "done"}
                            onClick={() => setSelectedResolution(item.id as any)}
                            className={`py-2 px-1.5 rounded-lg text-xs font-semibold transition flex flex-col items-center gap-0.5 ${
                              active ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
                            } disabled:opacity-50`}>
                            <span>{item.label}</span>
                            <span className={`text-[10px] font-normal ${active ? "text-indigo-200" : "text-slate-500"}`}>{item.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Logo Options */}
                  {(watermarkType === "image" || watermarkType === "both") && (
                    <div className="space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                        Select Logo Asset
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {LOGO_PRESETS.map((logo) => (
                          <button
                            key={logo.id}
                            type="button"
                            disabled={watermarkStatus === "done"}
                            onClick={() => {
                              setSelectedLogo(logo);
                              setImageScale(logo.recommendedScale);
                            }}
                            className={`p-2.5 rounded-lg border text-left transition flex flex-col gap-2 ${
                              selectedLogo.id === logo.id
                                ? "bg-blue-600/10 border-blue-500 text-white"
                                : "bg-zinc-950 border-zinc-800 text-slate-400"
                            } disabled:opacity-50`}>
                            <div className="h-8 flex items-center justify-center bg-black/40 rounded p-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={logo.previewSrc} alt={logo.name} className="max-h-full max-w-full object-contain" />
                            </div>
                            <span className="text-[11px] font-medium truncate">{logo.name}</span>
                          </button>
                        ))}
                      </div>

                      {/* Scale & Opacity */}
                      <div className="space-y-2 pt-2 border-t border-zinc-800">
                        <div className="flex justify-between text-xs text-slate-300">
                          <span>Scale ({Math.round(imageScale * 100)}%)</span>
                          <span>Opacity ({Math.round(imageOpacity * 100)}%)</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="range"
                            min="0.08"
                            max="0.35"
                            step="0.01"
                            disabled={watermarkStatus === "done"}
                            value={imageScale}
                            onChange={(e) => setImageScale(parseFloat(e.target.value))}
                            className="w-full accent-blue-500"
                          />
                          <input
                            type="range"
                            min="0.10"
                            max="1.0"
                            step="0.05"
                            disabled={watermarkStatus === "done"}
                            value={imageOpacity}
                            onChange={(e) => setImageOpacity(parseFloat(e.target.value))}
                            className="w-full accent-blue-500"
                          />
                        </div>

                        {/* Presets */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {["top-right", "top-left", "bottom-right", "bottom-left", "center"].map((p) => (
                            <button
                              key={p}
                              type="button"
                              disabled={watermarkStatus === "done"}
                              onClick={() => applyImagePreset(p as any)}
                              className="px-2 py-1 text-[10px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded capitalize disabled:opacity-50">
                              {p.replace("-", " ")}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Text Badge Options */}
                  {(watermarkType === "text" || watermarkType === "both") && (
                    <div className="space-y-3 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                        Text Overlay
                      </span>
                      <input
                        type="text"
                        disabled={watermarkStatus === "done"}
                        value={watermarkText}
                        onChange={(e) => setWatermarkText(e.target.value)}
                        placeholder="e.g. Union Education"
                        className="w-full px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white disabled:opacity-50"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[11px] text-slate-400 block mb-1">Font ({fontSize}px)</span>
                          <input
                            type="range"
                            min="16"
                            max="44"
                            step="2"
                            disabled={watermarkStatus === "done"}
                            value={fontSize}
                            onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                            className="w-full accent-emerald-500"
                          />
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400 block mb-1">Opacity ({Math.round(textOpacity * 100)}%)</span>
                          <input
                            type="range"
                            min="0.10"
                            max="1.0"
                            step="0.05"
                            disabled={watermarkStatus === "done"}
                            value={textOpacity}
                            onChange={(e) => setTextOpacity(parseFloat(e.target.value))}
                            className="w-full accent-emerald-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: YouTube Metadata */}
              {activeTab === "youtube" && (
                <div className="space-y-4">
                  <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center font-bold text-white text-xs">
                        UE
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          Union Education <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <p className="text-[11px] text-slate-400">Target Channel</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      Authorized
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300">YouTube Video Title</label>
                      <span className="text-[10px] text-slate-400 font-mono">{customTitle.length}/100</span>
                    </div>
                    <input
                      type="text"
                      maxLength={100}
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">Privacy Status</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "unlisted", label: "Unlisted", desc: "Link only" },
                        { id: "public", label: "Public", desc: "Everyone" },
                        { id: "private", label: "Private", desc: "Admin only" },
                      ].map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setPrivacyStatus(item.id as any)}
                          className={`p-2.5 rounded-xl border text-left transition ${
                            privacyStatus === item.id
                              ? "bg-red-600/10 border-red-500 text-white"
                              : "bg-zinc-950 border-zinc-800 text-slate-400"
                          }`}>
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className="text-[10px] text-slate-400">{item.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Description</label>
                    <textarea
                      rows={3}
                      value={customDescription}
                      onChange={(e) => setCustomDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom 2-Step Action Footer */}
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              
              {/* Watermark Rendering Progress Bar */}
              {watermarkStatus === "rendering" && (
                <div className="bg-zinc-950 border border-blue-500/40 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-blue-400">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      {watermarkProgressMsg}
                    </span>
                    <span className="font-mono font-bold text-blue-300">
                      {watermarkProgressPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${watermarkProgressPercent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Encoding video with hardware acceleration. Please keep this tab open...
                  </p>
                </div>
              )}

              {/* Watermark Error */}
              {watermarkError && (
                <div className="bg-red-950/40 border border-red-500/40 rounded-xl p-3 text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Watermarking Failed</span>
                    <span className="text-[11px]">{watermarkError}</span>
                  </div>
                </div>
              )}

              {/* YouTube Uploading Progress */}
              {uploadStatus === "uploading" && (
                <div className="bg-zinc-950 border border-red-500/40 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-red-400">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                      Uploading watermarked video to YouTube...
                    </span>
                    <span className="font-mono font-bold text-red-300">
                      {uploadProgressPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-red-500 to-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* YouTube Upload Success Card */}
              {uploadStatus === "done" && uploadResult && (
                <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    Uploaded to YouTube & Local Storage Cleaned Up!
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Both raw and processed video files were removed from your Mac to save disk space.
                  </p>
                  <div className="flex items-center gap-2 bg-black/60 p-2.5 rounded-lg border border-emerald-500/20">
                    <input
                      type="text"
                      readOnly
                      value={uploadResult.youtubeUrl}
                      className="bg-transparent text-xs text-emerald-200 flex-1 font-mono focus:outline-none"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition flex items-center gap-1">
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink ? "Copied" : "Copy"}
                    </button>
                    <a
                      href={uploadResult.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-md transition flex items-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" />
                      Watch
                    </a>
                  </div>
                </div>
              )}

              {/* Upload Error */}
              {uploadError && (
                <div className="bg-red-950/40 border border-red-500/40 rounded-xl p-3 text-xs text-red-300 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Upload Failed</span>
                    <span className="text-[11px]">{uploadError}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons: 2 Decoupled Steps */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-zinc-800 text-xs font-semibold text-slate-300 hover:bg-zinc-900 transition">
                  {uploadStatus === "done" ? "Close Studio" : "Cancel"}
                </button>

                {/* STEP 1 BUTTON: Render Watermark */}
                {watermarkStatus !== "done" && (
                  <>
                    <button
                      type="button"
                      onClick={handleAddToQueue}
                      disabled={enqueuingCloud || watermarkStatus === "rendering"}
                      className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-md"
                      title="Queue this video with custom watermark settings for GitHub Actions cloud runner">
                      {enqueuingCloud ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-indigo-200" />
                      )}
                      <span className="hidden sm:inline">⚡ Queue for Cloud Upload</span>
                      <span className="sm:hidden">Queue Cloud</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRenderWatermark}
                      disabled={watermarkStatus === "rendering"}
                      className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50">
                      {watermarkStatus === "rendering" ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Watermarking Video...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-yellow-300" />
                          <span>Step 1: Render Watermark on Entire Video</span>
                        </>
                      )}
                    </button>
                  </>
                )}

                {/* STEP 2 BUTTON: Upload to YouTube (Active after Step 1 finishes) */}
                {watermarkStatus === "done" && uploadStatus !== "done" && (
                  <button
                    type="button"
                    onClick={handleUploadToYouTube}
                    disabled={uploadStatus === "uploading"}
                    className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50">
                    {uploadStatus === "uploading" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading to YouTube...</span>
                      </>
                    ) : (
                      <>
                        <Youtube className="w-4 h-4 fill-current" />
                        <span>Step 2: Upload Watermarked Video to YouTube</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
