"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  Sliders,
  CheckCircle2,
  RotateCcw,
  Loader2,
  Film,
  Type,
  Image as ImageIcon,
  Check,
  Eye,
  Info,
  Move,
} from "lucide-react";
import {
  AutoWatermarkTemplate,
  DEFAULT_WATERMARK_TEMPLATE,
} from "@/lib/watermark-template";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export const LOGO_PRESETS = [
  {
    id: "crest",
    name: "Union Crest (Square)",
    path: "/assets/images/logo_main.png",
    aspectRatio: "1 / 1",
    previewSrc: "/assets/images/logo_main.png",
    recommendedScale: 0.18,
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
    recommendedScale: 0.16,
  },
];

interface AutoWatermarkTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (template: AutoWatermarkTemplate) => void;
}

export function AutoWatermarkTemplateModal({
  isOpen,
  onClose,
  onSaved,
}: AutoWatermarkTemplateModalProps) {
  const [template, setTemplate] = useState<AutoWatermarkTemplate>(DEFAULT_WATERMARK_TEMPLATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<"image" | "text" | null>(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, initPosX: 0, initPosY: 0 });

  // Load saved template on open
  useEffect(() => {
    if (!isOpen) return;

    // 1. Try localStorage first
    try {
      const stored = localStorage.getItem("zoomyt_auto_watermark_template");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object") {
          setTemplate({ ...DEFAULT_WATERMARK_TEMPLATE, ...parsed });
        }
      }
    } catch {}

    // 2. Fetch latest from API
    setLoading(true);
    fetch("/api/zoom-youtube/watermark-template")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.template) {
          setTemplate(data.template);
          try {
            localStorage.setItem("zoomyt_auto_watermark_template", JSON.stringify(data.template));
          } catch {}
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const currentLogo = LOGO_PRESETS.find((l) => l.id === template.logoPresetId) || LOGO_PRESETS[0];

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/zoom-youtube/watermark-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template),
      });
      const data = await res.json();
      if (data.success) {
        try {
          localStorage.setItem("zoomyt_auto_watermark_template", JSON.stringify(data.template));
          localStorage.setItem("zoomyt_queue_resolution", data.template.selectedResolution);
          localStorage.setItem("zoomyt_queue_watermark_preset", data.template.watermarkType);
        } catch {}
        setSavedSuccess(true);
        if (onSaved) onSaved(data.template);
        setTimeout(() => {
          setSavedSuccess(false);
          onClose();
        }, 1200);
      } else {
        alert(data.error || "Failed to save template");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error saving template");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (confirm("Reset watermark template to recommended Union Education defaults?")) {
      setTemplate(DEFAULT_WATERMARK_TEMPLATE);
    }
  };

  const handlePointerDown = (type: "image" | "text", e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(type);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initPosX: type === "image" ? template.imagePosX : template.textPosX,
      initPosY: type === "image" ? template.imagePosY : template.textPosY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const deltaX = (e.clientX - dragStartRef.current.startX) / rect.width;
    const deltaY = (e.clientY - dragStartRef.current.startY) / rect.height;

    const clamp = (val: number, min: number, max: number) =>
      Math.max(min, Math.min(max, Math.round(val * 100) / 100));

    if (isDragging === "image") {
      setTemplate((prev) => ({
        ...prev,
        imagePosX: clamp(dragStartRef.current.initPosX + deltaX, 0.01, 0.88),
        imagePosY: clamp(dragStartRef.current.initPosY + deltaY, 0.01, 0.88),
      }));
    } else if (isDragging === "text") {
      setTemplate((prev) => ({
        ...prev,
        textPosX: clamp(dragStartRef.current.initPosX + deltaX, 0.01, 0.88),
        textPosY: clamp(dragStartRef.current.initPosY + deltaY, 0.01, 0.88),
      }));
    }
  };

  const handlePointerUp = () => setIsDragging(null);

  const setLogoPositionPreset = (pos: "top-right" | "top-left" | "bottom-right" | "bottom-left") => {
    switch (pos) {
      case "top-right":
        setTemplate((prev) => ({ ...prev, imagePosX: 0.78, imagePosY: 0.04 }));
        break;
      case "top-left":
        setTemplate((prev) => ({ ...prev, imagePosX: 0.04, imagePosY: 0.04 }));
        break;
      case "bottom-right":
        setTemplate((prev) => ({ ...prev, imagePosX: 0.78, imagePosY: 0.88 }));
        break;
      case "bottom-left":
        setTemplate((prev) => ({ ...prev, imagePosX: 0.04, imagePosY: 0.88 }));
        break;
    }
  };

  const setTextPositionPreset = (pos: "bottom-left" | "bottom-right" | "top-left" | "top-right") => {
    switch (pos) {
      case "bottom-left":
        setTemplate((prev) => ({ ...prev, textPosX: 0.04, textPosY: 0.90 }));
        break;
      case "bottom-right":
        setTemplate((prev) => ({ ...prev, textPosX: 0.74, textPosY: 0.90 }));
        break;
      case "top-left":
        setTemplate((prev) => ({ ...prev, textPosX: 0.04, textPosY: 0.04 }));
        break;
      case "top-right":
        setTemplate((prev) => ({ ...prev, textPosX: 0.74, textPosY: 0.04 }));
        break;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Auto-Watermark Template & Visual Defaults"
      description="Set and preview the exact logo, text badge, positions, and opacity used for all automated background watermarking."
      icon={<Sparkles className="w-5 h-5 text-amber-400" />}
      size="4xl"
      headerActions={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleResetDefaults}
          title="Reset to recommended Union Education defaults"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Defaults</span>
        </Button>
      }
      footer={
        <div className="w-full flex items-center justify-between flex-wrap gap-2">
          <span className="text-[11px] text-slate-400">
            Saved template automatically applies to all background queue and cloud tasks.
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="premium"
              onClick={handleSave}
              disabled={saving || savedSuccess}
              loading={saving}
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Saved Successfully!</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Save as Default Auto-Watermark Template</span>
                </>
              )}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: 16:9 Visual Preview Canvas */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Live 16:9 Video Canvas Preview
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2 py-0.5 rounded">
                Simulated Output: {template.selectedResolution}
              </span>
            </div>

            {/* Canvas Container */}
            <div
              ref={canvasContainerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`relative aspect-video w-full rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border-2 border-slate-700 overflow-hidden shadow-inner flex items-center justify-center select-none touch-none ${
                isDragging ? "cursor-grabbing" : ""
              }`}>
              {/* Simulated Lecture Screen Background */}
              <div className="absolute inset-0 opacity-20 pointer-events-none flex flex-col justify-between p-6">
                <div className="border border-white/20 rounded-lg p-4 max-w-sm space-y-2">
                  <div className="h-3 bg-white/40 rounded w-3/4" />
                  <div className="h-2 bg-white/20 rounded w-1/2" />
                  <div className="h-2 bg-white/20 rounded w-2/3" />
                </div>
                <div className="text-center text-white/30 text-xs font-mono">
                  [ Live Zoom Class Streaming • 16:9 Output Canvas ]
                </div>
              </div>

              {/* Grid Guide Overlay */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-15 border border-dashed border-white/40">
                <div className="border-r border-b border-dashed border-white/30" />
                <div className="border-r border-b border-dashed border-white/30" />
                <div className="border-b border-dashed border-white/30" />
                <div className="border-r border-b border-dashed border-white/30" />
                <div className="border-r border-b border-dashed border-white/30" />
                <div className="border-b border-dashed border-white/30" />
              </div>

              {/* Drag instruction badge */}
              <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none bg-black/60 backdrop-blur-sm border border-white/10 px-2 py-1 rounded-md text-[10px] text-slate-300 flex items-center gap-1.5 font-medium">
                <Move className="w-2.5 h-2.5 text-amber-400" />
                <span>Drag & drop logo or badge to reposition</span>
              </div>

              {/* 1. Watermark Logo Layer */}
              {(template.watermarkType === "both" || template.watermarkType === "image") && (
                <div
                  onPointerDown={(e) => handlePointerDown("image", e)}
                  style={{
                    left: `${template.imagePosX * 100}%`,
                    top: `${template.imagePosY * 100}%`,
                    width: `${template.imageScale * 100}%`,
                    opacity: template.imageOpacity,
                    cursor: isDragging === "image" ? "grabbing" : "grab",
                  }}
                  className={`absolute z-20 transition-transform group touch-none ${
                    isDragging === "image"
                      ? "ring-2 ring-amber-400 scale-105 shadow-2xl"
                      : "hover:ring-2 hover:ring-amber-400/70"
                  }`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentLogo.previewSrc}
                    alt="Watermark Logo"
                    draggable={false}
                    className="w-full h-auto drop-shadow-lg pointer-events-none"
                  />
                  <div className="absolute -top-3 -right-3 bg-amber-500 text-slate-900 rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow">
                    <Move className="w-2.5 h-2.5" />
                  </div>
                  <div className="absolute -bottom-4 left-0 text-[9px] font-mono font-bold text-amber-300 bg-black/80 px-1 rounded whitespace-nowrap pointer-events-none">
                    Logo ({Math.round(template.imagePosX * 100)}%, {Math.round(template.imagePosY * 100)}%)
                  </div>
                </div>
              )}

              {/* 2. Text Badge Layer */}
              {(template.watermarkType === "both" || template.watermarkType === "text") && (
                <div
                  onPointerDown={(e) => handlePointerDown("text", e)}
                  style={{
                    left: `${template.textPosX * 100}%`,
                    top: `${template.textPosY * 100}%`,
                    opacity: template.textOpacity,
                    cursor: isDragging === "text" ? "grabbing" : "grab",
                  }}
                  className={`absolute z-20 transition-transform group touch-none ${
                    isDragging === "text"
                      ? "ring-2 ring-cyan-400 scale-105 shadow-2xl"
                      : "hover:ring-2 hover:ring-cyan-400/70"
                  }`}>
                  <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl pointer-events-none">
                    <span
                      className="font-bold tracking-wide"
                      style={{ fontSize: `${Math.max(10, Math.round(template.fontSize * 0.45))}px` }}>
                      {template.watermarkText || "Union Education"}
                    </span>
                  </div>
                  <div className="absolute -top-3 -right-3 bg-cyan-500 text-slate-900 rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow">
                    <Move className="w-2.5 h-2.5" />
                  </div>
                  <div className="absolute -bottom-4 left-0 text-[9px] font-mono font-bold text-cyan-300 bg-black/80 px-1 rounded whitespace-nowrap pointer-events-none">
                    Badge ({Math.round(template.textPosX * 100)}%, {Math.round(template.textPosY * 100)}%)
                  </div>
                </div>
              )}

              {/* If None */}
              {template.watermarkType === "none" && (
                <div className="text-center p-6 bg-slate-100 dark:bg-zinc-950 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-400">
                  <span className="text-sm font-semibold block text-slate-900 dark:text-slate-200">No Watermark Overlay Selected</span>
                  <span className="text-xs">Video will be processed and uploaded without logo or text badge.</span>
                </div>
              )}
            </div>

            {/* Visual Specs Summary Box */}
            <div className="p-3.5 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs space-y-2 text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>FFmpeg Stream Parameters Summary:</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <strong>Logo:</strong> {currentLogo.name} &bull; Opacity: {Math.round(template.imageOpacity * 100)}% &bull; Size: {Math.round(template.imageScale * 100)}%
                </div>
                <div>
                  <strong>Badge:</strong> &quot;{template.watermarkText}&quot; &bull; Opacity: {Math.round(template.textOpacity * 100)}% &bull; Font: {template.fontSize}px
                </div>
                <div>
                  <strong>Logo Pos:</strong> X={Math.round(template.imagePosX * 100)}%, Y={Math.round(template.imagePosY * 100)}%
                </div>
                <div>
                  <strong>Badge Pos:</strong> X={Math.round(template.textPosX * 100)}%, Y={Math.round(template.textPosY * 100)}%
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Configuration Controls */}
          <div className="lg:col-span-5 space-y-5">
            {/* 1. Watermark Mode Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Watermark Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "both", label: "✨ Logo & Badge", desc: "Both Top-Right Logo + Bottom-Left Badge" },
                  { id: "image", label: "🖼️ Logo Only", desc: "Top-Right Logo only" },
                  { id: "text", label: "🏷️ Badge Only", desc: "Bottom-Left Text Badge only" },
                  { id: "none", label: "🚫 None", desc: "Fast raw pass-through" },
                ].map((mode) => {
                  const active = template.watermarkType === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setTemplate((prev) => ({ ...prev, watermarkType: mode.id as any }))}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-500/20"
                          : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
                      }`}>
                      <div className="text-xs font-bold">{mode.label}</div>
                      <div className={`text-[10px] ${active ? "text-indigo-100" : "text-slate-400"}`}>
                        {mode.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Target Output Resolution */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">
                Default Encoding Resolution
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["720p", "1080p", "480p", "original"] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => setTemplate((prev) => ({ ...prev, selectedResolution: res }))}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition text-center ${
                      template.selectedResolution === res
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
                    }`}>
                    {res === "720p" ? "⚡ 720p" : res === "original" ? "Original" : res}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Logo Settings (if enabled) */}
            {(template.watermarkType === "both" || template.watermarkType === "image") && (
              <div className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-zinc-800 pb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Logo Customization
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Pos: ({Math.round(template.imagePosX * 100)}%, {Math.round(template.imagePosY * 100)}%)
                  </span>
                </div>

                {/* Logo Preset Picker */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">Select Logo Asset</span>
                  <div className="grid grid-cols-2 gap-2">
                    {LOGO_PRESETS.map((logo) => (
                      <button
                        key={logo.id}
                        type="button"
                        onClick={() =>
                          setTemplate((prev) => ({
                            ...prev,
                            logoPresetId: logo.id,
                            logoPath: logo.path,
                            imageScale: logo.recommendedScale,
                          }))
                        }
                        className={`p-2 rounded-lg border text-xs flex items-center gap-2 transition ${
                          template.logoPresetId === logo.id
                            ? "bg-white dark:bg-zinc-900 border-blue-500 ring-2 ring-blue-500/20 shadow-sm font-bold text-blue-900 dark:text-blue-300"
                            : "bg-white dark:bg-zinc-900/80 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-zinc-900"
                        }`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logo.previewSrc} alt={logo.name} className="w-5 h-5 object-contain" />
                        <span className="truncate">{logo.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Position Shortcuts */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">Position Shortcut</span>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: "top-right", label: "Top-Right (Default)" },
                      { id: "top-left", label: "Top-Left" },
                      { id: "bottom-right", label: "Bottom-Right" },
                      { id: "bottom-left", label: "Bottom-Left" },
                    ].map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => setLogoPositionPreset(pos.id as any)}
                        className="py-1 px-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate text-center">
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders: Scale & Opacity */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Logo Scale</span>
                      <span className="font-bold text-slate-900 dark:text-white">{Math.round(template.imageScale * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.08"
                      max="0.35"
                      step="0.01"
                      value={template.imageScale}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, imageScale: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Logo Opacity</span>
                      <span className="font-bold text-slate-900 dark:text-white">{Math.round(template.imageOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.20"
                      max="1.00"
                      step="0.05"
                      value={template.imageOpacity}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, imageOpacity: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. Text Badge Settings (if enabled) */}
            {(template.watermarkType === "both" || template.watermarkType === "text") && (
              <div className="p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-zinc-800 pb-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" /> Text Pill Badge Customization
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Pos: ({Math.round(template.textPosX * 100)}%, {Math.round(template.textPosY * 100)}%)
                  </span>
                </div>

                {/* Text String Input */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">
                    Badge Text Content
                  </label>
                  <input
                    type="text"
                    value={template.watermarkText}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, watermarkText: e.target.value }))}
                    placeholder="e.g. Union Education"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 dark:border-zinc-800 rounded-lg bg-white dark:bg-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Position Shortcuts */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block">Position Shortcut</span>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: "bottom-left", label: "Bottom-Left (Default)" },
                      { id: "bottom-right", label: "Bottom-Right" },
                      { id: "top-left", label: "Top-Left" },
                      { id: "top-right", label: "Top-Right" },
                    ].map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => setTextPositionPreset(pos.id as any)}
                        className="py-1 px-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate text-center">
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders: Font Size & Opacity */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Font Size</span>
                      <span className="font-bold text-slate-900 dark:text-white">{template.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="16"
                      max="36"
                      step="2"
                      value={template.fontSize}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, fontSize: parseInt(e.target.value, 10) }))
                      }
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Badge Opacity</span>
                      <span className="font-bold text-slate-900 dark:text-white">{Math.round(template.textOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.20"
                      max="1.00"
                      step="0.05"
                      value={template.textOpacity}
                      onChange={(e) =>
                        setTemplate((prev) => ({ ...prev, textOpacity: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-indigo-600"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
    </Modal>
  );
}
