"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Film,
  Video,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Cloud,
  Laptop,
  Sparkles,
  ExternalLink,
  RefreshCw,
  ArrowRight,
  Clock,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Radio,
  HardDrive,
  Cpu,
  Layers,
  X,
  Sliders,
} from "lucide-react";
import { Youtube } from "@/components/icons/Youtube";
import { AutoWatermarkTemplateModal } from "@/components/AutoWatermarkTemplateModal";
import { UploadQueueDrawer } from "@/components/UploadQueueDrawer";
import { useUploadQueue } from "@/lib/upload-queue-store";
import { AutopilotRunRecord } from "@/lib/autopilot";

interface StorageInfo {
  targetPath: string;
  totalGB: number;
  freeGB: number;
  usedGB: number;
  freePercentage: number;
  status: "healthy" | "warning" | "critical";
  message: string;
}

interface DeviceItem {
  nodeId: string;
  label: string;
  isPrimary: boolean;
  isOnline: boolean;
  secondsAgo: number;
  lastHeartbeat: string;
  system: {
    hostname: string;
    platform: string;
    arch: string;
    cpus: number;
    cpuModel: string;
    totalMemoryGB: number;
    freeMemoryGB: number;
    storage: StorageInfo;
  };
}

interface YouTubeStatus {
  connected: boolean;
  channel: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    status: string;
  } | null;
  quota: {
    unitsUsedToday: number;
    unitsLimit: number;
    datePacific: string;
    remainingUnits: number;
    remainingVideosToday?: number;
    resetCountdown?: string;
    resetAtNpt?: string;
    extensionExpiryDate?: string;
    daysUntilExpiry?: number;
    isExpiringSoon?: boolean;
    isLiveGoogleMetric?: boolean;
  };
}

interface ZoomAccount {
  id: string;
  accountName: string;
  accountId: string;
  isActive: boolean;
  createdAt: string;
}

interface RecordingItem {
  id: string;
  topic: string;
  accountName?: string;
  recording_start: string;
  duration_minutes: number;
  file_size_bytes: number;
  status: "discovered" | "queued" | "downloading" | "watermarking" | "ready" | "uploading" | "uploaded" | "failed" | "skipped";
  youtube_video_id?: string;
  youtube_url?: string;
  error_message?: string;
  account?: {
    account_name?: string;
  };
}

interface AutopilotData {
  config: {
    enabled: boolean;
    morningScheduleNpt: string;
    eveningScheduleNpt: string;
    discordWebhookUrl: string;
    lastRunAt: string | null;
    lastRunStatus: string;
    lastRunMessage: string | null;
    lastRunDiscoveredCount: number;
    lastRunQueuedCount: number;
    lastRunUploadedCount: number;
  };
  runs?: AutopilotRunRecord[];
  nextRunNpt: string;
  activeAccountsCount: number;
  queuedRecordingsCount: number;
}

type ProcessingTarget = "local" | "cloud";

interface ToastItem {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function ZoomYouTubeDashboardPage() {
  const router = useRouter();
  const { user } = useUser();
  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  // Data State
  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [totalRecordingsCount, setTotalRecordingsCount] = useState<number>(0);
  const [ytStatus, setYtStatus] = useState<YouTubeStatus | null>(null);
  const [zoomAccounts, setZoomAccounts] = useState<ZoomAccount[]>([]);
  const [autopilotData, setAutopilotData] = useState<AutopilotData | null>(null);
  const [devices, setDevices] = useState<DeviceItem[]>([]);

  // Processing Target & Worker
  const [processingTarget, setProcessingTarget] = useState<ProcessingTarget>("cloud");
  const [triggeringRunner, setTriggeringRunner] = useState(false);
  const [scanningZoom, setScanningZoom] = useState(false);
  const [togglingAutopilot, setTogglingAutopilot] = useState(false);
  const [actionLoadingRunId, setActionLoadingRunId] = useState<string | null>(null);

