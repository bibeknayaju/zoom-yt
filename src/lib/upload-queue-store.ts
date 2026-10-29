"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

export type VideoResolution = "1080p" | "720p" | "480p" | "original";
export type WatermarkPreset = "both" | "logo" | "image" | "text" | "none";

export function buildWatermarkConfig(preset?: WatermarkPreset) {
  let savedTpl: any = null;
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem("zoomyt_auto_watermark_template");
      if (raw) savedTpl = JSON.parse(raw);
    } catch {}
  }

  const effectivePreset: WatermarkPreset = preset || savedTpl?.watermarkType || globalWatermarkPreset || "both";

  if (effectivePreset === "none") return { type: "none" };

  const logoScale = typeof savedTpl?.imageScale === "number" ? savedTpl.imageScale : 0.18;
  const logoOpacity = typeof savedTpl?.imageOpacity === "number" ? savedTpl.imageOpacity : 0.85;
  const logoPosX = typeof savedTpl?.imagePosX === "number" ? savedTpl.imagePosX : 0.78;
  const logoPosY = typeof savedTpl?.imagePosY === "number" ? savedTpl.imagePosY : 0.04;
  const logoPath = savedTpl?.logoPath || "/assets/images/logo_main.png";

  const text = savedTpl?.watermarkText || "Union Education";
  const fontSize = typeof savedTpl?.fontSize === "number" ? savedTpl.fontSize : 24;
  const textOpacity = typeof savedTpl?.textOpacity === "number" ? savedTpl.textOpacity : 0.85;
  const textPosX = typeof savedTpl?.textPosX === "number" ? savedTpl.textPosX : 0.04;
  const textPosY = typeof savedTpl?.textPosY === "number" ? savedTpl.textPosY : 0.90;

  if (effectivePreset === "logo" || effectivePreset === "image") {
    return {
      type: "image",
      scale: logoScale,
      opacity: logoOpacity,
      posX: logoPosX,
      posY: logoPosY,
      logoPath,
    };
  }
  if (effectivePreset === "text") {
    return {
      type: "text",
      text,
      opacity: textOpacity,
      posX: textPosX,
      posY: textPosY,
      fontSize,
    };
  }
  return {
    type: "both",
    text,
    scale: logoScale,
    opacity: logoOpacity,
    posX: logoPosX,
    posY: logoPosY,
    textPosX,
    textPosY,
    fontSize,
    logoPath,
  };
}

export interface DirectUploadQueueItem {
  id: string; // fileId
  recording: any;
  accountName: string;
  topic: string;
  startTime: string;
  durationMinutes: number;
  fileSizeBytes: number;
  status: "queued" | "uploading" | "uploaded" | "failed";
  progressMsg?: string;
  progressPercent?: number;
  youtubeUrl?: string;
  error?: string;
  queuedAt: number;
  resolution?: VideoResolution;
  watermark?: any;
  retryCount?: number;
  // Items queued directly into Supabase (processed by the laptop/cloud worker)
  serverManaged?: boolean;
  serverTarget?: "local" | "cloud";
}

// Global in-memory queue shared across client-side page transitions
let globalQueue: DirectUploadQueueItem[] = [];
let globalResolution: VideoResolution = "720p";
let globalWatermarkPreset: WatermarkPreset = "both";
let isProcessing = false;
let activeAbortController: AbortController | null = null;
let activeProcessingFileId: string | null = null;
const listeners = new Set<() => void>();
const dismissedServerIds = new Set<string>();


