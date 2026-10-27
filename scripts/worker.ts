#!/usr/bin/env node
/**
 * Zoom-to-YouTube Automation Background Worker Daemon
 *
 * Runs locally on your Mac / PC or on a dedicated server.
 * Connects to Supabase, registers hardware heartbeat, atomically claims jobs
 * via PostgreSQL `zy_claim_job()`, executes hardware-accelerated watermarking,
 * and uploads to YouTube.
 *
 * Usage:
 *   npm run worker
 */

import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getDeviceSystemInfo, checkDeviceStorage } from "../src/lib/storage";
import { decryptToken } from "../src/lib/crypto";
import { getZoomS2SToken } from "../src/lib/zoom-s2s";
import { processRecordingEndToEnd, registerActiveTask, unregisterActiveTask } from "../src/lib/pipeline";
import { recordHeartbeat } from "../src/lib/zoomyt-store";

// 1. Ensure Environment Variables are Loaded in Standalone Node Runtime
if (typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(".env.local"); } catch {}
  try { process.loadEnvFile(".env"); } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ [Worker] Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Stable Worker Node Identifier
const hostnameClean = os.hostname().toLowerCase().replace(/[^a-z0-9]/g, "-");
const NODE_ID = process.env.WORKER_NODE_ID || `mac-${hostnameClean}`;
const NODE_LABEL = process.env.WORKER_NODE_LABEL || `${os.hostname()} (${os.platform()} ${os.arch()})`;
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;

let isRunning = true;
let currentAbortController: AbortController | null = null;
let isJobActive = false;

console.log("=======================================================");
console.log("🚀 Zoom to YouTube Dedicated Worker Starting");
console.log(`💻 Node ID:     ${NODE_ID}`);
console.log(`🏷️  Label:       ${NODE_LABEL}`);
console.log(`⚡ Acceleration: ${process.platform === "darwin" ? "Apple VideoToolbox (Hardware)" : "libx264 ultrafast"}`);
console.log("=======================================================\n");

