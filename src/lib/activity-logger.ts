import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface ActivityLogItem {
  id: string;
  fileId: string;
  topic: string;
  customTitle?: string;
  accountName?: string;
  status: "success" | "failed" | "processing";
  youtubeUrl?: string;
  youtubeVideoId?: string;
  privacyStatus?: string;
  resolution?: string;
  watermarkType?: string;
  fileSizeBytes?: number;
  durationMinutes?: number;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// In-memory cache so UI updates immediately even before DB returns
let memoryLogsCache: ActivityLogItem[] = [];

/**
 * Records the start of an activity directly in PostgreSQL zy_activity_logs.
 */
export async function recordActivityStart(
  item: Omit<ActivityLogItem, "completedAt" | "durationSeconds">
): Promise<string> {
  const logItem: ActivityLogItem = {
    ...item,
    status: item.status || "processing",
    startedAt: item.startedAt || new Date().toISOString(),
  };

  const existingIdx = memoryLogsCache.findIndex((l) => l.id === logItem.id);
  if (existingIdx >= 0) {
    memoryLogsCache[existingIdx] = logItem;
  } else {
    memoryLogsCache.unshift(logItem);
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_activity_logs").upsert({
        id: logItem.id,
        file_id: logItem.fileId,
        topic: logItem.topic,
        custom_title: logItem.customTitle,
        account_name: logItem.accountName,
        status: logItem.status,
        youtube_url: logItem.youtubeUrl,
        youtube_video_id: logItem.youtubeVideoId,
        privacy_status: logItem.privacyStatus,
        resolution: logItem.resolution,
        watermark_type: logItem.watermarkType,
        file_size_bytes: logItem.fileSizeBytes,
        duration_minutes: logItem.durationMinutes,
        started_at: logItem.startedAt,
      });
    } catch (err) {
      console.error("Failed to write activity start to database:", err);
    }
  }

  return logItem.id;
}

/**
 * Updates an activity to success directly in PostgreSQL zy_activity_logs.
 */
export async function recordActivitySuccess(
  id: string,
  details: Partial<ActivityLogItem>
): Promise<void> {
  const completedAt = new Date().toISOString();
  const existing = memoryLogsCache.find((l) => l.id === id);

  let durationSeconds = 0;
  if (existing && existing.startedAt) {
    durationSeconds = Math.round((new Date(completedAt).getTime() - new Date(existing.startedAt).getTime()) / 1000);
  }

  const updated: ActivityLogItem = {
    ...(existing || {
      id,
      fileId: details.fileId || id,
      topic: details.topic || "Upload",
      startedAt: new Date(Date.now() - 60000).toISOString(),
    }),
    ...details,
    status: "success",
    completedAt,
    durationSeconds: durationSeconds || details.durationSeconds || 0,
  };

  memoryLogsCache = [updated, ...memoryLogsCache.filter((l) => l.id !== id)];

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_activity_logs").update({
        status: "success",
        youtube_url: updated.youtubeUrl,
        youtube_video_id: updated.youtubeVideoId,
        completed_at: completedAt,
        duration_seconds: updated.durationSeconds,
      }).eq("id", id);
    } catch (err) {
      console.error("Failed to update activity success in database:", err);
    }
  }
}

/**
 * Updates an activity to failed with error message directly in PostgreSQL zy_activity_logs.
 */
export async function recordActivityFailure(
  id: string,
  errorMessage: string,
  details?: Partial<ActivityLogItem>
): Promise<void> {
  const completedAt = new Date().toISOString();
  const existing = memoryLogsCache.find((l) => l.id === id);

  let durationSeconds = 0;
  if (existing && existing.startedAt) {
    durationSeconds = Math.round((new Date(completedAt).getTime() - new Date(existing.startedAt).getTime()) / 1000);
  }

  const updated: ActivityLogItem = {
    ...(existing || {
      id,
      fileId: details?.fileId || id,
      topic: details?.topic || "Upload",
      startedAt: new Date(Date.now() - 60000).toISOString(),
    }),
    ...details,
    status: "failed",
    errorMessage,
    completedAt,
    durationSeconds: durationSeconds || details?.durationSeconds || 0,
  };

  memoryLogsCache = [updated, ...memoryLogsCache.filter((l) => l.id !== id)];

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_activity_logs").update({
        status: "failed",
        error_message: errorMessage,
        completed_at: completedAt,
        duration_seconds: updated.durationSeconds,
      }).eq("id", id);
    } catch (err) {
      console.error("Failed to update activity failure in database:", err);
    }
  }
}

/**
 * Fetches recent activity logs directly from Supabase / PostgreSQL zy_activity_logs.
 */
export async function getActivityLogs(limit = 100): Promise<ActivityLogItem[]> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("zy_activity_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit);

      if (!error && data) {
        const mapped = data.map((row: any) => ({
          id: row.id,
          fileId: row.file_id,
          topic: row.topic,
          customTitle: row.custom_title,
          accountName: row.account_name,
          status: row.status,
          youtubeUrl: row.youtube_url,
          youtubeVideoId: row.youtube_video_id,
          privacyStatus: row.privacy_status,
          resolution: row.resolution,
          watermarkType: row.watermark_type,
          fileSizeBytes: row.file_size_bytes,
          durationMinutes: row.duration_minutes,
          errorMessage: row.error_message,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          durationSeconds: row.duration_seconds,
        }));
        memoryLogsCache = mapped;
        return mapped;
      }
    } catch (err) {
      console.error("Failed to fetch activity logs from database:", err);
    }
  }

  return memoryLogsCache.slice(0, limit);
}

/**
 * Clears activity logs directly in PostgreSQL zy_activity_logs.
 */
export async function clearAllActivityLogs(): Promise<void> {
  memoryLogsCache = [];
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_activity_logs").delete().neq("id", "none");
    } catch (err) {
      console.error("Failed to clear activity logs in database:", err);
    }
  }
}