// Initialize from localStorage if in browser
if (typeof window !== "undefined") {
  try {
    const savedRes = localStorage.getItem("zoomyt_queue_resolution") as VideoResolution;
    if (savedRes && ["1080p", "720p", "480p", "original"].includes(savedRes)) {
      globalResolution = savedRes;
    }
  } catch {}

  try {
    const savedWm = localStorage.getItem("zoomyt_queue_watermark_preset") as WatermarkPreset;
    if (savedWm && ["both", "logo", "image", "text", "none"].includes(savedWm)) {
      globalWatermarkPreset = (savedWm === "logo" ? "image" : savedWm) as WatermarkPreset;
    } else {
      const rawTpl = localStorage.getItem("zoomyt_auto_watermark_template");
      if (rawTpl) {
        const parsed = JSON.parse(rawTpl);
        if (parsed?.watermarkType && ["both", "logo", "image", "text", "none"].includes(parsed.watermarkType)) {
          globalWatermarkPreset = (parsed.watermarkType === "logo" ? "image" : parsed.watermarkType) as WatermarkPreset;
        }
      }
    }
  } catch {}

  try {
    const saved = localStorage.getItem("zoomyt_direct_queue");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        globalQueue = parsed.map((item) =>
          item.status === "uploading"
            ? { ...item, status: "queued", progressPercent: 0, progressMsg: "Queued..." }
            : item
        );
      }
    }
  } catch {}

  // Auto-resume queue when network connection is regained
  window.addEventListener("online", () => {
    console.log("🌐 Network regained! Auto-resuming upload queue...");
    globalQueue = globalQueue.map((it) => {
      if (it.status === "failed" && (it.error?.toLowerCase().includes("network") || it.error?.toLowerCase().includes("fetch"))) {
        return { ...it, status: "queued", progressMsg: "Network restored. Resuming..." };
      }
      return it;
    });
    notifyListeners();
    if (!isProcessing && globalQueue.some((i) => i.status === "queued" && !i.serverManaged)) {
      processNextQueueItem();
    }
  });

  window.addEventListener("offline", () => {
    console.warn("⚠️ Network offline detected.");
    globalQueue = globalQueue.map((it) => {
      if (it.status === "uploading") {
        return { ...it, progressMsg: "Network offline. Waiting for connection..." };
      }
      return it;
    });
    notifyListeners();
  });
}

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error("Queue store listener error:", e);
    }
  });
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("zoomyt_direct_queue", JSON.stringify(globalQueue));
    } catch {}
  }
}

