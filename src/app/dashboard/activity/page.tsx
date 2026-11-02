"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { Pagination } from "@/components/Pagination";
import { UploadQueueDrawer } from "@/components/UploadQueueDrawer";
import { Youtube } from "@/components/icons/Youtube";
import {
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Search,
  Trash2,
  RefreshCw,
  Copy,
  AlertCircle,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
  Zap,
} from "lucide-react";
import { useUploadQueue } from "@/lib/upload-queue-store";
import { AutopilotRunRecord } from "@/lib/autopilot";

export interface ActivityLogItem {
  id: string;
  fileId: string;
  topic: string;
  customTitle?: string;
  accountName?: string;
  status: "success" | "failed" | "processing";
  youtubeUrl?: string;
  youtubeVideoId?: string;
  privacyStatus?: string;
  resolution?: string;
  watermarkType?: string;
  fileSizeBytes?: number;
  durationMinutes?: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
}

export default function ActivityLogsPage() {
  const router = useRouter();
  const { user } = useUser();
  const userRole =
    (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  // Data & Pagination
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [loading, setLoading] = useState<boolean>(true);
  const [clearing, setClearing] = useState<boolean>(false);

  // Tabs: Video Processing Logs vs Auto-Pilot Discovery Runs
  type ActivityTab = "videos" | "autopilot";
  const [activeTab, setActiveTab] = useState<ActivityTab>("videos");
  const [autopilotRuns, setAutopilotRuns] = useState<AutopilotRunRecord[]>([]);
  const [loadingAutopilot, setLoadingAutopilot] = useState<boolean>(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [actionLoadingRunId, setActionLoadingRunId] = useState<string | null>(
    null,
  );
  const [syncingRuns, setSyncingRuns] = useState<boolean>(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Check URL tab query param
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "autopilot") {
        setActiveTab("autopilot");
      }
    }
  }, []);

  // Fetch Auto-Pilot Runs
  const fetchAutopilotRuns = useCallback(async () => {
    setLoadingAutopilot(true);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot");
      const json = await res.json();
      if (json.success && Array.isArray(json.runs)) {
        setAutopilotRuns(json.runs);
      }
    } catch (err) {
      console.error("Failed to load autopilot runs:", err);
    } finally {
      setLoadingAutopilot(false);
    }
  }, []);

  const handleResolveRun = async (
    runId: string,
    status: "success" | "failed" = "success",
  ) => {
    setActionLoadingRunId(runId);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_run", runId, status }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchAutopilotRuns();
      } else {
        alert(json.error || "Failed to resolve run");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to resolve run");
    } finally {
      setActionLoadingRunId(null);
    }
  };

  const handleStopRun = async (runId: string) => {
    if (
      !confirm(
        "Are you sure you want to stop this run? This will abort any active GitHub Actions workflow runner.",
      )
    ) {
      return;
    }
    setActionLoadingRunId(runId);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop_run", runId }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchAutopilotRuns();
      } else {
        alert(json.error || "Failed to stop run");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to stop run");
    } finally {
      setActionLoadingRunId(null);
    }
  };

  const handleSyncStaleRuns = async () => {
    setSyncingRuns(true);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_runs" }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchAutopilotRuns();
      }
    } catch (err) {
      console.error("Failed to sync runs:", err);
    } finally {
      setSyncingRuns(false);
    }
  };

  useEffect(() => {
    fetchAutopilotRuns();
  }, [fetchAutopilotRuns]);

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
    removeFromQueue: handleRemoveFromQueue,
    retryQueueItem: handleRetryQueueItem,
    clearCompleted: handleClearCompletedQueue,
    startDirectProcessing: handleStartDirectProcessing,
  } = useUploadQueue();

  type ProcessingTarget = "local" | "cloud";
  const [processingTarget, setProcessingTarget] =
    useState<ProcessingTarget>("cloud");
  const [triggeringRunner, setTriggeringRunner] = useState<boolean>(false);

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

  const handleTriggerCloudRunner = async () => {
    setTriggeringRunner(true);
    try {
      const res = await fetch("/api/zoom-youtube/workflow/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Manual batch trigger from Activity page",
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert("GitHub Actions Cloud Runner dispatched successfully!");
      } else {
        alert(data.message || "Failed to dispatch runner");
      }
    } catch (err) {
      alert("Error dispatching runner: " + String(err));
    } finally {
      setTriggeringRunner(false);
    }
  };

  // Fetch paginated logs
  const fetchLogs = useCallback(
    async (
      page = currentPage,
      limit = pageSize,
      status = statusFilter,
      search = searchQuery,
    ) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (status && status !== "all") params.set("status", status);
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(
          `/api/zoom-youtube/activity-logs?${params.toString()}`,
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
          setTotalCount(data.total ?? data.logs.length);
          setTotalPages(
            data.totalPages ??
              Math.max(1, Math.ceil((data.total ?? 1) / limit)),
          );
          setLastRefreshed(new Date());
        }
      } catch (err) {
        console.error("Failed to load activity logs:", err);
      } finally {
        setLoading(false);
      }
    },
    [currentPage, pageSize, statusFilter, searchQuery],
  );

  useEffect(() => {
    fetchLogs(currentPage, pageSize, statusFilter, searchQuery);
  }, [currentPage, pageSize, statusFilter, searchQuery, fetchLogs]);

  // Auto-refresh interval (polling every 15s if enabled and tab visible)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        fetchLogs(currentPage, pageSize, statusFilter, searchQuery);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [
    autoRefresh,
    currentPage,
    pageSize,
    statusFilter,
    searchQuery,
    fetchLogs,
  ]);

  // Clear logs
  const handleClearLogs = async () => {
    if (
      !confirm(
        "Are you sure you want to clear all activity and audit logs? This cannot be undone.",
      )
    )
      return;
    setClearing(true);
    try {
      const res = await fetch("/api/zoom-youtube/activity-logs", {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        setTotalCount(0);
        setTotalPages(1);
        setCurrentPage(1);
      } else {
        alert(data.error || "Failed to clear logs");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error clearing logs");
    } finally {
      setClearing(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "—";
    const mb = bytes / (1024 * 1024);
    return `${Math.round(mb)} MB`;
  };

  const formatDurationSec = (seconds?: number) => {
    if (!seconds || seconds <= 0) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-zinc-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Activity Logs &amp; Upload History</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
                  {totalCount} Total Logs
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comprehensive audit trail of Zoom recording downloads, watermark
                rendering, and YouTube uploads.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live refresh toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition ${
              autoRefresh
                ? "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                : "bg-white dark:bg-black border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-400"
            }`}>
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh
                  ? "bg-emerald-500 dark:bg-emerald-400 animate-pulse"
                  : "bg-slate-400 dark:bg-slate-500"
              }`}
            />
            <span>Live {autoRefresh ? "ON (15s)" : "Paused"}</span>
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => {
              fetchLogs(currentPage, pageSize, statusFilter, searchQuery);
              fetchAutopilotRuns();
            }}
            disabled={loading || loadingAutopilot}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-black hover:bg-slate-100 dark:hover:bg-zinc-850 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm transition disabled:opacity-50">
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading || loadingAutopilot ? "animate-spin text-blue-500" : ""}`}
            />
            <span>Refresh</span>
          </button>

          {/* Clear logs */}
          {userRole === "admin" && activeTab === "videos" && (
            <button
              type="button"
              onClick={handleClearLogs}
              disabled={clearing || totalCount === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-red-400 hover:text-rose-700 dark:hover:text-red-300 bg-rose-50 dark:bg-red-950/40 hover:bg-rose-100 dark:hover:bg-red-950/70 border border-rose-200 dark:border-red-800/60 rounded-xl transition disabled:opacity-40">
              <Trash2 className="w-3.5 h-3.5" />
              <span>{clearing ? "Clearing..." : "Clear Logs"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Segmented Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("videos")}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
            activeTab === "videos"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900"
          }`}>
          <History className="w-3.5 h-3.5" />
          <span>Video Processing &amp; YouTube Logs</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "videos"
                ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                : "bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
            }`}>
            {totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("autopilot")}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
            activeTab === "autopilot"
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900"
          }`}>
          <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span>Auto-Pilot Discovery Runs</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === "autopilot"
                ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                : "bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300"
            }`}>
            {autopilotRuns.length}
          </span>
        </button>
      </div>

      {activeTab === "videos" ? (
        /* Main Card with Toolbar & Table (Video Processing Logs) */
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl overflow-hidden flex flex-col">
          {/* Controls / Filter Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/80 dark:bg-black">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by topic, custom title, error, or file ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
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

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: "all", label: "All Logs" },
                { id: "success", label: "Success" },
                { id: "failed", label: "Failed" },
                { id: "processing", label: "Processing" },
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
                        ? "bg-rose-600 text-white shadow-sm"
                        : "bg-white dark:bg-zinc-950 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto min-h-[360px] relative">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
                <p className="text-xs text-slate-400">
                  Loading audit history...
                </p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center mx-auto text-slate-400">
                  <History className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200">
                  No activity logs recorded
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {searchQuery || statusFilter !== "all"
                    ? "No logs match the current search or status filter."
                    : "Activity logs will automatically populate here whenever a video is downloaded, watermarked, or uploaded."}
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50/80 dark:bg-zinc-950 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-zinc-800 select-none">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">Status</th>
                    <th className="py-3 px-3">Topic / Class Name</th>
                    <th className="py-3 px-3">Account</th>
                    <th className="py-3 px-3">Date &amp; Time</th>
                    <th className="py-3 px-3">Duration</th>
                    <th className="py-3 px-3">Size</th>
                    <th className="py-3 px-3">Watermark</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                  {logs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const isSuccess = log.status === "success";
                    const isFailed = log.status === "failed";
                    const isProcessing = log.status === "processing";

                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition cursor-pointer ${
                            isExpanded
                              ? "bg-slate-100/70 dark:bg-zinc-900/60"
                              : ""
                          }`}
                          onClick={() =>
                            setExpandedLogId(isExpanded ? null : log.id)
                          }>
                          {/* Status Icon */}
                          <td className="py-3 px-3 text-center">
                            {isSuccess ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 mx-auto" />
                            ) : isFailed ? (
                              <XCircle className="w-4 h-4 text-rose-500 dark:text-rose-400 mx-auto" />
                            ) : (
                              <Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin mx-auto" />
                            )}
                          </td>

                          {/* Topic & Custom Title */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 dark:text-slate-100 max-w-xs truncate">
                              {log.customTitle || log.topic}
                            </div>
                            {log.customTitle &&
                              log.customTitle !== log.topic && (
                                <p className="text-[11px] text-slate-500 truncate">
                                  Topic: {log.topic}
                                </p>
                              )}
                            <span className="text-[10px] font-mono text-slate-500">
                              ID: {log.fileId}
                            </span>
                          </td>

                          {/* Account */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                            <span className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2 py-0.5 rounded-lg text-[11px] font-medium text-slate-700 dark:text-slate-300">
                              {log.accountName || "Zoom Account"}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                            {formatDate(log.startedAt)}
                          </td>

                          {/* Process Duration */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono">
                            {formatDurationSec(log.durationSeconds)}
                          </td>

                          {/* File Size */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400 font-mono">
                            {formatFileSize(log.fileSizeBytes)}
                          </td>

                          {/* Watermark & Resolution */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300">
                              <Sparkles className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" />
                              <span>{log.resolution || "720p"}</span>
                              <span>•</span>
                              <span className="capitalize">
                                {log.watermarkType || "WM"}
                              </span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td
                            className="py-3 px-3 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {log.youtubeUrl && (
                                <a
                                  href={log.youtubeUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800/80 rounded-lg text-xs font-bold transition">
                                  <Youtube className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                                  <span>Watch</span>
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLogId(isExpanded ? null : log.id)
                                }
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                                title="Toggle details">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Details Row */}
                        {isExpanded && (
                          <tr className="bg-slate-50 dark:bg-zinc-950 border-y border-slate-200 dark:border-zinc-800">
                            <td colSpan={8} className="p-4">
                              <div className="space-y-3">
                                {/* Error Details if Failed */}
                                {log.errorMessage && (
                                  <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-200">
                                      <AlertCircle className="w-4 h-4 text-rose-500 dark:text-rose-400" />
                                      <span>Failure Reason:</span>
                                    </div>
                                    <p className="font-mono text-[11px] whitespace-pre-wrap break-all text-rose-800 dark:text-rose-200 bg-white/80 dark:bg-black/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900/50">
                                      {log.errorMessage}
                                    </p>
                                  </div>
                                )}

                                {/* YouTube URL box if Success */}
                                {log.youtubeUrl && (
                                  <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5 truncate">
                                      <span className="font-bold text-emerald-800 dark:text-emerald-200 block">
                                        YouTube Video Link:
                                      </span>
                                      <a
                                        href={log.youtubeUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-600 dark:text-emerald-400 underline font-mono text-[11px] truncate block">
                                        {log.youtubeUrl}
                                      </a>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleCopy(log.youtubeUrl!, log.id)
                                      }
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition self-start sm:self-auto shrink-0 shadow-xs">
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>
                                        {copiedId === log.id
                                          ? "Copied!"
                                          : "Copy URL"}
                                      </span>
                                    </button>
                                  </div>
                                )}

                                {/* Job Metadata Details Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-100 dark:bg-black p-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-slate-400">
                                  <div>
                                    <strong className="text-slate-800 dark:text-slate-300 block">
                                      Zoom File ID:
                                    </strong>
                                    <span className="font-mono text-[10px] break-all">
                                      {log.fileId}
                                    </span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-800 dark:text-slate-300 block">
                                      Started:
                                    </strong>
                                    <span>{formatDate(log.startedAt)}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-800 dark:text-slate-300 block">
                                      Completed:
                                    </strong>
                                    <span>{formatDate(log.completedAt)}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-800 dark:text-slate-300 block">
                                      Target Resolution:
                                    </strong>
                                    <span>{log.resolution || "720p"}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
            itemLabel="activity logs"
            disabled={loading}
          />
        </div>
      ) : (
        /* Main Card: Auto-Pilot Discovery Runs */
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl overflow-hidden flex flex-col">
          {/* Header Bar */}
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/80 dark:bg-black">
            <div className="flex items-center gap-2 flex-wrap">
              <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Auto-Pilot Discovery &amp; Batch Runs
              </h3>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                {autopilotRuns.length} recorded runs
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSyncStaleRuns}
                disabled={syncingRuns || loadingAutopilot}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 transition shadow-xs disabled:opacity-50">
                <RefreshCw
                  className={`w-3.5 h-3.5 ${syncingRuns ? "animate-spin" : ""}`}
                />
                <span>
                  {syncingRuns ? "Reconciling..." : "Sync Stale Runs"}
                </span>
              </button>
              <p className="text-xs text-slate-500 dark:text-zinc-400 hidden lg:block">
                Scans all active Zoom accounts strictly for today&apos;s classes
                in Nepal Time.
              </p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loadingAutopilot ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Loading discovery run history...
                </p>
              </div>
            ) : autopilotRuns.length === 0 ? (
              <div className="text-center py-16 px-4 space-y-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                  No Auto-Pilot Runs Logged Yet
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Runs will appear here automatically when the scheduled cloud
                  runner or manual trigger scans Zoom.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50/90 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <tr>
                    <th className="py-3 px-4">Run Time (NPT)</th>
                    <th className="py-3 px-4">Runner &amp; Trigger</th>
                    <th className="py-3 px-4">Scan Window</th>
                    <th className="py-3 px-4">Accounts</th>
                    <th className="py-3 px-4">Classes Discovered</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-850">
                  {autopilotRuns.map((run) => (
                    <React.Fragment key={run.id}>
                      <tr className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/40 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {new Date(run.runAt).toLocaleString("en-US", {
                            timeZone: "Asia/Kathmandu",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}{" "}
                          NPT
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800 dark:text-zinc-200 truncate max-w-[180px]">
                            {run.runnerLabel}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-zinc-400">
                            {run.triggerSource}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-zinc-300 whitespace-nowrap">
                          {run.scanWindow}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-800 dark:text-zinc-200">
                          {run.accountsScanned} accounts
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {run.totalFound} found
                            </span>
                            <span className="text-slate-400">•</span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              {run.alreadyUploadedCount} uploaded
                            </span>
                            {run.newlyQueuedCount > 0 && (
                              <>
                                <span className="text-slate-400">•</span>
                                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                  {run.newlyQueuedCount} queued
                                </span>
                              </>
                            )}
                          </div>
                          <p
                            className="text-[10px] text-slate-500 dark:text-zinc-400 truncate max-w-xs"
                            title={run.summary}>
                            {run.summary}
                          </p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                run.status === "success"
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                  : run.status === "running"
                                    ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                    : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                              }`}>
                              {run.status === "success" && (
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              )}
                              {run.status === "running" && (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              )}
                              {run.status.toUpperCase()}
                            </span>

                            {run.status === "running" && (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={actionLoadingRunId === run.id}
                                  onClick={() =>
                                    handleResolveRun(run.id, "success")
                                  }
                                  title="Mark this run as completed"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50 shadow-xs">
                                  {actionLoadingRunId === run.id ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                  )}
                                  <span>Mark Done</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoadingRunId === run.id}
                                  onClick={() => handleStopRun(run.id)}
                                  title="Stop run and cancel active runner"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50 shadow-xs">
                                  {actionLoadingRunId === run.id ? (
                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  ) : (
                                    <XCircle className="w-2.5 h-2.5" />
                                  )}
                                  <span>Stop</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {run.items && run.items.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRunId(
                                  expandedRunId === run.id ? null : run.id,
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white">
                              <span>
                                {expandedRunId === run.id
                                  ? "Hide"
                                  : `Classes (${run.items.length})`}
                              </span>
                              {expandedRunId === run.id ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expandable Class Breakdown */}
                      {expandedRunId === run.id && run.items && (
                        <tr className="bg-slate-50/70 dark:bg-zinc-950/80">
                          <td
                            colSpan={7}
                            className="p-4 border-t border-b border-slate-200 dark:border-zinc-800">
                            <div className="space-y-2">
                              <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
                                Discovered Classes for this Run
                              </h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {run.items.map((it, idx) => (
                                  <div
                                    key={idx}
                                    className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black flex flex-col justify-between gap-2 shadow-xs">
                                    <div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                                          {it.accountName}
                                        </span>
                                        <span className="text-[10px] text-slate-500 dark:text-zinc-400">
                                          {it.durationMinutes} min
                                        </span>
                                      </div>
                                      <p className="font-semibold text-xs text-slate-900 dark:text-white mt-1">
                                        {it.topic}
                                      </p>
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-zinc-900 text-[11px]">
                                      <span className="text-slate-500 dark:text-zinc-400">
                                        {new Date(it.startTime).toLocaleString(
                                          "en-US",
                                          {
                                            timeZone: "Asia/Kathmandu",
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: true,
                                          },
                                        )}{" "}
                                        NPT
                                      </span>

                                      {it.status === "already_uploaded" &&
                                      it.youtubeUrl ? (
                                        <a
                                          href={it.youtubeUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 hover:underline">
                                          <span>Watch on YouTube</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      ) : it.status === "queued" ? (
                                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                                          Queued for upload
                                        </span>
                                      ) : it.status === "zoom_processing" ? (
                                        <span className="font-semibold text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                                          <Loader2 className="w-3 h-3 animate-spin" />{" "}
                                          Rendering on Zoom (~30-45m)
                                        </span>
                                      ) : it.status === "already_queued" ? (
                                        <span className="font-semibold text-sky-600 dark:text-sky-400">
                                          Already processing
                                        </span>
                                      ) : (
                                        <span className="text-slate-500">
                                          {it.status}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Floating Upload Queue Drawer */}
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
