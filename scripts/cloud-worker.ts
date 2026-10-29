#!/usr/bin/env node
/**
 * Zoom-to-YouTube GitHub Actions Batch Cloud Worker
 *
 * Runs inside GitHub Actions on Ubuntu Linux runners.
 * Queries Supabase for queued recording tasks, processes them end-to-end
 * (download from Zoom + simultaneous watermark + upload to YouTube + disk cleanup),
 * and cleanly exits once the queue is empty.
 */

import os from "node:os";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getDeviceSystemInfo, checkDeviceStorage } from "../src/lib/storage";
import { decryptToken } from "../src/lib/crypto";
import { getZoomS2SToken } from "../src/lib/zoom-s2s";
import { processRecordingEndToEnd } from "../src/lib/pipeline";
import { recordHeartbeat } from "../src/lib/zoomyt-store";

// 1. Ensure Environment Variables are Loaded in Standalone Node Runtime
if (typeof process.loadEnvFile === "function") {
  try { process.loadEnvFile(".env.local"); } catch {}
  try { process.loadEnvFile(".env"); } catch {}
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ [Cloud Worker] Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const RUN_ID = process.env.GITHUB_RUN_ID || String(Date.now());
const NODE_ID = `github-runner-${RUN_ID}`;
const NODE_LABEL = `GitHub Cloud Runner #${RUN_ID} (Linux x64)`;

console.log("=======================================================");
console.log("☁️  Zoom to YouTube GitHub Cloud Worker Starting");
console.log(`💻 Runner Node ID: ${NODE_ID}`);
console.log(`🏷️  Runner Label:   ${NODE_LABEL}`);
console.log(`⚡ Acceleration:    libx264 ultrafast (4-Core Datacenter)`);
console.log("=======================================================\n");

// Send Heartbeat to Supabase so dashboard reflects the active cloud runner
async function sendHeartbeat() {
  try {
    const sysInfo = await getDeviceSystemInfo();
    await recordHeartbeat({
      nodeId: NODE_ID,
      label: NODE_LABEL,
      system: sysInfo,
    });
    await supabase.from("zy_worker_nodes").upsert({
      node_id: NODE_ID,
      label: NODE_LABEL,
      is_primary: false,
      last_heartbeat: new Date().toISOString(),
      system_info: sysInfo,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ [Cloud Worker] Heartbeat warning: ${msg}`);
  }
}

// Load Default Watermark Settings from database
async function loadDefaultSettings() {
  try {
    const { data } = await supabase.from("zy_settings").select("*").eq("id", "default").maybeSingle();
    return data || {};
  } catch {
    return {};
  }
}

// Poll the job row so a cancel from the dashboard (which resets it to
// "discovered") can abort the ffmpeg/upload running in this process.
function watchForCancellation(jobId: string, controller: AbortController) {
  const timer = setInterval(async () => {
    try {
      const { data } = await supabase
        .from("zy_recordings")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      const status = data?.status;
      if (status && ["discovered", "cancelled", "skipped"].includes(status)) {
        console.log(`\n🛑 [Cloud Worker] Cancel requested for ${jobId} (status: ${status}). Aborting...`);
        controller.abort();
      }
    } catch {}
  }, 2000);
  return () => clearInterval(timer);
}

async function runBatch() {
  const storage = await checkDeviceStorage({ criticalThresholdGB: 2 });
  console.log(`💾 Runner Free Disk Space: ${storage.freeGB} GB (${storage.status.toUpperCase()})`);

  await sendHeartbeat();
  const heartbeatTimer = setInterval(sendHeartbeat, 30000);

  let processedCount = 0;
  let successCount = 0;
  let failCount = 0;

  try {
    while (true) {
      // 1. Fetch the oldest queued recording routed to the cloud runner
      let { data: candidateJobs, error: selectErr } = await supabase
        .from("zy_recordings")
        .select("*")
        .eq("status", "queued")
        .eq("processing_target", "cloud")
        .order("recording_start", { ascending: true })
        .limit(1);

      // Gracefully handle databases without the processing_target column yet.
      if (selectErr && /processing_target/i.test(selectErr.message)) {
        const retry = await supabase
          .from("zy_recordings")
          .select("*")
          .eq("status", "queued")
          .order("recording_start", { ascending: true })
          .limit(1);
        candidateJobs = retry.data;
        selectErr = retry.error;
      }

      if (selectErr) {
        console.error("❌ [Cloud Worker] Error checking queue:", selectErr.message);
        break;
      }

      const candidate = candidateJobs && candidateJobs.length > 0 ? candidateJobs[0] : null;

      if (!candidate) {
        console.log(`\n✨ No pending queued recordings found. Batch work complete!`);
        break;
      }

      // 2. Atomically claim and lease this queued recording
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
        // Another instance claimed it or status changed, try next
        continue;
      }

      processedCount++;
      const abortController = new AbortController();
      const stopCancelWatch = watchForCancellation(job.id, abortController);

      console.log(`\n=======================================================`);
      console.log(`📥 [Task ${processedCount}] Processing: "${job.topic}"`);
      console.log(`🆔 File ID:     ${job.zoom_file_id}`);
      console.log(`📅 Meeting Date: ${job.recording_start}`);
      console.log(`⏱️ Duration:     ${job.duration_minutes || "unknown"} mins`);
      console.log(`=======================================================`);

      try {
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

        // 5. Execute End-to-End Processing (Stream + Watermark + YouTube Upload + Disk Cleanup)
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
          abortController.signal
        );

        console.log("\n");

        if (result.success) {
          console.log(`✅ [Task ${processedCount}] SUCCESS! Uploaded to YouTube: ${result.youtubeUrl}`);
          successCount++;
        } else {
          console.error(`❌ [Task ${processedCount}] FAILED: ${result.error}`);
          failCount++;
        }
      } catch (taskErr: unknown) {
        const msg = taskErr instanceof Error ? taskErr.message : String(taskErr);
        console.error(`\n❌ [Task ${processedCount}] Error: ${msg}`);
        failCount++;

        // Update database status to failed so it doesn't loop infinitely
        await supabase
          .from("zy_recordings")
          .update({
            status: "failed",
            error_message: msg,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      } finally {
        stopCancelWatch();
      }
    }
  } finally {
    clearInterval(heartbeatTimer);
  }

  console.log("\n=======================================================");
  console.log(`📊 Cloud Worker Summary:`);
  console.log(`   Total Processed: ${processedCount}`);
  console.log(`   Successful:      ${successCount}`);
  console.log(`   Failed:          ${failCount}`);
  console.log("=======================================================\n");

  process.exit(failCount > 0 && successCount === 0 && processedCount > 0 ? 1 : 0);
}

runBatch().catch((err) => {
  console.error("💥 [Cloud Worker] Fatal error:", err);
  process.exit(1);
});