function mapServerStatus(status?: string): DirectUploadQueueItem["status"] | null {
  switch (status) {
    case "queued":
      return "queued";
    case "downloading":
    case "watermarking":
    case "uploading":
    case "ready":
      return "uploading";
    case "uploaded":
      return "uploaded";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

function serverStatusMessage(status: string | undefined, target: "local" | "cloud") {
  const where = target === "local" ? "local laptop" : "GitHub Cloud";
  switch (status) {
    case "downloading":
      return `Downloading on ${where}...`;
    case "watermarking":
      return `Watermarking on ${where}...`;
    case "uploading":
      return `Uploading to YouTube from ${where}...`;
    case "ready":
      return `Ready on ${where}...`;
    case "uploaded":
      return "Uploaded to YouTube";
    case "failed":
      return "Processing failed";
    default:
      return `Queued for ${where}`;
  }
}

/**
 * Adds server-side queued jobs (Supabase `zy_recordings`) to the shared queue UI
 * so the bottom-right popup appears without starting the legacy direct-upload flow.
 */
export function trackServerQueueItems(
  recs: any[],
  target: "local" | "cloud",
  forcedStatus?: string
) {
  const updates = new Map<string, DirectUploadQueueItem>();
  const additions: DirectUploadQueueItem[] = [];

  for (const rec of recs) {
    const fileId = rec.fileId || rec.zoom_file_id;
    if (!fileId) continue;

    const rawStatus = forcedStatus || rec.status || "queued";
    const status = mapServerStatus(rawStatus);
    if (!status) continue;

    // A dismissed job only comes back when it is explicitly re-queued.
    if (dismissedServerIds.has(fileId) && rawStatus !== "queued") continue;
    if (rawStatus === "queued") dismissedServerIds.delete(fileId);

    const existing = globalQueue.find((i) => i.id === fileId);
    const base: DirectUploadQueueItem =
      existing || {
        id: fileId,
        recording: rec,
        accountName: rec.accountName || "Zoom Account",
        topic: rec.topic || "Class Recording",
        startTime: rec.startTime || rec.recording_start || new Date().toISOString(),
        durationMinutes: rec.durationMinutes || rec.duration_minutes || 0,
        fileSizeBytes: rec.fileSizeBytes || rec.file_size_bytes || 0,
        status: "queued",
        queuedAt: Date.now(),
      };

    const progressPercent =
      typeof rec.options?.progressPercent === "number"
        ? rec.options.progressPercent
        : typeof rec.progress_percent === "number"
        ? rec.progress_percent
        : status === "uploaded"
        ? 100
        : base.progressPercent || 0;

    const progressMsg =
      rec.options?.progressMsg ||
      rec.progress_message ||
      base.progressMsg ||
      serverStatusMessage(rawStatus, target);

    const updated: DirectUploadQueueItem = {
      ...base,
      recording: base.recording || rec,
      status,
      serverManaged: true,
      serverTarget: target,
      progressPercent,
      progressMsg,
      youtubeUrl: rec.youtubeUrl || rec.youtube_url || base.youtubeUrl,
      error: status === "failed" ? rec.error_message || rec.error || "Processing failed" : undefined,
    };

    if (existing) updates.set(fileId, updated);
    else additions.push(updated);
  }

  if (updates.size === 0 && additions.length === 0) return;

  globalQueue = globalQueue
    .map((item) => updates.get(item.id) || item)
    .concat(additions);
  notifyListeners();
}

/** Refreshes statuses of server-managed items from the recordings poll. */
export function syncServerQueueStatuses(recordings: any[]) {
  if (!globalQueue.some((i) => i.serverManaged)) return;

  const byId = new Map(
    recordings.map((r) => [r.zoom_file_id || r.id, r] as [string, any])
  );
  let changed = false;

  const next = globalQueue.map((item) => {
    if (!item.serverManaged) return item;
    const rec = byId.get(item.id);
    if (!rec) return item;

    const status = mapServerStatus(rec.status);
    if (!status) return item;

    const target = item.serverTarget || "cloud";
    const youtubeUrl = rec.youtube_url || rec.youtubeUrl || item.youtubeUrl;
    const error = status === "failed" ? rec.error_message || item.error : undefined;

    const progressPercent =
      typeof rec.options?.progressPercent === "number"
        ? rec.options.progressPercent
        : typeof rec.progress_percent === "number"
        ? rec.progress_percent
        : status === "uploaded"
        ? 100
        : item.progressPercent || 0;

    const progressMsg =
      rec.options?.progressMsg ||
      rec.progress_message ||
      (status === "uploading" && rec.status
        ? `${rec.status === "watermarking" ? "Watermarking" : "Uploading"} on ${target === "local" ? "laptop" : "cloud"}...`
        : serverStatusMessage(rec.status, target));

    if (
      status === item.status &&
      youtubeUrl === item.youtubeUrl &&
      error === item.error &&
      progressPercent === item.progressPercent &&
      progressMsg === item.progressMsg
    ) {
      return item;
    }

    changed = true;
    return {
      ...item,
      status,
      progressPercent,
      progressMsg,
      youtubeUrl,
      error,
    };
  });

  if (changed) {
    globalQueue = next;
    notifyListeners();
  }
}

/**
 * Mirrors activity logs into the corner popup. This covers jobs started outside
 * the dashboard (worker / Watermark Studio) that never went through the enqueue UI.
 */
export function syncServerQueueFromActivity(
  logs: any[],
  target: "local" | "cloud"
) {
  if (!Array.isArray(logs) || logs.length === 0) return;

  const byFile = new Map<string, any>();
  for (const log of logs) {
    if (log?.fileId) byFile.set(log.fileId, log);
  }

  const updates = new Map<string, DirectUploadQueueItem>();
  const additions: DirectUploadQueueItem[] = [];

  for (const log of logs) {
    const fileId = log?.fileId;
    if (!fileId || log.status !== "processing") continue;
    if (dismissedServerIds.has(fileId)) continue;

    const existing = globalQueue.find((i) => i.id === fileId);
    if (existing?.status === "uploaded") continue;

    const base: DirectUploadQueueItem =
      existing || {
        id: fileId,
        recording: { fileId, topic: log.topic },
        accountName: log.accountName || "Zoom Account",
        topic: log.topic || "Class Recording",
        startTime: log.startedAt || new Date().toISOString(),
        durationMinutes: log.durationMinutes || 0,
        fileSizeBytes: log.fileSizeBytes || 0,
        status: "uploading",
        queuedAt: Date.now(),
      };

    const updated: DirectUploadQueueItem = {
      ...base,
      status: "uploading",
      serverManaged: true,
      serverTarget: target,
      progressMsg: `Processing & uploading${target === "local" ? " on local laptop" : " on GitHub Cloud"}...`,
    };

    if (existing) updates.set(fileId, updated);
    else additions.push(updated);
  }

  let changed = additions.length > 0 || updates.size > 0;

  const next = globalQueue.map((item) => {
    if (!item.serverManaged) return item;
    const log = byFile.get(item.id);
    if (!log) return item;

    if (log.status === "success") {
      changed = true;
      return {
        ...item,
        status: "uploaded" as const,
        youtubeUrl: log.youtubeUrl || item.youtubeUrl,
        progressMsg: "Uploaded to YouTube",
        error: undefined,
      };
    }
    if (log.status === "failed") {
      changed = true;
      return {
        ...item,
        status: "failed" as const,
        error: log.errorMessage || item.error || "Processing failed",
        progressMsg: "Processing failed",
      };
    }
    return updates.get(item.id) || item;
  });

  const existingIds = new Set(next.map((i) => i.id));
  const newItems = additions.filter((i) => !existingIds.has(i.id));
  if (newItems.length > 0) changed = true;

  if (changed) {
    globalQueue = next.concat(newItems);
    notifyListeners();
  }
}


async function readSseStream(
  res: Response,
  onEvent: (event: any) => void
): Promise<any> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEvent: any = null;

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
            lastEvent = data;
            onEvent(data);
          } catch {}
        }
      }
    }
  }

  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) {
        try {
          const data = JSON.parse(trimmed.slice(5).trim());
          lastEvent = data;
          onEvent(data);
        } catch {}
      }
    }
  }

  return lastEvent;
}

