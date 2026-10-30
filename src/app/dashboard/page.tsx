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
  Cloud,
  X,
  Info,
  ArrowRight,
} from "lucide-react";
import { Youtube } from "@/components/icons/Youtube";
import { useUser } from "@clerk/nextjs";
import { AutoWatermarkTemplateModal } from "@/components/AutoWatermarkTemplateModal";
import { WatermarkStudio } from "@/components/WatermarkStudio";
import { useUploadQueue, DirectUploadQueueItem, buildWatermarkConfig, trackServerQueueItems, syncServerQueueStatuses, syncServerQueueFromActivity } from "@/lib/upload-queue-store";
import { UploadQueueDrawer } from "@/components/UploadQueueDrawer";
import { ActivityLogsSection } from "@/components/ActivityLogsSection";
import { Pagination } from "@/components/Pagination";
import {
  Button,
  Input,
  Badge as ShadBadge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Modal,
  AlertModal,
} from "@/components/ui";


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

type ProcessingTarget = "local" | "cloud";

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
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [primaryNodeId, setPrimaryNodeId] = useState<string | null>(null);
  const [ytStatus, setYtStatus] = useState<YouTubeStatus | null>(null);
  const [zoomAccounts, setZoomAccounts] = useState<ZoomAccount[]>([]);
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [syncingRecordings, setSyncingRecordings] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [recordingsPage, setRecordingsPage] = useState(1);
  const [recordingsPageSize, setRecordingsPageSize] = useState(10);
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
  const [processingTarget, setProcessingTarget] = useState<ProcessingTarget>("cloud");
  const [localWorkerRunning, setLocalWorkerRunning] = useState(false);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerMsg, setWorkerMsg] = useState<string | null>(null);

  const fetchWorkerStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/zoom-youtube/worker", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.success) setLocalWorkerRunning(Boolean(data.running));
    } catch {}
  }, []);

  const handleToggleLocalWorker = useCallback(
    async (action: "start" | "stop") => {
      setWorkerBusy(true);
      setWorkerMsg(null);
      try {
        const res = await fetch("/api/zoom-youtube/worker", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => null);
        if (data?.success) {
          setLocalWorkerRunning(action === "start" ? Boolean(data.started) || localWorkerRunning : false);
          setWorkerMsg(data.message || null);
        } else {
          setWorkerMsg(data?.error || "Failed to control the local worker.");
        }
      } catch (err: unknown) {
        setWorkerMsg(err instanceof Error ? err.message : "Failed to control the local worker.");
      } finally {
        setWorkerBusy(false);
        fetchWorkerStatus();
      }
    },
    [fetchWorkerStatus, localWorkerRunning]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem("zoomyt_processing_target");
      if (saved === "local" || saved === "cloud") setProcessingTarget(saved);
    } catch {}
    fetchWorkerStatus();
  }, [fetchWorkerStatus]);

  // Local Laptop turns on `npm run worker`; GitHub Cloud turns it back off.
  useEffect(() => {
    if (processingTarget === "local") {
      void handleToggleLocalWorker("start");
    } else if (localWorkerRunning) {
      void handleToggleLocalWorker("stop");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processingTarget]);

  const handleSetProcessingTarget = (target: ProcessingTarget) => {
    setProcessingTarget(target);
    try {
      localStorage.setItem("zoomyt_processing_target", target);
    } catch {}
  };

  const targetShort = processingTarget === "local" ? "Laptop" : "GitHub Workflow";

  // Initial full load on mount: fetch static config (devices, youtube, zoom accounts, initial recordings)
  const fetchStatus = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      setError(null);

      // Only fetch accounts/devices/youtube on initial mount, NOT in periodic background loop!
      const requests: Promise<Response>[] = isInitial
        ? [
            fetch("/api/zoom-youtube/recordings"),
            fetch("/api/zoom-youtube/youtube/status"),
            fetch("/api/zoom-youtube/zoom/accounts"),
            fetch("/api/zoom-youtube/devices"),
          ]
        : [fetch("/api/zoom-youtube/recordings")];

      const responses = await Promise.all(requests);
      const recRes = responses[0];

      if (isInitial && responses.length >= 4) {
        const ytRes = responses[1];
        const zoomRes = responses[2];
        const devRes = responses[3];

        const ytData = ytRes.ok ? await ytRes.json().catch(() => null) : null;
        if (ytData?.success) setYtStatus(ytData);

        const zoomData = zoomRes.ok ? await zoomRes.json().catch(() => null) : null;
        if (zoomData?.success) setZoomAccounts(zoomData.accounts || []);

        const devData = devRes.ok ? await devRes.json().catch(() => null) : null;
        if (devData?.success) {
          setDevices(devData.devices || []);
          setPrimaryNodeId(devData.primaryNodeId);
        } else if (devRes.status === 401) {
          setError("Session expired. Please sign in again.");
        }
      }

      let queueTarget: ProcessingTarget = "cloud";
      try {
        if (localStorage.getItem("zoomyt_processing_target") === "local") queueTarget = "local";
      } catch {}

      const recData = recRes.ok ? await recRes.json().catch(() => null) : null;
      if (recData?.success) {
        const list = recData.recordings || [];
        setRecordings(list);
        syncServerQueueStatuses(list);

        const activeServerJobs = list.filter((r: RecordingItem) =>
          ["queued", "downloading", "watermarking", "uploading", "ready"].includes(r.status)
        );
        if (activeServerJobs.length > 0) {
          trackServerQueueItems(activeServerJobs, queueTarget);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

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
    addToQueue,
    removeFromQueue: handleRemoveFromQueue,
    retryQueueItem: handleRetryQueueItem,
    clearCompleted: handleClearCompletedQueue,
    startDirectProcessing: handleStartDirectProcessing,
  } = useUploadQueue(fetchStatus);

  const isAnyJobActive =
    recordings.some((r) =>
      ["queued", "downloading", "watermarking", "uploading"].includes(r.status)
    ) ||
    uploadQueue.some((i) =>
      i.serverManaged && (i.status === "queued" || i.status === "uploading")
    );

  useEffect(() => {
    // Initial load: fetches status
    fetchStatus(true);

    // Background poll ONLY if a job is actively processing or queued, otherwise don't poll
    if (!isAnyJobActive) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchStatus(false);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchStatus, isAnyJobActive]);

  const [enqueuingIds, setEnqueuingIds] = useState<Record<string, boolean>>({});
  const [enqueuingAll, setEnqueuingAll] = useState(false);
  const [triggeringRunner, setTriggeringRunner] = useState(false);

  const handleTriggerCloudRunner = async () => {
    setTriggeringRunner(true);
    try {
      const res = await fetch("/api/zoom-youtube/workflow/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Manual batch trigger from Dashboard UI" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: "success",
          title: "Cloud Runner Dispatched",
          message: "GitHub Actions runner is booting up now. It will process all queued videos sequentially in a single runner run.",
          action: {
            label: "View Live Runs ↗",
            onClick: () => window.open("https://github.com/bibeknayaju/zoom-yt/actions", "_blank"),
          },
        });
        await fetchStatus();
      } else {
        showToast({
          type: "error",
          title: "Cloud Runner Dispatch Failed",
          message: data.message || "Ensure your GITHUB_PAT has Actions Read/Write permissions.",
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to trigger workflow";
      showToast({
        type: "error",
        title: "Connection Error",
        message: msg,
      });
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
          target: processingTarget,
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

      if (processingTarget === "local") {
        void handleToggleLocalWorker("start");

        for (const rec of recsToEnqueue) {
          addToQueue(
            rec,
            rec.accountName || "Zoom Account",
            {
              watermark: wmConfig || (modalAutoWatermark ? buildWatermarkConfig(currentWatermarkPreset) : { type: "none" }),
              resolution: (resolution as any) || (modalAutoWatermark ? currentResolution : "original"),
            }
          );
        }
        setQueueDrawerOpen(true);
        showToast({
          type: "success",
          title: `Started ${recsToEnqueue.length} Task${recsToEnqueue.length > 1 ? "s" : ""} on Laptop`,
          message: "Live stream downloading, watermarking per-frame, and YouTube upload underway.",
        });
      } else {
        trackServerQueueItems(recsToEnqueue, "cloud", "queued");
        setQueueDrawerOpen(true);

        const totalWaiting = recordings.filter((r) => r.status === "queued").length + recsToEnqueue.length;
        showToast({
          type: "info",
          title: `Queued ${recsToEnqueue.length} Video${recsToEnqueue.length > 1 ? "s" : ""} for Cloud Runner`,
          message: `${totalWaiting} video${totalWaiting === 1 ? "" : "s"} ready in backlog. Click "Run Cloud Runner" to process all at once.`,
          action: {
            label: "Run Now",
            onClick: handleTriggerCloudRunner,
          },
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to queue recordings";
      showToast({
        type: "error",
        title: "Queueing Failed",
        message: msg,
      });
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

  const [showDevicesSection, setShowDevicesSection] = useState(false);
  const [dismissedStorageWarning, setDismissedStorageWarning] = useState(false);

  const physicalDevices = devices.filter(
    (d) => !d.nodeId.startsWith("github-") && !d.label?.toLowerCase().includes("cloud")
  );

  // Check if any physical device has storage warnings - only relevant when processing on local laptop, laptop is online, and not dismissed
  const storageWarnings = dismissedStorageWarning
    ? []
    : physicalDevices.filter(
        (d) =>
          processingTarget === "local" &&
          d.isOnline &&
          (d.system?.storage?.status === "warning" || d.system?.storage?.status === "critical")
      );

  const localWorkersOnline = physicalDevices.filter((d) => d.isOnline);

  const cloudWorkersOnline = devices.filter(
    (d) => d.isOnline && (d.nodeId.startsWith("github-") || d.label.toLowerCase().includes("cloud")),
  );

  const queuedCloudRecordings = recordings.filter(
    (r) => r.status === "queued",
  );

  const filteredRecordings = recordings.filter(
    (r) => statusFilter === "all" || r.status === statusFilter,
  );
  const recordingsTotalPages = Math.max(
    1,
    Math.ceil(filteredRecordings.length / recordingsPageSize),
  );
  const safeRecordingsPage = Math.min(recordingsPage, recordingsTotalPages);
  const pagedRecordings = filteredRecordings.slice(
    (safeRecordingsPage - 1) * recordingsPageSize,
    safeRecordingsPage * recordingsPageSize,
  );

  const { user } = useUser();
  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
      {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-zinc-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Cloud Recordings & Studio
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Browse Zoom cloud recordings, launch Watermark Studio, or run high-speed YouTube uploads.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Target Toggle: Local Laptop vs GitHub Workflow */}
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

            <button
              onClick={() => setShowTemplateModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-300 transition shadow-sm">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Watermark Template</span>
            </button>
            <button
              onClick={() => fetchStatus(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition shadow-sm disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

      {/* Critical / Warning Storage Banner (Only shown if local processing is selected, device is online, and not dismissed) */}
      {storageWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-300/80 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 p-4 shadow-xs flex items-start justify-between gap-3 transition">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Low Storage Warning Detected
              </h3>
              {storageWarnings.map((d) => (
                <p key={d.nodeId} className="text-xs text-amber-800 dark:text-amber-300/90">
                  <span className="font-semibold text-amber-950 dark:text-amber-100">{d.label}</span> has only{" "}
                  <span className="font-bold">{d.system.storage.freeGB} GB</span> free storage
                  remaining (threshold: 20 GB). Local tasks may fail if disk fills up.
                </p>
              ))}
              <div className="pt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSetProcessingTarget("cloud")}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs">
                  <Cloud className="w-3.5 h-3.5" />
                  Switch to GitHub Cloud (No Local Disk Needed)
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissedStorageWarning(true)}
            className="text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 p-1 rounded-lg transition"
            title="Dismiss warning">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Active Runner Control Panel */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black p-5 shadow-xs">
        {processingTarget === "cloud" ? (
          <div className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      cloudWorkersOnline.length > 0
                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                        : "text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                    }`}>
                    <Radio className={`w-3 h-3 ${cloudWorkersOnline.length > 0 ? "text-emerald-600 dark:text-emerald-400 animate-pulse" : "text-slate-400 dark:text-zinc-500"}`} />
                    {cloudWorkersOnline.length > 0
                      ? `Cloud Runner Active (${cloudWorkersOnline[0].label})`
                      : "Cloud Runner Idle (Ready for batch run)"}
                  </span>

                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-800">
                    <Clock className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
                    <span>
                      {queuedCloudRecordings.length} video{queuedCloudRecordings.length === 1 ? "" : "s"} waiting in cloud queue
                    </span>
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
                  GitHub Actions runner streams, watermarks, and uploads queued recordings sequentially in a single automated cloud run.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleTriggerCloudRunner}
                  disabled={triggeringRunner}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 rounded-xl transition shadow-xs disabled:opacity-50">
                  {triggeringRunner ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {triggeringRunner
                      ? "Dispatching..."
                      : queuedCloudRecordings.length > 0
                      ? `Run Cloud Runner (${queuedCloudRecordings.length} queued)`
                      : "Run Cloud Runner Now"}
                  </span>
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
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Automated batch schedule: <strong className="font-semibold text-slate-800 dark:text-slate-200">7:45 AM & 10:30 PM NPT</strong> daily</span>
              </span>
              <span className="text-slate-400 dark:text-zinc-500">Zero rate-limit waste • Isolated cloud runner</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold text-xs px-2.5 py-1 rounded-full border ${
                      localWorkerRunning
                        ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
                        : "text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800"
                    }`}>
                    <Radio className={`w-2.5 h-2.5 ${localWorkerRunning ? "animate-pulse text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
                    Local Worker: {localWorkerRunning ? "Running" : "Stopped"}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {localWorkersOnline.length > 0
                      ? `${localWorkersOnline.length} laptop online`
                      : "No laptop registered"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {workerMsg || "Local worker processes queued recordings on this laptop using local FFmpeg."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggleLocalWorker(localWorkerRunning ? "stop" : "start")}
                disabled={workerBusy}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition disabled:opacity-50 shrink-0 ${
                  localWorkerRunning
                    ? "text-rose-700 dark:text-rose-300 bg-white dark:bg-zinc-900 border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                    : "text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                }`}>
                {workerBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : localWorkerRunning ? (
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                ) : (
                  <Play className="w-3 h-3 fill-current" />
                )}
                {workerBusy ? "Working..." : localWorkerRunning ? "Stop Local Worker" : "Start Local Worker"}
              </button>
            </div>

            {localWorkersOnline.length === 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-2.5">
                No local laptop worker is registered. If starting doesn&apos;t connect, run <code className="font-semibold bg-amber-100/60 dark:bg-zinc-800 px-1 py-0.5 rounded">npm run worker</code> in a terminal, or switch to GitHub Workflow above.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Physical Hardware Laptops Section (Collapsible) */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black backdrop-blur-md shadow-sm dark:shadow-xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDevicesSection((prev) => !prev)}
          className="w-full flex items-center justify-between p-4 bg-slate-50/70 hover:bg-slate-100/70 dark:bg-black dark:hover:bg-zinc-900/60 transition text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100">
              <Laptop className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Physical Worker Laptops ({physicalDevices.length})
                </h3>
                {localWorkersOnline.length > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <Radio className="w-2 h-2 animate-pulse text-emerald-600" /> {localWorkersOnline.length} online
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full border border-slate-200 dark:border-zinc-800">
                    No laptop worker running
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {physicalDevices.length > 0
                  ? `Primary: ${physicalDevices.find((d) => d.nodeId === primaryNodeId)?.label || "Auto"} • Click to view hardware storage & status`
                  : "All cloud batch tasks run on GitHub Actions. Run 'npm run worker' on your laptop if processing locally."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-indigo-600">
              {showDevicesSection ? "Hide Details" : "View Details"}
            </span>
            {showDevicesSection ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </button>

        {showDevicesSection && (
          <div className="p-5 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-black">
            {physicalDevices.length === 0 && !loading && (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50/50 dark:bg-zinc-950">
                <Laptop className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No physical worker laptops reported yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Run <code className="bg-slate-200 dark:bg-zinc-800 px-1 py-0.5 rounded text-slate-800 dark:text-slate-200">npm run worker</code> on your Office Laptop to register its disk storage here.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {physicalDevices.map((device) => {
                const isPrimary = device.nodeId === primaryNodeId;
                const storage = device.system?.storage;
                const usedPct = storage?.totalGB
                  ? Math.min(100, Math.round((storage.usedGB / storage.totalGB) * 100))
                  : 0;

                const isLow = storage?.status === "warning" || storage?.status === "critical";

                return (
                  <div
                    key={device.nodeId}
                    className={`relative rounded-xl border bg-white dark:bg-zinc-950 p-5 shadow-xs transition-all ${
                      isPrimary
                        ? "border-indigo-400 ring-2 ring-indigo-100 dark:ring-indigo-950/60"
                        : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                    }`}>
                    {/* Card Top: Node Info + Role Badge */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{device.label}</h4>
                          {device.isOnline ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                              <Radio className="w-2 h-2 animate-pulse text-emerald-600 dark:text-emerald-400" /> Online
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full">
                              Seen {device.secondsAgo}s ago
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Hostname: {device.system?.hostname} • {device.system?.platform} ({device.system?.arch})
                        </p>
                      </div>

                      {isPrimary ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2.5 py-0.5 rounded-full shadow-xs">
                          <Star className="w-3 h-3 fill-current" /> Primary Node
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-zinc-900 px-2 py-0.5 rounded-full">
                          Backup
                        </span>
                      )}
                    </div>

                    {/* Storage Health Gauge */}
                    {storage && (
                      <div className="rounded-lg bg-slate-50 dark:bg-black p-3 border border-slate-100 dark:border-zinc-800/80 mb-3 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                            <HardDrive className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span>Disk Storage</span>
                          </div>
                          <span className={isLow ? "text-amber-600 font-bold" : "text-emerald-700 dark:text-emerald-400 font-bold"}>
                            {storage.freeGB} GB Free ({storage.freePercentage}%)
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
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

                        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span>Used: {storage.usedGB} GB</span>
                          <span>Total: {storage.totalGB} GB</span>
                        </div>
                      </div>
                    )}

                    {/* Hardware Specs */}
                    <div className="grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400 mb-4 bg-slate-50/50 dark:bg-black p-2.5 rounded-lg border border-slate-100 dark:border-zinc-800/80">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5 text-slate-400" />
                        <span>{device.system?.cpus} Cores ({device.system?.cpuModel?.slice(0, 18)})</span>
                      </div>
                      <div className="text-right">
                        <span>RAM: {device.system?.freeMemoryGB} GB free / {device.system?.totalMemoryGB} GB</span>
                      </div>
                    </div>

                    {/* Action: Set as Primary */}
                    <div className="border-t border-slate-100 dark:border-zinc-800 pt-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400">
                          ID: <code className="text-slate-600 dark:text-slate-400">{device.nodeId}</code>
                        </span>
                        {!isPrimary && (
                          <button
                            onClick={() => handleDeleteDevice(device.nodeId)}
                            title="Remove device from monitoring list"
                            className="text-slate-300 dark:text-slate-600 hover:text-red-500 transition p-0.5 rounded">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {!isPrimary ? (
                        <button
                          onClick={() => handleSetPrimary(device.nodeId)}
                          disabled={updatingNode === device.nodeId}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 px-3 py-1 rounded-lg transition disabled:opacity-50">
                          <Star className="w-3 h-3" />
                          {updatingNode === device.nodeId ? "Switching..." : "Set as Primary"}
                        </button>
                      ) : (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active Worker
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* YouTube Connection Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black backdrop-blur-md shadow-sm dark:shadow-xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {/* Channel Avatar or YouTube Icon */}
            {ytStatus?.channel?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ytStatus.channel.thumbnailUrl}
                alt={ytStatus.channel.title}
                className="w-14 h-14 rounded-full border-2 border-red-500/40 shadow-sm object-cover shrink-0"
              />
            ) : (
              <div
                className={`p-3.5 rounded-2xl border shrink-0 ${
                  ytStatus?.connected
                    ? "bg-red-500/10 text-red-400 border-red-500/30"
                    : "bg-slate-900 text-slate-500 border-slate-800"
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
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Connected
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                    Not Connected
                  </span>
                )}
              </div>

              {/* Prominent Channel Name */}
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {ytStatus?.channel?.title || "No Channel Connected"}
                </h3>
                {ytStatus?.channel?.id && ytStatus.channel.id !== "configured_in_env" && (
                  <a
                    href={`https://www.youtube.com/channel/${ytStatus.channel.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-red-400 transition"
                    title="Open on YouTube">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              {ytStatus?.channel?.id && (
                <p className="text-xs text-slate-400 font-mono">
                  Channel ID: {ytStatus.channel.id}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium bg-slate-100 dark:bg-zinc-900 px-2.5 py-0.5 rounded-md border border-slate-200 dark:border-zinc-800">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> AES-256-GCM Encrypted
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Daily Quota:{" "}
                  <strong className="text-slate-900 dark:text-white">
                    {ytStatus?.quota?.unitsUsedToday ?? 0} / 48,000 units
                  </strong>{" "}
                  <span className="text-slate-500">(resets Midnight Pacific)</span>
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <a
              href="/api/zoom-youtube/youtube/auth"
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl shadow-md transition ${
                ytStatus?.connected
                  ? "text-slate-200 bg-slate-900 border border-slate-700 hover:bg-slate-800"
                  : "text-white bg-red-600 hover:bg-red-500 shadow-red-600/20"
              }`}>
              <Youtube className="w-4 h-4 text-red-500" />
              <span>{ytStatus?.connected ? "Switch / Reconnect Channel" : "Connect YouTube Channel"}</span>
            </a>
          </div>
        </div>
      </div>

      {/* Zoom Accounts Section Overview */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black backdrop-blur-md shadow-sm dark:shadow-xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/10 text-blue-500 dark:text-blue-400 rounded-xl border border-blue-500/20">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Zoom Cloud Accounts (Server-to-Server OAuth)
                </h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700">
                  {zoomAccounts.length} Connected
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {zoomAccounts.length > 0
                  ? `Active accounts: ${zoomAccounts.map((a) => a.accountName).join(", ")}`
                  : "Connect your Zoom Server-to-Server OAuth accounts to automatically discover recordings."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href="/dashboard/zoom-accounts"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition">
              <span>Manage & Add Zoom Accounts</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Browse Cloud Recordings Modal */}
      <Modal
        isOpen={Boolean(selectedZoomAccountForBrowse)}
        onClose={() => setSelectedZoomAccountForBrowse(null)}
        title={selectedZoomAccountForBrowse ? `Cloud Recordings: ${selectedZoomAccountForBrowse.accountName}` : "Cloud Recordings"}
        description="Browse recent classes from Zoom and choose which recording to download, watermark, and upload to YouTube."
        icon={<Film className="w-5 h-5 text-blue-400" />}
        size="5xl"
        headerActions={
          browsedRecordings.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Target Toggle: Local Laptop vs GitHub Workflow */}
              <div className="flex items-center bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs">
                <button
                  type="button"
                  onClick={() => handleSetProcessingTarget("local")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    processingTarget === "local"
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                  title="Run task immediately on local laptop">
                  <Laptop className="w-3.5 h-3.5" />
                  <span>Laptop</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetProcessingTarget("cloud")}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    processingTarget === "cloud"
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                  title="Automatically trigger GitHub Actions workflow in cloud">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Cloud</span>
                </button>
              </div>

              <div className="hidden sm:flex items-center bg-slate-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs">
                {(["720p", "1080p", "480p"] as const).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQueueResolution(q)}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                      currentResolution === q
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}>
                    {q}
                  </button>
                ))}
              </div>

              {/* Auto Watermark Default Toggle */}
              <Button
                type="button"
                size="sm"
                variant={modalAutoWatermark ? "amber" : "outline"}
                onClick={() => {
                  const nextVal = !modalAutoWatermark;
                  setModalAutoWatermark(nextVal);
                  setRecWatermarkOverrides({});
                }}
                className="text-xs"
                title={modalAutoWatermark ? "Auto-Watermark is ON" : "Auto-Watermark is OFF (Raw)"}>
                <Sparkles className={`w-3.5 h-3.5 ${modalAutoWatermark ? "text-amber-400" : "text-slate-400"}`} />
                <span>{modalAutoWatermark ? "Auto WM: ON" : "No WM (Raw)"}</span>
              </Button>

              <Button
                size="sm"
                variant="premium"
                onClick={() => {
                  const unUploaded = browsedRecordings.filter(
                    (r) => r.status !== "uploaded" && !r.youtubeUrl && r.status !== "queued"
                  );
                  if (unUploaded.length === 0) {
                    showToast({
                      type: "info",
                      title: "Queue Up to Date",
                      message: "All recordings in this list are already queued or uploaded!",
                    });
                    return;
                  }
                  handleEnqueueCloudRecordings(
                    unUploaded,
                    modalAutoWatermark ? buildWatermarkConfig(currentWatermarkPreset) : { type: "none" },
                    modalAutoWatermark ? currentResolution : "original"
                  );
                }}
                disabled={enqueuingAll}
                loading={enqueuingAll}
                className="text-xs">
                {processingTarget === "local" ? (
                  <Laptop className="w-3.5 h-3.5" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>
                  {processingTarget === "local"
                    ? `Start All on Laptop (${browsedRecordings.filter((r) => r.status !== "uploaded" && !r.youtubeUrl && r.status !== "queued").length})`
                    : `Queue All for Cloud (${browsedRecordings.filter((r) => r.status !== "uploaded" && !r.youtubeUrl && r.status !== "queued").length})`}
                </span>
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {loadingBrowse ? (
            <div className="py-16 text-center text-slate-400 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
              <p className="text-sm font-medium">Scanning Zoom Cloud for meetings in the last 30 days...</p>
            </div>
          ) : browsedRecordings.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Film className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-medium text-slate-300">No cloud recordings found for this account in the last 30 days.</p>
              <p className="text-xs text-slate-500">Make sure cloud recording was enabled during the meeting and finished processing on Zoom.</p>
            </div>
          ) : (
            browsedRecordings.map((rec) => {
              const isProcessing = processingFileId === rec.fileId;
              const statusMsg = processStatusMsg[rec.fileId];
              const toMB = (bytes: number) => Math.round(bytes / (1024 * 1024));

              return (
                <div
                  key={rec.fileId}
                  className="border border-slate-200 dark:border-zinc-800 rounded-xl p-4 bg-slate-50/70 dark:bg-zinc-950/80 hover:border-slate-300 dark:hover:border-zinc-700 transition space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{rec.topic}</h4>
                        {rec.totalParts && rec.totalParts > 1 && (
                          <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 px-2 py-0.5 rounded-full">
                            Part {rec.partNumber} of {rec.totalParts}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>Teacher: <strong className="text-slate-700 dark:text-slate-200">{rec.hostName}</strong></span>
                        <span>•</span>
                        <span>{new Date(rec.startTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span>•</span>
                        <span>{rec.durationMinutes} mins</span>
                        <span>•</span>
                        <span className="font-mono bg-slate-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-zinc-800">
                          Video: {toMB(rec.fileSizeBytes)} MB
                        </span>
                        {rec.recordingType && (
                          <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
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
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition shadow-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Uploaded (View YT)</span>
                          <ExternalLink className="w-3 h-3 text-emerald-400" />
                        </a>
                      ) : rec.status === "downloading" || rec.status === "watermarking" || rec.status === "uploading" ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          <span className="capitalize">Cloud: {rec.status}...</span>
                        </div>
                      ) : rec.status === "queued" ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Queued for {processingTarget === "local" ? "Local Worker" : "Cloud Runner"}</span>
                          <button
                            type="button"
                            onClick={() => handleCancelQueuedRecording(rec.fileId)}
                            className="text-slate-400 hover:text-rose-400 font-bold ml-1 text-sm"
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
                                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                                    isRowWm
                                      ? "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25"
                                      : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-slate-200"
                                  }`}
                                  title={
                                    isRowWm
                                      ? "Auto-Watermark is enabled. Click to upload raw."
                                      : "Watermarking is disabled (Raw). Click to enable Auto Watermark."
                                  }>
                                  {isRowWm ? (
                                    <>
                                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                      <span>Auto WM: ON</span>
                                    </>
                                  ) : (
                                    <span>Raw (No WM)</span>
                                  )}
                                </button>

                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleEnqueueCloudRecordings(
                                      [rec],
                                      isRowWm ? buildWatermarkConfig(currentWatermarkPreset) : { type: "none" },
                                      isRowWm ? currentResolution : "original"
                                    )
                                  }
                                  disabled={isEnqueuing}
                                  loading={isEnqueuing}
                                  className="text-xs"
                                >
                                  {processingTarget === "local" ? (
                                    <Laptop className="w-3.5 h-3.5" />
                                  ) : (
                                    <Cloud className="w-3.5 h-3.5" />
                                  )}
                                  <span>
                                    {processingTarget === "local" ? "Start on Laptop" : "Queue for Cloud"}
                                  </span>
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          try {
                            sessionStorage.setItem("zoomyt_selected_recording", JSON.stringify(rec));
                          } catch {}
                          router.push("/dashboard/studio");
                        }}
                        className="text-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Studio</span>
                      </Button>
                    </div>
                  </div>

                  {statusMsg && (
                    <p className={`text-xs p-2.5 rounded-lg font-medium border ${
                      statusMsg.startsWith("Uploaded")
                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60"
                        : statusMsg.startsWith("Failed") || statusMsg.startsWith("Error")
                        ? "bg-rose-950/40 text-rose-300 border-rose-800/60"
                        : "bg-blue-950/40 text-blue-300 border-blue-800/60"
                    }`}>
                      {statusMsg}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {/* Cloud Recordings Queue Table */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-black backdrop-blur-md shadow-sm dark:shadow-xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-zinc-100 dark:bg-zinc-900 text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-zinc-800">
              <Film className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-xs transition">
              <Film className="w-3.5 h-3.5" />
              <span>Full Discovered Page &amp; Pagination &rarr;</span>
            </Link>

            <button
              onClick={handleSyncRecordings}
              disabled={syncingRecordings}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-lg shadow-xs transition disabled:opacity-50">
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
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-white bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 rounded-lg shadow-sm transition disabled:opacity-50"
              title="Immediately triggers the GitHub Actions cloud runner to process all queued videos without waiting for scheduled times">
              {triggeringRunner ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
              )}
              <span>Run Cloud Runner Now</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-zinc-800 pb-3">
          {["all", "queued", "discovered", "ready", "uploaded"].map((f) => {
            const count =
              f === "all"
                ? recordings.length
                : recordings.filter((r) => r.status === f).length;
            const active = statusFilter === f;
            return (
              <button
                key={f}
                onClick={() => {
                  setStatusFilter(f);
                  setRecordingsPage(1);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-lg capitalize transition ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-900"
                }`}>
                {f} ({count})
              </button>
            );
          })}
        </div>

        {/* Recordings Table */}
        {recordings.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-xl bg-slate-50/50 dark:bg-black">
            <Film className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No recordings in queue yet</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click &quot;Sync from Zoom Now&quot; above to scan your recent classes from {zoomAccounts[0]?.accountName || "Zoom"}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-zinc-950 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-zinc-800">
                <tr>
                  <th className="py-3 px-3">Topic / Class</th>
                  <th className="py-3 px-3">Date & Time</th>
                  <th className="py-3 px-3">Duration</th>
                  <th className="py-3 px-3">Size</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-y dark:divide-slate-800/80">
                {pagedRecordings
                  .map((rec) => {
                    const toMB = (bytes: number) =>
                      bytes ? `${Math.round(bytes / (1024 * 1024))} MB` : "-";

                    const badgeColors: Record<string, string> = {
                      discovered: "bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800",
                      queued: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50 font-medium",
                      downloading: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50 animate-pulse",
                      watermarking: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50 animate-pulse",
                      ready: "bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800",
                      uploading: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50 animate-pulse",
                      uploaded: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50",
                      skipped: "bg-slate-100 dark:bg-zinc-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-zinc-800",
                      failed: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50",
                    };

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 transition">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white max-w-xs truncate">
                            {rec.topic}
                          </div>
                          {rec.accountName && (
                            <span className="text-[10px] text-slate-400">
                              {rec.accountName}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {new Date(rec.recording_start).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {rec.duration_minutes} min
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap font-mono">
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
                              <span className="text-xs font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 px-2 py-0.5 rounded-md">
                                Queued for {processingTarget === "local" ? "Local" : "Cloud"}
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
                                      meetingUuid: (rec as any).zoom_meeting_uuid,
                                      meetingId: (rec as any).zoom_meeting_id,
                                    },
                                  ])
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 px-2.5 py-1 rounded-md transition shadow-xs">
                                <Youtube className="w-3 h-3 text-red-300" />
                                Queue for {targetShort}
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
                                    meetingUuid: (rec as any).zoom_meeting_uuid,
                                    meetingId: (rec as any).zoom_meeting_id,
                                  };
                                  try {
                                    sessionStorage.setItem("zoomyt_selected_recording", JSON.stringify(sel));
                                  } catch {}
                                  router.push("/dashboard/studio");
                                }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 border border-slate-300 dark:border-zinc-800 px-2 py-1 rounded-md transition">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                Studio
                              </button>
                              <button
                                onClick={() => handleUpdateRecordingStatus(rec.id, "skipped")}
                                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                                Skip
                              </button>
                            </div>
                          ) : rec.status === "failed" ? (
                            <div className="inline-flex items-center gap-2">
                              <span
                                title={rec.error_message || "Processing failed"}
                                className="text-[10px] text-rose-600 max-w-[180px] truncate">
                                {rec.error_message || "Processing failed"}
                              </span>
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
                                      meetingUuid: (rec as any).zoom_meeting_uuid,
                                      meetingId: (rec as any).zoom_meeting_id,
                                    },
                                  ])
                                }
                                disabled={Boolean(enqueuingIds[(rec as any).zoom_file_id || rec.id])}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded-md transition shadow-sm disabled:opacity-50">
                                {enqueuingIds[(rec as any).zoom_file_id || rec.id] ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                Retry {targetShort}
                              </button>
                            </div>
                          ) : rec.status === "skipped" ? (
                            <button
                              onClick={() => handleUpdateRecordingStatus(rec.id, "discovered")}
                              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium transition">
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

        {recordings.length > 0 && (
          <Pagination
            currentPage={safeRecordingsPage}
            totalPages={recordingsTotalPages}
            totalItems={filteredRecordings.length}
            pageSize={recordingsPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            onPageChange={setRecordingsPage}
            onPageSizeChange={(size) => {
              setRecordingsPageSize(size);
              setRecordingsPage(1);
            }}
            itemLabel="recordings"
          />
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

      {/* Modern Floating Toast Notification Container */}
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