// Send Periodic System Diagnostics & Heartbeat
async function sendHeartbeat() {
  try {
    const sysInfo = await getDeviceSystemInfo();
    await recordHeartbeat({
      nodeId: NODE_ID,
      label: NODE_LABEL,
      system: sysInfo,
    });
    // Also update public.zy_worker_nodes
    await supabase.from("zy_worker_nodes").upsert({
      node_id: NODE_ID,
      label: NODE_LABEL,
      is_primary: true,
      last_heartbeat: new Date().toISOString(),
      system_info: sysInfo,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ [Worker] Heartbeat warning: ${msg}`);
  }
}

// Check and Load Default Watermark Settings
async function loadDefaultSettings() {
  try {
    const { data } = await supabase.from("zy_settings").select("*").eq("id", "default").maybeSingle();
    return data || {};
  } catch {
    return {};
  }
}

// Main Polling Loop
async function pollAndExecute() {
  // Initial storage check
  const storage = await checkDeviceStorage({ criticalThresholdGB: 5 });
  console.log(`💾 Free Disk Space: ${storage.freeGB} GB (${storage.status.toUpperCase()})`);
  if (storage.status === "critical") {
    console.error(`🚨 [Worker] Disk space critical (<10GB). Please clear space in .zoomyt-tmp before running jobs.`);
  }

  // First Heartbeat
  await sendHeartbeat();
  const heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  while (isRunning) {
    try {
      // 1. Atomically Claim Job from Database (ONLY explicitly queued tasks, never auto-process 'discovered')
      const { data: candidateJobs, error: selectErr } = await supabase
        .from("zy_recordings")
        .select("*")
        .eq("status", "queued")
        .order("recording_start", { ascending: true })
        .limit(1);

      if (selectErr) {
        console.error("❌ [Worker] Error checking queue:", selectErr.message);
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      const candidate = candidateJobs && candidateJobs.length > 0 ? candidateJobs[0] : null;

      if (!candidate) {
        // No explicitly queued jobs, wait for next poll
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      // Atomically claim and lease this queued recording
      const { data: claimedJob, error: leaseErr } = await supabase
        .from("zy_recordings")
        .update({
          status: "downloading",
          claimed_by: NODE_ID,
          lease_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id)
        .eq("status", "queued")
        .select()
        .maybeSingle();

      const job = claimedJob;
      if (!job) {
        // Another worker claimed it or status changed, check next
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // 2. Active Job Found!
      isJobActive = true;
      currentAbortController = new AbortController();

      console.log(`\n=======================================================`);
      console.log(`📥 [Worker] Claimed Recording: "${job.topic}"`);
      console.log(`🆔 File ID:     ${job.zoom_file_id}`);
      console.log(`📅 Meeting Date: ${job.recording_start}`);
      console.log(`⏱️ Duration:     ${job.duration_minutes || "unknown"} mins`);
      console.log(`=======================================================`);

      // 3. Fetch Zoom Account Credentials
      let zoomAccount: any = null;
      if (job.zoom_account_id) {
        const { data: acc } = await supabase
          .from("zy_zoom_accounts")
          .select("*")
          .eq("id", job.zoom_account_id)
          .maybeSingle();
        zoomAccount = acc;
      } else {
        // Fallback: pick first active Zoom account
        const { data: accs } = await supabase
          .from("zy_zoom_accounts")
          .select("*")
          .eq("is_active", true)
          .limit(1);
        zoomAccount = accs?.[0];
      }

      if (!zoomAccount) {
        throw new Error("No active Zoom account found to authenticate recording download.");
      }

      const clientId = decryptToken(zoomAccount.client_id_enc);
      const clientSecret = decryptToken(zoomAccount.client_secret_enc);
      const zoomToken = await getZoomS2SToken(zoomAccount.account_id, clientId, clientSecret);

      // 4. Load Settings & Watermark Options
      const settings = await loadDefaultSettings();
      const jobOptions = (job as any).options || {};

      const watermarkOpts = {
        type: jobOptions.watermarkType || settings.watermark_type || "image",
        logoPath: jobOptions.logoPath || settings.watermark_image_url || "/assets/images/logo1.png",
        imageScale: jobOptions.imageScale ?? settings.watermark_scale ?? 0.18,
        imageOpacity: jobOptions.imageOpacity ?? settings.watermark_opacity ?? 0.85,
        imagePosX: jobOptions.imagePosX ?? settings.watermark_pos_x ?? 0.78,
        imagePosY: jobOptions.imagePosY ?? settings.watermark_pos_y ?? 0.04,
        text: jobOptions.watermarkText || settings.watermark_text || "Union Education",
        resolution: jobOptions.resolution || "original",
      };

      // 5. Execute End-to-End Processing (Download + Watermark + YouTube Upload)
      const result = await processRecordingEndToEnd(
        {
          meetingTopic: job.topic,
          meetingDate: job.recording_start,
          downloadUrl: job.download_url,
          fileId: job.zoom_file_id,
          zoomAccessToken: zoomToken,
          watermark: watermarkOpts as any,
          resolution: watermarkOpts.resolution as any,
          customTitle: jobOptions.customTitle,
          customDescription: jobOptions.customDescription,
          privacyStatus: jobOptions.privacyStatus || settings.privacy_status || "unlisted",
          accountName: zoomAccount.account_name,
          durationMinutes: job.duration_minutes,
          fileSizeBytes: job.file_size_bytes,
        },
        (prog) => {
          const bar = `[${"█".repeat(Math.floor(prog.percent / 5))}${"-".repeat(20 - Math.floor(prog.percent / 5))}]`;
          process.stdout.write(`\r⚙️  [${prog.stage.toUpperCase()}] ${bar} ${prog.percent}%: ${prog.message}    `);
        },
        currentAbortController.signal
      );

      console.log("\n");

      if (result.success) {
        console.log(`✅ [Worker] SUCCESS! Video Uploaded: ${result.youtubeUrl}`);
      } else {
        console.error(`❌ [Worker] FAILED: ${result.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n❌ [Worker] Error processing job: ${msg}`);
    } finally {
      isJobActive = false;
      currentAbortController = null;
    }
  }

  clearInterval(heartbeatTimer);
}

// Graceful Shutdown
function handleShutdown() {
  console.log("\n🛑 [Worker] Shutting down gracefully (SIGINT/SIGTERM)...");
  isRunning = false;
  if (isJobActive && currentAbortController) {
    console.log("⏳ Aborting active video processing task...");
    currentAbortController.abort();
  }
  setTimeout(() => {
    console.log("👋 [Worker] Shutdown complete. Goodbye!");
    process.exit(0);
  }, 1000);
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

// Start Worker
pollAndExecute().catch((err) => {
  console.error("💥 [Worker] Fatal error:", err);
  process.exit(1);
});