async function processNextQueueItem() {
  if (isProcessing) return;

  const nextItem = globalQueue.find((i) => i.status === "queued" && !i.serverManaged);
  if (!nextItem) return;

  isProcessing = true;
  const fileId = nextItem.id;
  activeProcessingFileId = fileId;
  activeAbortController = new AbortController();
  const currentSignal = activeAbortController.signal;

  // Mark as uploading with true 0% initial state
  globalQueue = globalQueue.map((it) =>
    it.id === fileId
      ? {
          ...it,
          status: "uploading",
          progressPercent: 0,
          progressMsg: "Connecting to Zoom & initiating download...",
        }
      : it
  );
  notifyListeners();

  try {
    const finalWatermark = nextItem.watermark !== undefined
      ? nextItem.watermark
      : buildWatermarkConfig(globalWatermarkPreset);

    const isNoWatermark = !finalWatermark?.type || finalWatermark.type === "none";

    const res = await fetch("/api/zoom-youtube/recordings/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: currentSignal,
      body: JSON.stringify({
        recording: nextItem.recording,
        watermark: finalWatermark,
        watermarkText: (finalWatermark?.type === "image" || finalWatermark?.type === "none") ? "" : (finalWatermark?.text || "Union Education"),
        resolution: isNoWatermark ? "original" : (nextItem.resolution || globalResolution),
        privacyStatus: "unlisted",
      }),
    });

    if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
      const errorJson = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
      throw new Error(errorJson.error || `Failed with status ${res.status}`);
    }

    let finalResult: any = null;
    await readSseStream(res, (data) => {
      if (currentSignal.aborted) return;
      finalResult = data;
      if (typeof data.percent === "number") {
        globalQueue = globalQueue.map((it) =>
          it.id === fileId && it.status === "uploading"
            ? {
                ...it,
                progressPercent: data.percent,
                progressMsg: data.msg || it.progressMsg,
              }
            : it
        );
        notifyListeners();
      }
    });

    if (currentSignal.aborted) {
      console.log(`⏹️ Task cancelled for ${nextItem.topic}`);
      return;
    }

    if (finalResult?.success) {
      globalQueue = globalQueue.map((it) =>
        it.id === fileId
          ? {
              ...it,
              status: "uploaded",
              progressPercent: 100,
              youtubeUrl: finalResult.youtubeUrl,
              progressMsg: `Uploaded! ${finalResult.youtubeUrl}`,
            }
          : it
      );
      notifyListeners();
    } else {
      const errMsg = finalResult?.error || "Upload failed";
      globalQueue = globalQueue.map((it) =>
        it.id === fileId
          ? {
              ...it,
              status: "failed",
              progressPercent: 0,
              error: errMsg,
              progressMsg: `Failed: ${errMsg}`,
            }
          : it
      );
      notifyListeners();
    }
  } catch (err: unknown) {
    if (currentSignal.aborted) {
      console.log(`⏹️ Task cancelled during processing for ${nextItem.topic}`);
      return;
    }
    const msg = err instanceof Error ? err.message : "Request failed";
    const isNetworkErr =
      msg.toLowerCase().includes("network") ||
      msg.toLowerCase().includes("fetch") ||
      msg.toLowerCase().includes("econnreset") ||
      msg.toLowerCase().includes("timeout") ||
      msg.toLowerCase().includes("failed to fetch");

    const retries = nextItem.retryCount || 0;

    if (isNetworkErr && retries < 3) {
      console.warn(`⚠️ Network interrupted for ${nextItem.topic}. Auto-retrying in 5s (Attempt ${retries + 1}/3)...`);
      globalQueue = globalQueue.map((it) =>
        it.id === fileId
          ? {
              ...it,
              status: "queued",
              retryCount: retries + 1,
              progressMsg: `Network interrupted. Auto-retrying in 5s (Attempt ${retries + 1}/3)...`,
            }
          : it
      );
      notifyListeners();
    } else {
      globalQueue = globalQueue.map((it) =>
        it.id === fileId
          ? {
              ...it,
              status: "failed",
              progressPercent: 0,
              error: msg,
              progressMsg: `Failed: ${msg}`,
            }
          : it
      );
      notifyListeners();
    }
  } finally {
    if (activeProcessingFileId === fileId) {
      activeProcessingFileId = null;
      activeAbortController = null;
    }
    isProcessing = false;
    setTimeout(() => {
      const hasMore = globalQueue.some((i) => i.status === "queued" && !i.serverManaged);
      if (hasMore && !isProcessing) {
        processNextQueueItem();
      }
    }, 600);
  }
}

