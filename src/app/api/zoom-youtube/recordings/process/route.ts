import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { getZoomS2SToken } from "@/lib/zoom-s2s";
import { processRecordingEndToEnd } from "@/lib/pipeline";
import fs from "node:fs/promises";
import path from "node:path";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recording, watermark, watermarkText, customTitle, customDescription, privacyStatus, resolution } = body;

    const fileId = recording?.fileId || recording?.zoom_file_id;
    const downloadUrl = recording?.downloadUrl || recording?.download_url;
    const zoomAccountId = recording?.zoomAccountId || recording?.zoom_account_id;

    if (!recording || !fileId || !downloadUrl || !zoomAccountId) {
      return NextResponse.json(
        { success: false, error: "Missing required recording fields (fileId, downloadUrl, zoomAccountId)" },
        { status: 400 }
      );
    }

    // 1. Fetch Zoom account credentials directly from database
    const supabase = getSupabase();
    let accountRow: any = null;

    if (supabase) {
      const { data } = await supabase
        .from("zy_zoom_accounts")
        .select("*")
        .eq("id", zoomAccountId)
        .maybeSingle();
      accountRow = data;
    }

    if (!accountRow) {
      return NextResponse.json({ success: false, error: "Zoom account not found" }, { status: 404 });
    }

    const clientId = decryptToken(accountRow.client_id_enc);
    const clientSecret = decryptToken(accountRow.client_secret_enc);
    const zoomToken = await getZoomS2SToken(accountRow.account_id, clientId, clientSecret);

    const abortController = new AbortController();
    req.signal.addEventListener("abort", () => {
      try { abortController.abort(); } catch {}
    }, { once: true });

    // 2. Stream real-time progress for end-to-end processing
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let isClosed = false;

        const sendEvent = (obj: any) => {
          if (isClosed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {}
        };

        try {
          const result = await processRecordingEndToEnd(
            {
              meetingTopic: recording.topic || "Class Recording",
              meetingDate: recording.startTime || recording.recording_start,
              downloadUrl: downloadUrl,
              fileId: fileId,
              zoomAccessToken: zoomToken,
              watermark: watermark,
              watermarkText: watermark?.text || watermarkText || "Union Education",
              resolution: resolution || watermark?.resolution,
              customTitle: customTitle,
              customDescription: customDescription,
              privacyStatus: privacyStatus || "unlisted",
              accountName: recording.accountName || accountRow?.account_name,
              durationMinutes: recording.durationMinutes || recording.duration_minutes,
              fileSizeBytes: recording.fileSizeBytes || recording.file_size_bytes,
            },
            (prog) => {
              sendEvent({
                percent: prog.percent,
                stage: prog.stage,
                msg: prog.message,
              });
            },
            abortController.signal
          );

          if (!result.success) {
            sendEvent({ success: false, error: result.error });
          } else {
            sendEvent({
              success: true,
              percent: 100,
              youtubeUrl: result.youtubeUrl,
              youtubeVideoId: result.youtubeVideoId,
              msg: "Video processed, watermarked, and uploaded to YouTube successfully!",
            });
          }
        } catch (err: any) {
          sendEvent({ success: false, error: err.message || "Processing failed" });
        } finally {
          isClosed = true;
          try { controller.close(); } catch {}
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Processing failed";
    console.error("POST /api/zoom-youtube/recordings/process error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
