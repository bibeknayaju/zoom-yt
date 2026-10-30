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
  Play,
  Laptop,
  Cloud,
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
  startDirectProcessing?: (id?: string) => void;
  onTriggerCloudRunner?: () => Promise<void>;
  isTriggeringRunner?: boolean;
  processingTarget?: "local" | "cloud";
  setProcessingTarget?: (target: "local" | "cloud") => void;
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
  startDirectProcessing,
  onTriggerCloudRunner,
  isTriggeringRunner,
  processingTarget,
  setProcessingTarget,
  currentResolution,
  setQueueResolution,
  currentWatermarkPreset,
  setQueueWatermarkPreset,
}: UploadQueueDrawerProps) {
  const [mounted, setMounted] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [internalTriggering, setInternalTriggering] = useState<boolean>(false);
  const [fallbackTarget, setFallbackTarget] = useState<"local" | "cloud">("cloud");

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("zoomyt_processing_target");
      if (saved === "local" || saved === "cloud") {
        setFallbackTarget(saved);
      }
    } catch {}
  }, []);

  const effectiveTarget = processingTarget || fallbackTarget;

  const handleSetTarget = (target: "local" | "cloud") => {
    if (setProcessingTarget) {
      setProcessingTarget(target);
    } else {
      setFallbackTarget(target);
    }
    try {
      localStorage.setItem("zoomyt_processing_target", target);
    } catch {}
  };

  const handleTriggerRunner = async () => {
    if (onTriggerCloudRunner) {
      await onTriggerCloudRunner();
      return;
    }
    setInternalTriggering(true);
    try {
      const res = await fetch("/api/zoom-youtube/workflow/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual batch trigger from Queue Drawer" }),
      });
      const data = await res.json();
      if (data.success) {
        alert("GitHub Actions Cloud Runner dispatched successfully!");
      } else {
        alert(data.message || "Failed to dispatch GitHub Actions runner");
      }
    } catch (err) {
      alert("Error dispatching runner: " + String(err));
    } finally {
      setInternalTriggering(false);
    }
  };

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

  if (!mounted || queue.length === 0) return null;

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
          className="group flex items-center gap-2.5 px-4 py-2.5 bg-black/95 hover:bg-black text-white rounded-full shadow-2xl border border-zinc-700 hover:border-indigo-500 backdrop-blur-md transition-all duration-200 hover:scale-105 active:scale-95"
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
    <div className="fixed bottom-5 right-5 z-50 w-full max-w-md bg-white dark:bg-black rounded-2xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200">
      {/* Drawer Header */}
      <div className="p-3.5 bg-black text-white border-b border-zinc-800 flex items-center justify-between select-none">
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
          {queuedCount > 0 && effectiveTarget === "cloud" ? (
            <button
              type="button"
              onClick={handleTriggerRunner}
              disabled={isTriggeringRunner || internalTriggering}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 border border-zinc-700 dark:border-zinc-300 px-2.5 py-1 rounded shadow-xs transition disabled:opacity-50"
              title="Run batch GitHub Actions runner now for all queued videos">
              {isTriggeringRunner || internalTriggering ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Cloud className="w-3 h-3" />
              )}
              <span>Run Cloud ({queuedCount})</span>
            </button>
          ) : queuedCount > 0 && startDirectProcessing ? (
            <button
              type="button"
              onClick={() => startDirectProcessing()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 px-2 py-0.5 rounded shadow-xs transition"
              title="Start downloading, watermarking, and uploading all queued items in browser now">
              <Play className="w-2.5 h-2.5 fill-current" />
              <span>Start All</span>
            </button>
          ) : null}
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
              className="text-[11px] font-semibold text-zinc-300 hover:text-white px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition"
              title="Clear finished items">
              Clear Done
            </button>
          )}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-zinc-900 transition"
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
      <div className="px-3.5 py-2 bg-zinc-950 border-t border-zinc-800">
        <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5 font-medium">
          <span>Overall Progress</span>
          <span className="font-semibold text-white">
            {overallPercent}% ({completedCount}/{queue.length} done)
          </span>
        </div>
        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-400 h-1.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* Presets Toolbar (Quality + Auto-Watermark Selector) */}
      <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 space-y-2 text-xs">
        {/* Quality preset */}
        {currentResolution && setQueueResolution && (
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-600 dark:text-zinc-400 text-[11px]">Quality Preset:</span>
            <div className="flex items-center gap-1">
              {(["720p", "1080p", "480p", "original"] as const).map((res) => (
                <button
                  key={res}
                  type="button"
                  onClick={() => setQueueResolution(res)}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                    currentResolution === res
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs"
                      : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-white"
                  }`}>
                  {res === "original" ? "Original" : res}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Auto-Watermark preset */}
        {setQueueWatermarkPreset && (
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 dark:border-zinc-800">
            <span className="font-medium text-slate-600 dark:text-zinc-400 text-[11px]">
              Auto Watermark:
            </span>
            <div className="flex items-center gap-1">
              {([
                { id: "both", label: "Logo & Badge", title: "Embed Logo top-right + Union Education pill badge bottom-left" },
                { id: "image", label: "Logo", title: "Embed Logo top-right only" },
                { id: "text", label: "Badge", title: "Embed Union Education text badge only" },
                { id: "none", label: "None", title: "Fast pass-through without watermark" },
              ] as const).map((wm) => {
                const active = ((currentWatermarkPreset === "logo" ? "image" : currentWatermarkPreset) || "both") === wm.id;
                return (
                  <button
                    key={wm.id}
                    type="button"
                    title={wm.title}
                    onClick={() => setQueueWatermarkPreset?.(wm.id)}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                      active
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs"
                        : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-white"
                    }`}>
                    {wm.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Processing Target preset */}
        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 dark:border-zinc-800">
          <span className="font-medium text-slate-600 dark:text-zinc-400 text-[11px]">
            Target Runner:
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleSetTarget("local")}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                effectiveTarget === "local"
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs"
                  : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-white"
              }`}>
              <Laptop className="w-3.5 h-3.5" />
              <span>Laptop</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetTarget("cloud")}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                effectiveTarget === "cloud"
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-xs"
                  : "bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800 hover:text-slate-900 dark:hover:text-white"
              }`}>
              <Cloud className="w-3.5 h-3.5" />
              <span>GitHub Workflow</span>
            </button>
          </div>
        </div>
      </div>

      {/* Drawer Items List */}
      <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800 p-2 space-y-1.5 bg-slate-50/50 dark:bg-black">
        {queue.map((item) => (
          <div
            key={item.id}
            className="p-2.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs space-y-1 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white truncate block">
                    {item.topic}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400 flex-wrap">
                  <span className="bg-slate-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded font-medium text-slate-700 dark:text-slate-300">
                    {item.accountName}
                  </span>
                  <span>•</span>
                  <span className="bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-800 px-1.5 py-0.5 rounded font-medium text-[10px]">
                    {item.watermark?.type === "none" || (!item.watermark && currentWatermarkPreset === "none")
                      ? "Original"
                      : item.resolution || currentResolution || "720p"}
                  </span>
                  <span>•</span>
                  <span className="bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-800 px-1.5 py-0.5 rounded font-medium text-[10px]">
                    {item.watermark?.type && item.watermark.type !== "none"
                      ? item.watermark.type === "both"
                        ? "Logo + Badge"
                        : item.watermark.type === "image" || item.watermark.type === "logo"
                        ? "Logo"
                        : item.watermark.type === "text"
                        ? "Badge"
                        : "Raw"
                      : (currentWatermarkPreset || "both") !== "none"
                      ? "Logo + Badge"
                      : "Raw"}
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
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-lg hover:underline">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      <span>YouTube</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => removeFromQueue(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-900 transition"
                      title="Dismiss from list">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : item.status === "uploading" ? (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 px-2 py-0.5 rounded-lg animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
                      <span>{item.progressPercent ? `${item.progressPercent}%` : (item.serverManaged ? (item.serverTarget === "local" ? "Laptop" : "Cloud") : "Streaming...")}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => (cancelTask ? cancelTask(item.id) : removeFromQueue(item.id))}
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-900/50 px-1.5 py-0.5 rounded-md transition"
                      title="Cancel this ongoing task">
                      <X className="w-3 h-3 text-rose-600" />
                      <span>Cancel</span>
                    </button>
                  </div>
                ) : item.status === "failed" ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">Failed</span>
                    <button
                      type="button"
                      onClick={() => retryQueueItem(item.id)}
                      className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-900/50">
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromQueue(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 dark:hover:bg-zinc-900 transition"
                      title="Remove from list">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2 py-0.5 rounded-lg">
                      <Clock className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                      <span>{item.serverManaged ? `Queued · ${item.serverTarget === "local" ? "Laptop" : "Cloud"}` : "Queued"}</span>
                    </span>
                    {startDirectProcessing && (
                      <button
                        type="button"
                        onClick={() => startDirectProcessing(item.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 px-2 py-0.5 rounded-md transition shadow-xs"
                        title="Start downloading & watermarking right now in browser">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>Start</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFromQueue(item.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 dark:hover:bg-zinc-900 transition"
                      title="Cancel queued task">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {item.status === "uploading" && (
              <div className="space-y-1 mt-2 pt-1.5 border-t border-slate-100 dark:border-zinc-800">
                <div className="flex items-center justify-between text-[10px] text-blue-700 dark:text-blue-300 font-medium">
                  <span className="truncate">{item.progressMsg || "Processing & uploading..."}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono font-bold">{item.progressPercent || 0}%</span>
                    <button
                      type="button"
                      onClick={() => (cancelTask ? cancelTask(item.id) : removeFromQueue(item.id))}
                      className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300 text-[10px] font-bold hover:underline">
                      Stop
                    </button>
                  </div>
                </div>
                <div className="w-full bg-blue-100 dark:bg-blue-900/60 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(item.progressPercent || 0, 5)}%` }}
                  />
                </div>
              </div>
            )}

            {item.status === "queued" && (
              <div className="space-y-1 mt-2 pt-1.5 border-t border-slate-100 dark:border-zinc-800">
                <div className="flex items-center justify-between text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                  <span className="truncate">{item.progressMsg || "Queued (ready to stream)..."}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono font-semibold text-slate-400">0%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-400 h-1.5 rounded-full"
                    style={{ width: "0%" }}
                  />
                </div>
              </div>
            )}

            {item.error && (
              <p className="text-[10px] text-red-600 dark:text-red-400 truncate">{item.error}</p>
            )}
          </div>
        ))}
      </div>

      {/* Popup Footer Note */}
      <div className="px-3.5 py-2 bg-slate-100 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>Transfers run in background</span>
        <button
          type="button"
          onClick={() => setDrawerOpen(false)}
          className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold flex items-center gap-1">
          <Minimize2 className="w-3 h-3" />
          <span>Minimize</span>
        </button>
      </div>
    </div>
  );
}