/**
 * Cancels an ongoing or queued upload task immediately.
 * Aborts client stream, notifies backend to terminate ffmpeg/downloads, and deletes from queue.
 */
export function cancelQueueItem(fileId: string, deletePermanently = true) {
  const queuedItem = globalQueue.find((i) => i.id === fileId);

  if (activeProcessingFileId === fileId) {
    if (activeAbortController) {
      try { activeAbortController.abort(); } catch {}
    }
    activeAbortController = null;
    activeProcessingFileId = null;

    fetch("/api/zoom-youtube/recordings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    }).catch(() => {});
  } else if (queuedItem?.serverManaged) {
    dismissedServerIds.add(fileId);
    fetch("/api/zoom-youtube/recordings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    }).catch(() => {});
  }

  if (deletePermanently) {
    globalQueue = globalQueue.filter((i) => i.id !== fileId);
  } else {
    globalQueue = globalQueue.map((it) =>
      it.id === fileId
        ? {
            ...it,
            status: "failed",
            error: "Cancelled by user",
            progressPercent: 0,
            progressMsg: "Cancelled by user",
          }
        : it
    );
  }

  isProcessing = false;
  notifyListeners();

  setTimeout(() => {
    if (!isProcessing && globalQueue.some((i) => i.status === "queued" && !i.serverManaged)) {
      processNextQueueItem();
    }
  }, 400);
}

/**
 * Cancels all ongoing and queued tasks.
 */
export function cancelAllQueue() {
  if (activeProcessingFileId) {
    const fileId = activeProcessingFileId;
    if (activeAbortController) {
      try { activeAbortController.abort(); } catch {}
    }
    activeAbortController = null;
    activeProcessingFileId = null;

    fetch("/api/zoom-youtube/recordings/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    }).catch(() => {});
  }

  globalQueue = [];
  isProcessing = false;
  notifyListeners();
}

const EMPTY_QUEUE: DirectUploadQueueItem[] = [];

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getQueueSnapshot(): DirectUploadQueueItem[] {
  return globalQueue;
}

function getServerQueueSnapshot(): DirectUploadQueueItem[] {
  return EMPTY_QUEUE;
}

function getResolutionSnapshot(): VideoResolution {
  return globalResolution;
}

function getServerResolutionSnapshot(): VideoResolution {
  return "720p";
}

function getWatermarkPresetSnapshot(): WatermarkPreset {
  return globalWatermarkPreset;
}

function getServerWatermarkPresetSnapshot(): WatermarkPreset {
  return "both";
}

export function useUploadQueue(onItemComplete?: () => void) {
  const queue = useSyncExternalStore(subscribe, getQueueSnapshot, getServerQueueSnapshot);
  const currentResolution = useSyncExternalStore(subscribe, getResolutionSnapshot, getServerResolutionSnapshot);
  const currentWatermarkPreset = useSyncExternalStore(subscribe, getWatermarkPresetSnapshot, getServerWatermarkPresetSnapshot);
  const [drawerOpen, setDrawerOpen] = useState(true);

  useEffect(() => {
    let lastUploadedCount = globalQueue.filter((i) => i.status === "uploaded" || i.status === "failed").length;

    const listener = () => {
      const currentUploadedCount = globalQueue.filter((i) => i.status === "uploaded" || i.status === "failed").length;
      if (currentUploadedCount > lastUploadedCount) {
        lastUploadedCount = currentUploadedCount;
        if (onItemComplete) {
          onItemComplete();
        }
      }
    };
    listeners.add(listener);

    // Start processing if items queued and not currently active
    if (!isProcessing && globalQueue.some((i) => i.status === "queued" && !i.serverManaged)) {
      processNextQueueItem();
    }

    return () => {
      listeners.delete(listener);
    };
  }, [onItemComplete]);

  const setQueueResolution = useCallback((res: VideoResolution) => {
    globalResolution = res;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("zoomyt_queue_resolution", res);
      } catch {}
    }
    notifyListeners();
  }, []);

  const setQueueWatermarkPreset = useCallback((preset: WatermarkPreset) => {
    globalWatermarkPreset = preset;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("zoomyt_queue_watermark_preset", preset);
      } catch {}
    }
    notifyListeners();
  }, []);

  const addToQueue = useCallback(
    (
      rec: any,
      accountName: string = "Zoom Account",
      options?: { resolution?: VideoResolution; watermark?: any; watermarkPreset?: WatermarkPreset }
    ) => {
      const fileId = rec.fileId || rec.zoom_file_id;
      if (globalQueue.some((i) => i.id === fileId)) return;

      const wm = options?.watermark !== undefined
        ? options.watermark
        : options?.watermarkPreset
        ? buildWatermarkConfig(options.watermarkPreset)
        : buildWatermarkConfig(globalWatermarkPreset);
      const isNoWm = !wm?.type || wm.type === "none";
      const chosenRes = isNoWm ? "original" : (options?.resolution || globalResolution);

      const newItem: DirectUploadQueueItem = {
        id: fileId,
        recording: rec,
        accountName: accountName || "Zoom Account",
        topic: rec.topic || "Class Recording",
        startTime: rec.startTime || rec.recording_start || new Date().toISOString(),
        durationMinutes: rec.durationMinutes || rec.duration_minutes || 0,
        fileSizeBytes: rec.fileSizeBytes || rec.file_size_bytes || 0,
        status: "queued",
        progressMsg: "Queued for upload...",
        progressPercent: 0,
        queuedAt: Date.now(),
        resolution: chosenRes,
        watermark: wm,
      };

      globalQueue = [...globalQueue, newItem];
      notifyListeners();

      if (!isProcessing) {
        processNextQueueItem();
      }
    },
    []
  );

  const addAllToQueue = useCallback(
    (
      recs: any[],
      accountName: string = "Zoom Account",
      options?: { resolution?: VideoResolution; watermark?: any; watermarkPreset?: WatermarkPreset }
    ) => {
      const existingIds = new Set(globalQueue.map((i) => i.id));
      const newItems: DirectUploadQueueItem[] = [];
      const wm = options?.watermark !== undefined
        ? options.watermark
        : options?.watermarkPreset
        ? buildWatermarkConfig(options.watermarkPreset)
        : buildWatermarkConfig(globalWatermarkPreset);

      const isNoWm = !wm?.type || wm.type === "none";
      const chosenRes = isNoWm ? "original" : (options?.resolution || globalResolution);

      for (const rec of recs) {
        const fileId = rec.fileId || rec.zoom_file_id;
        if (!existingIds.has(fileId)) {
          newItems.push({
            id: fileId,
            recording: rec,
            accountName: accountName || "Zoom Account",
            topic: rec.topic || "Class Recording",
            startTime: rec.startTime || rec.recording_start || new Date().toISOString(),
            durationMinutes: rec.durationMinutes || rec.duration_minutes || 0,
            fileSizeBytes: rec.fileSizeBytes || rec.file_size_bytes || 0,
            status: "queued",
            progressMsg: "Queued for upload...",
            progressPercent: 0,
            queuedAt: Date.now(),
            resolution: chosenRes,
            watermark: wm,
          });
          existingIds.add(fileId);
        }
      }

      if (newItems.length > 0) {
        globalQueue = [...globalQueue, ...newItems];
        notifyListeners();
        if (!isProcessing) {
          processNextQueueItem();
        }
      }
    },
    []
  );

  const removeFromQueue = useCallback((fileId: string) => {
    cancelQueueItem(fileId, true);
  }, []);

  const cancelTask = useCallback((fileId: string) => {
    cancelQueueItem(fileId, true);
  }, []);

  const cancelAll = useCallback(() => {
    cancelAllQueue();
  }, []);

  const retryQueueItem = useCallback((fileId: string) => {
    const item = globalQueue.find((i) => i.id === fileId);

    if (item?.serverManaged) {
      const target = item.serverTarget || "cloud";
      dismissedServerIds.delete(fileId);
      globalQueue = globalQueue.map((it) =>
        it.id === fileId
          ? { ...it, status: "queued", error: undefined, progressMsg: `Re-queueing for ${target === "local" ? "local laptop" : "GitHub Cloud"}...` }
          : it
      );
      notifyListeners();

      fetch("/api/zoom-youtube/recordings/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordings: [item.recording], target }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data?.success) throw new Error(data?.error || "Failed to re-queue recording");
          globalQueue = globalQueue.map((it) =>
            it.id === fileId
              ? { ...it, status: "queued", progressMsg: `Queued for ${target === "local" ? "local laptop" : "GitHub Cloud"}` }
              : it
          );
          notifyListeners();
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to re-queue recording";
          globalQueue = globalQueue.map((it) =>
            it.id === fileId ? { ...it, status: "failed", error: msg } : it
          );
          notifyListeners();
        });
      return;
    }

    globalQueue = globalQueue.map((it) =>
      it.id === fileId
        ? { ...it, status: "queued", error: undefined, progressPercent: 0, progressMsg: "Retrying in queue..." }
        : it
    );
    notifyListeners();
    if (!isProcessing) {
      processNextQueueItem();
    }
  }, []);

  const clearCompleted = useCallback(() => {
    globalQueue = globalQueue.filter((i) => i.status === "queued" || i.status === "uploading");
    notifyListeners();
  }, []);

  const handleStartDirectProcessing = useCallback((fileId?: string) => {
    startDirectProcessing(fileId);
  }, []);

  return {
    queue,
    drawerOpen,
    setDrawerOpen,
    currentResolution,
    setQueueResolution,
    currentWatermarkPreset,
    setQueueWatermarkPreset,
    addToQueue,
    addAllToQueue,
    removeFromQueue,
    cancelTask,
    cancelAll,
    cancelQueueItem: cancelTask,
    retryQueueItem,
    clearCompleted,
    startDirectProcessing: handleStartDirectProcessing,
  };
}

