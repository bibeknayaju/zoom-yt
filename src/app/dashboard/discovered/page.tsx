"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { Pagination } from "@/components/Pagination";
import { UploadQueueDrawer } from "@/components/UploadQueueDrawer";
import { Youtube } from "@/components/icons/Youtube";
import {
  Film,
  DownloadCloud,
  Loader2,
  Play,
  Sparkles,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  Sliders,
  ExternalLink,
  Filter,
  CheckSquare,
  Square,
  AlertCircle,
  Laptop,
  Cloud,
} from "lucide-react";
import {
  useUploadQueue,
  DirectUploadQueueItem,
  buildWatermarkConfig,
  trackServerQueueItems,
} from "@/lib/upload-queue-store";

interface RecordingItem {
  id: string;
  zoom_file_id: string;
  zoom_account_id?: string;
  meeting_id: string;
  topic: string;
  recording_start: string;
  duration_minutes: number;
  file_size_bytes: number;
  download_url?: string;
  status:
    | "discovered"
    | "queued"
    | "downloading"
    | "watermarking"
    | "ready"
    | "uploading"
    | "uploaded"
    | "failed"
    | "skipped";
  youtube_video_id?: string;
  youtube_url?: string;
  accountName?: string;
  hostName?: string;
  partNumber?: number;
  totalParts?: number;
}