  // Modals & Drawers
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showHardwareDetails, setShowHardwareDetails] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 7000);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Shared Upload Queue store
  const {
    queue: uploadQueue,
    drawerOpen: queueDrawerOpen,
    setDrawerOpen: setQueueDrawerOpen,
    currentResolution,
    setQueueResolution,
    currentWatermarkPreset,
    setQueueWatermarkPreset,
    removeFromQueue: handleRemoveFromQueue,
    retryQueueItem: handleRetryQueueItem,
    clearCompleted: handleClearCompletedQueue,
    startDirectProcessing: handleStartDirectProcessing,
  } = useUploadQueue();

  // Load Saved Target Preference
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

  // Primary Data Fetch
  const fetchAllData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setLoading(true);
    try {
      const [recRes, ytRes, zoomRes, autoRes, devRes] = await Promise.all([
        fetch("/api/zoom-youtube/recordings", { cache: "no-store" }),
        fetch("/api/zoom-youtube/youtube/status", { cache: "no-store" }),
        fetch("/api/zoom-youtube/zoom/accounts", { cache: "no-store" }),
        fetch("/api/zoom-youtube/autopilot", { cache: "no-store" }),
        fetch("/api/zoom-youtube/devices", { cache: "no-store" }),
      ]);

      const [recData, ytData, zoomData, autoData, devData] = await Promise.all([
        recRes.ok ? recRes.json().catch(() => null) : null,
        ytRes.ok ? ytRes.json().catch(() => null) : null,
        zoomRes.ok ? zoomRes.json().catch(() => null) : null,
        autoRes.ok ? autoRes.json().catch(() => null) : null,
        devRes.ok ? devRes.json().catch(() => null) : null,
      ]);

      if (recData?.success) {
        setRecordings(recData.recordings || []);
        setTotalRecordingsCount(recData.total ?? recData.recordings?.length ?? 0);
      }
      if (ytData?.success) setYtStatus(ytData);
      if (zoomData?.success) setZoomAccounts(zoomData.accounts || []);
      if (autoData?.success) setAutopilotData(autoData);
      if (devData?.success) setDevices(devData.devices || []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchAllData();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Today Date Calculation (Nepal Time)
  const todayNepalStr = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kathmandu",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  }, []);

  const getRecordDateNepal = useCallback((dateStr: string) => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kathmandu",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(dateStr));
    } catch {
      return "";
    }
  }, []);

  // Filtered Sets for Overview
  const todayRecordings = useMemo(() => {
    return recordings.filter((r) => getRecordDateNepal(r.recording_start) === todayNepalStr);
  }, [recordings, todayNepalStr, getRecordDateNepal]);

  const uploadedTodayCount = useMemo(() => {
    return todayRecordings.filter((r) => r.status === "uploaded" || Boolean(r.youtube_url)).length;
  }, [todayRecordings]);

  const queuedTodayCount = useMemo(() => {
    return todayRecordings.filter((r) => r.status === "queued").length;
  }, [todayRecordings]);

  // Backlog queue (all active or waiting jobs)
  const activeBacklog = useMemo(() => {
    return recordings.filter((r) =>
      ["queued", "downloading", "watermarking", "uploading", "ready"].includes(r.status)
    );
  }, [recordings]);

  // Recent uploads (Top 5 finished videos with YouTube links)
  const recentUploads = useMemo(() => {
    return recordings
      .filter((r) => r.status === "uploaded" || Boolean(r.youtube_url))
      .slice(0, 5);
  }, [recordings]);

  // Action: Trigger Cloud Runner
  const handleTriggerCloudRunner = async () => {
    setTriggeringRunner(true);
    try {
      const res = await fetch("/api/zoom-youtube/workflow/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual batch trigger from Dashboard operations" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: "success",
          title: "Cloud Runner Dispatched",
          message: "GitHub Actions runner is booting up now. It will process all queued videos sequentially.",
          action: {
            label: "View Live Runs ↗",
            onClick: () => window.open("https://github.com/bibeknayaju/zoom-yt/actions", "_blank"),
          },
        });
        await fetchAllData();
      } else {
        showToast({
          type: "error",
          title: "Dispatch Failed",
          message: data.message || "Ensure GITHUB_PAT has Actions Read/Write permissions.",
        });
      }
    } catch (err) {
      showToast({
        type: "error",
        title: "Connection Error",
        message: err instanceof Error ? err.message : "Failed to trigger workflow",
      });
    } finally {
      setTriggeringRunner(false);
    }
  };

  // Action: Scan Zoom Now
  const handleScanZoomNow = async () => {
    setScanningZoom(true);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger", reason: "Manual scan from Dashboard" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: "success",
          title: "Zoom Scan Complete",
          message: data.message || `Discovered ${data.totalDiscoveredToday || 0} classes for today (${data.newlyQueuedCount || 0} newly queued).`,
        });
        await fetchAllData();
      } else {
        showToast({
          type: "error",
          title: "Scan Failed",
          message: data.error || "Failed to scan Zoom accounts",
        });
      }
    } catch (err) {
      showToast({
        type: "error",
        title: "Scan Error",
        message: err instanceof Error ? err.message : "Failed to scan Zoom",
      });
    } finally {
      setScanningZoom(false);
    }
  };

  // Action: Toggle Auto-Pilot ON/OFF
  const handleToggleAutopilot = async () => {
    if (!autopilotData) return;
    const nextState = !autopilotData.config.enabled;
    setTogglingAutopilot(true);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", enabled: nextState }),
      });
      const data = await res.json();
      if (data.success) {
        setAutopilotData((prev) =>
          prev
            ? {
                ...prev,
                config: {
                  ...prev.config,
                  enabled: nextState,
                },
              }
            : null
        );
        showToast({
          type: "info",
          title: nextState ? "Auto-Pilot Activated" : "Auto-Pilot Paused",
          message: nextState
            ? "Scheduled scans will run daily at 7:00 AM & 11:00 PM NPT."
            : "Automatic scheduled runs are temporarily paused.",
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Toggle Failed",
        message: "Failed to update Auto-Pilot state",
      });
    } finally {
      setTogglingAutopilot(false);
    }
  };

  // Action: Resolve Stuck Run
  const handleResolveRun = async (runId: string, status: "success" | "failed" = "success") => {
    setActionLoadingRunId(runId);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_run", runId, status }),
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: "success",
          title: "Run Status Updated",
          message: `Run marked as ${status.toUpperCase()} successfully.`,
        });
        await fetchAllData();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve run");
    } finally {
      setActionLoadingRunId(null);
    }
  };

  // Action: Stop Run & Cancel GitHub Action
  const handleStopRun = async (runId: string) => {
    if (!confirm("Are you sure you want to stop this run? This will abort any active GitHub Actions workflow runner.")) {
      return;
    }
    setActionLoadingRunId(runId);
    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop_run", runId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: "warning",
          title: "Workflow Run Cancelled",
          message: "Active cloud runner was terminated.",
        });
        await fetchAllData();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to stop run");
    } finally {
      setActionLoadingRunId(null);
    }
  };

  // Quota Metrics
  const quotaLimit = ytStatus?.quota?.unitsLimit ?? 48000;
  const quotaUsed = ytStatus?.quota?.unitsUsedToday ?? 0;
  const quotaPct = Math.min(100, Math.round((quotaUsed / quotaLimit) * 100));
  const uploadsRemaining = ytStatus?.quota?.remainingVideosToday ?? Math.max(0, Math.floor((quotaLimit - quotaUsed) / 1600));

  // Auto-Pilot latest run
  const latestAutopilotRun = autopilotData?.runs?.[0] || null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
      {/* 1. Executive Operations Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              VidShuttle Studio Operations
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Pipeline Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Executive overview of automated Zoom class discovery, watermark branding, and scheduled YouTube uploads.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Target Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-zinc-900/60 p-1 rounded-xl border border-slate-200/80 dark:border-white/[0.08] shadow-xs">
            <button
              type="button"
              onClick={() => handleSetProcessingTarget("cloud")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                processingTarget === "cloud"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}>
              <Cloud className="w-3.5 h-3.5" />
              <span>Cloud (GitHub)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetProcessingTarget("local")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                processingTarget === "local"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white"
              }`}>
              <Laptop className="w-3.5 h-3.5" />
              <span>Local Laptop</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTemplateModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-500/25 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/50 transition shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Watermark Template</span>
          </button>

          <button
            type="button"
            onClick={() => fetchAllData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-900/60 border border-slate-200/80 dark:border-white/[0.08] rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition shadow-xs disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Executive Stat Cards (Row of 4 Key Counts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Today's Classes */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/[0.15] transition">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Today&apos;s Classes
              </span>
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <Film className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {uploadedTodayCount} / {todayRecordings.length}
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Uploaded
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
              {queuedTodayCount > 0
                ? `${queuedTodayCount} queued for upload`
                : "All today's discovered classes published"}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <Link
              href="/dashboard/discovered"
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              <span>View Discovered Classes ({totalRecordingsCount || 162})</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Metric 2: YouTube Daily Quota */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/[0.15] transition">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Daily YouTube Quota
              </span>
              <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <Youtube className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {quotaUsed.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                / {quotaLimit.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1">
              ~{uploadsRemaining} uploads left today ({quotaPct}% used)
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <Link
              href="/dashboard/admin"
              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
              <span>Quota &amp; Channel Status</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Metric 3: Zoom Cloud Accounts */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/[0.15] transition">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Zoom Cloud Accounts
              </span>
              <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <Video className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {zoomAccounts.length}
              </span>
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                Connected
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 truncate">
              {zoomAccounts.length > 0
                ? zoomAccounts.map((a) => a.accountName).join(", ")
                : "No Zoom S2S accounts connected"}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <Link
              href="/dashboard/zoom-accounts"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              <span>Manage Zoom Accounts</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Metric 4: Auto-Pilot Scheduler */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-4 shadow-xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-white/[0.15] transition">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Auto-Pilot Scheduler
              </span>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <Zap className="w-4 h-4 fill-amber-500/20" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {autopilotData?.config.enabled ? "Active" : "Paused"}
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                7:00 AM &amp; 11:00 PM
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 truncate">
              Next: {autopilotData?.nextRunNpt || "Daily batches"}
            </p>
          </div>
          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <Link
              href="/dashboard/activity?tab=autopilot"
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline">
              <span>View Batch History</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Primary Operations Grid (Auto-Pilot Hub & YouTube Monitor) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Auto-Pilot Command Center (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                  <Zap className="w-4 h-4 fill-current" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Auto-Pilot Cloud Pipeline
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Discovers new Zoom recordings, stamps bottom-right watermark, and uploads to YouTube.
                  </p>
                </div>
              </div>

              {/* ON/OFF Switch */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-zinc-300">
                  {autopilotData?.config.enabled ? "Enabled" : "Paused"}
                </span>
                <button
                  type="button"
                  onClick={handleToggleAutopilot}
                  disabled={togglingAutopilot}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    autopilotData?.config.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-zinc-800"
                  }`}>
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autopilotData?.config.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleTriggerCloudRunner}
                disabled={triggeringRunner}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl transition shadow-xs disabled:opacity-50">
                {triggeringRunner ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                <span>
                  {activeBacklog.length > 0
                    ? `Run Cloud Batch (${activeBacklog.length} queued)`
                    : "Run Cloud Runner Now"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleScanZoomNow}
                disabled={scanningZoom}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-900/60 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-xl transition border border-slate-200/80 dark:border-white/[0.08] disabled:opacity-50">
                {scanningZoom ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>Scan Zoom Now</span>
              </button>

              <a
                href="https://github.com/bibeknayaju/zoom-yt/actions"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition">
                <span>GitHub Actions ↗</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Latest Run Snapshot */}
            {latestAutopilotRun && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-white/[0.05] space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        latestAutopilotRun.status === "success"
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/20"
                          : latestAutopilotRun.status === "running"
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/20"
                          : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-500/20"
                      }`}>
                      {latestAutopilotRun.status === "success" && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />}
                      {latestAutopilotRun.status === "running" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                      {latestAutopilotRun.status.toUpperCase()}
                    </span>

                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                      Latest Batch:{" "}
                      {new Date(latestAutopilotRun.runAt).toLocaleString("en-US", {
                        timeZone: "Asia/Kathmandu",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}{" "}
                      NPT
                    </span>
                  </div>

                  {/* Actions if currently running */}
                  {latestAutopilotRun.status === "running" && (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={actionLoadingRunId === latestAutopilotRun.id}
                        onClick={() => handleResolveRun(latestAutopilotRun.id, "success")}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50">
                        {actionLoadingRunId === latestAutopilotRun.id ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        )}
                        <span>Mark Done</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionLoadingRunId === latestAutopilotRun.id}
                        onClick={() => handleStopRun(latestAutopilotRun.id)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50">
                        {actionLoadingRunId === latestAutopilotRun.id ? (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        ) : (
                          <XCircle className="w-2.5 h-2.5" />
                        )}
                        <span>Stop</span>
                      </button>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-600 dark:text-zinc-400 truncate">
                  {latestAutopilotRun.summary}
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between text-xs text-slate-500 dark:text-zinc-400">
            <span>
              Next Scheduled Batch:{" "}
              <strong className="text-slate-800 dark:text-zinc-200">
                {autopilotData?.nextRunNpt || "Daily 7:00 AM & 11:00 PM"}
              </strong>
            </span>
            <Link
              href="/dashboard/activity?tab=autopilot"
              className="font-semibold text-slate-700 dark:text-zinc-300 hover:underline">
              All Runs ({autopilotData?.runs?.length || 0}) &rarr;
            </Link>
          </div>
        </div>

        {/* Right Column: YouTube Target & Live Quota Health (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Target YouTube Channel
                </h3>
              </div>

              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/80 dark:border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" />
                AES-256 Connected
              </span>
            </div>

            {/* Channel Snapshot */}
            <div className="flex items-center gap-3">
              {ytStatus?.channel?.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ytStatus.channel.thumbnailUrl}
                  alt={ytStatus.channel.title}
                  className="w-12 h-12 rounded-full border border-red-500/30 object-cover shadow-xs"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500">
                  <Youtube className="w-6 h-6" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {ytStatus?.channel?.title || "Connected Channel"}
                </h4>
                <p className="text-[11px] font-mono text-slate-400 dark:text-zinc-500 truncate">
                  {ytStatus?.channel?.id || "Configured in Environment"}
                </p>
              </div>
            </div>

            {/* Quota Progress Bar */}
            <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-white/[0.05]">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-600 dark:text-zinc-300">Daily Consumption:</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {quotaUsed.toLocaleString()} / {quotaLimit.toLocaleString()} units
                </span>
              </div>

              <div className="w-full bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    quotaPct > 90 ? "bg-rose-500" : quotaPct > 70 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.max(4, quotaPct)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400 pt-0.5">
                <span>{uploadsRemaining} uploads left today</span>
                {ytStatus?.quota?.resetCountdown && (
                  <span>Resets in {ytStatus.quota.resetCountdown}</span>
                )}
              </div>
            </div>

            {/* 48K Extension pill if available */}
            {ytStatus?.quota?.daysUntilExpiry !== undefined && (
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/30 border border-slate-100 dark:border-white/[0.05]">
                <div className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>48K Quota Extension</span>
                </div>
                <a
                  href="https://console.cloud.google.com/iam-admin/quotas"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1">
                  <span>~{ytStatus.quota.daysUntilExpiry} days left</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
            <Link
              href="/dashboard/admin"
              className="text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white">
              Admin &amp; Quota Settings
            </Link>

            <a
              href="/api/zoom-youtube/youtube/auth"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
              <span>Switch Channel</span>
              <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* 4. Live Highlights (Two 5-Item Overview Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Panel 1: Processing Backlog (6 cols) */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Active Upload Queue
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/20">
                  {activeBacklog.length} in queue
                </span>
              </div>

              <Link
                href="/dashboard/discovered"
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                View Discovered ({totalRecordingsCount || recordings.length}) &rarr;
              </Link>
            </div>

            {activeBacklog.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
                <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Active Upload Queue is Empty
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-xs mx-auto">
                  0 videos waiting in active runner queue. All of today&apos;s classes have already been watermarked and uploaded to YouTube.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeBacklog.slice(0, 5).map((rec) => (
                  <div
                    key={rec.id}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-zinc-900/30 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <h5 className="font-semibold text-slate-900 dark:text-white truncate">
                        {rec.topic}
                      </h5>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        <span className="font-bold text-slate-700 dark:text-zinc-300">
                          {rec.account?.account_name || rec.accountName || "Zoom"}
                        </span>
                        <span>•</span>
                        <span>{rec.duration_minutes} min</span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        rec.status === "uploading" || rec.status === "watermarking" || rec.status === "downloading"
                          ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/20 animate-pulse"
                          : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-500/20"
                      }`}>
                      {rec.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <Link
              href="/dashboard/discovered"
              className="w-full text-center block text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white">
              Open Full Discovered Video Catalog &amp; Batch Selector &rarr;
            </Link>
          </div>
        </div>

        {/* Panel 2: Recent Uploaded Classes (6 cols) */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Youtube className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent YouTube Uploads
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-500/20">
                  {recentUploads.length} shown
                </span>
              </div>

              <Link
                href="/dashboard/activity"
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
                Full Activity Logs &rarr;
              </Link>
            </div>

            {recentUploads.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Film className="w-8 h-8 text-slate-400 mx-auto opacity-70" />
                <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  No Uploads Recorded Today
                </p>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-xs mx-auto">
                  New uploaded videos with YouTube links will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentUploads.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-zinc-900/30 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <h5 className="font-semibold text-slate-900 dark:text-white truncate">
                        {rec.topic}
                      </h5>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        <span className="font-bold text-slate-700 dark:text-zinc-300">
                          {rec.account?.account_name || rec.accountName || "Zoom"}
                        </span>
                        <span>•</span>
                        <span>{rec.duration_minutes} min</span>
                        <span>•</span>
                        <span>
                          {new Date(rec.recording_start).toLocaleString("en-US", {
                            timeZone: "Asia/Kathmandu",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          NPT
                        </span>
                      </div>
                    </div>

                    {rec.youtube_url ? (
                      <a
                        href={rec.youtube_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200/80 dark:border-emerald-500/20 transition shrink-0">
                        <span>Watch</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[10px] text-slate-400">Processing...</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-white/[0.06]">
            <Link
              href="/dashboard/activity"
              className="w-full text-center block text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white">
              View Complete Audit Trail in Activity Logs &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* 5. Discreet System Infrastructure Accordion */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-zinc-950/40 overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowHardwareDetails(!showHardwareDetails)}
          className="w-full px-5 py-3 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition bg-slate-50/50 dark:bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>Infrastructure: GitHub Actions Cloud Runner • {devices.length} Registered Node{devices.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span>{showHardwareDetails ? "Hide Details" : "View Hardware & Storage Specs"}</span>
            {showHardwareDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {showHardwareDetails && (
          <div className="p-5 border-t border-slate-200/80 dark:border-white/[0.08] space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {devices.map((dev) => (
                <div
                  key={dev.nodeId}
                  className="p-3.5 rounded-xl border border-slate-200/80 dark:border-white/[0.06] bg-slate-50 dark:bg-zinc-900/30 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">{dev.label}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        dev.isOnline ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "text-slate-400 bg-slate-100 dark:bg-zinc-900"
                      }`}>
                      {dev.isOnline ? "ONLINE" : "OFFLINE"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                    Host: {dev.system?.hostname} • {dev.system?.platform}
                  </p>
                  {dev.system?.storage && (
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-300 pt-1 border-t border-slate-100 dark:border-white/[0.05]">
                      <span>Free Disk: {dev.system.storage.freeGB} GB ({dev.system.storage.freePercentage}%)</span>
                      <span>Total: {dev.system.storage.totalGB} GB</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Persistent Modals & Drawers */}
      <AutoWatermarkTemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSaved={(tpl) => {
          if (tpl.watermarkType && setQueueWatermarkPreset) {
            setQueueWatermarkPreset(tpl.watermarkType);
          }
          if (tpl.selectedResolution && setQueueResolution) {
            setQueueResolution(tpl.selectedResolution);
          }
        }}
      />

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

      {/* Floating Modern Toast Alerts */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl shadow-2xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-3 flex items-start gap-3 ${
              toast.type === "success"
                ? "bg-slate-900/95 text-white border-emerald-500/50 ring-1 ring-emerald-500/20"
                : toast.type === "error"
                ? "bg-slate-900/95 text-white border-rose-500/50 ring-1 ring-rose-500/20"
                : toast.type === "warning"
                ? "bg-slate-900/95 text-white border-amber-500/50 ring-1 ring-amber-500/20"
                : "bg-slate-900/95 text-white border-indigo-500/50 ring-1 ring-indigo-500/20"
            }`}>
            <div className="shrink-0 mt-0.5">
              {toast.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : toast.type === "error" ? (
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              ) : toast.type === "warning" ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <Cloud className="w-4 h-4 text-indigo-400" />
              )}
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <h5 className="text-xs font-bold tracking-wide">{toast.title}</h5>
              {toast.message && (
                <p className="text-[11px] text-slate-300 leading-relaxed">{toast.message}</p>
              )}
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    removeToast(toast.id);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 px-2.5 py-1 rounded-lg transition shadow-xs">
                  <span>{toast.action.label}</span>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-white p-0.5 rounded transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