export function startDirectProcessing(fileId?: string) {
  dismissedServerIds.clear();
  if (fileId) {
    globalQueue = globalQueue.map((it) =>
      it.id === fileId
        ? {
            ...it,
            serverManaged: false,
            status: "queued" as const,
            progressPercent: 0,
            progressMsg: "Starting stream processing...",
          }
        : it
    );
  } else {
    globalQueue = globalQueue.map((it) =>
      it.status === "queued"
        ? {
            ...it,
            serverManaged: false,
            progressPercent: 0,
            progressMsg: "Starting stream processing...",
          }
        : it
    );
  }
  notifyListeners();
  if (!isProcessing) {
    processNextQueueItem();
  }
}

export async function enqueueRecordingsForWorker(
  recordings: any[],
  options?: {
    watermark?: any;
    resolution?: VideoResolution;
    customTitle?: string;
    customDescription?: string;
    privacyStatus?: "unlisted" | "public" | "private";
  }
): Promise<{ success: boolean; enqueuedCount: number; message: string }> {
  const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recordings,
      watermark: options?.watermark,
      resolution: options?.resolution,
      customTitle: options?.customTitle,
      customDescription: options?.customDescription,
      privacyStatus: options?.privacyStatus || "unlisted",
    }),
  });
  return res.json();
}