const STATUS_BADGE_STYLES: Record<string, { bg: string; text: string; border: string; animate?: boolean }> = {
  discovered: { bg: "bg-slate-100 dark:bg-zinc-900", text: "text-slate-700 dark:text-zinc-300", border: "border-slate-200 dark:border-zinc-800" },
  queued: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-900/50" },
  ready: { bg: "bg-slate-100 dark:bg-zinc-900", text: "text-slate-700 dark:text-zinc-300", border: "border-slate-200 dark:border-zinc-800" },
  downloading: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-900/50", animate: true },
  watermarking: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-900/50", animate: true },
  uploading: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200 dark:border-blue-900/50", animate: true },
  uploaded: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-900/50" },
  skipped: { bg: "bg-slate-100 dark:bg-zinc-900", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200 dark:border-zinc-800" },
  failed: { bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", border: "border-rose-200 dark:border-rose-900/50" },
};

export default function DiscoveredVideosPage() {
  const router = useRouter();
  const { user } = useUser();
  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  // Data & Pagination state
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Runner & Processing target state
  type ProcessingTarget = "local" | "cloud";
  const [processingTarget, setProcessingTarget] = useState<ProcessingTarget>("cloud");
  const [triggeringRunner, setTriggeringRunner] = useState<boolean>(false);
  const [enqueuingIds, setEnqueuingIds] = useState<Record<string, boolean>>({});
  const [enqueuingAll, setEnqueuingAll] = useState<boolean>(false);
  const [runnerMsg, setRunnerMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load saved processing target from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("zoomyt_processing_target");
      if (saved === "local" || saved === "cloud") {
        setProcessingTarget(saved as ProcessingTarget);
      }
    } catch {}
  }, []);

  const handleSetProcessingTarget = (target: ProcessingTarget) => {
    setProcessingTarget(target);
    try {
      localStorage.setItem("zoomyt_processing_target", target);
    } catch {}
  };

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Shared Upload Queue store
  const {
    queue: uploadQueue,
    drawerOpen: queueDrawerOpen,
    setDrawerOpen: setQueueDrawerOpen,
    currentResolution,
    setQueueResolution,
    currentWatermarkPreset,
    setQueueWatermarkPreset,
    addToQueue: handleQueueDirectUpload,
    addAllToQueue: handleQueueAllDirectUpload,
    removeFromQueue: handleRemoveFromQueue,
    retryQueueItem: handleRetryQueueItem,
    clearCompleted: handleClearCompletedQueue,
    startDirectProcessing: handleStartDirectProcessing,
  } = useUploadQueue();

  // Fetch paginated recordings from API
  const fetchRecordings = useCallback(
    async (page = currentPage, limit = pageSize, status = statusFilter, search = searchQuery) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (status && status !== "all") params.set("status", status);
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/zoom-youtube/recordings?${params.toString()}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.recordings)) {
          setRecordings(data.recordings);
          setTotalCount(data.total ?? data.recordings.length);
          setTotalPages(data.totalPages ?? Math.max(1, Math.ceil((data.total ?? 1) / limit)));
        }
      } catch (err) {
        console.error("Failed to fetch discovered recordings:", err);
      } finally {
        setLoading(false);
      }
    },
    [currentPage, pageSize, statusFilter, searchQuery]
  );

  // Re-fetch when page, size, status, or search changes
  useEffect(() => {
    fetchRecordings(currentPage, pageSize, statusFilter, searchQuery);
  }, [currentPage, pageSize, statusFilter, searchQuery, fetchRecordings]);

  // Background polling when any recording is actively queued or processing
  const isAnyJobActive = useMemo(() => {
    return (
      recordings.some((r) =>
        ["queued", "downloading", "watermarking", "uploading"].includes(r.status)
      ) ||
      uploadQueue.some((q) =>
        ["queued", "uploading"].includes(q.status)
      )
    );
  }, [recordings, uploadQueue]);

  useEffect(() => {
    if (!isAnyJobActive) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchRecordings(currentPage, pageSize, statusFilter, searchQuery);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isAnyJobActive, fetchRecordings, currentPage, pageSize, statusFilter, searchQuery]);

  // Trigger GitHub Actions Cloud Runner
  const handleTriggerCloudRunner = async () => {
    setTriggeringRunner(true);
    setRunnerMsg(null);
    try {
      const res = await fetch("/api/zoom-youtube/workflow/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual batch trigger from Discovered Videos page" }),
      });
      const data = await res.json();
      if (data.success) {
        setRunnerMsg({
          type: "success",
          text: "Cloud Runner Dispatched! GitHub Actions runner is processing queued videos.",
        });
        fetchRecordings(currentPage, pageSize, statusFilter, searchQuery);
      } else {
        setRunnerMsg({
          type: "error",
          text: data.message || "Failed to dispatch GitHub Actions runner.",
        });
      }
    } catch (err: unknown) {
      setRunnerMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to trigger workflow",
      });
    } finally {
      setTriggeringRunner(false);
      setTimeout(() => setRunnerMsg(null), 6000);
    }
  };

  // Cancel / unqueue recording
  const handleCancelQueuedRecording = async (fileId: string) => {
    try {
      await fetch("/api/zoom-youtube/recordings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      setRecordings((prev) =>
        prev.map((r) =>
          ((r.zoom_file_id || r.id) === fileId ? { ...r, status: "discovered" } : r)
        )
      );
      handleRemoveFromQueue(fileId);
    } catch (err) {
      console.error("Failed to cancel queued recording:", err);
    }
  };

  // Sync recordings from Zoom Cloud
  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/zoom-youtube/recordings/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSyncMsg(`Synced! ${data.discoveredCount ?? 0} new recordings discovered.`);
        fetchRecordings(1, pageSize, statusFilter, searchQuery);
        setCurrentPage(1);
      } else {
        setSyncMsg(data.error || "Failed to sync from Zoom");
      }
    } catch (err: unknown) {
      setSyncMsg(err instanceof Error ? err.message : "Sync request failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  };

  // Status update
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch("/api/zoom-youtube/recordings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setRecordings((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: newStatus as any } : r))
        );
      } else {
        alert(data.error || "Failed to update status");
      }
    } catch {
      alert("Error updating status");
    }
  };

  // Open recording in Watermark Studio
  const handleOpenStudio = (rec: RecordingItem) => {
    const sel = {
      fileId: rec.zoom_file_id || rec.id,
      topic: rec.topic,
      downloadUrl: rec.download_url,
      zoomAccountId: rec.zoom_account_id,
      startTime: rec.recording_start,
      fileSizeBytes: rec.file_size_bytes,
      durationMinutes: rec.duration_minutes,
      accountName: rec.accountName,
    };
    try {
      sessionStorage.setItem("zoomyt_selected_recording", JSON.stringify(sel));
    } catch {}
    router.push("/dashboard/studio");
  };

  // Direct upload item
  const handleDirectUploadItem = async (rec: RecordingItem) => {
    const fileId = rec.zoom_file_id || rec.id;
    setEnqueuingIds((prev) => ({ ...prev, [fileId]: true }));
    const wm = buildWatermarkConfig(currentWatermarkPreset);
    const formattedRec = {
      fileId,
      topic: rec.topic,
      downloadUrl: rec.download_url,
      zoomAccountId: rec.zoom_account_id,
      startTime: rec.recording_start,
      fileSizeBytes: rec.file_size_bytes,
      durationMinutes: rec.duration_minutes,
      accountName: rec.accountName || "Zoom Account",
    };

    try {
      if (processingTarget === "cloud") {
        // Enqueue to server for GitHub Actions Cloud Runner
        const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordings: [formattedRec],
            watermark: wm,
            resolution: wm.type === "none" ? "original" : currentResolution,
            target: "cloud",
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to enqueue video for Cloud Runner");
        }

        // Add to server-managed queue drawer without starting local browser processing
        trackServerQueueItems([formattedRec], "cloud", "queued");
        setRecordings((prev) =>
          prev.map((r) => ((r.zoom_file_id || r.id) === fileId ? { ...r, status: "queued" } : r))
        );
        setQueueDrawerOpen(true);
      } else {
        // Local laptop: Post to enqueue API with target: "local" and process in browser worker
        await fetch("/api/zoom-youtube/recordings/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordings: [formattedRec],
            watermark: wm,
            resolution: wm.type === "none" ? "original" : currentResolution,
            target: "local",
          }),
        }).catch(() => {});

        handleQueueDirectUpload(
          formattedRec,
          rec.accountName || "Zoom Account",
          {
            watermark: wm,
            resolution: wm.type === "none" ? "original" : currentResolution,
          }
        );
        setRecordings((prev) =>
          prev.map((r) => ((r.zoom_file_id || r.id) === fileId ? { ...r, status: "queued" } : r))
        );
        setQueueDrawerOpen(true);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to queue video");
    } finally {
      setEnqueuingIds((prev) => ({ ...prev, [fileId]: false }));
    }
  };

  // Bulk actions
  const toggleSelectAll = () => {
    if (selectedIds.size === recordings.length && recordings.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recordings.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkUploadSelected = async () => {
    const selected = recordings.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setEnqueuingAll(true);
    const wm = buildWatermarkConfig(currentWatermarkPreset);
    const formatted = selected.map((r) => ({
      fileId: r.zoom_file_id || r.id,
      topic: r.topic,
      downloadUrl: r.download_url,
      zoomAccountId: r.zoom_account_id,
      startTime: r.recording_start,
      fileSizeBytes: r.file_size_bytes,
      durationMinutes: r.duration_minutes,
      accountName: r.accountName || "Zoom Account",
    }));
    const enqueuedIds = new Set(formatted.map((r) => r.fileId));

    try {
      if (processingTarget === "cloud") {
        const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordings: formatted,
            watermark: wm,
            resolution: wm.type === "none" ? "original" : currentResolution,
            target: "cloud",
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to enqueue videos for Cloud Runner");
        }

        trackServerQueueItems(formatted, "cloud", "queued");
        setRecordings((prev) =>
          prev.map((r) => (enqueuedIds.has(r.zoom_file_id || r.id) ? { ...r, status: "queued" } : r))
        );
        setSelectedIds(new Set());
        setQueueDrawerOpen(true);
      } else {
        await fetch("/api/zoom-youtube/recordings/enqueue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordings: formatted,
            watermark: wm,
            resolution: wm.type === "none" ? "original" : currentResolution,
            target: "local",
          }),
        }).catch(() => {});

        handleQueueAllDirectUpload(formatted, "Bulk Discovered", {
          watermark: wm,
          resolution: wm.type === "none" ? "original" : currentResolution,
        });
        setRecordings((prev) =>
          prev.map((r) => (enqueuedIds.has(r.zoom_file_id || r.id) ? { ...r, status: "queued" } : r))
        );
        setSelectedIds(new Set());
        setQueueDrawerOpen(true);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to bulk queue videos");
    } finally {
      setEnqueuingAll(false);
    }
  };

  const toMB = (bytes: number) => (bytes ? `${Math.round(bytes / (1024 * 1024))} MB` : "—");

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
      {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl shadow-md text-white">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Discovered Videos &amp; Recordings</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                    {totalCount} Total
                  </span>
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Recordings automatically discovered from your connected Zoom accounts. Review, watermark, and queue for YouTube.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Target Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-800 shadow-xs">
              <button
                type="button"
                onClick={() => handleSetProcessingTarget("local")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  processingTarget === "local"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}>
                <Laptop className="w-3.5 h-3.5" />
                <span>Local Laptop</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetProcessingTarget("cloud")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  processingTarget === "cloud"
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}>
                <Cloud className="w-3.5 h-3.5" />
                <span>GitHub Workflow</span>
              </button>
            </div>

            {/* Run Cloud Runner Button (when cloud target is selected) */}
            {processingTarget === "cloud" && (
              <>
                <button
                  type="button"
                  onClick={handleTriggerCloudRunner}
                  disabled={triggeringRunner}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition disabled:opacity-50"
                  title="Dispatch GitHub Actions cloud runner to process all queued videos">
                  {triggeringRunner ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5" />
                  )}
                  <span>{triggeringRunner ? "Dispatching..." : "Run Cloud Runner"}</span>
                </button>

                <a
                  href="https://github.com/bibeknayaju/zoom-yt/actions"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition shadow-xs"
                  title="Open GitHub Actions workflows tab in a new window">
                  <span>View Live Runs</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              </>
            )}

            <button
              type="button"
              onClick={handleSyncNow}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition disabled:opacity-50">
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <DownloadCloud className="w-4 h-4" />
              )}
              <span>{syncing ? "Scanning Zoom..." : "Sync from Zoom Now"}</span>
            </button>

            <button
              type="button"
              onClick={() => router.push("/dashboard/studio")}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-black hover:bg-slate-100 dark:hover:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm transition">
              <Sliders className="w-4 h-4 text-slate-400" />
              <span>Studio</span>
            </button>
          </div>
        </div>

        {/* Runner Dispatch Feedback alert */}
        {runnerMsg && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-in fade-in ${
              runnerMsg.type === "success"
                ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/80 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-300"
            }`}>
            <div className="flex items-center gap-2 flex-wrap">
              {runnerMsg.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span>{runnerMsg.text}</span>
              {runnerMsg.type === "success" && (
                <a
                  href="https://github.com/bibeknayaju/zoom-yt/actions"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline ml-1 hover:text-emerald-700 dark:hover:text-white inline-flex items-center gap-1">
                  <span>View Live Runs</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <button
              onClick={() => setRunnerMsg(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Sync message alert */}
        {syncMsg && (
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-300 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
              <span>{syncMsg}</span>
            </div>
            <button
              onClick={() => setSyncMsg(null)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* Main Card with Toolbar & Table */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl overflow-hidden flex flex-col">
          {/* Controls / Filter Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/80 dark:bg-black">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by topic, meeting ID, or host..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white text-xs">
                  ✕
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "all", label: "All" },
                { id: "discovered", label: "Discovered" },
                { id: "queued", label: "Queued" },
                { id: "ready", label: "Ready" },
                { id: "uploading", label: "Uploading" },
                { id: "uploaded", label: "Uploaded" },
                { id: "skipped", label: "Skipped" },
                { id: "failed", label: "Failed" },
              ].map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-xl capitalize transition ${
                      active
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                        : "bg-white dark:bg-zinc-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bulk Selection Bar (when items are selected) */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-2 bg-slate-100 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200">
              <span className="font-semibold">
                {selectedIds.size} {selectedIds.size === 1 ? "video" : "videos"} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBulkUploadSelected}
                  disabled={enqueuingAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg font-semibold shadow-xs transition disabled:opacity-50">
                  {enqueuingAll ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : processingTarget === "cloud" ? (
                    <Cloud className="w-3.5 h-3.5" />
                  ) : (
                    <Laptop className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {processingTarget === "cloud"
                      ? `Queue Selected for Cloud (${selectedIds.size})`
                      : `Start Selected on Laptop (${selectedIds.size})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2 py-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 text-xs">
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Table Container */}
          <div className="overflow-x-auto min-h-[360px] relative">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-xs text-slate-400">Loading discovered videos...</p>
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-slate-400">
                  <Film className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200">No recordings found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {searchQuery || statusFilter !== "all"
                    ? "Try adjusting your search query or status filter."
                    : "No Zoom recordings have been synced yet. Click 'Sync from Zoom Now' above to discover your classes."}
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-zinc-950 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-zinc-800 select-none">
                  <tr>
                    <th className="py-3 px-3.5 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        title="Select all on this page"
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                        {selectedIds.size === recordings.length && recordings.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-3">Topic / Class Name</th>
                    <th className="py-3 px-3">Account</th>
                    <th className="py-3 px-3">Date &amp; Time</th>
                    <th className="py-3 px-3">Duration</th>
                    <th className="py-3 px-3">File Size</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {recordings.map((rec) => {
                    const isSelected = selectedIds.has(rec.id);
                    const queueItem = uploadQueue.find(
                      (q) => q.id === (rec.zoom_file_id || rec.id)
                    );
                    const badge = STATUS_BADGE_STYLES[rec.status] || {
                      bg: "bg-slate-100 dark:bg-zinc-900",
                      text: "text-slate-700 dark:text-slate-300",
                      border: "border-slate-200 dark:border-zinc-800",
                    };

                    return (
                      <tr
                        key={rec.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition ${
                          isSelected ? "bg-indigo-50/80 dark:bg-indigo-950/20" : ""
                        }`}>
                        {/* Checkbox */}
                        <td className="py-3 px-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectRow(rec.id)}
                            className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Topic */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100 max-w-sm truncate flex items-center gap-1.5">
                            <span>{rec.topic || "Class Recording"}</span>
                            {rec.totalParts && rec.totalParts > 1 && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 font-semibold">
                                Part {rec.partNumber}/{rec.totalParts}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-500">
                            ID: {rec.meeting_id || rec.zoom_file_id || rec.id}
                          </span>
                        </td>

                        {/* Account */}
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          <span className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2 py-0.5 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-300">
                            {rec.accountName || "Zoom Account"}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {rec.recording_start
                            ? new Date(rec.recording_start).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>

                        {/* Duration */}
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap font-mono">
                          {rec.duration_minutes ? `${rec.duration_minutes} min` : "—"}
                        </td>

                        {/* File Size */}
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap font-mono">
                          {toMB(rec.file_size_bytes)}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full border capitalize ${
                              badge.bg
                            } ${badge.text} ${badge.border}`}>
                            {badge.animate && (
                              <Loader2 className="w-3 h-3 animate-spin inline" />
                            )}
                            <span>{rec.status}</span>
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {rec.youtube_url ? (
                            <a
                              href={rec.youtube_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800/80 rounded-lg text-xs font-bold transition">
                              <Play className="w-3.5 h-3.5 fill-current text-red-500 dark:text-red-400" />
                              <span>Watch on YT</span>
                              <ExternalLink className="w-3 h-3 text-red-500 dark:text-red-400" />
                            </a>
                          ) : queueItem && queueItem.status === "uploading" ? (
                            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 dark:text-blue-400" />
                              <span>Uploading ({queueItem.progressPercent || 0}%)</span>
                            </div>
                          ) : rec.status === "queued" || (queueItem && queueItem.status === "queued") ? (
                            <div className="inline-flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2.5 py-1 rounded-lg">
                                <Clock className="w-3 h-3 text-slate-400" />
                                <span>Queued ({processingTarget === "local" ? "Laptop" : "Cloud"})</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCancelQueuedRecording(rec.zoom_file_id || rec.id)}
                                className="text-xs text-rose-600 hover:text-rose-800 dark:text-rose-400 font-medium transition"
                                title="Cancel and unqueue">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              {/* Open Studio */}
                              <button
                                type="button"
                                onClick={() => handleOpenStudio(rec)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:text-red-300 hover:text-rose-800 dark:hover:text-white bg-rose-50 dark:bg-red-950/50 hover:bg-rose-100 dark:hover:bg-red-900/60 border border-rose-200 dark:border-red-800/80 rounded-lg transition"
                                title="Open in Watermark Studio">
                                <Sparkles className="w-3 h-3 text-rose-500 dark:text-red-400" />
                                <span>Studio</span>
                              </button>

                              {/* Direct Upload / Queue Button */}
                              <button
                                type="button"
                                onClick={() => handleDirectUploadItem(rec)}
                                disabled={enqueuingIds[rec.zoom_file_id || rec.id]}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-lg shadow-xs transition disabled:opacity-50"
                                title={processingTarget === "cloud" ? "Queue video for GitHub Actions cloud runner" : "Process and stream directly on this laptop"}>
                                {enqueuingIds[rec.zoom_file_id || rec.id] ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : processingTarget === "cloud" ? (
                                  <Cloud className="w-3.5 h-3.5" />
                                ) : (
                                  <Laptop className="w-3.5 h-3.5" />
                                )}
                                <span>{processingTarget === "cloud" ? "Queue Cloud" : "Upload"}</span>
                              </button>

                              {/* Ready / Unready toggle */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStatus(
                                    rec.id,
                                    rec.status === "ready" ? "discovered" : "ready"
                                  )
                                }
                                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition">
                                {rec.status === "ready" ? "Unready" : "Ready"}
                              </button>

                              <span className="text-slate-300 dark:text-slate-700">|</span>

                              {/* Skip / Unskip */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateStatus(
                                    rec.id,
                                    rec.status === "skipped" ? "discovered" : "skipped"
                                  )
                                }
                                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition">
                                {rec.status === "skipped" ? "Unskip" : "Skip"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={pageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageChange={(p) => setCurrentPage(p)}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setCurrentPage(1);
            }}
            itemLabel="recordings"
            disabled={loading}
          />
        </div>

      {/* Persistent floating Upload Queue Drawer */}
      <UploadQueueDrawer
        queue={uploadQueue}
        drawerOpen={queueDrawerOpen}
        setDrawerOpen={setQueueDrawerOpen}
        clearCompleted={handleClearCompletedQueue}
        retryQueueItem={handleRetryQueueItem}
        removeFromQueue={handleRemoveFromQueue}
        startDirectProcessing={handleStartDirectProcessing}
        onTriggerCloudRunner={handleTriggerCloudRunner}
        isTriggeringRunner={triggeringRunner}
        processingTarget={processingTarget}
        setProcessingTarget={handleSetProcessingTarget}
        currentResolution={currentResolution}
        setQueueResolution={setQueueResolution}
        currentWatermarkPreset={currentWatermarkPreset}
        setQueueWatermarkPreset={setQueueWatermarkPreset}
      />
    </div>
  );
}
