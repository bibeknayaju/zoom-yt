"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  AutoWatermarkTemplate,
  DEFAULT_WATERMARK_TEMPLATE,
} from "@/lib/watermark-template";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="p-5 border-b flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                Auto-Watermark Template &amp; Visual Defaults
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Set and preview the exact logo, text badge, positions, and opacity used for all automated background watermarking.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition flex items-center gap-1.5"
              title="Reset to recommended Union Education defaults">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Canvas Preview, Right Controls */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          {/* Left Column: 16:9 Visual Preview Canvas */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Live 16:9 Video Canvas Preview
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Simulated Output: {template.selectedResolution}
              </span>
            </div>

            {/* Canvas Container */}
            <div className="relative aspect-video w-full rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 border-2 border-slate-700 overflow-hidden shadow-inner flex items-center justify-center select-none">
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

              {/* 1. Watermark Logo Layer */}
              {(template.watermarkType === "both" || template.watermarkType === "image") && (
                <div
                  className="absolute pointer-events-none transition-all duration-75"
                  style={{
                    left: `${template.imagePosX * 100}%`,
                    top: `${template.imagePosY * 100}%`,
                    width: `${template.imageScale * 100}%`,
                    opacity: template.imageOpacity,
                  }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentLogo.previewSrc}
                    alt="Watermark Logo"
                    className="w-full h-auto drop-shadow-lg"
                  />
                  <div className="absolute -bottom-4 left-0 text-[9px] font-mono font-bold text-amber-300 bg-black/80 px-1 rounded whitespace-nowrap">
                    Logo ({Math.round(template.imagePosX * 100)}%, {Math.round(template.imagePosY * 100)}%)
                  </div>
                </div>
              )}

              {/* 2. Text Badge Layer */}
              {(template.watermarkType === "both" || template.watermarkType === "text") && (
                <div
                  className="absolute pointer-events-none transition-all duration-75"
                  style={{
                    left: `${template.textPosX * 100}%`,
                    top: `${template.textPosY * 100}%`,
                    opacity: template.textOpacity,
                  }}>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white shadow-xl">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span
                      className="font-bold tracking-wide"
                      style={{ fontSize: `${Math.max(10, Math.round(template.fontSize * 0.45))}px` }}>
                      {template.watermarkText || "Union Education"}
                    </span>
                  </div>
                  <div className="absolute -bottom-4 left-0 text-[9px] font-mono font-bold text-cyan-300 bg-black/80 px-1 rounded whitespace-nowrap">
                    Badge ({Math.round(template.textPosX * 100)}%, {Math.round(template.textPosY * 100)}%)
                  </div>
                </div>
              )}

              {/* If None */}
              {template.watermarkType === "none" && (
                <div className="text-center p-6 bg-slate-900/80 rounded-xl border border-slate-700 text-slate-400">
                  <span className="text-sm font-semibold block text-slate-200">No Watermark Overlay Selected</span>
                  <span className="text-xs">Video will be processed and uploaded without logo or text badge.</span>
                </div>
              )}
            </div>

            {/* Visual Specs Summary Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 text-slate-600">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Info className="w-3.5 h-3.5 text-blue-600" />
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
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
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
                          ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/20"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}>
                      <div className="text-xs font-bold">{mode.label}</div>
                      <div className={`text-[10px] ${active ? "text-slate-300" : "text-slate-400"}`}>
                        {mode.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Target Output Resolution */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
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
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}>
                    {res === "720p" ? "⚡ 720p" : res === "original" ? "Original" : res}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Logo Settings (if enabled) */}
            {(template.watermarkType === "both" || template.watermarkType === "image") && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" /> Logo Customization
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Pos: ({Math.round(template.imagePosX * 100)}%, {Math.round(template.imagePosY * 100)}%)
                  </span>
                </div>

                {/* Logo Preset Picker */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 block">Select Logo Asset</span>
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
                            ? "bg-white border-blue-500 ring-2 ring-blue-100 shadow-sm font-bold text-blue-900"
                            : "bg-white/80 border-slate-200 text-slate-600 hover:bg-white"
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
                  <span className="text-[11px] font-semibold text-slate-700 block">Position Shortcut</span>
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
                        className="py-1 px-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-[10px] font-medium text-slate-700 truncate text-center">
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders: Scale & Opacity */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 font-medium">Logo Scale</span>
                      <span className="font-bold text-slate-900">{Math.round(template.imageScale * 100)}%</span>
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
                      <span className="text-slate-600 font-medium">Logo Opacity</span>
                      <span className="font-bold text-slate-900">{Math.round(template.imageOpacity * 100)}%</span>
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
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-indigo-600" /> Text Pill Badge Customization
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    Pos: ({Math.round(template.textPosX * 100)}%, {Math.round(template.textPosY * 100)}%)
                  </span>
                </div>

                {/* Text String Input */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">
                    Badge Text Content
                  </label>
                  <input
                    type="text"
                    value={template.watermarkText}
                    onChange={(e) => setTemplate((prev) => ({ ...prev, watermarkText: e.target.value }))}
                    placeholder="e.g. Union Education"
                    className="w-full px-3 py-1.5 text-xs border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Position Shortcuts */}
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-700 block">Position Shortcut</span>
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
                        className="py-1 px-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-[10px] font-medium text-slate-700 truncate text-center">
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sliders: Font Size & Opacity */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 font-medium">Font Size</span>
                      <span className="font-bold text-slate-900">{template.fontSize}px</span>
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
                      <span className="text-slate-600 font-medium">Badge Opacity</span>
                      <span className="font-bold text-slate-900">{Math.round(template.textOpacity * 100)}%</span>
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

        {/* Modal Footer with Primary Save Button */}
        <div className="p-4 border-t bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Saved template will automatically apply to all direct uploads &amp; background queue tasks.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition">
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || savedSuccess}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition disabled:opacity-50">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : savedSuccess ? (
                <Check className="w-4 h-4 text-emerald-300" />
              ) : (
                <Sparkles className="w-4 h-4 text-amber-300" />
              )}
              <span>
                {saving
                  ? "Saving Template..."
                  : savedSuccess
                  ? "Saved Successfully!"
                  : "Save as Default Auto-Watermark Template"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
