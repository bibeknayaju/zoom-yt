"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Laptop,
  HardDrive,
  Cpu,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Star,
  ShieldCheck,
  Radio,
  ExternalLink,
  Trash2,
  Video,
  Plus,
  Key,
  Loader2,
  Film,
  Play,
  DownloadCloud,
  Clock,
  Sparkles,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { Youtube } from "@/components/icons/Youtube";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { AutoWatermarkTemplateModal } from "@/components/AutoWatermarkTemplateModal";
import { WatermarkStudio } from "@/components/WatermarkStudio";
import { useUploadQueue, DirectUploadQueueItem, buildWatermarkConfig } from "@/lib/upload-queue-store";
import { UploadQueueDrawer } from "@/components/UploadQueueDrawer";
import { ActivityLogsSection } from "@/components/ActivityLogsSection";


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
}

export default function ZoomYouTubeDashboardPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [primaryNodeId, setPrimaryNodeId] = useState<string | null>(null);
  const [ytStatus, setYtStatus] = useState<YouTubeStatus | null>(null);
  const [zoomAccounts, setZoomAccounts] = useState<ZoomAccount[]>([]);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [syncingRecordings, setSyncingRecordings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAddZoom, setShowAddZoom] = useState(false);
  const [newZoom, setNewZoom] = useState({
    accountName: "",
    accountId: "",
    clientId: "",
    clientSecret: "",
  });
  const [savingZoom, setSavingZoom] = useState(false);
  const [testingZoomId, setTestingZoomId] = useState<string | null>(null);
  const [zoomTestMsg, setZoomTestMsg] = useState<Record<string, string>>({});
  const [selectedZoomAccountForBrowse, setSelectedZoomAccountForBrowse] = useState<ZoomAccount | null>(null);
  const [browsedRecordings, setBrowsedRecordings] = useState<any[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [processingFileId, setProcessingFileId] = useState<string | null>(null);
  const [processStatusMsg, setProcessStatusMsg] = useState<Record<string, string>>({});
  const [activeStudioRecording, setActiveStudioRecording] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingNode, setUpdatingNode] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [modalAutoWatermark, setModalAutoWatermark] = useState(true);
  const [recWatermarkOverrides, setRecWatermarkOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [devRes, ytRes, zoomRes, recRes] = await Promise.all([
        fetch("/api/zoom-youtube/devices"),
        fetch("/api/zoom-youtube/youtube/status"),
        fetch("/api/zoom-youtube/zoom/accounts"),
        fetch("/api/zoom-youtube/recordings"),
      ]);

      const devData = devRes.ok ? await devRes.json().catch(() => null) : null;
      if (devData?.success) {
        setDevices(devData.devices || []);
        setPrimaryNodeId(devData.primaryNodeId);
      } else if (devRes.status === 401) {
        setError("Session expired. Please sign in again.");
      } else if (devData?.error) {
        setError(devData.error);
      }

      const ytData = ytRes.ok ? await ytRes.json().catch(() => null) : null;
      if (ytData?.success) {
        setYtStatus(ytData);
      }

      const zoomData = zoomRes.ok ? await zoomRes.json().catch(() => null) : null;
      if (zoomData?.success) {
        setZoomAccounts(zoomData.accounts || []);
      }

      const recData = recRes.ok ? await recRes.json().catch(() => null) : null;
      if (recData?.success) {
        setRecordings(recData.recordings || []);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchStatus();
      }
    }, 25000); // Poll every 25s when tab is visible
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleSetPrimary = async (nodeId: string) => {
    try {
      setUpdatingNode(nodeId);
      const res = await fetch("/api/zoom-youtube/devices/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      });
      const data = await res.json();
      if (data.success) {
        setPrimaryNodeId(data.primaryNodeId);
        // Refresh local view immediately
        setDevices((prev) =>
          prev.map((d) => ({
            ...d,
            isPrimary: d.nodeId === nodeId,
          })),
        );
      } else {
        alert(data.error || "Failed to update primary device");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error updating primary";
      alert(msg);
    } finally {
      setUpdatingNode(null);
    }
  };

  const handleDeleteDevice = async (nodeId: string) => {
    if (!confirm(`Remove device "${nodeId}" from monitoring list?`)) return;
    try {
      const res = await fetch(`/api/zoom-youtube/devices?nodeId=${encodeURIComponent(nodeId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setDevices((prev) => prev.filter((d) => d.nodeId !== nodeId));
        if (data.primaryNodeId) setPrimaryNodeId(data.primaryNodeId);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error removing device");
    }
  };

  const handleAddZoomAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingZoom(true);
    try {
      const res = await fetch("/api/zoom-youtube/zoom/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newZoom),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || "Zoom account connected successfully!");
        setNewZoom({ accountName: "", accountId: "", clientId: "", clientSecret: "" });
        setShowAddZoom(false);
        fetchStatus();
      } else {
        alert(data.error || "Failed to add Zoom account");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error connecting to Zoom");
    } finally {
      setSavingZoom(false);
    }
  };

  const handleTestZoomAccount = async (id: string) => {
    setTestingZoomId(id);
    try {
      const res = await fetch("/api/zoom-youtube/zoom/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        setZoomTestMsg((prev) => ({
          ...prev,
          [id]: `Connected! Found ${data.usersCount} active users (${data.sampleUsers?.map((u: any) => u.email).slice(0, 2).join(", ")})`,
        }));
      } else {
        setZoomTestMsg((prev) => ({
          ...prev,
          [id]: `Error: ${data.error}`,
        }));
      }
    } catch (err: unknown) {
      setZoomTestMsg((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Test request failed",
      }));
    } finally {
      setTestingZoomId(null);
    }
  };

  const handleDeleteZoomAccount = async (id: string, name: string) => {
    if (!confirm(`Delete Zoom account "${name}"?`)) return;
    try {
      const res = await fetch(`/api/zoom-youtube/zoom/accounts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setZoomAccounts((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert(data.error || "Failed to delete account");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error deleting account");
    }
  };

  const handleSyncRecordings = async () => {
    setSyncingRecordings(true);
    try {
      const res = await fetch("/api/zoom-youtube/recordings/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchStatus();
      } else {
        alert(data.error || "Sync failed");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Sync error");
    } finally {
      setSyncingRecordings(false);
    }
  };

  const handleUpdateRecordingStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/zoom-youtube/recordings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (data.success) {
        setRecordings((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: status as any } : r))
        );
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleBrowseZoomAccount = async (acc: ZoomAccount) => {
    setSelectedZoomAccountForBrowse(acc);
    setLoadingBrowse(true);
    setBrowsedRecordings([]);
    try {
      const res = await fetch(`/api/zoom-youtube/zoom/recordings?accountId=${encodeURIComponent(acc.id)}&days=30`);
      const data = await res.json();
      if (data.success) {
        setBrowsedRecordings(data.recordings || []);
        fetchStatus();
      } else {
        alert(data.error || "Failed to fetch recordings");
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error browsing recordings");
    } finally {
      setLoadingBrowse(false);
    }
  };

  const handleProcessSingleRecording = async (rec: any) => {
    const wmConfig = buildWatermarkConfig(currentWatermarkPreset);
    const isNoWm = !wmConfig?.type || wmConfig.type === "none";
    if (!confirm(isNoWm ? `Start downloading raw and uploading "${rec.topic}" to YouTube?` : `Start downloading, watermarking, and uploading "${rec.topic}" to YouTube?`)) return;
    setProcessingFileId(rec.fileId);
    setProcessStatusMsg((prev) => ({
      ...prev,
      [rec.fileId]: isNoWm ? "Downloading raw from Zoom & uploading..." : "Downloading from Zoom & applying watermark...",
    }));

    try {
      const res = await fetch("/api/zoom-youtube/recordings/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recording: rec,
          watermark: wmConfig,
          watermarkText: wmConfig?.text || "Union Education",
          resolution: isNoWm ? "original" : currentResolution,
        }),
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const errorJson = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
        throw new Error(errorJson.error || `Failed with status ${res.status}`);
      }

      let finalData: any = null;
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
                  finalData = data;
                  if (data.msg) {
                    setProcessStatusMsg((prev) => ({
                      ...prev,
                      [rec.fileId]: data.msg,
                    }));
                  }
                } catch {}
              }
            }
          }
        }
      }

      if (finalData?.success) {
        setProcessStatusMsg((prev) => ({
          ...prev,
          [rec.fileId]: `Uploaded! Link: ${finalData.youtubeUrl}`,
        }));
        alert(`Video successfully watermarked & uploaded to YouTube!\n\n${finalData.youtubeUrl}`);
        fetchStatus();
      } else {
        const errMsg = finalData?.error || "Processing failed";
        setProcessStatusMsg((prev) => ({
          ...prev,
          [rec.fileId]: `Failed: ${errMsg}`,
        }));
        alert(`Processing error: ${errMsg}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setProcessStatusMsg((prev) => ({
        ...prev,
        [rec.fileId]: `Error: ${msg}`,
      }));
      alert(msg);
    } finally {
      setProcessingFileId(null);
    }
  };

  // Shared persistent Upload Queue (synchronized with /studio)
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
  } = useUploadQueue(fetchStatus);

  const [enqueuingIds, setEnqueuingIds] = useState<Record<string, boolean>>({});
  const [enqueuingAll, setEnqueuingAll] = useState(false);
  const [triggeringRunner, setTriggeringRunner] = useState(false);

  const handleTriggerCloudRunner = async () => {
    setTriggeringRunner(true);
    try {
      const res = await fetch("/api/zoom-youtube/workflow/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual trigger from Dashboard UI button" }),
      });
      const data = await res.json();
      if (data.success) {
        alert("🚀 GitHub Actions runner has been triggered!\n\nProcessing all queued recordings in the cloud now. Check the Actions tab in your GitHub repository to view live progress.");
      } else {
        alert(data.message || "Failed to trigger runner. Ensure GITHUB_PAT is set in Vercel or trigger manually in GitHub Actions tab.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to trigger workflow";
      alert(msg);
    } finally {
      setTriggeringRunner(false);
    }
  };

  const handleEnqueueCloudRecordings = async (
    recsToEnqueue: any[],
    wmConfig?: any,
    resolution?: string
  ) => {
    if (recsToEnqueue.length === 0) return;
    const isSingle = recsToEnqueue.length === 1;
    const singleId = isSingle ? recsToEnqueue[0].fileId || recsToEnqueue[0].zoom_file_id : null;
    if (singleId) {
      setEnqueuingIds((prev) => ({ ...prev, [singleId]: true }));
    } else {
      setEnqueuingAll(true);
    }

    try {
      const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordings: recsToEnqueue,
          watermark: wmConfig || (modalAutoWatermark ? buildWatermarkConfig(currentWatermarkPreset) : { type: "none" }),
          resolution: resolution || (modalAutoWatermark ? currentResolution : "original"),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to enqueue recordings");
      }

      const enqueuedIds = new Set(
        recsToEnqueue.map((r) => r.fileId || r.zoom_file_id)
      );

      // Update browsed recordings status locally
      setBrowsedRecordings((prev) =>
        prev.map((r) =>
          enqueuedIds.has(r.fileId || r.zoom_file_id)
            ? { ...r, status: "queued" }
            : r
        )
      );

      // Also update main dashboard recordings table
      setRecordings((prev) =>
        prev.map((r) =>
          enqueuedIds.has((r as any).zoom_file_id || r.id)
            ? { ...r, status: "queued" as any }
            : r
        )
      );

      await fetchStatus();

      if (data.workflowTriggered) {
        alert(`⚡ Enqueued ${recsToEnqueue.length} recording(s)!\n\n🚀 GitHub Actions cloud runner was triggered immediately.`);
      } else {
        alert(`⏳ Enqueued ${recsToEnqueue.length} recording(s) in Supabase!\n\nℹ️ Note: To auto-trigger GitHub Actions on click, add GITHUB_PAT to your Vercel Environment Variables. Otherwise, it will process on your daily schedule (7:45 AM / 10:30 PM NPT) or when you click "Run Cloud Runner Now".`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to queue recordings";
      alert(msg);
    } finally {
      if (singleId) {
        setEnqueuingIds((prev) => ({ ...prev, [singleId]: false }));
      } else {
        setEnqueuingAll(false);
      }
    }
  };

  const handleCancelQueuedRecording = async (fileId: string) => {
    try {
      await fetch("/api/zoom-youtube/recordings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      setBrowsedRecordings((prev) =>
        prev.map((r) =>
          (r.fileId === fileId || r.zoom_file_id === fileId)
            ? { ...r, status: "discovered" }
            : r
        )
      );
      setRecordings((prev) =>
        prev.map((r) =>
          ((r as any).zoom_file_id === fileId || r.id === fileId)
            ? { ...r, status: "discovered" as any }
            : r
        )
      );
      await fetchStatus();
    } catch (err) {
      console.warn("Cancel queue error:", err);
    }
  };

  // Check if any device has storage warnings
  const storageWarnings = devices.filter(
    (d) => d.system?.storage?.status === "warning" || d.system?.storage?.status === "critical",
  );

  const { user } = useUser();
  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        userRole={userRole}
        userEmail={user?.primaryEmailAddress?.emailAddress}
        onOpenQueue={() => setQueueDrawerOpen(true)}
      />
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Cloud Recordings & Studio
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Browse Zoom cloud recordings, launch Watermark Studio, or run high-speed YouTube uploads.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowTemplateModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-amber-300 bg-amber-950/40 border border-amber-700/60 rounded-xl hover:bg-amber-900/50 hover:border-amber-600 transition shadow-sm">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Watermark Template</span>
            </button>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-200 bg-slate-900 border border-slate-700/80 rounded-xl hover:bg-slate-800 transition shadow-sm disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

      {/* Critical / Warning Storage Banner */}
      {storageWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-amber-800">
                Low Storage Warning Detected
              </h3>
              {storageWarnings.map((d) => (
                <p key={d.nodeId} className="text-xs text-amber-700">
                  <span className="font-medium">{d.label}</span> has only{" "}
                  <span className="font-bold">{d.system.storage.freeGB} GB</span> free storage
                  remaining (threshold: 20 GB). Consider freeing space or making another device primary.
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Device Management Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Laptop className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">
              Connected Worker Devices
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Active Primary:{" "}
            <span className="font-semibold text-indigo-600">
              {devices.find((d) => d.nodeId === primaryNodeId)?.label || "None set"}
            </span>
          </span>
        </div>

        {devices.length === 0 && !loading && (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <Laptop className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">No worker devices reported yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Run <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">npm run worker</code> on your Office Laptop or current machine to register storage.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {devices.map((device) => {
            const isPrimary = device.nodeId === primaryNodeId;
            const storage = device.system?.storage;
            const usedPct = storage?.totalGB
              ? Math.min(100, Math.round((storage.usedGB / storage.totalGB) * 100))
              : 0;

            const isLow = storage?.status === "warning" || storage?.status === "critical";

            return (
              <div
                key={device.nodeId}
                className={`relative rounded-xl border bg-white p-6 shadow-sm transition-all ${
                  isPrimary
                    ? "border-indigo-400 ring-2 ring-indigo-100"
                    : "border-slate-200 hover:border-slate-300"
                }`}>
                {/* Card Top: Node Info + Role Badge */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">{device.label}</h3>
                      {device.isOnline ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-600" /> Online
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Seen {device.secondsAgo}s ago
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Hostname: {device.system?.hostname} • {device.system?.platform} ({device.system?.arch})
                    </p>
                  </div>

                  {isPrimary ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-600 text-white px-3 py-1 rounded-full shadow-sm">
                      <Star className="w-3.5 h-3.5 fill-current" /> Primary Node
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                      Backup Standby
                    </span>
                  )}
                </div>

                {/* Storage Health Gauge */}
                {storage && (
                  <div className="rounded-lg bg-slate-50 p-4 border border-slate-100 mb-4 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <HardDrive className="w-4 h-4 text-slate-500" />
                        <span>Disk Storage</span>
                      </div>
                      <span className={isLow ? "text-amber-600 font-bold" : "text-emerald-700 font-bold"}>
                        {storage.freeGB} GB Free ({storage.freePercentage}%)
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          storage.status === "critical"
                            ? "bg-rose-500"
                            : storage.status === "warning"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>Used: {storage.usedGB} GB</span>
                      <span>Total: {storage.totalGB} GB</span>
                    </div>

                    {isLow && (
                      <p className="text-[11px] text-amber-700 font-medium pt-1">
                        ⚠️ {storage.message}
                      </p>
                    )}
                  </div>
                )}

                {/* Hardware Specs */}
                <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 mb-5">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-slate-400" />
                    <span>{device.system?.cpus} Cores ({device.system?.cpuModel?.slice(0, 18)})</span>
                  </div>
                  <div className="text-right">
                    <span>RAM: {device.system?.freeMemoryGB} GB free / {device.system?.totalMemoryGB} GB</span>
                  </div>
                </div>

                {/* Action: Set as Primary */}
                <div className="border-t pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      ID: <code className="text-slate-600">{device.nodeId}</code>
                    </span>
                    {!isPrimary && (
                      <button
                        onClick={() => handleDeleteDevice(device.nodeId)}
                        title="Remove device from monitoring list"
                        className="text-slate-300 hover:text-red-500 transition p-0.5 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {!isPrimary ? (
                    <button
                      onClick={() => handleSetPrimary(device.nodeId)}
                      disabled={updatingNode === device.nodeId}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3.5 py-1.5 rounded-lg transition disabled:opacity-50">
                      <Star className="w-3.5 h-3.5" />
                      {updatingNode === device.nodeId ? "Switching..." : "Set as Primary"}
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Active Worker
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* YouTube Connection Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {/* Channel Avatar or YouTube Icon */}
            {ytStatus?.channel?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ytStatus.channel.thumbnailUrl}
                alt={ytStatus.channel.title}
                className="w-14 h-14 rounded-full border-2 border-red-100 shadow-sm object-cover shrink-0"
              />
            ) : (
              <div
                className={`p-3.5 rounded-2xl border shrink-0 ${
                  ytStatus?.connected
                    ? "bg-red-50 text-red-600 border-red-100"
                    : "bg-slate-100 text-slate-400 border-slate-200"
                }`}>
                <Youtube className="w-7 h-7" />
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  YouTube Target
                </span>
                {ytStatus?.connected ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Connected
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Not Connected
                  </span>
                )}
              </div>

              {/* Prominent Channel Name */}
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">
                  {ytStatus?.channel?.title || "No Channel Connected"}
                </h3>
                {ytStatus?.channel?.id && ytStatus.channel.id !== "configured_in_env" && (
                  <a
                    href={`https://www.youtube.com/channel/${ytStatus.channel.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-red-600 transition"
                    title="Open on YouTube">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {ytStatus?.channel?.id && (
                <p className="text-xs text-slate-500 font-mono">
                  Channel ID: {ytStatus.channel.id}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                <span className="inline-flex items-center gap-1 text-slate-600 font-medium bg-slate-100 px-2.5 py-0.5 rounded-md">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> AES-256-GCM Encrypted
                </span>
                <span className="text-slate-600">
                  Daily Quota:{" "}
                  <strong className="text-slate-900">
                    {ytStatus?.quota?.unitsUsedToday ?? 0} / 48,000 units
                  </strong>{" "}
                  <span className="text-slate-400">(resets Midnight Pacific)</span>
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <a
              href="/api/zoom-youtube/youtube/auth"
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg shadow-sm transition ${
                ytStatus?.connected
                  ? "text-slate-700 bg-white border border-slate-300 hover:bg-slate-50"
                  : "text-white bg-red-600 hover:bg-red-700"
              }`}>
              <Youtube className="w-4 h-4 text-red-600" />
              {ytStatus?.connected ? "Switch / Reconnect Channel" : "Connect YouTube Channel"}
            </a>
          </div>
        </div>
      </div>

      {/* Zoom Accounts Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Zoom Cloud Accounts (Server-to-Server OAuth)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Connect your Zoom accounts to auto-discover and stream cloud recordings for watermarking.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddZoom(!showAddZoom)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition self-start sm:self-auto">
            <Plus className="w-4 h-4" />
            {showAddZoom ? "Close Form" : "Add Zoom S2S Account"}
          </button>
        </div>

        {/* Add Zoom Account Form */}
        {showAddZoom && (
          <form
            onSubmit={handleAddZoomAccount}
            className="rounded-xl border border-blue-200 bg-blue-50/40 p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-900">
              <Key className="w-4 h-4 text-blue-600" />
              <span>Connect New Zoom Server-to-Server App</span>
            </div>
            <p className="text-xs text-slate-600">
              Create a <strong>Server-to-Server OAuth</strong> app on{" "}
              <a
                href="https://marketplace.zoom.us/develop/create"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline font-medium">
                marketplace.zoom.us
              </a>
              . Ensure you grant the scope: <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-800">recording:read:admin</code>.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account Label / Nickname
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Union Education Account"
                  value={newZoom.accountName}
                  onChange={(e) => setNewZoom({ ...newZoom, accountName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Zoom Account ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. pI5GqK2..."
                  value={newZoom.accountId}
                  onChange={(e) => setNewZoom({ ...newZoom, accountId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Client ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. jB7aC9..."
                  value={newZoom.clientId}
                  onChange={(e) => setNewZoom({ ...newZoom, clientId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••••••"
                  value={newZoom.clientSecret}
                  onChange={(e) => setNewZoom({ ...newZoom, clientSecret: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddZoom(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition">
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingZoom}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50">
                {savingZoom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {savingZoom ? "Verifying with Zoom..." : "Save & Verify Connection"}
              </button>
            </div>
          </form>
        )}

        {/* Zoom Accounts List */}
        {zoomAccounts.length === 0 && !showAddZoom ? (
          <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <Video className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">No Zoom accounts connected yet</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Click &quot;Add Zoom S2S Account&quot; above to connect your first account.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {zoomAccounts.map((acc) => (
              <div
                key={acc.id}
                className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{acc.accountName}</h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Account ID: {acc.accountId}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active
                  </span>
                </div>

                {zoomTestMsg[acc.id] && (
                  <p className="text-xs text-blue-700 font-medium bg-blue-50 border border-blue-100 p-2 rounded-lg">
                    {zoomTestMsg[acc.id]}
                  </p>
                )}

                <div className="flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBrowseZoomAccount(acc)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow-sm transition">
                      <Film className="w-3.5 h-3.5" /> Browse Cloud Recordings
                    </button>

                    <button
                      onClick={() => handleTestZoomAccount(acc.id)}
                      disabled={testingZoomId === acc.id}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition disabled:opacity-50 px-2 py-1.5">
                      {testingZoomId === acc.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      {testingZoomId === acc.id ? "Testing..." : "Test"}
                    </button>
                  </div>

                  <button
                    onClick={() => handleDeleteZoomAccount(acc.id, acc.accountName)}
                    className="text-slate-400 hover:text-red-500 transition p-1"
                    title="Delete Account">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Browse Cloud Recordings Modal */}
      {selectedZoomAccountForBrowse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cloud Recordings: {selectedZoomAccountForBrowse.accountName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Browse recent classes from Zoom and choose which recording to download, watermark, and upload to YouTube.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {browsedRecordings.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                      {(["720p", "1080p", "480p"] as const).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQueueResolution(q)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition ${
                            currentResolution === q
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "text-slate-600 hover:text-slate-900"
                          }`}>
                          {q === "720p" ? "⚡ 720p" : q}
                        </button>
                      ))}
                    </div>
                    {/* Auto Watermark Default Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        const nextVal = !modalAutoWatermark;
                        setModalAutoWatermark(nextVal);
                        setRecWatermarkOverrides({});
                      }}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                        modalAutoWatermark
                          ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                      }`}
                      title={modalAutoWatermark ? "Auto-Watermark is ON for direct uploads. Click to turn OFF." : "Auto-Watermark is OFF (Raw Upload). Click to turn ON."}>
                      <Sparkles className={`w-3.5 h-3.5 ${modalAutoWatermark ? "text-amber-600" : "text-slate-400"}`} />
                      <span>{modalAutoWatermark ? "Auto WM: ON" : "No WM (Raw)"}</span>
                    </button>

                    <button
                      onClick={() => {
                        const unUploaded = browsedRecordings.filter(
                          (r) => r.status !== "uploaded" && !r.youtubeUrl && r.status !== "queued"
                        );
                        if (unUploaded.length === 0) {
                          alert("All recordings are already queued or uploaded!");
                          return;
                        }
                        handleEnqueueCloudRecordings(
                          unUploaded,
                          modalAutoWatermark ? buildWatermarkConfig(currentWatermarkPreset) : { type: "none" },
                          modalAutoWatermark ? currentResolution : "original"
                        );
                      }}
                      disabled={enqueuingAll}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg shadow-sm transition disabled:opacity-50">
                      {enqueuingAll ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      ) : (
                        <Youtube className="w-3.5 h-3.5 text-red-600" />
                      )}
                      <span>⚡ Queue All for Cloud Upload ({browsedRecordings.filter((r) => r.status !== "uploaded" && !r.youtubeUrl && r.status !== "queued").length})</span>
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setSelectedZoomAccountForBrowse(null)}
                  className="text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-200 text-sm font-bold transition">
                  ✕ Close
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {loadingBrowse ? (
                <div className="py-16 text-center text-slate-500 space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
                  <p className="text-sm font-medium">Scanning Zoom Cloud for meetings in the last 30 days...</p>
                </div>
              ) : browsedRecordings.length === 0 ? (
                <div className="py-16 text-center text-slate-500 space-y-2">
                  <Film className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-medium">No cloud recordings found for this account in the last 30 days.</p>
                  <p className="text-xs text-slate-400">Make sure cloud recording was enabled during the meeting and finished processing on Zoom.</p>
                </div>
              ) : (
                browsedRecordings.map((rec) => {
                  const isProcessing = processingFileId === rec.fileId;
                  const statusMsg = processStatusMsg[rec.fileId];
                  const toMB = (bytes: number) => Math.round(bytes / (1024 * 1024));
                  const queueItem = uploadQueue.find((q) => q.id === rec.fileId);
                  const queuePosition = queueItem && queueItem.status === "queued"
                    ? uploadQueue.filter((q) => q.status === "queued").findIndex((q) => q.id === rec.fileId) + 1
                    : null;

                  return (
                    <div
                      key={rec.fileId}
                      className="border border-slate-200 rounded-xl p-4 bg-white hover:border-blue-300 transition space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900">{rec.topic}</h4>
                            {rec.totalParts && rec.totalParts > 1 && (
                              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                                Part {rec.partNumber} of {rec.totalParts}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>Teacher: <strong className="text-slate-700">{rec.hostName}</strong></span>
                            <span>•</span>
                            <span>{new Date(rec.startTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            <span>•</span>
                            <span>{rec.durationMinutes} mins</span>
                            <span>•</span>
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-semibold">
                              📹 Video: {toMB(rec.fileSizeBytes)} MB
                            </span>
                            {rec.recordingType && (
                              <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                {rec.recordingType.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                          {rec.status === "uploaded" || rec.youtubeUrl ? (
                            <a
                              href={rec.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition shadow-sm">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Uploaded (View YT)</span>
                              <ExternalLink className="w-3 h-3 text-emerald-600" />
                            </a>
                          ) : rec.status === "downloading" || rec.status === "watermarking" || rec.status === "uploading" ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-xl">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                              <span className="capitalize">⚙️ Cloud: {rec.status}...</span>
                            </div>
                          ) : rec.status === "queued" ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>⏳ Queued for Cloud Runner</span>
                              <button
                                type="button"
                                onClick={() => handleCancelQueuedRecording(rec.fileId)}
                                className="text-slate-400 hover:text-red-500 font-bold ml-1 text-sm"
                                title="Cancel and unqueue">
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {(() => {
                                const isRowWm =
                                  recWatermarkOverrides[rec.fileId] !== undefined
                                    ? recWatermarkOverrides[rec.fileId]
                                    : modalAutoWatermark;
                                const isEnqueuing = Boolean(enqueuingIds[rec.fileId]);
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRecWatermarkOverrides((prev) => ({
                                          ...prev,
                                          [rec.fileId]: !isRowWm,
                                        }))
                                      }
                                      className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold border transition ${
                                        isRowWm
                                          ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                                          : "bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200"
                                      }`}
                                      title={
                                        isRowWm
                                          ? "Watermarking is enabled for this video. Click to upload raw."
                                          : "Watermarking is disabled. Click to enable Auto Watermark."
                                      }>
                                      {isRowWm ? (
                                        <>
                                          <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                                          <span>✨ WM: ON</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-slate-400 text-xs">🚫</span>
                                          <span>Raw</span>
                                        </>
                                      )}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleEnqueueCloudRecordings(
                                          [rec],
                                          isRowWm ? buildWatermarkConfig(currentWatermarkPreset) : { type: "none" },
                                          isRowWm ? currentResolution : "original"
                                        )
                                      }
                                      disabled={isEnqueuing}
                                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition hover:scale-[1.02] disabled:opacity-50">
                                      {isEnqueuing ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Youtube className="w-3.5 h-3.5 text-red-300" />
                                      )}
                                      <span>⚡ Queue for Cloud Upload</span>
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          <button
                            onClick={() => {
                              try {
                                sessionStorage.setItem("zoomyt_selected_recording", JSON.stringify(rec));
                              } catch {}
                              router.push("/dashboard/studio");
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl shadow-sm transition hover:scale-[1.02]">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>Watermark Studio</span>
                          </button>
                        </div>
                      </div>

                      {statusMsg && (
                        <p className={`text-xs p-2.5 rounded-lg font-medium ${
                          statusMsg.startsWith("Uploaded")
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : statusMsg.startsWith("Failed") || statusMsg.startsWith("Error")
                            ? "bg-red-50 text-red-800 border border-red-200"
                            : "bg-blue-50 text-blue-800 border border-blue-200"
                        }`}>
                          {statusMsg}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cloud Recordings Queue Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Class Cloud Recordings Queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically discovered from Zoom. Status progresses from discovered &rarr; downloaded &rarr; watermarked &rarr; uploaded.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <Link
              href="/dashboard/discovered"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg shadow-sm transition">
              <Film className="w-3.5 h-3.5" />
              <span>Full Discovered Page &amp; Pagination &rarr;</span>
            </Link>

            <button
              onClick={handleSyncRecordings}
              disabled={syncingRecordings}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50">
              {syncingRecordings ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <DownloadCloud className="w-4 h-4" />
              )}
              {syncingRecordings ? "Scanning Zoom Cloud..." : "Sync from Zoom Now"}
            </button>

            <button
              onClick={handleTriggerCloudRunner}
              disabled={triggeringRunner}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg shadow-sm transition disabled:opacity-50"
              title="Immediately triggers the GitHub Actions cloud runner to process all queued videos without waiting for scheduled times">
              {triggeringRunner ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
              )}
              <span>🚀 Run Cloud Runner Now</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          {["all", "queued", "discovered", "ready", "uploaded"].map((f) => {
            const count =
              f === "all"
                ? recordings.length
                : recordings.filter((r) => r.status === f).length;
            const active = statusFilter === f;
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-lg capitalize transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}>
                {f} ({count})
              </button>
            );
          })}
        </div>

        {/* Recordings Table */}
        {recordings.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <Film className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">No recordings in queue yet</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Click &quot;Sync from Zoom Now&quot; above to scan your recent classes from {zoomAccounts[0]?.accountName || "Zoom"}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b">
                <tr>
                  <th className="py-3 px-3">Topic / Class</th>
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Duration</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recordings
                  .filter((r) => statusFilter === "all" || r.status === statusFilter)
                  .map((rec) => {
                    const toMB = (bytes: number) =>
                      bytes ? `${Math.round(bytes / (1024 * 1024))} MB` : "-";

                    const badgeColors: Record<string, string> = {
                      discovered: "bg-amber-50 text-amber-700 border-amber-200",
                      queued: "bg-blue-50 text-blue-700 border-blue-200 font-bold",
                      downloading: "bg-blue-50 text-blue-700 border-blue-200 animate-pulse",
                      watermarking: "bg-purple-50 text-purple-700 border-purple-200",
                      ready: "bg-cyan-50 text-cyan-700 border-cyan-200",
                      uploading: "bg-indigo-50 text-indigo-700 border-indigo-200 animate-pulse",
                      uploaded: "bg-emerald-50 text-emerald-700 border-emerald-200",
                      skipped: "bg-slate-100 text-slate-500 border-slate-200",
                      failed: "bg-rose-50 text-rose-700 border-rose-200",
                    };

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 max-w-xs truncate">
                            {rec.topic}
                          </div>
                          {rec.accountName && (
                            <span className="text-[10px] text-slate-400">
                              {rec.accountName}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {new Date(rec.recording_start).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                          {rec.duration_minutes} min
                        </td>
                        <td className="py-3 px-3 text-slate-600 whitespace-nowrap font-mono">
                          {toMB(rec.file_size_bytes)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full border capitalize ${
                              badgeColors[rec.status] || "bg-slate-100 text-slate-600"
                            }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {rec.youtube_url ? (
                            <a
                              href={rec.youtube_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 transition">
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Watch
                            </a>
                          ) : rec.status === "queued" ? (
                            <div className="inline-flex items-center gap-2">
                              <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                ⏳ Queued for Cloud
                              </span>
                              <button
                                onClick={() => handleCancelQueuedRecording((rec as any).zoom_file_id || rec.id)}
                                className="text-xs text-red-600 hover:text-red-800 font-medium transition">
                                Cancel
                              </button>
                            </div>
                          ) : rec.status === "discovered" || rec.status === "ready" ? (
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() =>
                                  handleEnqueueCloudRecordings([
                                    {
                                      fileId: (rec as any).zoom_file_id || rec.id,
                                      topic: rec.topic,
                                      downloadUrl: (rec as any).download_url || (rec as any).downloadUrl,
                                      zoomAccountId: (rec as any).zoom_account_id || (rec as any).zoomAccountId || zoomAccounts[0]?.id,
                                      startTime: rec.recording_start,
                                      fileSizeBytes: rec.file_size_bytes,
                                      durationMinutes: rec.duration_minutes,
                                    },
                                  ])
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 rounded-md transition shadow-sm">
                                <Youtube className="w-3 h-3 text-red-300" />
                                Queue for Cloud
                              </button>
                              <button
                                onClick={() => {
                                  const sel = {
                                    fileId: (rec as any).zoom_file_id || rec.id,
                                    topic: rec.topic,
                                    downloadUrl: (rec as any).download_url || (rec as any).downloadUrl,
                                    zoomAccountId: (rec as any).zoom_account_id || (rec as any).zoomAccountId || zoomAccounts[0]?.id,
                                    startTime: rec.recording_start,
                                    fileSizeBytes: rec.file_size_bytes,
                                    durationMinutes: rec.duration_minutes,
                                  };
                                  try {
                                    sessionStorage.setItem("zoomyt_selected_recording", JSON.stringify(sel));
                                  } catch {}
                                  router.push("/dashboard/studio");
                                }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2 py-1 rounded-md transition">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                Studio
                              </button>
                              <button
                                onClick={() => handleUpdateRecordingStatus(rec.id, "skipped")}
                                className="text-xs text-slate-400 hover:text-slate-600 transition">
                                Skip
                              </button>
                            </div>
                          ) : rec.status === "skipped" ? (
                            <button
                              onClick={() => handleUpdateRecordingStatus(rec.id, "discovered")}
                              className="text-xs text-slate-500 hover:text-slate-700 font-medium transition">
                              Unskip
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      
      {/* Activity Logs & Upload Audit History Section */}
      <ActivityLogsSection />

      {/* Shared Persistent Floating Upload Queue Drawer */}
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
      </div>
    </div>
  );
}
