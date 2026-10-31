import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { exec, spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { checkDeviceStorage, getSafeTempDir } from "@/lib/storage";
import { readZoomYtState } from "@/lib/zoomyt-store";
import {
  recordActivityStart,
  recordActivitySuccess,
  recordActivityFailure,
} from "@/lib/activity-logger";
import {
  generateAutoThumbnailForUpload,
  uploadThumbnailToYouTube,
} from "@/lib/thumbnail-server";

const execAsync = promisify(exec);

export interface ActiveTaskHandle {
  fileId: string;
  activityId?: string;
  abortController: AbortController;
  childProcess?: ChildProcess;
  rawPath?: string;
  procPath?: string;
}

const activeTasksMap = new Map<string, ActiveTaskHandle>();

export function registerActiveTask(fileId: string, handle: ActiveTaskHandle) {
  activeTasksMap.set(fileId, handle);
}

export function unregisterActiveTask(fileId: string) {
  activeTasksMap.delete(fileId);
}

export async function cancelPipelineTask(fileId: string): Promise<boolean> {
  const task = activeTasksMap.get(fileId);
  const tempDir = getSafeTempDir();
  const rawPath = task?.rawPath || path.join(tempDir, `raw_${fileId}.mp4`);
  const procPath = task?.procPath || path.join(tempDir, `proc_${fileId}.mp4`);

  if (task) {
    try {
      task.abortController.abort();
    } catch {}
    if (task.childProcess) {
      try {
        task.childProcess.kill("SIGKILL");
      } catch {}
    }
    if (task.activityId) {
      await recordActivityFailure(task.activityId, "Cancelled by user");
    }
    activeTasksMap.delete(fileId);
  }

  // Always delete partial temp files immediately
  await fsp.unlink(rawPath).catch(() => {});
  await fsp.unlink(procPath).catch(() => {});

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_recordings").update({
        status: "failed",
        error_message: "Cancelled by user",
      }).eq("zoom_file_id", fileId);
    } catch {}
  }

  return true;
}


export type VideoResolution = "1080p" | "720p" | "480p" | "original";

export interface WatermarkProgressInfo {
  percent: number;
  speed?: string;
  fps?: number;
  message: string;
}

export interface PipelineProgressInfo {
  percent: number;
  stage: "downloading" | "watermarking" | "uploading" | "done";
  message: string;
}

export interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
}

export async function getVideoMetadata(filePath: string): Promise<VideoMetadata> {
  try {
    const isNetwork = filePath.startsWith("http://") || filePath.startsWith("https://");
    const netFlags = isNetwork ? "-reconnect 1 -reconnect_at_eof 1 -reconnect_streamed 1 -reconnect_delay_max 5 " : "";
    const { stdout } = await execAsync(
      `ffprobe -v error ${netFlags}-select_streams v:0 -show_entries stream=width,height,duration -show_entries format=duration -of json "${filePath}"`,
      { timeout: 15000 }
    );
    const parsed = JSON.parse(stdout);
    const stream = parsed?.streams?.[0];
    const width = stream?.width || 1280;
    const height = stream?.height || 720;
    const durStream = parseFloat(stream?.duration || "0");
    const durFormat = parseFloat(parsed?.format?.duration || "0");
    const duration = durStream > 0 ? durStream : durFormat > 0 ? durFormat : 0;
    return { width, height, duration };
  } catch {
    return { width: 1280, height: 720, duration: 0 };
  }
}

/**
 * Resolves the authenticated Zoom cloud recording download URL to its direct presigned CDN/S3 URL.
 * Zoom requires 'Authorization: Bearer <token>' and responds with a 302 redirect to a seekable presigned
 * MP4 URL (CloudFront/S3/SSR) which ffmpeg/ffprobe can stream and watermark frame-by-frame directly over HTTP.
 */
export async function getDirectStreamUrl(downloadUrl: string, accessToken: string): Promise<string> {
  if (
    downloadUrl.includes("ssrweb.zoom.us") ||
    downloadUrl.includes("s3.amazonaws.com") ||
    downloadUrl.includes("cloudfront.net")
  ) {
    return downloadUrl;
  }

  try {
    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "manual",
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (location) {
        return location;
      }
    }

    if (res.ok) {
      return res.url || downloadUrl;
    }

    // Try HEAD with follow redirect to get final destination URL
    const headRes = await fetch(downloadUrl, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "follow",
    });
    if (headRes.ok && headRes.url) {
      return headRes.url;
    }
  } catch (err: any) {
    console.warn("⚠️ Failed to resolve presigned direct stream URL:", err?.message || err);
  }

  // Fallback to query parameter if redirect resolution wasn't successful
  try {
    const urlObj = new URL(downloadUrl);
    urlObj.searchParams.set("access_token", accessToken);
    return urlObj.toString();
  } catch {
    return downloadUrl;
  }
}

export async function getVideoDuration(filePath: string): Promise<number> {
  const meta = await getVideoMetadata(filePath);
  return meta.duration;
}

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatEta(sec: number): string {
  if (sec <= 0) return "few sec";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}s`;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

function runFfmpegWithLiveProgress(
  args: string[],
  totalDurationSeconds: number,
  onProgress?: (info: WatermarkProgressInfo) => void,
  abortSignal?: AbortSignal,
  onProcessSpawn?: (proc: ChildProcess) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      return reject(new Error("Operation cancelled by user"));
    }

    const fullArgs = [...args, "-progress", "pipe:1"];
    const proc = spawn("ffmpeg", fullArgs);
    if (onProcessSpawn) onProcessSpawn(proc);

    let aborted = false;
    const abortHandler = () => {
      aborted = true;
      try {
        proc.kill("SIGKILL");
      } catch {}
      reject(new Error("Operation cancelled by user"));
    };

    if (abortSignal) {
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    }

    const startTime = Date.now();
    let stderr = "";
    let outTimeUs = 0;
    let speed = "";
    let fps = 0;

    proc.stdout.on("data", (chunk: Buffer) => {
      if (aborted) return;
      const text = chunk.toString();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("out_time_us=")) {
          outTimeUs = parseInt(trimmed.split("=")[1], 10);
        } else if (trimmed.startsWith("speed=")) {
          speed = trimmed.split("=")[1].trim();
        } else if (trimmed.startsWith("fps=")) {
          fps = parseFloat(trimmed.split("=")[1]);
        }
      }
      if (outTimeUs > 0 && totalDurationSeconds > 0) {
        const secs = outTimeUs / 1000000;
        const percent = Math.min(Math.round((secs / totalDurationSeconds) * 100), 99);
        const curFormatted = formatSeconds(secs);
        const totalFormatted = formatSeconds(totalDurationSeconds);

        let etaStr = "";
        const speedVal = speed ? parseFloat(speed.replace("x", "")) : 0;
        if (speedVal > 0 && totalDurationSeconds > secs) {
          const remSec = Math.round((totalDurationSeconds - secs) / speedVal);
          etaStr = ` • ~${formatEta(remSec)} left`;
        } else {
          const elapsedSec = (Date.now() - startTime) / 1000;
          if (percent > 3) {
            const totalEstSec = (elapsedSec / percent) * 100;
            const remSec = Math.max(1, Math.round(totalEstSec - elapsedSec));
            etaStr = ` • ~${formatEta(remSec)} left`;
          }
        }

        const statsStr = `${curFormatted} / ${totalFormatted}${speed ? ` at ${speed}` : ""}${etaStr}`;
        const msg = `${percent}% (${statsStr})`;
        onProgress?.({
          percent,
          speed,
          fps,
          message: msg,
        });
      }
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (abortSignal) {
        abortSignal.removeEventListener("abort", abortHandler);
      }
      if (aborted) return;
      if (code === 0) {
        if (onProgress && totalDurationSeconds > 0) {
          const totalFormatted = formatSeconds(totalDurationSeconds);
          onProgress({
            percent: 100,
            speed,
            fps,
            message: `100% (${totalFormatted} encoded)`,
          });
        }
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-600)}`));
      }
    });

    proc.on("error", (err) => {
      if (abortSignal) {
        abortSignal.removeEventListener("abort", abortHandler);
      }
      if (aborted) return;
      reject(err);
    });
  });
}

