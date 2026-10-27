"use client";

import Link from "next/link";
import { Youtube } from "@/components/icons/Youtube";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  History,
  CheckCircle2,
  XCircle,
  Loader2,
  Wifi,
  WifiOff,
  ExternalLink,
  Clock,
  Film,
  Search,
  Trash2,
  RefreshCw,
  Calendar,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  AlertCircle,
  ShieldAlert,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";

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

interface ActivityLogsSectionProps {
  onRetryItem?: (item: ActivityLogItem) => void;
}

export function ActivityLogsSection({ onRetryItem }: ActivityLogsSectionProps) {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "failed" | "processing">("all");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Detect network online/offline state
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsOnline(navigator.onLine);
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/zoom-youtube/activity-logs?limit=200");
      if (!res.ok) {
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.error("Failed to load activity logs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchLogs();
      }
    }, 20000); // Polling every 20s when visible
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const handleClearLogs = async () => {
    if (!confirm("Are you sure you want to clear all activity and audit logs? This cannot be undone.")) return;
    setClearing(true);
    try {
      const res = await fetch("/api/zoom-youtube/activity-logs", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
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

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.topic?.toLowerCase().includes(q) ||
        item.customTitle?.toLowerCase().includes(q) ||
        item.accountName?.toLowerCase().includes(q) ||
        item.fileId?.toLowerCase().includes(q) ||
        item.youtubeUrl?.toLowerCase().includes(q) ||
        item.errorMessage?.toLowerCase().includes(q)
      );
    });
  }, [logs, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    return {
      total: logs.length,
      success: logs.filter((l) => l.status === "success").length,
      failed: logs.filter((l) => l.status === "failed").length,
      processing: logs.filter((l) => l.status === "processing").length,
    };
  }, [logs]);

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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 mt-0.5">
            <History className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">
                Activity Logs &amp; Upload History
              </h2>
              {/* Network connection badge with Auto-Resume indication */}
              {isOnline ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <Wifi className="w-3 h-3 text-emerald-600" />
                  Network Online &bull; Auto-Resume Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300 animate-pulse">
                  <WifiOff className="w-3 h-3 text-amber-600" />
                  Network Disconnected &bull; Will Resume on Regain
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live audit trail of all Zoom recordings downloaded, watermarked, and uploaded to YouTube with metadata and error diagnostics.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <Link
            href="/dashboard/activity"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shadow-sm transition">
            <History className="w-3.5 h-3.5" />
            <span>Full Logs &amp; Pagination &rarr;</span>
          </Link>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg shadow-sm transition disabled:opacity-50"
            title="Refresh logs">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>

          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shadow-sm transition disabled:opacity-50">
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Clear History</span>
            </button>
          )}
        </div>
      </div>

      {/* Network Alert Banner (if offline) */}
      {!isOnline && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-amber-800 text-xs">
          <div className="flex items-center gap-2.5">
            <WifiOff className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Internet connection dropped.</strong> Active downloads and YouTube uploads are automatically paused and will resume seamlessly once connection returns.
            </span>
          </div>
          <span className="font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[11px] shrink-0">
            Auto-reconnecting...
          </span>
        </div>
      )}

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setStatusFilter("all")}
          className={`cursor-pointer p-3.5 rounded-xl border transition ${
            statusFilter === "all"
              ? "bg-slate-900 text-white border-slate-900 shadow-sm"
              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
          }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Total Events</span>
            <Film className={`w-4 h-4 ${statusFilter === "all" ? "text-slate-300" : "text-slate-400"}`} />
          </div>
          <div className="text-xl font-bold mt-1">{counts.total}</div>
        </div>

        <div
          onClick={() => setStatusFilter("success")}
          className={`cursor-pointer p-3.5 rounded-xl border transition ${
            statusFilter === "success"
              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
              : "bg-emerald-50/60 text-emerald-800 border-emerald-200 hover:bg-emerald-100/60"
          }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Uploaded</span>
            <CheckCircle2 className={`w-4 h-4 ${statusFilter === "success" ? "text-white" : "text-emerald-600"}`} />
          </div>
          <div className="text-xl font-bold mt-1">{counts.success}</div>
        </div>

        <div
          onClick={() => setStatusFilter("failed")}
          className={`cursor-pointer p-3.5 rounded-xl border transition ${
            statusFilter === "failed"
              ? "bg-rose-600 text-white border-rose-600 shadow-sm"
              : "bg-rose-50/60 text-rose-800 border-rose-200 hover:bg-rose-100/60"
          }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Failed</span>
            <XCircle className={`w-4 h-4 ${statusFilter === "failed" ? "text-white" : "text-rose-600"}`} />
          </div>
          <div className="text-xl font-bold mt-1">{counts.failed}</div>
        </div>

        <div
          onClick={() => setStatusFilter("processing")}
          className={`cursor-pointer p-3.5 rounded-xl border transition ${
            statusFilter === "processing"
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-blue-50/60 text-blue-800 border-blue-200 hover:bg-blue-100/60"
          }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">In Progress</span>
            <Loader2 className={`w-4 h-4 ${statusFilter === "processing" ? "text-white animate-spin" : "text-blue-600"}`} />
          </div>
          <div className="text-xl font-bold mt-1">{counts.processing}</div>
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by meeting title, account name, YouTube link, or error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50/50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600">
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs text-slate-500">
          <span>Showing {filteredLogs.length} of {logs.length} logs</span>
        </div>
      </div>

      {/* Logs Table / List */}
      {filteredLogs.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 space-y-2">
          <History className="w-8 h-8 text-slate-300 mx-auto mb-1" />
          <p className="text-sm font-semibold text-slate-700">No activity logs recorded yet</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            When recordings are downloaded, watermarked, or uploaded to YouTube from the queue or Watermark Studio, detailed audit logs will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5">Recording &amp; Title</th>
                <th className="py-3 px-3">Account</th>
                <th className="py-3 px-3">Date &amp; Time</th>
                <th className="py-3 px-3">Specs</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">YouTube Output</th>
                <th className="py-3 px-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const isSuccess = log.status === "success";
                const isFailed = log.status === "failed";
                const isProcessing = log.status === "processing";

                return (
                  <React.Fragment key={log.id}>
                    <tr className="hover:bg-slate-50/80 transition">
                      {/* Topic & Title */}
                      <td className="py-3.5 px-3.5 max-w-xs">
                        <div className="font-bold text-slate-900 truncate" title={log.topic}>
                          {log.customTitle || log.topic}
                        </div>
                        {log.customTitle && log.customTitle !== log.topic && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5" title={log.topic}>
                            Zoom: {log.topic}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          ID: {log.fileId}
                        </div>
                      </td>

                      {/* Account */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                          {log.accountName || "Zoom"}
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-600">
                        <div>{formatDate(log.startedAt)}</div>
                        {log.durationSeconds && log.durationSeconds > 0 ? (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Took: {formatDurationSec(log.durationSeconds)}
                          </div>
                        ) : null}
                      </td>

                      {/* Specs */}
                      <td className="py-3.5 px-3 whitespace-nowrap text-slate-600">
                        <div className="flex items-center gap-1.5">
                          {log.resolution && (
                            <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded text-[10px]">
                              {log.resolution}
                            </span>
                          )}
                          {log.watermarkType && log.watermarkType !== "none" && (
                            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                              WM
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {log.durationMinutes ? `${log.durationMinutes}m` : "—"} &bull; {formatFileSize(log.fileSizeBytes)}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Success
                          </span>
                        ) : isFailed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                            Processing
                          </span>
                        )}
                      </td>

                      {/* YouTube Output Link */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {log.youtubeUrl ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={log.youtubeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg transition shadow-sm">
                              <Youtube className="w-3.5 h-3.5 text-red-600" />
                              <span>View on YT</span>
                              <ArrowUpRight className="w-3 h-3 text-red-600" />
                            </a>
                            <button
                              onClick={() => handleCopy(log.youtubeUrl!, log.id)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                              title="Copy YouTube URL">
                              {copiedId === log.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : isFailed ? (
                          <span className="text-[11px] text-rose-600 font-medium">No upload link</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Uploading...</span>
                        )}
                      </td>

                      {/* Details & Expand toggle */}
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isFailed && onRetryItem && (
                            <button
                              onClick={() => onRetryItem(log)}
                              className="px-2 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition">
                              Retry
                            </button>
                          )}
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                            title="Toggle technical details">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Details Drawer */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 border-b border-slate-200">
                        <td colSpan={7} className="p-4">
                          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                            <div className="flex items-center justify-between border-b pb-2">
                              <span className="text-xs font-bold text-slate-800">
                                Event Diagnostics &amp; Audit Payload
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                Log ID: {log.id}
                              </span>
                            </div>

                            {/* Detailed Metadata Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div>
                                <span className="text-slate-400 block text-[10px]">Topic</span>
                                <span className="font-semibold text-slate-800">{log.topic}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Account</span>
                                <span className="font-semibold text-slate-800">{log.accountName || "Zoom"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Resolution / Quality</span>
                                <span className="font-semibold text-slate-800">{log.resolution || "Original"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Watermark Style</span>
                                <span className="font-semibold text-slate-800">{log.watermarkType || "None"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Privacy Status</span>
                                <span className="font-semibold text-slate-800 uppercase">{log.privacyStatus || "Unlisted"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Video Length</span>
                                <span className="font-semibold text-slate-800">{log.durationMinutes ? `${log.durationMinutes} mins` : "—"}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Size on Disk</span>
                                <span className="font-semibold text-slate-800">{formatFileSize(log.fileSizeBytes)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 block text-[10px]">Processing Elapsed</span>
                                <span className="font-semibold text-slate-800">{formatDurationSec(log.durationSeconds)}</span>
                              </div>
                            </div>

                            {/* Error Details if Failed */}
                            {log.errorMessage && (
                              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
                                <div className="flex items-center gap-1.5 font-bold">
                                  <AlertCircle className="w-4 h-4 text-rose-600" />
                                  <span>Failure Reason:</span>
                                </div>
                                <p className="font-mono text-[11px] whitespace-pre-wrap break-all text-rose-900 bg-white/70 p-2 rounded border border-rose-100">
                                  {log.errorMessage}
                                </p>
                              </div>
                            )}

                            {/* YouTube URL box if Success */}
                            {log.youtubeUrl && (
                              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-3">
                                <div className="space-y-0.5 truncate">
                                  <span className="font-bold text-emerald-900 block">YouTube Link Published:</span>
                                  <a
                                    href={log.youtubeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-700 underline font-mono text-[11px] truncate block">
                                    {log.youtubeUrl}
                                  </a>
                                </div>
                                <button
                                  onClick={() => handleCopy(log.youtubeUrl!, log.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded text-xs font-semibold text-emerald-800 hover:bg-emerald-100/50 transition shrink-0">
                                  {copiedId === log.id ? "Copied!" : "Copy URL"}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
