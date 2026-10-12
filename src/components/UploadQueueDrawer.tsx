"use client";

import React, { useState, useEffect } from "react";
import { Youtube } from "@/components/icons/Youtube";
import {

  CheckCircle2,
  Loader2,
  Clock,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Wifi,
  WifiOff,
  Sparkles,
  X,
  Minimize2,
} from "lucide-react";
import {
  DirectUploadQueueItem,
  VideoResolution,
  WatermarkPreset,
} from "@/lib/upload-queue-store";

interface UploadQueueDrawerProps {
  queue: DirectUploadQueueItem[];
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  clearCompleted: () => void;
  retryQueueItem: (id: string) => void;
  removeFromQueue: (id: string) => void;
  cancelTask?: (id: string) => void;
  cancelAll?: () => void;
  currentResolution?: VideoResolution;
  setQueueResolution?: (res: VideoResolution) => void;
  currentWatermarkPreset?: WatermarkPreset;
  setQueueWatermarkPreset?: (preset: WatermarkPreset) => void;
}

export function UploadQueueDrawer({
  queue,
  drawerOpen,
  setDrawerOpen,
  clearCompleted,
  retryQueueItem,
  removeFromQueue,
  cancelTask,
  cancelAll,
  currentResolution,
  setQueueResolution,
  currentWatermarkPreset,
  setQueueWatermarkPreset,
}: UploadQueueDrawerProps) {
  const [isOnline, setIsOnline] = useState<boolean>(true);


  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const onOn = () => setIsOnline(true);
      const onOff = () => setIsOnline(false);
      window.addEventListener("online", onOn);
      window.addEventListener("offline", onOff);
      return () => {
        window.removeEventListener("online", onOn);
        window.removeEventListener("offline", onOff);
      };
    }
  }, []);

  if (queue.length === 0) return null;

  const completedCount = queue.filter((i) => i.status === "uploaded").length;
  const isUploading = queue.some((i) => i.status === "uploading");
  const queuedCount = queue.filter((i) => i.status === "queued").length;
  const overallPercent = Math.round((completedCount / queue.length) * 100);
  const toMB = (bytes: number) => Math.round(bytes / (1024 * 1024));

  /* ------------------------------------------------------------------ */
  /* 1. Minimized State: Sleek floating corner pill (unblocks all background buttons) */
  /* ------------------------------------------------------------------ */
  if (!drawerOpen) {
    return (
      <div className="fixed bottom-5 right-5 z-50">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="group flex items-center gap-2.5 px-4 py-2.5 bg-slate-900/95 hover:bg-slate-900 text-white rounded-full shadow-2xl border border-slate-700 hover:border-indigo-500 backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95"
          title="Open Direct YouTube Upload Queue Popup">
          <div className="relative">
            <Youtube className="w-4 h-4 text-red-500" />
            {isUploading && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
            )}
          </div>
          <span className="text-xs font-bold tracking-wide">
            Queue ({completedCount}/{queue.length})
          </span>
          {isUploading ? (
            <span className="text-[11px] font-mono font-bold text-emerald-400">
              {overallPercent}%
            </span>
          ) : completedCount === queue.length ? (
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded-full border border-emerald-800">
              Done
            </span>
          ) : null}
          <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition" />
        </button>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* 2. Expanded State: Full Popup card with close (✕) and clear actions */
  /* ------------------------------------------------------------------ */
  return (
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200">
      {/* Drawer Header */}
      <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between select-none">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Youtube className="w-5 h-5 text-red-500" />
            {isUploading && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-wide">
              Direct YouTube Upload Queue
            </h4>
            <p className="text-[11px] text-slate-300">
              {completedCount} of {queue.length} completed
              {isUploading && " • 1 processing"}
              {queuedCount > 0 && ` • ${queuedCount} waiting`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {(isUploading || queuedCount > 0) && (
            <button
              type="button"
              onClick={cancelAll || clearCompleted}
              className="text-[11px] font-semibold text-rose-300 hover:text-white px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-800/60 transition"
              title="Cancel all ongoing and queued tasks">
              Cancel All
            </button>
          )}
          {completedCount > 0 && (
            <button
              type="button"
              onClick={clearCompleted}
              className="text-[11px] font-semibold text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition"
              title="Clear finished items">
              Clear Done
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Minimize / Close popup">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Network Drop Auto-Resume Alert */}
      {!isOnline && (
        <div className="px-3.5 py-2 bg-amber-500 text-slate-950 flex items-center justify-between text-[11px] font-bold">
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Network Interrupted &bull; Transfers paused (will auto-resume)</span>
          </div>
          <span className="text-[10px] bg-amber-600/40 px-1.5 py-0.5 rounded border border-amber-700/30">
            Waiting...
          </span>
        </div>
      )}

      {/* Overall Queue Progress Bar */}
      <div className="px-3.5 py-2 bg-slate-800 border-t border-slate-700">
        <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5 font-medium">
          <span>Overall Progress</span>
          <span className="font-semibold text-white">
            {overallPercent}% ({completedCount}/{queue.length} done)
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* Presets Toolbar (Quality + Auto-Watermark Selector) */}
      <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 space-y-1.5 text-xs">
        {/* Quality preset */}
        {currentResolution && setQueueResolution && (
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-600 text-[11px]">Quality Preset:</span>
            <div className="flex items-center gap-1">
              {(["720p", "1080p", "480p", "original"] as const).map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setQueueResolution(res)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                    currentResolution === res
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                  }`}>
                  {res === "720p" ? "⚡ 720p" : res === "1080p" ? "1080p" : res === "480p" ? "480p" : "Original"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auto-Watermark preset */}
        {setQueueWatermarkPreset && (
          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
            <span className="font-medium text-slate-600 text-[11px] flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" /> Auto Watermark:
            </span>
            <div className="flex items-center gap-1">
              {([
                { id: "both", label: "✨ Logo & Badge", title: "Embed Logo top-right + Union Education pill badge bottom-left" },
                { id: "logo", label: "🖼️ Logo", title: "Embed Logo top-right only" },
                { id: "text", label: "🏷️ Badge", title: "Embed Union Education text badge only" },
                { id: "none", label: "🚫 None", title: "Fast pass-through without watermark" },
              ] as const).map((wm) => {
                const active = (currentWatermarkPreset || "both") === wm.id;
                return (
                  <button
                    key={wm.id}
                    type="button"
                    title={wm.title}
                    onClick={() => setQueueWatermarkPreset(wm.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                      active
                        ? "bg-amber-600 text-white shadow-sm"
                        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                    }`}>
                    {wm.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Drawer Items List */}
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1.5 bg-slate-50/50">
        {queue.map((item) => (
          <div
            key={item.id}
            className="p-2.5 rounded-xl bg-white border border-slate-100 text-xs space-y-1 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 truncate block">
                    {item.topic}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-700">
                    {item.accountName}
                  </span>
                  <span>•</span>
                  <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                    {item.watermark?.type === "none" || (!item.watermark && currentWatermarkPreset === "none")
                      ? "Original (Raw)"
                      : item.resolution || currentResolution || "720p"}
                  </span>
                  <span>•</span>
                  <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                    {item.watermark?.type && item.watermark.type !== "none"
                      ? item.watermark.type === "both"
                        ? "✨ WM: Logo+Badge"
                        : item.watermark.type === "image"
                        ? "🖼️ WM: Logo"
                        : "🏷️ WM: Badge"
                      : (currentWatermarkPreset || "both") !== "none"
                      ? "✨ Auto WM"
                      : "🚫 No WM (Raw)"}
                  </span>
                  <span>•</span>
                  <span>{toMB(item.fileSizeBytes)} MB</span>
                </div>
              </div>

              <div className="shrink-0">
                {item.status === "uploaded" ? (
                  <div className="flex items-center gap-1">
                    <a
                      href={item.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg hover:underline">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>YouTube</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => removeFromQueue(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition"
                      title="Dismiss from list">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : item.status === "uploading" ? (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                      <span>{item.progressPercent || 15}%</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => (cancelTask ? cancelTask(item.id) : removeFromQueue(item.id))}
                      className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-1.5 py-0.5 rounded-md transition hover:scale-105 active:scale-95 shadow-xs"
                      title="Cancel this ongoing task">
                      <X className="w-3 h-3 text-rose-600" />
                      <span>Cancel</span>
                    </button>
                  </div>
                ) : item.status === "failed" ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-red-600 font-bold">Failed</span>
                    <button
                      type="button"
                      onClick={() => retryQueueItem(item.id)}
                      className="text-[10px] font-bold text-red-700 bg-red-50 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200">
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromQueue(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition"
                      title="Remove from list">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span>Queued</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromQueue(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition"
                      title="Cancel queued task">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {item.status === "uploading" && (
              <div className="space-y-1 mt-2 pt-1.5 border-t border-slate-100">
                <div className="flex items-center justify-between text-[10px] text-blue-700 font-medium">
                  <span className="truncate">{item.progressMsg || "Processing & uploading..."}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono font-bold">{item.progressPercent || 15}%</span>
                    <button
                      type="button"
                      onClick={() => (cancelTask ? cancelTask(item.id) : removeFromQueue(item.id))}
                      className="text-rose-600 hover:text-rose-800 text-[10px] font-bold hover:underline">
                      Stop
                    </button>
                  </div>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${item.progressPercent || 15}%` }}
                  />
                </div>
              </div>
            )}

            {item.error && (
              <p className="text-[10px] text-red-600 truncate">{item.error}</p>
            )}
          </div>
        ))}
      </div>

      {/* Popup Footer Note */}
      <div className="px-3.5 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <span>Transfers run in background</span>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1">
          <Minimize2 className="w-3 h-3" />
          <span>Minimize</span>
        </button>
      </div>
    </div>
  );
}
