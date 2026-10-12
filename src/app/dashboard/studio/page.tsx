"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { WatermarkStudio, StudioRecording } from "@/components/WatermarkStudio";
import {
  Film,
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Youtube } from "@/components/icons/Youtube";
import Link from "next/link";
import { useUploadQueue } from "@/lib/upload-queue-store";
import { UploadQueueDrawer } from "@/components/UploadQueueDrawer";

function StudioContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedRecording, setSelectedRecording] = useState<StudioRecording | null>(null);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Shared persistent Upload Queue
  const {
    queue,
    drawerOpen,
    setDrawerOpen,
    currentResolution,
    setQueueResolution,
    addToQueue,
    addAllToQueue,
    removeFromQueue,
    retryQueueItem,
    clearCompleted,
  } = useUploadQueue();

  const loadRecordings = () => {
    setLoading(true);
    fetch("/api/zoom-youtube/recordings")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.recordings) {
          setRecordings(data.recordings);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // 1. Try reading from sessionStorage
    try {
      const stored = sessionStorage.getItem("zoomyt_selected_recording");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && (parsed.fileId || parsed.zoom_file_id) && parsed.downloadUrl) {
          setSelectedRecording({
            fileId: parsed.fileId || parsed.zoom_file_id,
            topic: parsed.topic || "Class Recording",
            downloadUrl: parsed.downloadUrl || parsed.download_url,
            zoomAccountId: parsed.zoomAccountId || parsed.zoom_account_id,
            startTime: parsed.startTime || parsed.recording_start || new Date().toISOString(),
            fileSizeBytes: parsed.fileSizeBytes || parsed.file_size_bytes,
            durationMinutes: parsed.durationMinutes || parsed.duration_minutes,
            hostName: parsed.hostName,
          });
          return;
        }
      }
    } catch {}

    // 2. Try URL query parameters
    const fileId = searchParams.get("fileId");
    const downloadUrl = searchParams.get("downloadUrl");
    const zoomAccountId = searchParams.get("zoomAccountId");
    const topic = searchParams.get("topic") || "Class Recording";
    const startTime = searchParams.get("startTime") || new Date().toISOString();

    if (fileId && downloadUrl && zoomAccountId) {
      setSelectedRecording({
        fileId,
        topic,
        downloadUrl,
        zoomAccountId,
        startTime,
      });
      return;
    }

    // 3. Fallback: fetch queue
    loadRecordings();
  }, [searchParams]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-red-600" />
              Video Watermark Studio
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Step 1: Customize and render watermark &bull; Step 2: Upload to YouTube &amp; auto-clean disk.
            </p>
          </div>
        </div>
      </div>

      {selectedRecording ? (
        <WatermarkStudio
          recording={selectedRecording}
          onClose={() => {
            sessionStorage.removeItem("zoomyt_selected_recording");
            router.push("/dashboard");
          }}
          onSuccess={(result) => {
            console.log("Uploaded successfully from Studio:", result);
          }}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Select a Recording to Open in Studio
              </h2>
              <p className="text-xs text-slate-500">
                Choose any recorded class to preview watermark or directly upload to YouTube without re-encoding.
              </p>
            </div>

            {recordings.length > 0 && (
              <div className="flex items-center gap-1.5 self-start sm:self-auto">
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
                <button
                  onClick={() => addAllToQueue(recordings, "Recorded Queue")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg shadow-sm transition">
                  <Youtube className="w-3.5 h-3.5 text-red-600" />
                  <span>⚡ Direct Upload All ({recordings.length}) to YT</span>
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-red-600 mb-2" />
              <p className="text-sm font-medium">Loading recordings queue...</p>
            </div>
          ) : recordings.length === 0 ? (
            <div className="py-12 text-center text-slate-500 border border-dashed rounded-xl">
              <Film className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium">No recordings found in queue.</p>
              <Link
                href="/dashboard"
                className="mt-3 inline-block text-xs font-semibold text-blue-600 hover:underline">
                &larr; Return to Zoom &rarr; YouTube dashboard to browse or sync recordings
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordings.map((rec) => {
                const recFileId = rec.zoom_file_id || rec.fileId || rec.id;
                const queueItem = queue.find((q) => q.id === recFileId);
                const queuePosition =
                  queueItem && queueItem.status === "queued"
                    ? queue.filter((q) => q.status === "queued").findIndex((q) => q.id === recFileId) + 1
                    : null;
                const toMB = (bytes?: number) => (bytes ? `${Math.round(bytes / (1024 * 1024))} MB` : "~");

                return (
                  <div
                    key={rec.id || recFileId}
                    className="border border-slate-200 rounded-xl p-4 hover:border-red-400 hover:shadow-md transition bg-slate-50/50 flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-2">
                        {rec.topic}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <span>{new Date(rec.recording_start || rec.startTime).toLocaleDateString()}</span>
                        <span>&bull;</span>
                        <span>{rec.duration_minutes || rec.durationMinutes || 0} min</span>
                        <span>&bull;</span>
                        <span className="font-mono text-slate-700 bg-slate-100 px-1 py-0.2 rounded text-[11px]">
                          {toMB(rec.file_size_bytes || rec.fileSizeBytes)}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      {/* Direct Upload / Queue Action */}
                      {queueItem ? (
                        queueItem.status === "uploaded" ? (
                          <a
                            href={queueItem.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full py-2 px-3 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition shadow-sm flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Uploaded (View YT)</span>
                            <ExternalLink className="w-3 h-3 text-emerald-600" />
                          </a>
                        ) : queueItem.status === "uploading" ? (
                          <div className="space-y-1 bg-blue-50 border border-blue-200 p-2 rounded-lg">
                            <div className="flex items-center justify-between text-xs font-bold text-blue-700">
                              <span className="flex items-center gap-1.5">
                                <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                Uploading to YT...
                              </span>
                              <span className="font-mono">{queueItem.progressPercent || 15}%</span>
                            </div>
                            <div className="w-full bg-blue-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${queueItem.progressPercent || 15}%` }}
                              />
                            </div>
                          </div>
                        ) : queueItem.status === "failed" ? (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 border border-red-200 text-xs">
                            <span className="text-red-700 font-semibold truncate">Upload Failed</span>
                            <button
                              onClick={() => retryQueueItem(recFileId)}
                              className="px-2 py-0.5 text-xs font-bold text-red-700 bg-white hover:bg-red-50 border border-red-300 rounded">
                              Retry
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              Queued (#{queuePosition})
                            </span>
                            <button
                              onClick={() => removeFromQueue(recFileId)}
                              className="text-slate-400 hover:text-red-500 font-bold px-1"
                              title="Cancel">
                              ✕
                            </button>
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() =>
                            addToQueue(
                              {
                                fileId: recFileId,
                                topic: rec.topic,
                                downloadUrl: rec.download_url || rec.downloadUrl,
                                zoomAccountId: rec.zoom_account_id || rec.zoomAccountId,
                                startTime: rec.recording_start || rec.startTime,
                                durationMinutes: rec.duration_minutes || rec.durationMinutes,
                                fileSizeBytes: rec.file_size_bytes || rec.fileSizeBytes,
                              },
                              "Recording Queue"
                            )
                          }
                          className="w-full py-2 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm flex items-center justify-center gap-1.5">
                          <Youtube className="w-3.5 h-3.5 text-red-300" />
                          <span>Direct Upload to YT</span>
                        </button>
                      )}

                      {/* Open in Studio Button */}
                      <button
                        onClick={() => {
                          const sel = {
                            fileId: recFileId,
                            topic: rec.topic,
                            downloadUrl: rec.download_url || rec.downloadUrl,
                            zoomAccountId: rec.zoom_account_id || rec.zoomAccountId,
                            startTime: rec.recording_start || rec.startTime,
                            fileSizeBytes: rec.file_size_bytes || rec.fileSizeBytes,
                            durationMinutes: rec.duration_minutes || rec.durationMinutes,
                          };
                          sessionStorage.setItem("zoomyt_selected_recording", JSON.stringify(sel));
                          setSelectedRecording(sel);
                        }}
                        className="w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition shadow-sm flex items-center justify-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-slate-500" />
                        <span>Open in Watermark Studio</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Shared Persistent Floating Upload Queue Drawer */}
      <UploadQueueDrawer
        queue={queue}
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        clearCompleted={clearCompleted}
        retryQueueItem={retryQueueItem}
        removeFromQueue={removeFromQueue}
        currentResolution={currentResolution}
        setQueueResolution={setQueueResolution}
      />
    </div>
  );
}

export default function StudioPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-500">Loading Studio...</div>}>
      <StudioContent />
    </Suspense>
  );
}
