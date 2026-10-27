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
} from "lucide-react";
import { useUploadQueue } from "@/lib/upload-queue-store";

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
  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  // Data & Pagination
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [loading, setLoading] = useState<boolean>(true);
  const [clearing, setClearing] = useState<boolean>(false);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

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
  } = useUploadQueue();

  // Fetch paginated logs
  const fetchLogs = useCallback(
    async (page = currentPage, limit = pageSize, status = statusFilter, search = searchQuery) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (status && status !== "all") params.set("status", status);
        if (search.trim()) params.set("search", search.trim());

        const res = await fetch(`/api/zoom-youtube/activity-logs?${params.toString()}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
          setTotalCount(data.total ?? data.logs.length);
          setTotalPages(data.totalPages ?? Math.max(1, Math.ceil((data.total ?? 1) / limit)));
          setLastRefreshed(new Date());
        }
      } catch (err) {
        console.error("Failed to load activity logs:", err);
      } finally {
        setLoading(false);
      }
    },
    [currentPage, pageSize, statusFilter, searchQuery]
  );

  useEffect(() => {
    fetchLogs(currentPage, pageSize, statusFilter, searchQuery);
  }, [currentPage, pageSize, statusFilter, searchQuery, fetchLogs]);

  // Auto-refresh interval (polling every 15s if enabled and tab visible)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchLogs(currentPage, pageSize, statusFilter, searchQuery);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, currentPage, pageSize, statusFilter, searchQuery, fetchLogs]);

  // Clear logs
  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all activity and audit logs? This cannot be undone.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/zoom-youtube/activity-logs", { method: "DELETE" });
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        userRole={userRole}
        userEmail={user?.primaryEmailAddress?.emailAddress}
        onOpenQueue={() => setQueueDrawerOpen(true)}
      />

      <main className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-gradient-to-tr from-rose-600 to-indigo-600 rounded-xl shadow-md text-white">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>Activity Logs &amp; Upload History</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    {totalCount} Total Logs
                  </span>
                </h1>
                <p className="text-xs text-slate-400">
                  Comprehensive audit trail of Zoom recording downloads, watermark rendering, and YouTube uploads.
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
                  ? "bg-emerald-950/60 border-emerald-800 text-emerald-400"
                  : "bg-slate-900 border-slate-700 text-slate-400"
              }`}>
              <span
                className={`w-2 h-2 rounded-full ${
                  autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                }`}
              />
              <span>Live {autoRefresh ? "ON (15s)" : "Paused"}</span>
            </button>

            {/* Refresh button */}
            <button
              type="button"
              onClick={() => fetchLogs(currentPage, pageSize, statusFilter, searchQuery)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl shadow-sm transition disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
              <span>Refresh</span>
            </button>

            {/* Clear logs */}
            {userRole === "admin" && (
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={clearing || totalCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-950/70 border border-red-800/60 rounded-xl transition disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearing ? "Clearing..." : "Clear Logs"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Card with Toolbar & Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden flex flex-col">
          {/* Controls / Filter Bar */}
          <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-900/90">
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
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs">
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
                        : "bg-slate-950/80 text-slate-400 border border-slate-800 hover:bg-slate-800 hover:text-slate-200"
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
                <p className="text-xs text-slate-400">Loading audit history...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                  <History className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-200">No activity logs recorded</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {searchQuery || statusFilter !== "all"
                    ? "No logs match the current search or status filter."
                    : "Activity logs will automatically populate here whenever a video is downloaded, watermarked, or uploaded."}
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-800 select-none">
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
                <tbody className="divide-y divide-slate-800/80">
                  {logs.map((log) => {
                    const isExpanded = expandedLogId === log.id;
                    const isSuccess = log.status === "success";
                    const isFailed = log.status === "failed";
                    const isProcessing = log.status === "processing";

                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`hover:bg-slate-800/40 transition cursor-pointer ${
                            isExpanded ? "bg-slate-800/50" : ""
                          }`}
                          onClick={() =>
                            setExpandedLogId(isExpanded ? null : log.id)
                          }>
                          {/* Status Icon */}
                          <td className="py-3 px-3 text-center">
                            {isSuccess ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                            ) : isFailed ? (
                              <XCircle className="w-4 h-4 text-rose-400 mx-auto" />
                            ) : (
                              <Loader2 className="w-4 h-4 text-blue-400 animate-spin mx-auto" />
                            )}
                          </td>

                          {/* Topic & Custom Title */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-100 max-w-xs truncate">
                              {log.customTitle || log.topic}
                            </div>
                            {log.customTitle && log.customTitle !== log.topic && (
                              <p className="text-[11px] text-slate-500 truncate">
                                Topic: {log.topic}
                              </p>
                            )}
                            <span className="text-[10px] font-mono text-slate-500">
                              ID: {log.fileId}
                            </span>
                          </td>

                          {/* Account */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-400">
                            <span className="bg-slate-800/70 border border-slate-700/60 px-2 py-0.5 rounded-lg text-[11px] font-medium text-slate-300">
                              {log.accountName || "Zoom Account"}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-400">
                            {formatDate(log.startedAt)}
                          </td>

                          {/* Process Duration */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-400 font-mono">
                            {formatDurationSec(log.durationSeconds)}
                          </td>

                          {/* File Size */}
                          <td className="py-3 px-3 whitespace-nowrap text-slate-400 font-mono">
                            {formatFileSize(log.fileSizeBytes)}
                          </td>

                          {/* Watermark & Resolution */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300">
                              <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                              <span>{log.resolution || "720p"}</span>
                              <span>•</span>
                              <span className="capitalize">{log.watermarkType || "WM"}</span>
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
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/80 rounded-lg text-xs font-bold transition">
                                  <Youtube className="w-3.5 h-3.5 text-red-400" />
                                  <span>Watch</span>
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLogId(isExpanded ? null : log.id)
                                }
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
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
                          <tr className="bg-slate-950/60 border-y border-slate-800">
                            <td colSpan={8} className="p-4">
                              <div className="space-y-3">
                                {/* Error Details if Failed */}
                                {log.errorMessage && (
                                  <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs space-y-1.5">
                                    <div className="flex items-center gap-1.5 font-bold text-rose-200">
                                      <AlertCircle className="w-4 h-4 text-rose-400" />
                                      <span>Failure Reason:</span>
                                    </div>
                                    <p className="font-mono text-[11px] whitespace-pre-wrap break-all text-rose-200 bg-black/40 p-2.5 rounded-lg border border-rose-900/50">
                                      {log.errorMessage}
                                    </p>
                                  </div>
                                )}

                                {/* YouTube URL box if Success */}
                                {log.youtubeUrl && (
                                  <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5 truncate">
                                      <span className="font-bold text-emerald-200 block">
                                        YouTube Video Link:
                                      </span>
                                      <a
                                        href={log.youtubeUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-emerald-400 underline font-mono text-[11px] truncate block">
                                        {log.youtubeUrl}
                                      </a>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(log.youtubeUrl!, log.id)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition self-start sm:self-auto shrink-0">
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>{copiedId === log.id ? "Copied!" : "Copy URL"}</span>
                                    </button>
                                  </div>
                                )}

                                {/* Job Metadata Details Grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-900 p-3 rounded-xl border border-slate-800 text-slate-400">
                                  <div>
                                    <strong className="text-slate-300 block">Zoom File ID:</strong>
                                    <span className="font-mono text-[10px] break-all">{log.fileId}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-300 block">Started:</strong>
                                    <span>{formatDate(log.startedAt)}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-300 block">Completed:</strong>
                                    <span>{formatDate(log.completedAt)}</span>
                                  </div>
                                  <div>
                                    <strong className="text-slate-300 block">Target Resolution:</strong>
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
      </main>

      {/* Floating Upload Queue Drawer */}
      <UploadQueueDrawer
        queue={uploadQueue}
        drawerOpen={queueDrawerOpen}
        setDrawerOpen={setQueueDrawerOpen}
        clearCompleted={handleClearCompletedQueue}
        retryQueueItem={handleRetryQueueItem}
        removeFromQueue={handleRemoveFromQueue}
        currentResolution={currentResolution}
        setQueueResolution={setQueueResolution}
        currentWatermarkPreset={currentWatermarkPreset}
        setQueueWatermarkPreset={setQueueWatermarkPreset}
      />
    </div>
  );
}
