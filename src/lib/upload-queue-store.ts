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
}

// Global in-memory queue shared across client-side page transitions
let globalQueue: DirectUploadQueueItem[] = [];
let globalResolution: VideoResolution = "720p";
let globalWatermarkPreset: WatermarkPreset = "both";
let isProcessing = false;
let activeAbortController: AbortController | null = null;
let activeProcessingFileId: string | null = null;
const listeners = new Set<() => void>();


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
    if (!isProcessing && globalQueue.some((i) => i.status === "queued")) {
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

  const nextItem = globalQueue.find((i) => i.status === "queued");
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

    const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: currentSignal,
      body: JSON.stringify({
        recordings: [nextItem.recording],
        watermark: finalWatermark,
        watermarkText: (finalWatermark?.type === "image" || finalWatermark?.type === "none") ? "" : (finalWatermark?.text || "Union Education"),
        resolution: isNoWatermark ? "original" : (nextItem.resolution || globalResolution),
        privacyStatus: "unlisted",
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Failed with status ${res.status}`);
    }

    if (currentSignal.aborted) {
      console.log(`⏹️ Task cancelled for ${nextItem.topic}`);
      return;
    }

    globalQueue = globalQueue.map((it) =>
      it.id === fileId
        ? {
            ...it,
            status: "queued",
            progressPercent: 100,
            progressMsg: "Enqueued for Cloud Runner!",
          }
        : it
    );
    notifyListeners();
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
      const hasMore = globalQueue.some((i) => i.status === "queued");
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
    if (!isProcessing && globalQueue.some((i) => i.status === "queued")) {
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
    if (!isProcessing && globalQueue.some((i) => i.status === "queued")) {
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
  };
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