export interface WatermarkOptions {
  type?: "image" | "text" | "both" | "none";
  resolution?: VideoResolution;
  // Image watermark options
  logoPath?: string;
  imageScale?: number;    // e.g. 0.18
  imageOpacity?: number;  // e.g. 0.85
  imagePosX?: number;     // 0.0 to 1.0 (e.g. 0.78 for top-right)
  imagePosY?: number;     // 0.0 to 1.0 (e.g. 0.04 for top-right)

  // Text watermark options
  text?: string;
  fontSize?: number;      // e.g. 32
  textScale?: number;     // e.g. 0.22 of video width
  textOpacity?: number;   // e.g. 0.90
  textPosX?: number;      // 0.0 to 1.0 (e.g. 0.04 for bottom-left)
  textPosY?: number;      // 0.0 to 1.0 (e.g. 0.92 for bottom-left)

  // Legacy/Unified aliases:
  scale?: number;
  opacity?: number;
  posX?: number;
  posY?: number;
}

export interface ProcessRecordingOptions {
  meetingTopic: string;
  meetingDate?: string;
  downloadUrl: string;
  fileId: string;
  zoomAccessToken: string;
  tempDir?: string;
  watermark?: WatermarkOptions;
  watermarkText?: string;
  watermarkLogoPath?: string;
  resolution?: VideoResolution;
  customTitle?: string;
  customDescription?: string;
  privacyStatus?: "unlisted" | "public" | "private";
  accountName?: string;
  durationMinutes?: number;
  fileSizeBytes?: number;
}

