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
      target,
    } = body;

    const processingTarget: "local" | "cloud" = target === "local" ? "local" : "cloud";
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
      textOpacity: watermark?.textOpacity ?? watermark?.opacity,
      textPosX: watermark?.textPosX,
      textPosY: watermark?.textPosY,
      fontSize: watermark?.fontSize,
    };

    let enqueuedCount = 0;
    const failures: string[] = [];

    for (const rec of list) {
      const fileId = rec.fileId || rec.zoom_file_id;
      const downloadUrl = rec.downloadUrl || rec.download_url;
      const topic = rec.topic || rec.meetingTopic || "Class Recording";
      const zoomAccountId = rec.zoomAccountId || rec.zoom_account_id;
      const startTime = rec.startTime || rec.recording_start || new Date().toISOString();
      const meetingUuid =
        rec.zoom_meeting_uuid || rec.uuid || rec.meetingUuid || rec.meeting_uuid;
      const meetingId =
        rec.zoom_meeting_id || rec.meetingId || rec.meeting_id;

      if (!fileId || !downloadUrl) {
        failures.push(`${topic}: missing fileId or downloadUrl`);
        continue;
      }

      const payload: Record<string, any> = {
        zoom_file_id: fileId,
        topic,
        recording_start: startTime,
        download_url: downloadUrl,
        zoom_account_id: zoomAccountId?.startsWith?.("zoom-") ? null : zoomAccountId,
        status: "queued",
        processing_target: processingTarget,
        options,
        lease_expires_at: null,
        claimed_by: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      };

      if (meetingUuid) payload.zoom_meeting_uuid = meetingUuid;
      if (meetingId) payload.zoom_meeting_id = String(meetingId);
      if (rec.durationMinutes || rec.duration_minutes) {
        payload.duration_minutes = rec.durationMinutes || rec.duration_minutes;
      }
      if (rec.fileSizeBytes || rec.file_size_bytes) {
        payload.file_size_bytes = rec.fileSizeBytes || rec.file_size_bytes;
      }

      // zoom_meeting_uuid and zoom_meeting_id are NOT NULL. Reuse the values already
      // stored for this file, then fall back to the file id so queueing never fails.
      if (!payload.zoom_meeting_uuid || !payload.zoom_meeting_id) {
        const { data: existing } = await supabase
          .from("zy_recordings")
          .select("zoom_meeting_uuid, zoom_meeting_id")
          .eq("zoom_file_id", fileId)
          .maybeSingle();
        if (existing) {
          if (!payload.zoom_meeting_uuid && existing.zoom_meeting_uuid) {
            payload.zoom_meeting_uuid = existing.zoom_meeting_uuid;
          }
          if (!payload.zoom_meeting_id && existing.zoom_meeting_id) {
            payload.zoom_meeting_id = existing.zoom_meeting_id;
          }
        }
      }
      if (!payload.zoom_meeting_uuid) payload.zoom_meeting_uuid = fileId;
      if (!payload.zoom_meeting_id) payload.zoom_meeting_id = String(fileId);

      // Upsert, gracefully dropping optional columns that have not been migrated yet.
      let upsertPayload = payload;
      let error: { message: string } | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await supabase.from("zy_recordings").upsert(upsertPayload, {
          onConflict: "zoom_file_id",
        });
        error = result.error;
        if (!error) break;

        let stripped = false;
        if ("processing_target" in upsertPayload && /processing_target/i.test(error.message)) {
          upsertPayload = { ...upsertPayload };
          delete upsertPayload.processing_target;
          stripped = true;
        }
        if ("options" in upsertPayload && /options/i.test(error.message)) {
          upsertPayload = { ...upsertPayload };
          delete upsertPayload.options;
          stripped = true;
        }
        if (!stripped) break;
      }

      if (!error) {
        enqueuedCount++;
      } else {
        failures.push(`${topic}: ${error.message}`);
      }
    }

    if (enqueuedCount === 0 && failures.length > 0) {
      return NextResponse.json(
        { success: false, error: `Failed to enqueue recordings: ${failures[0]}`, failures },
        { status: 500 }
      );
    }

    const triggerWorkflow = body.triggerWorkflow === true;
    let workflowStatus: { triggered: boolean; message: string } | null = null;
    if (enqueuedCount > 0 && processingTarget === "cloud" && triggerWorkflow) {
      workflowStatus = await triggerGitHubWorkflow(
        `Enqueued ${enqueuedCount} recording(s) from Dashboard UI for cloud processing`
      );
    }

    let returnMessage = "";
    if (processingTarget === "local") {
      returnMessage = `Enqueued ${enqueuedCount} recording(s) for local laptop processing.`;
    } else if (triggerWorkflow) {
      returnMessage = workflowStatus?.triggered
        ? `Enqueued ${enqueuedCount} recording(s) and dispatched GitHub Cloud Runner.`
        : `Enqueued ${enqueuedCount} recording(s). Runner status: ${workflowStatus?.message}`;
    } else {
      returnMessage = `Enqueued ${enqueuedCount} recording(s) in cloud backlog. Trigger the Cloud Runner when ready to process all at once.`;
    }

    return NextResponse.json({
      success: true,
      message: returnMessage,
      enqueuedCount,
      failures,
      processingTarget,
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
