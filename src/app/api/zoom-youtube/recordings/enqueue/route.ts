import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { triggerGitHubWorkflow } from "@/lib/github-actions";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recordings,
      watermark,
      watermarkText,
      customTitle,
      customDescription,
      privacyStatus,
      resolution,
    } = body;

    const list = Array.isArray(recordings) ? recordings : [body.recording].filter(Boolean);

    if (list.length === 0) {
      return NextResponse.json({ success: false, error: "No recordings provided to enqueue" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database connection not available" }, { status: 500 });
    }

    const options = {
      watermarkType: watermark?.type || "image",
      watermarkText: watermark?.text || watermarkText || "Union Education",
      resolution: resolution || watermark?.resolution || "original",
      privacyStatus: privacyStatus || "unlisted",
      customTitle,
      customDescription,
      logoPath: watermark?.logoPath,
      imageScale: watermark?.imageScale ?? watermark?.scale,
      imageOpacity: watermark?.imageOpacity ?? watermark?.opacity,
      imagePosX: watermark?.imagePosX ?? watermark?.posX,
      imagePosY: watermark?.imagePosY ?? watermark?.posY,
    };

    let enqueuedCount = 0;

    for (const rec of list) {
      const fileId = rec.fileId || rec.zoom_file_id;
      const downloadUrl = rec.downloadUrl || rec.download_url;
      const topic = rec.topic || rec.meetingTopic || "Class Recording";
      const zoomAccountId = rec.zoomAccountId || rec.zoom_account_id;
      const startTime = rec.startTime || rec.recording_start || new Date().toISOString();

      if (!fileId || !downloadUrl) continue;

      const payload: Record<string, any> = {
        zoom_file_id: fileId,
        topic,
        recording_start: startTime,
        download_url: downloadUrl,
        zoom_account_id: zoomAccountId?.startsWith?.("zoom-") ? null : zoomAccountId,
        status: "queued",
        lease_expires_at: null,
        claimed_by: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      };

      if (rec.zoom_meeting_uuid || rec.uuid) {
        payload.zoom_meeting_uuid = rec.zoom_meeting_uuid || rec.uuid;
      }
      if (rec.zoom_meeting_id || rec.meetingId) {
        payload.zoom_meeting_id = String(rec.zoom_meeting_id || rec.meetingId);
      }
      if (rec.durationMinutes || rec.duration_minutes) {
        payload.duration_minutes = rec.durationMinutes || rec.duration_minutes;
      }
      if (rec.fileSizeBytes || rec.file_size_bytes) {
        payload.file_size_bytes = rec.fileSizeBytes || rec.file_size_bytes;
      }

      const { error } = await supabase.from("zy_recordings").upsert(payload, {
        onConflict: "zoom_file_id",
      });

      if (!error) {
        enqueuedCount++;
      }
    }

    let workflowStatus: { triggered: boolean; message: string } | null = null;
    if (enqueuedCount > 0) {
      workflowStatus = await triggerGitHubWorkflow(
        `Enqueued ${enqueuedCount} recording(s) from Dashboard UI`
      );
    }

    return NextResponse.json({
      success: true,
      message: `Enqueued ${enqueuedCount} recording(s) for worker processing.`,
      enqueuedCount,
      workflowTriggered: workflowStatus?.triggered ?? false,
      workflowMessage: workflowStatus?.message ?? "",
      options,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to enqueue recordings";
    console.error("POST /api/zoom-youtube/recordings/enqueue error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