export interface ProcessResult {
  success: boolean;
  youtubeVideoId?: string;
  youtubeUrl?: string;
  error?: string;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Helper to check and wait until network connection is restored if lost.
 */
async function waitForNetworkRegain(maxWaitSeconds = 60, onWaiting?: (secLeft: number) => void): Promise<boolean> {
  const start = Date.now();
  while ((Date.now() - start) < maxWaitSeconds * 1000) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://www.google.com/generate_204", { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok || res.status === 204) return true;
    } catch {}
    if (onWaiting) {
      const rem = Math.max(1, Math.round((maxWaitSeconds * 1000 - (Date.now() - start)) / 1000));
      onWaiting(rem);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Downloads a cloud recording MP4 from Zoom using Bearer token with full Range-resumable download and network drop recovery.
 */
export async function downloadZoomVideo(
  downloadUrl: string,
  accessToken: string,
  destPath: string,
  onProgress?: (bytes: number, totalBytes: number, etaMsg?: string) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  if (abortSignal?.aborted) {
    throw new Error("Operation cancelled by user");
  }

  const urlObj = new URL(downloadUrl);
  urlObj.searchParams.set("access_token", accessToken);

  let totalBytes = 0;
  let downloadedBytes = 0;
  const maxRetries = 6;
  let attempt = 0;

  // Check if partially downloaded file exists
  if (fs.existsSync(destPath)) {
    try {
      downloadedBytes = (await fsp.stat(destPath)).size;
    } catch {}
  }

  const startTime = Date.now();

  while (attempt < maxRetries) {
    if (abortSignal?.aborted) {
      throw new Error("Operation cancelled by user");
    }
    attempt++;
    let fileStream: fs.WriteStream | null = null;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
      };

      if (downloadedBytes > 0) {
        headers["Range"] = `bytes=${downloadedBytes}-`;
      }

      const res = await fetch(urlObj.toString(), {
        headers,
        signal: abortSignal,
      });

      if (res.status === 416) {
        // Range not satisfiable: file is already complete!
        return;
      }

      if (!res.ok && res.status !== 206) {
        const err = await res.text();
        throw new Error(`Failed to download Zoom recording (${res.status}): ${err}`);
      }

      if (totalBytes === 0) {
        const contentRange = res.headers.get("content-range");
        if (contentRange) {
          const match = contentRange.match(/\/(\d+)$/);
          if (match) totalBytes = parseInt(match[1], 10);
        }
        if (!totalBytes) {
          const cl = Number(res.headers.get("content-length")) || 0;
          totalBytes = downloadedBytes + cl;
        }
      }

      fileStream = fs.createWriteStream(destPath, { flags: downloadedBytes > 0 ? "a" : "w" });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body stream from Zoom");

      let streamFinished = false;
      while (true) {
        if (abortSignal?.aborted) {
          if (fileStream) {
            try { fileStream.destroy(); } catch {}
          }
          throw new Error("Operation cancelled by user");
        }
        const { done, value } = await reader.read();
        if (done) {
          streamFinished = true;
          break;
        }
        if (value) {
          const canWrite = fileStream.write(Buffer.from(value));
          downloadedBytes += value.length;
          if (!canWrite && fileStream) {
            await new Promise<void>((resDrain) => fileStream?.once("drain", resDrain));
          }
          if (onProgress) {
            const elapsedSec = (Date.now() - startTime) / 1000;
            let etaMsg = "";
            if (totalBytes > downloadedBytes && elapsedSec > 0.8 && downloadedBytes > 0) {
              const speedBps = downloadedBytes / elapsedSec;
              const remSec = Math.round((totalBytes - downloadedBytes) / speedBps);
              if (remSec > 0) etaMsg = ` • ~${formatEta(remSec)} left`;
            }
            onProgress(downloadedBytes, totalBytes, etaMsg);
          }
        }
      }

      await new Promise<void>((resolve, reject) => {
        fileStream?.end((err?: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      if (streamFinished && (totalBytes === 0 || downloadedBytes >= totalBytes)) {
        return; // Success!
      }
    } catch (err: any) {
      if (fileStream) {
        try { fileStream.destroy(); } catch {}
      }

      if (abortSignal?.aborted || err?.message?.includes("cancelled by user") || err?.name === "AbortError") {
        throw new Error("Operation cancelled by user");
      }

      if (fs.existsSync(destPath)) {
        try { downloadedBytes = (await fsp.stat(destPath)).size; } catch {}
      }

      if (attempt >= maxRetries) {
        throw new Error(`Download failed after ${maxRetries} network attempts: ${err.message}`);
      }

      const backoffSec = Math.min(attempt * 3, 20);
      console.warn(`⚠️ Network drop during download (${err.message}). Resuming from ${Math.round(downloadedBytes / 1048576)} MB in ${backoffSec}s (Attempt ${attempt}/${maxRetries})...`);

      onProgress?.(
        downloadedBytes,
        totalBytes,
        ` • Network paused. Resuming from ${Math.round(downloadedBytes / 1048576)} MB in ${backoffSec}s...`
      );

      await waitForNetworkRegain(backoffSec);
    }
  }
}

/**
 * Generates a clean, transparent PNG badge with white text on a subtle dark pill background.
 */
async function generateTextBadgePng(
  text: string,
  outputPath: string,
  fontSize = 28,
  videoHeight = 720
): Promise<string> {
  const pyScript = `
import sys
from PIL import Image, ImageDraw, ImageFont

text = sys.argv[1]
output = sys.argv[2]
base_font_size = int(sys.argv[3]) if len(sys.argv) > 3 else 28
vh = int(sys.argv[4]) if len(sys.argv) > 4 else 720

scale_factor = max(0.5, min(2.5, vh / 720.0))
font_size = max(14, int(base_font_size * scale_factor))
pad_x = max(8, int(16 * scale_factor))
pad_y = max(4, int(8 * scale_factor))
radius = max(4, int(8 * scale_factor))

try:
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
except Exception:
    try:
        font = ImageFont.truetype("/System/Library/Fonts/SFCompact.ttf", font_size)
    except Exception:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()

dummy = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
d = ImageDraw.Draw(dummy)
bbox = d.textbbox((0, 0), text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]

w = text_w + (pad_x * 2)
h = text_h + (pad_y * 2)

img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=(0, 0, 0, 180))
draw.text((pad_x - bbox[0], pad_y - bbox[1]), text, fill=(255, 255, 255, 245), font=font)
img.save(output)
`;
  const sanitized = text.replace(/['"\\]/g, "");
  const cmd = `python3 -c '${pyScript}' "${sanitized}" "${outputPath}" ${fontSize} ${videoHeight}`;
  await execAsync(cmd);
  return outputPath;
}

/**
 * Resolves a logo file path whether given as public URL (/assets/images/...) or absolute path.
 */
function resolveLogoPath(inputPath?: string): string {
  if (inputPath) {
    if (path.isAbsolute(inputPath) && fs.existsSync(inputPath)) {
      return inputPath;
    }
    const clean = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
    const fromPublic = path.join(process.cwd(), "public", clean);
    if (fs.existsSync(fromPublic)) return fromPublic;
    const direct = path.join(process.cwd(), clean);
    if (fs.existsSync(direct)) return direct;
  }
  // Default to logo1.png or logo.png
  const def1 = path.join(process.cwd(), "public", "assets", "images", "logo1.png");
  if (fs.existsSync(def1)) return def1;
  const def2 = path.join(process.cwd(), "public", "assets", "images", "logo.png");
  if (fs.existsSync(def2)) return def2;
  return "";
}

/**
 * Watermarks a video using ffmpeg with exact position, scale, and opacity.
 */
export async function watermarkVideo(
  inputPath: string,
  outputPath: string,
  options: WatermarkOptions = {},
  onProgress?: (info: WatermarkProgressInfo) => void,
  abortSignal?: AbortSignal,
  onProcessSpawn?: (proc: ChildProcess) => void,
  fallbackDurationSeconds = 0
): Promise<void> {
  if (abortSignal?.aborted) {
    throw new Error("Operation cancelled by user");
  }

  const type = options.type || "image";
  const resolution = options.resolution || "original";
  const targetHeight =
    resolution === "480p" ? 480 : resolution === "720p" ? 720 : resolution === "1080p" ? 1080 : null;

  const meta = await getVideoMetadata(inputPath);
  const inWidth = meta.width;
  const inHeight = meta.height;
  const totalDuration = meta.duration > 0 ? meta.duration : (fallbackDurationSeconds > 0 ? fallbackDurationSeconds : 0);
  console.log(`🎬 Input video: ${inWidth}x${inHeight}, duration: ${totalDuration}s`);

  const shouldScaleVideo = Boolean(targetHeight && inHeight > targetHeight);
  const outHeight = shouldScaleVideo ? targetHeight! : inHeight;
  const outWidth = Math.round(inWidth * (outHeight / inHeight));
  const effectiveOutWidth = outWidth % 2 === 0 ? outWidth : outWidth + 1;
  const effectiveOutHeight = outHeight % 2 === 0 ? outHeight : outHeight + 1;

  const isMac = process.platform === "darwin";
  const hwaccelArgs = isMac ? ["-hwaccel", "videotoolbox"] : [];
  const videoEncoderArgs = isMac
    ? ["-c:v", "h264_videotoolbox", "-b:v", "450k", "-prio_speed", "1"]
    : ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "fastdecode", "-crf", "28", "-threads", "0"];

  const isNetworkStream = inputPath.startsWith("http://") || inputPath.startsWith("https://");
  const netInputArgs = isNetworkStream
    ? ["-reconnect", "1", "-reconnect_at_eof", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5"]
    : [];

  if (type === "none") {
    // If no watermark and original resolution, stream copy is instant (0 re-encoding)
    if (!shouldScaleVideo) {
      const cmd = `ffmpeg -y ${netInputArgs.join(" ")} -i "${inputPath}" -c copy "${outputPath}"`;
      await execAsync(cmd);
      if (onProgress) {
        onProgress({ percent: 100, message: "Stream copy complete" });
      }
      return;
    }
    // If no watermark but user requested downscaling (e.g. 720p or 480p)
    const scaleArgs = [
      "-y",
      ...hwaccelArgs,
      ...netInputArgs,
      "-i",
      inputPath,
      "-vf",
      `scale=${effectiveOutWidth}:${effectiveOutHeight}:flags=fast_bilinear`,
      ...videoEncoderArgs,
      "-sws_flags",
      "fast_bilinear",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ];
    try {
      await runFfmpegWithLiveProgress(scaleArgs, totalDuration, onProgress, abortSignal, onProcessSpawn);
    } catch (err: any) {
      if (abortSignal?.aborted || err?.message?.includes("cancelled by user")) {
        throw new Error("Operation cancelled by user");
      }
      if (isMac) {
        const fallbackArgs = [
          "-y",
          ...netInputArgs,
          "-i",
          inputPath,
          "-vf",
          `scale=${effectiveOutWidth}:${effectiveOutHeight}:flags=fast_bilinear`,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "fastdecode",
          "-crf",
          "28",
          "-threads",
          "0",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
          outputPath,
        ];
        await runFfmpegWithLiveProgress(fallbackArgs, totalDuration, onProgress, abortSignal, onProcessSpawn);
      } else {
        throw err;
      }
    }
    return;
  }

  const tempBadgesToClean: string[] = [];

  try {
    const logoFile = resolveLogoPath(options.logoPath);
    const logoScale = options.imageScale ?? options.scale ?? 0.18;
    const logoOpacity = options.imageOpacity ?? options.opacity ?? 0.85;
    const logoPosX = options.imagePosX ?? options.posX ?? 0.78;
    const logoPosY = options.imagePosY ?? options.posY ?? 0.04;

    const textStr = options.text || "Union Education";
    const textOpacity = options.textOpacity ?? options.opacity ?? 0.85;
    const textPosX = options.textPosX ?? options.posX ?? 0.04;
    const textPosY = options.textPosY ?? options.posY ?? 0.90;
    const fontSize = options.fontSize ?? 28;

    let filterComplex = "";
    const inputArgs: string[] = [...netInputArgs, "-i", inputPath];

    // Base video stream name
    let baseStream = "[0:v]";
    const filterParts: string[] = [];
    if (shouldScaleVideo) {
      filterParts.push(`[0:v]scale=${effectiveOutWidth}:${effectiveOutHeight}:flags=fast_bilinear[vbase]`);
      baseStream = "[vbase]";
    }

    let logoTargetW = Math.round(effectiveOutWidth * logoScale);
    if (logoTargetW % 2 !== 0) logoTargetW += 1;

    if (type === "image" && logoFile && fs.existsSync(logoFile)) {
      inputArgs.push("-i", logoFile);
      filterParts.push(`[1:v]scale=${logoTargetW}:-2:flags=lanczos,format=rgba,colorchannelmixer=aa=${logoOpacity}[wm_trans]`);
      filterParts.push(`${baseStream}[wm_trans]overlay=W*${logoPosX}:H*${logoPosY}`);
      filterComplex = filterParts.join(";");
    } else if (type === "text" || (type === "image" && !logoFile)) {
      const badgeFile = path.join(path.dirname(outputPath), `badge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`);
      tempBadgesToClean.push(badgeFile);
      await generateTextBadgePng(textStr, badgeFile, fontSize, effectiveOutHeight);

      inputArgs.push("-i", badgeFile);
      filterParts.push(`[1:v]format=rgba,colorchannelmixer=aa=${textOpacity}[txt_trans]`);
      filterParts.push(`${baseStream}[txt_trans]overlay=W*${textPosX}:H*${textPosY}`);
      filterComplex = filterParts.join(";");
    } else if (type === "both" && logoFile && fs.existsSync(logoFile)) {
      const badgeFile = path.join(path.dirname(outputPath), `badge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`);
      tempBadgesToClean.push(badgeFile);
      await generateTextBadgePng(textStr, badgeFile, fontSize, effectiveOutHeight);

      inputArgs.push("-i", logoFile);
      inputArgs.push("-i", badgeFile);
      filterParts.push(`[1:v]scale=${logoTargetW}:-2:flags=lanczos,format=rgba,colorchannelmixer=aa=${logoOpacity}[wm_trans]`);
      filterParts.push(`[2:v]format=rgba,colorchannelmixer=aa=${textOpacity}[txt_trans]`);
      filterParts.push(`${baseStream}[wm_trans]overlay=W*${logoPosX}:H*${logoPosY}[base_wm]`);
      filterParts.push(`[base_wm][txt_trans]overlay=W*${textPosX}:H*${textPosY}`);
      filterComplex = filterParts.join(";");
    } else {
      // Fallback: direct copy
      const cmd = `ffmpeg -y -i "${inputPath}" -c copy "${outputPath}"`;
      await execAsync(cmd);
      return;
    }

    const mainArgs = [
      "-y",
      ...hwaccelArgs,
      ...inputArgs,
      "-filter_complex",
      filterComplex,
      ...videoEncoderArgs,
      "-sws_flags",
      "fast_bilinear",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ];

    console.log(`🎬 Running live ffmpeg with hardware acceleration (Res: ${resolution})...`);

    try {
      await runFfmpegWithLiveProgress(mainArgs, totalDuration, onProgress, abortSignal, onProcessSpawn);
    } catch (encErr: any) {
      if (abortSignal?.aborted || encErr?.message?.includes("cancelled by user")) {
        throw new Error("Operation cancelled by user");
      }
      if (isMac) {
        console.warn("Hardware videotoolbox failed, falling back to libx264 ultrafast:", encErr);
        const fallbackArgs = [
          "-y",
          ...inputArgs,
          "-filter_complex",
          filterComplex,
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-tune",
          "fastdecode",
          "-crf",
          "28",
          "-threads",
          "0",
          "-c:a",
          "copy",
          "-movflags",
          "+faststart",
          outputPath,
        ];
        await runFfmpegWithLiveProgress(fallbackArgs, totalDuration, onProgress, abortSignal, onProcessSpawn);
      } else {
        throw encErr;
      }
    }
    if (!fs.existsSync(outputPath)) {
      throw new Error(`ffmpeg failed to output file: ${outputPath}`);
    }
  } finally {
    for (const b of tempBadgesToClean) {
      await fsp.unlink(b).catch(() => {});
    }
  }
}


/**
 * Uploads video to YouTube via googleapis.
 */
export async function uploadVideoToYouTube(
  videoPath: string,
  metadata: {
    title: string;
    description: string;
    privacyStatus?: "unlisted" | "public" | "private";
    thumbnailBuffer?: Buffer;
  },
  onProgress?: (bytesUploaded: number, totalBytes: number, etaMsg?: string) => void,
  abortSignal?: AbortSignal
): Promise<{ videoId: string; url: string }> {
  if (abortSignal?.aborted) {
    throw new Error("Operation cancelled by user");
  }

  const state = await readZoomYtState();
  let refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (state.youtube?.encryptedRefreshToken) {
    try {
      refreshToken = decryptToken(state.youtube.encryptedRefreshToken);
    } catch {}
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing YouTube OAuth credentials or refresh token");
  }

  const totalBytes = (await fsp.stat(videoPath)).size;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const safeTitle = metadata.title.replace(/[<>]/g, "").slice(0, 100);

  const maxUploadAttempts = 4;
  let attempt = 0;

  while (attempt < maxUploadAttempts) {
    if (abortSignal?.aborted) {
      throw new Error("Operation cancelled by user");
    }
    attempt++;
    const upStartTime = Date.now();
    const videoStream = fs.createReadStream(videoPath);

    try {
      const res = await youtube.videos.insert(
        {
          part: ["snippet", "status"],
          requestBody: {
            snippet: {
              title: safeTitle,
              description: metadata.description,
              tags: ["education", "unioneducation", "nepal", "classes"],
              categoryId: "27", // Education
            },
            status: {
              privacyStatus: metadata.privacyStatus || "unlisted",
              selfDeclaredMadeForKids: false,
            },
          },
          media: {
            mimeType: "video/mp4",
            body: videoStream,
          },
        },
        {
          onUploadProgress: (evt: any) => {
            if (abortSignal?.aborted) {
              try { videoStream.destroy(); } catch {}
              return;
            }
            if (onProgress && evt.bytesRead) {
              const elapsedSec = (Date.now() - upStartTime) / 1000;
              let etaMsg = "";
              if (totalBytes > evt.bytesRead && elapsedSec > 0.8 && evt.bytesRead > 0) {
                const speedBps = evt.bytesRead / elapsedSec;
                const remSec = Math.round((totalBytes - evt.bytesRead) / speedBps);
                if (remSec > 0) etaMsg = ` • ~${formatEta(remSec)} left`;
              }
              onProgress(evt.bytesRead, totalBytes, etaMsg);
            }
          },
        }
      );

      const videoId = res.data.id;
      if (!videoId) throw new Error("YouTube did not return a video ID");

      if (metadata.thumbnailBuffer && metadata.thumbnailBuffer.length > 0) {
        try {
          console.log(`🎨 Uploading custom 1080p thumbnail for YouTube video ${videoId}...`);
          const { Readable } = await import("node:stream");
          await youtube.thumbnails.set({
            videoId,
            media: {
              mimeType: "image/png",
              body: Readable.from(metadata.thumbnailBuffer),
            },
          });
          console.log(`✅ [YouTube] Custom 1080p thumbnail successfully set on video ${videoId}!`);
        } catch (thumbErr: any) {
          console.warn(`⚠️ [YouTube] Thumbnail upload warning (video was uploaded successfully): ${thumbErr?.message || thumbErr}`);
        }
      }

      return {
        videoId,
        url: `https://youtu.be/${videoId}`,
      };
    } catch (err: any) {
      try { videoStream.destroy(); } catch {}

      if (abortSignal?.aborted || err?.message?.includes("cancelled by user")) {
        throw new Error("Operation cancelled by user");
      }

      if (attempt >= maxUploadAttempts) {
        throw new Error(`YouTube upload failed after ${maxUploadAttempts} attempts: ${err.message}`);
      }

      const waitSec = Math.min(attempt * 5, 25);
      console.warn(`⚠️ Network drop during YouTube upload: ${err.message}. Waiting ${waitSec}s for network regain (Attempt ${attempt}/${maxUploadAttempts})...`);
      onProgress?.(
        0,
        totalBytes,
        ` • Network dropped. Resuming in ${waitSec}s (Attempt ${attempt}/${maxUploadAttempts})...`
      );

      await waitForNetworkRegain(waitSec);
    }
  }

  throw new Error("YouTube upload failed after retrying");
}

/**
 * End-to-end pipeline for a single recording:
 * 1. Storage check
 * 2. Download from Zoom
 * 3. Watermark with ffmpeg
 * 4. Upload to YouTube
 * 5. Cleanup temp files
 * 6. Record to Supabase
 */
export async function processRecordingEndToEnd(
  options: ProcessRecordingOptions,
  onProgress?: (info: PipelineProgressInfo) => void,
  abortSignal?: AbortSignal
): Promise<ProcessResult> {
  const localController = new AbortController();
  const effectiveSignal = abortSignal || localController.signal;

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      try { localController.abort(); } catch {}
    }, { once: true });
  }

  if (effectiveSignal.aborted) {
    return { success: false, error: "Operation cancelled by user" };
  }

  const tempDir = options.tempDir || getSafeTempDir();
  await fsp.mkdir(tempDir, { recursive: true });

  const rawPath = path.join(tempDir, `raw_${options.fileId}.mp4`);
  const procPath = path.join(tempDir, `proc_${options.fileId}.mp4`);

  const activityId = `act_${Date.now()}_${options.fileId.slice(0, 8)}`;
  await recordActivityStart({
    id: activityId,
    fileId: options.fileId,
    topic: options.meetingTopic,
    customTitle: options.customTitle,
    accountName: options.accountName,
    durationMinutes: options.durationMinutes,
    fileSizeBytes: options.fileSizeBytes,
    privacyStatus: options.privacyStatus || "unlisted",
    resolution: options.resolution || "original",
    watermarkType: options.watermark?.type || "none",
    status: "processing",
    startedAt: new Date().toISOString(),
  });

  const taskHandle: ActiveTaskHandle = {
    fileId: options.fileId,
    activityId,
    abortController: localController,
    rawPath,
    procPath,
  };
  registerActiveTask(options.fileId, taskHandle);

  const onProcessSpawn = (proc: ChildProcess) => {
    taskHandle.childProcess = proc;
  };

  const supabase = getSupabase();

  try {
    const storage = await checkDeviceStorage({ targetDir: tempDir, criticalThresholdGB: 2 });
    if (storage.status === "critical") {
      throw new Error(`Device storage critical: only ${storage.freeGB} GB free. Need at least 2 GB.`);
    }

    if (effectiveSignal.aborted) {
      throw new Error("Operation cancelled by user");
    }

    if (supabase) {
      try {
        const { error: updErr } = await supabase
          .from("zy_recordings")
          .update({
            topic: options.meetingTopic,
            status: "downloading",
            updated_at: new Date().toISOString(),
          })
          .eq("zoom_file_id", options.fileId);
        if (updErr) console.warn("[Pipeline] Failed to set status=downloading:", updErr.message);
      } catch (err) {
        console.warn("[Pipeline] Error updating status=downloading:", err);
      }
    }

    const watermarkOpts: WatermarkOptions = {
      ...(options.watermark ? options.watermark : { type: "none" }),
      text: options.watermark?.text || options.watermarkText || "Union Education",
      logoPath: options.watermark?.logoPath || options.watermarkLogoPath,
      resolution: options.resolution || options.watermark?.resolution || "original",
    };

    let uploadFilePath = rawPath;
    const hasWatermark = Boolean(watermarkOpts.type && watermarkOpts.type !== "none");
    const needsProcessing = hasWatermark;
    const fallbackDuration = (options.durationMinutes || 0) * 60;

    if (needsProcessing) {
      if (supabase) {
        try {
          await supabase.from("zy_recordings").update({
            status: "watermarking",
          }).eq("zoom_file_id", options.fileId);
        } catch {}
      }

      console.log(`\n========================================`);
      console.log(`▶ Starting Simultaneous Stream Processing for: ${options.meetingTopic}`);
      console.log(`========================================`);
      console.log(`🎨 Auto Watermark Mode (Type: ${watermarkOpts.type}, Res: ${watermarkOpts.resolution})...`);

      const resLabel = watermarkOpts.resolution && watermarkOpts.resolution !== "original" ? ` (${watermarkOpts.resolution})` : "";

      try {
        console.log(`🔗 Resolving authenticated Zoom direct stream URL...`);
        const streamInputUrl = await getDirectStreamUrl(options.downloadUrl, options.zoomAccessToken);
        console.log(`⚡ Streaming from Zoom & watermarking simultaneously (per frame / per byte)...`);

        await watermarkVideo(
          streamInputUrl,
          procPath,
          watermarkOpts,
          (prog) => {
            const mappedPct = Math.round((prog.percent / 100) * 80);
            onProgress?.({
              percent: mappedPct,
              stage: "watermarking",
              message: `Streaming & watermarking (per frame/per byte)${resLabel}: ${prog.message}`,
            });
          },
          effectiveSignal,
          onProcessSpawn,
          fallbackDuration
        );
        console.log(`✅ Simultaneous stream processing complete!`);
        uploadFilePath = procPath;
      } catch (streamErr: any) {
        if (effectiveSignal.aborted) {
          throw new Error("Operation cancelled by user");
        }
        console.warn(`⚠️ Direct stream processing encountered an issue, falling back to download first:`, streamErr?.message || streamErr);
        console.log(`⬇️ Downloading from Zoom (fallback)...`);
        await downloadZoomVideo(options.downloadUrl, options.zoomAccessToken, rawPath, (bytes, total, etaMsg) => {
          const mb = Math.round(bytes / (1024 * 1024));
          const totalMb = total > 0 ? Math.round(total / (1024 * 1024)) : 0;
          const dlPct = total > 0 ? Math.min(Math.round((bytes / total) * 100), 99) : 0;
          const mappedPct = Math.round(dlPct * 0.4);
          onProgress?.({
            percent: mappedPct,
            stage: "downloading",
            message: totalMb > 0
              ? `Downloading from Zoom: ${dlPct}% (${mb} MB / ${totalMb} MB${etaMsg || ""})`
              : `Downloading from Zoom: ${mb} MB${etaMsg || ""}`,
          });
        }, effectiveSignal);

        if (effectiveSignal.aborted) {
          throw new Error("Operation cancelled by user");
        }

        await watermarkVideo(
          rawPath,
          procPath,
          watermarkOpts,
          (prog) => {
            const mappedPct = 40 + Math.round((prog.percent / 100) * 40);
            onProgress?.({
              percent: mappedPct,
              stage: "watermarking",
              message: `Applying watermark${resLabel}: ${prog.message}`,
            });
          },
          effectiveSignal,
          onProcessSpawn,
          fallbackDuration
        );
        uploadFilePath = procPath;
        await fsp.unlink(rawPath).catch(() => {});
      }
    } else {
      console.log(`\n========================================`);
      console.log(`▶ Starting Direct Upload (Raw / No Watermark) for: ${options.meetingTopic}`);
      console.log(`========================================`);
      console.log(`⬇️ Downloading raw recording from Zoom (Pass-through, no re-encoding)...`);
      await downloadZoomVideo(options.downloadUrl, options.zoomAccessToken, rawPath, (bytes, total, etaMsg) => {
        const mb = Math.round(bytes / (1024 * 1024));
        const totalMb = total > 0 ? Math.round(total / (1024 * 1024)) : 0;
        const dlPct = total > 0 ? Math.min(Math.round((bytes / total) * 100), 99) : 0;
        const mappedPct = Math.round(dlPct * 0.8);
        onProgress?.({
          percent: mappedPct,
          stage: "downloading",
          message: totalMb > 0
            ? `Downloading raw from Zoom: ${dlPct}% (${mb} MB / ${totalMb} MB${etaMsg || ""})`
            : `Downloading raw from Zoom: ${mb} MB${etaMsg || ""}`,
        });
      }, effectiveSignal);
      uploadFilePath = rawPath;
    }

    if (effectiveSignal.aborted) {
      throw new Error("Operation cancelled by user");
    }

    if (supabase) {
      try {
        await supabase.from("zy_recordings").update({
          status: "uploading",
        }).eq("zoom_file_id", options.fileId);
      } catch {}
    }

    console.log(`🚀 Uploading to YouTube as ${options.privacyStatus || "unlisted"}...`);
    const dateStr = options.meetingDate ? new Date(options.meetingDate).toLocaleDateString() : new Date().toLocaleDateString();
    const finalTitle = options.customTitle || `${options.meetingTopic} | ${dateStr}`;
    const finalDescription = options.customDescription || `Class Recording: ${options.meetingTopic}\nDate: ${dateStr}\nUnion Education`;

    // 🎨 Auto-generate 1080p YouTube thumbnail
    let thumbnailBuffer: Buffer | undefined;
    try {
      const thumbResult = await generateAutoThumbnailForUpload({
        accountName: options.accountName,
        meetingTopic: options.meetingTopic,
        meetingDate: options.meetingDate,
      });
      if (thumbResult?.pngBuffer) {
        thumbnailBuffer = thumbResult.pngBuffer;
        console.log(`🎨 [Pipeline] Generated 1080p thumbnail (${thumbResult.templateId}) for "${thumbResult.subject}" with instructor(s): ${thumbResult.teachers.join(", ")}`);
      }
    } catch (thumbErr) {
      console.warn("⚠️ [Pipeline] Thumbnail generation skipped:", thumbErr);
    }

    const uploadRes = await uploadVideoToYouTube(
      uploadFilePath,
      {
        title: finalTitle,
        description: finalDescription,
        privacyStatus: options.privacyStatus || "unlisted",
        thumbnailBuffer,
      },
      (bytesUploaded, totalBytes, etaMsg) => {
        const upPct = totalBytes > 0 ? Math.min(Math.round((bytesUploaded / totalBytes) * 100), 99) : 0;
        const base = needsProcessing ? 80 : 40;
        const scale = needsProcessing ? 0.2 : 0.6;
        const mappedPct = Math.round(base + (upPct * scale));
        const upMb = Math.round(bytesUploaded / (1024 * 1024));
        const totalMb = Math.round(totalBytes / (1024 * 1024));
        onProgress?.({
          percent: mappedPct,
          stage: "uploading",
          message: `Uploading to YouTube: ${upPct}% (${upMb} MB / ${totalMb} MB${etaMsg || ""})`,
        });
      },
      effectiveSignal
    );

    console.log(`🎉 UPLOAD SUCCESSFUL!`);
    console.log(`📺 Video URL: ${uploadRes.url}`);

    onProgress?.({
      percent: 100,
      stage: "done",
      message: `Uploaded to YouTube! ${uploadRes.url}`,
    });

    await fsp.unlink(uploadFilePath).catch(() => {});
    await fsp.unlink(rawPath).catch(() => {});
    await fsp.unlink(procPath).catch(() => {});

    if (supabase) {
      try {
        const { error: updErr } = await supabase
          .from("zy_recordings")
          .update({
            status: "uploaded",
            youtube_video_id: uploadRes.videoId,
            youtube_url: uploadRes.url,
            uploaded_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("zoom_file_id", options.fileId);

        if (updErr) {
          console.error("[Pipeline] CRITICAL: Failed to update recording to uploaded:", updErr.message);
        } else {
          console.log(`💾 Successfully updated database status to uploaded for file ${options.fileId} (${uploadRes.url})`);
        }

        const nowPacific = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const { data: ytRow } = await supabase.from("zy_youtube_channel").select("quota_used_today, last_quota_reset_date").limit(1).maybeSingle();
        const isNewDay = ytRow?.last_quota_reset_date !== nowPacific;
        const currentQuota = isNewDay ? 0 : (ytRow?.quota_used_today || 0);
        await supabase.from("zy_youtube_channel").update({
          quota_used_today: currentQuota + 1600,
          last_quota_reset_date: nowPacific,
        }).neq("id", "00000000-0000-0000-0000-000000000000");
      } catch (dbErr) {
        console.error("[Pipeline] Error saving uploaded state in database:", dbErr);
      }
    }

    await recordActivitySuccess(activityId, {
      youtubeUrl: uploadRes.url,
      youtubeVideoId: uploadRes.videoId,
    });

    return {
      success: true,
      youtubeVideoId: uploadRes.videoId,
      youtubeUrl: uploadRes.url,
    };
  } catch (err: unknown) {
    await fsp.unlink(rawPath).catch(() => {});
    await fsp.unlink(procPath).catch(() => {});

    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Processing failed: ${message}`);

    await recordActivityFailure(activityId, message);

    if (supabase) {
      try {
        await supabase.from("zy_recordings").update({
          status: "failed",
          error_message: message,
        }).eq("zoom_file_id", options.fileId);
      } catch {}
    }

    return { success: false, error: message };
  } finally {
    unregisterActiveTask(options.fileId);
  }
}

/**
 * Step 1 of decoupled pipeline: Downloads (if needed) and renders watermark to disk.
 */
export async function renderWatermarkOnly(
  options: ProcessRecordingOptions,
  onProgress?: (info: PipelineProgressInfo) => void
): Promise<{ success: boolean; fileId: string; procPath?: string; error?: string }> {
  const tempDir = options.tempDir || getSafeTempDir();
  await fsp.mkdir(tempDir, { recursive: true });

  const rawPath = path.join(tempDir, `raw_${options.fileId}.mp4`);
  const procPath = path.join(tempDir, `proc_${options.fileId}.mp4`);
  const supabase = getSupabase();

  try {
    const storage = await checkDeviceStorage({ targetDir: tempDir, criticalThresholdGB: 5 });
    if (storage.status === "critical") {
      throw new Error(`Device storage critical: only ${storage.freeGB} GB free.`);
    }

    // 1. Download from Zoom if raw file does not already exist
    if (!fs.existsSync(rawPath) || (await fsp.stat(rawPath)).size === 0) {
      if (supabase) {
        try {
          const { error: updErr } = await supabase
            .from("zy_recordings")
            .update({
              topic: options.meetingTopic,
              status: "downloading",
              updated_at: new Date().toISOString(),
            })
            .eq("zoom_file_id", options.fileId);
          if (updErr) console.warn("[Pipeline] Failed to set status=downloading:", updErr.message);
        } catch {}
      }

      console.log(`⬇️ Downloading Zoom recording: ${options.meetingTopic}...`);
      await downloadZoomVideo(options.downloadUrl, options.zoomAccessToken, rawPath, (bytes, total, etaMsg) => {
        const mb = Math.round(bytes / (1024 * 1024));
        const totalMb = total > 0 ? Math.round(total / (1024 * 1024)) : 0;
        const dlPct = total > 0 ? Math.min(Math.round((bytes / total) * 100), 99) : 0;
        onProgress?.({
          percent: dlPct,
          stage: "downloading",
          message: totalMb > 0
            ? `Downloading from Zoom: ${dlPct}% (${mb} MB / ${totalMb} MB${etaMsg || ""})...`
            : `Downloading from Zoom: ${mb} MB${etaMsg || ""}...`,
        });
      });
      console.log(`✅ Download complete! File size: ${Math.round((await fsp.stat(rawPath)).size / (1024 * 1024))} MB`);
    }

    // 2. Render watermark
    if (supabase) {
      try {
        await supabase.from("zy_recordings").update({
          status: "watermarking",
        }).eq("zoom_file_id", options.fileId);
      } catch {}
    }

    console.log(`🎨 Rendering watermark for ${options.meetingTopic}...`);
    const watermarkOpts: WatermarkOptions = {
      ...(options.watermark ? options.watermark : { type: "none" }),
      text: options.watermark?.text || options.watermarkText || "Union Education",
      logoPath: options.watermark?.logoPath || options.watermarkLogoPath,
      resolution: options.resolution || options.watermark?.resolution || "original",
    };

    onProgress?.({
      percent: 0,
      stage: "watermarking",
      message: "Starting FFmpeg encoder...",
    });

    await watermarkVideo(rawPath, procPath, watermarkOpts, (prog) => {
      onProgress?.({
        percent: prog.percent,
        stage: "watermarking",
        message: prog.message,
      });
    });
    console.log(`✅ Watermark rendered to: ${procPath}`);

    if (supabase) {
      try {
        await supabase.from("zy_recordings").update({
          status: "ready",
        }).eq("zoom_file_id", options.fileId);
      } catch {}
    }

    onProgress?.({
      percent: 100,
      stage: "done",
      message: "Watermarking complete! Ready for YouTube preview.",
    });

    return {
      success: true,
      fileId: options.fileId,
      procPath,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Watermarking failed: ${message}`);
    return { success: false, fileId: options.fileId, error: message };
  }
}

/**
 * Step 2 of decoupled pipeline: Uploads rendered video to YouTube and purges all local files.
 */
export async function uploadWatermarkedToYouTube(
  options: {
    fileId: string;
    meetingTopic: string;
    meetingDate?: string;
    customTitle?: string;
    customDescription?: string;
    privacyStatus?: "unlisted" | "public" | "private";
    tempDir?: string;
    accountName?: string;
    durationMinutes?: number;
    fileSizeBytes?: number;
  },
  onProgress?: (info: PipelineProgressInfo) => void
): Promise<ProcessResult> {
  const tempDir = options.tempDir || getSafeTempDir();
  const rawPath = path.join(tempDir, `raw_${options.fileId}.mp4`);
  const procPath = path.join(tempDir, `proc_${options.fileId}.mp4`);

  if (!fs.existsSync(procPath) || (await fsp.stat(procPath)).size === 0) {
    throw new Error(`Watermarked video not found on disk. Please render the watermark first.`);
  }

  const activityId = `act_${Date.now()}_${options.fileId.slice(0, 8)}`;
  await recordActivityStart({
    id: activityId,
    fileId: options.fileId,
    topic: options.meetingTopic,
    customTitle: options.customTitle,
    accountName: options.accountName,
    durationMinutes: options.durationMinutes,
    fileSizeBytes: options.fileSizeBytes,
    privacyStatus: options.privacyStatus || "unlisted",
    status: "processing",
    startedAt: new Date().toISOString(),
  });

  const supabase = getSupabase();

  try {
    if (supabase) {
      try {
        await supabase.from("zy_recordings").update({
          status: "uploading",
        }).eq("zoom_file_id", options.fileId);
      } catch {}
    }

    console.log(`🚀 Uploading ${options.fileId} to YouTube as ${options.privacyStatus || "unlisted"}...`);
    const dateStr = options.meetingDate ? new Date(options.meetingDate).toLocaleDateString() : new Date().toLocaleDateString();
    const finalTitle = options.customTitle || `${options.meetingTopic} | ${dateStr}`;
    const finalDescription = options.customDescription || `Class Recording: ${options.meetingTopic}\nDate: ${dateStr}\nUnion Education`;

    // 🎨 Auto-generate 1080p YouTube thumbnail
    let thumbnailBuffer: Buffer | undefined;
    try {
      const thumbResult = await generateAutoThumbnailForUpload({
        accountName: options.accountName,
        meetingTopic: options.meetingTopic,
        meetingDate: options.meetingDate,
      });
      if (thumbResult?.pngBuffer) {
        thumbnailBuffer = thumbResult.pngBuffer;
        console.log(`🎨 [Pipeline] Generated 1080p thumbnail (${thumbResult.templateId}) for "${thumbResult.subject}" with instructor(s): ${thumbResult.teachers.join(", ")}`);
      }
    } catch (thumbErr) {
      console.warn("⚠️ [Pipeline] Thumbnail generation skipped:", thumbErr);
    }

    const uploadRes = await uploadVideoToYouTube(
      procPath,
      {
        title: finalTitle,
        description: finalDescription,
        privacyStatus: options.privacyStatus || "unlisted",
        thumbnailBuffer,
      },
      (bytesUploaded, totalBytes, etaMsg) => {
        const upPct = totalBytes > 0 ? Math.min(Math.round((bytesUploaded / totalBytes) * 100), 99) : 0;
        const upMb = Math.round(bytesUploaded / (1024 * 1024));
        const totalMb = Math.round(totalBytes / (1024 * 1024));
        onProgress?.({
          percent: upPct,
          stage: "uploading",
          message: totalMb > 0
            ? `Uploading to YouTube: ${upPct}% (${upMb} MB / ${totalMb} MB${etaMsg || ""})`
            : `Uploading to YouTube: ${upMb} MB${etaMsg || ""}...`,
        });
      }
    );

    console.log(`🎉 UPLOAD SUCCESSFUL! ${uploadRes.url}`);

    onProgress?.({
      percent: 100,
      stage: "done",
      message: `Uploaded to YouTube! ${uploadRes.url}`,
    });

    // Clean up BOTH local files immediately to free laptop storage
    await fsp.unlink(rawPath).catch(() => {});
    await fsp.unlink(procPath).catch(() => {});
    console.log(`🧹 Cleaned up local files for ${options.fileId} successfully.`);

    if (supabase) {
      try {
        const { error: updErr } = await supabase
          .from("zy_recordings")
          .update({
            status: "uploaded",
            youtube_video_id: uploadRes.videoId,
            youtube_url: uploadRes.url,
            uploaded_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("zoom_file_id", options.fileId);

        if (updErr) {
          console.error("[Pipeline] CRITICAL: Failed to update recording to uploaded:", updErr.message);
        } else {
          console.log(`💾 Successfully updated database status to uploaded for file ${options.fileId} (${uploadRes.url})`);
        }

        const nowPacific = new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        const { data: ytRow } = await supabase.from("zy_youtube_channel").select("quota_used_today").limit(1).maybeSingle();
        const currentQuota = ytRow?.quota_used_today || 0;
        await supabase.from("zy_youtube_channel").update({
          quota_used_today: currentQuota + 1600,
          last_quota_reset_date: nowPacific,
        }).neq("id", "00000000-0000-0000-0000-000000000000");
      } catch {}
    }

    await recordActivitySuccess(activityId, {
      youtubeUrl: uploadRes.url,
      youtubeVideoId: uploadRes.videoId,
    });

    return {
      success: true,
      youtubeVideoId: uploadRes.videoId,
      youtubeUrl: uploadRes.url,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ YouTube upload failed: ${message}`);
    await recordActivityFailure(activityId, message);
    return { success: false, error: message };
  }
}

