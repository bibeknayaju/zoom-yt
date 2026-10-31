import { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { getZoomS2SToken, fetchUserRecordings } from "@/lib/zoom-s2s";

export interface DiscoveredClassRecording {
  zoomAccountId: string;
  accountName: string;
  meetingUuid: string;
  meetingId: string;
  fileId: string;
  topic: string;
  baseTopic: string;
  partNumber?: number;
  totalParts?: number;
  hostName: string;
  hostEmail: string;
  startTime: string;
  durationMinutes: number;
  fileSizeBytes: number;
  downloadUrl: string;
  recordingType?: string;
}

export interface AutopilotScanResult {
  scanDateNepal: string;
  activeAccountsCount: number;
  totalDiscoveredToday: number;
  newlyQueuedCount: number;
  alreadyUploadedCount: number;
  alreadyQueuedCount: number;
  queuedRecordings: DiscoveredClassRecording[];
}

/**
 * Returns current date in Nepal Time (Asia/Kathmandu) formatted as YYYY-MM-DD
 */
export function getNepalDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Checks if a recording took place on target Nepal date (ignores yesterday or older)
 */
export function isRecordedOnDateInNepal(
  startTimeIso: string,
  targetNepalDateStr = getNepalDateString()
): boolean {
  try {
    const meetingDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kathmandu",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(startTimeIso));
    return meetingDateStr === targetNepalDateStr;
  } catch {
    return false;
  }
}

/**
 * Scans all active Zoom accounts for today's recordings and queues any un-uploaded videos.
 */
export async function runAutopilotDiscovery(
  supabase: SupabaseClient,
  targetDateNepal = getNepalDateString()
): Promise<AutopilotScanResult> {
  console.log(`\n=======================================================`);
  console.log(`🔍 [Auto-Pilot Discovery] Scanning Active Zoom Accounts`);
  console.log(`📅 Target Date (Nepal Time): ${targetDateNepal}`);
  console.log(`=======================================================`);

  // 1. Fetch all active Zoom accounts
  const { data: accounts, error: accErr } = await supabase
    .from("zy_zoom_accounts")
    .select("*")
    .eq("is_active", true);

  if (accErr) {
    throw new Error(`Failed to load active Zoom accounts: ${accErr.message}`);
  }

  const activeAccounts = accounts || [];
  console.log(`ℹ️ Found ${activeAccounts.length} active Zoom account(s).`);

  if (activeAccounts.length === 0) {
    return {
      scanDateNepal: targetDateNepal,
      activeAccountsCount: 0,
      totalDiscoveredToday: 0,
      newlyQueuedCount: 0,
      alreadyUploadedCount: 0,
      alreadyQueuedCount: 0,
      queuedRecordings: [],
    };
  }

  // Calculate UTC query window (from yesterday UTC to today UTC to safely cover Nepal UTC+5:45)
  const toDateUtc = new Date().toISOString().split("T")[0];
  const fromDateUtcObj = new Date();
  fromDateUtcObj.setDate(fromDateUtcObj.getDate() - 1);
  const fromDateUtc = fromDateUtcObj.toISOString().split("T")[0];

  const candidateRecordings: DiscoveredClassRecording[] = [];

  // Helper to prioritize views
  const getViewPriority = (type?: string) => {
    if (type === "shared_screen_with_speaker_view") return 4;
    if (type === "shared_screen") return 3;
    if (type === "active_speaker") return 2;
    return 1;
  };

  // 2. Scan each active account
  for (const acc of activeAccounts) {
    try {
      console.log(`\n📡 [Auto-Pilot] Checking Account: "${acc.account_name}"...`);
      const clientId = decryptToken(acc.client_id_enc);
      const clientSecret = decryptToken(acc.client_secret_enc);
      const token = await getZoomS2SToken(acc.account_id, clientId, clientSecret);

      // List users in this Zoom account
      const usersRes = await fetch("https://api.zoom.us/v2/users?page_size=30", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!usersRes.ok) {
        console.warn(`⚠️ [Auto-Pilot] Could not list users for account ${acc.account_name}: ${usersRes.statusText}`);
        continue;
      }

      const usersData = await usersRes.json();
      const users = usersData.users || [];

      for (const u of users) {
        try {
          const meetings = await fetchUserRecordings(token, u.id, fromDateUtc, toDateUtc);
          for (const m of meetings) {
            const rawMp4Files = (m.recording_files || []).filter(
              (f: any) => f.file_type === "MP4" && f.status === "completed" && f.file_size > 0
            );

            if (rawMp4Files.length === 0) continue;

            // Sort chronologically
            rawMp4Files.sort((a: any, b: any) => {
              const tA = new Date(a.recording_start || m.start_time).getTime();
              const tB = new Date(b.recording_start || m.start_time).getTime();
              if (tA !== tB) return tA - tB;
              return a.file_size - b.file_size;
            });

            // De-duplicate simultaneous camera angles (<60s)
            const mp4Files: any[] = [];
            for (const file of rawMp4Files) {
              const fileStart = file.recording_start ? new Date(file.recording_start).getTime() : null;
              if (fileStart !== null) {
                const existingIndex = mp4Files.findIndex((existing) => {
                  const existingStart = existing.recording_start
                    ? new Date(existing.recording_start).getTime()
                    : null;
                  return existingStart !== null && Math.abs(fileStart - existingStart) < 60000;
                });

                if (existingIndex >= 0) {
                  const existing = mp4Files[existingIndex];
                  if (getViewPriority(file.recording_type) > getViewPriority(existing.recording_type)) {
                    mp4Files[existingIndex] = file;
                  }
                  continue;
                }
              }
              mp4Files.push(file);
            }

            const totalParts = mp4Files.length;

            mp4Files.forEach((file: any, index: number) => {
              const startTime = file.recording_start || m.start_time;

              // STRICT FILTER: Only include recordings from TODAY in Nepal Time!
              // (Ignores yesterday's or older recordings)
              if (!isRecordedOnDateInNepal(startTime, targetDateNepal)) {
                return;
              }

              let fileDuration = 0;
              if (file.recording_start && file.recording_end) {
                const diffMs =
                  new Date(file.recording_end).getTime() - new Date(file.recording_start).getTime();
                fileDuration = Math.max(1, Math.round(diffMs / 60000));
              } else {
                fileDuration = m.duration ? Math.round(m.duration / totalParts) : 0;
              }

              const baseTopic = m.topic || "Class Recording";
              const displayTopic = totalParts > 1 ? `${baseTopic} (Part ${index + 1})` : baseTopic;

              candidateRecordings.push({
                zoomAccountId: acc.id,
                accountName: acc.account_name,
                meetingUuid: m.uuid,
                meetingId: String(m.id),
                fileId: file.id,
                topic: displayTopic,
                baseTopic: baseTopic,
                partNumber: totalParts > 1 ? index + 1 : undefined,
                totalParts: totalParts > 1 ? totalParts : undefined,
                hostEmail: u.email,
                hostName: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email,
                startTime: startTime,
                durationMinutes: fileDuration,
                fileSizeBytes: file.file_size,
                downloadUrl: file.download_url,
                recordingType: file.recording_type,
              });
            });
          }
        } catch (uErr) {
          console.warn(`⚠️ [Auto-Pilot] Could not fetch user ${u.email} recordings:`, uErr);
        }
      }
    } catch (accErr) {
      console.error(`❌ [Auto-Pilot] Error scanning account ${acc.account_name}:`, accErr);
    }
  }

  console.log(`\n📋 Found ${candidateRecordings.length} total recording(s) for today (${targetDateNepal} NPT).`);

  if (candidateRecordings.length === 0) {
    return {
      scanDateNepal: targetDateNepal,
      activeAccountsCount: activeAccounts.length,
      totalDiscoveredToday: 0,
      newlyQueuedCount: 0,
      alreadyUploadedCount: 0,
      alreadyQueuedCount: 0,
      queuedRecordings: [],
    };
  }

  // 3. Cross-reference with existing database records to avoid duplicate processing
  const fileIds = candidateRecordings.map((r) => r.fileId);
  const { data: dbRecords } = await supabase
    .from("zy_recordings")
    .select("zoom_file_id, status, youtube_url")
    .in("zoom_file_id", fileIds);

  const dbMap = new Map((dbRecords || []).map((d: any) => [d.zoom_file_id, d]));

  const toQueue: DiscoveredClassRecording[] = [];
  let alreadyUploadedCount = 0;
  let alreadyQueuedCount = 0;

  for (const rec of candidateRecordings) {
    const existing = dbMap.get(rec.fileId);
    if (existing) {
      if (existing.status === "uploaded" || existing.youtube_url) {
        alreadyUploadedCount++;
        continue;
      }
      if (existing.status === "queued" || existing.status === "downloading" || existing.status === "watermarking") {
        alreadyQueuedCount++;
        continue;
      }
    }
    toQueue.push(rec);
  }

  console.log(`📊 Auto-Pilot Filter Status:`);
  console.log(`   - Already uploaded: ${alreadyUploadedCount}`);
  console.log(`   - Already in progress: ${alreadyQueuedCount}`);
  console.log(`   - Ready to queue for today: ${toQueue.length}`);

  // 4. Upsert candidate recordings and queue un-uploaded ones
  if (toQueue.length > 0) {
    const upsertRows = toQueue.map((r) => ({
      zoom_account_id: r.zoomAccountId,
      zoom_meeting_uuid: r.meetingUuid,
      zoom_meeting_id: r.meetingId,
      zoom_file_id: r.fileId,
      topic: r.topic,
      recording_start: r.startTime,
      duration_minutes: r.durationMinutes,
      file_size_bytes: r.fileSizeBytes,
      download_url: r.downloadUrl,
      status: "queued",
      processing_target: "cloud",
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase.from("zy_recordings").upsert(upsertRows, {
      onConflict: "zoom_file_id",
    });

    if (upsertErr) {
      console.error(`❌ [Auto-Pilot] Error queueing recordings: ${upsertErr.message}`);
    } else {
      console.log(`✨ Successfully queued ${toQueue.length} class(es) for cloud processing!`);
    }
  }

  return {
    scanDateNepal: targetDateNepal,
    activeAccountsCount: activeAccounts.length,
    totalDiscoveredToday: candidateRecordings.length,
    newlyQueuedCount: toQueue.length,
    alreadyUploadedCount,
    alreadyQueuedCount,
    queuedRecordings: toQueue,
  };
}
