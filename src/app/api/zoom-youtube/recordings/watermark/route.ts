import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { getZoomS2SToken } from "@/lib/zoom-s2s";
import { renderWatermarkOnly } from "@/lib/pipeline";
import fs from "node:fs/promises";
import path from "node:path";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recording, watermark, resolution } = body;

    const fileId = recording?.fileId || recording?.zoom_file_id;
    const downloadUrl = recording?.downloadUrl;
    const zoomAccountId = recording?.zoomAccountId || recording?.zoom_account_id;

    if (!recording || !fileId || !downloadUrl || !zoomAccountId) {
      return NextResponse.json(
        { success: false, error: "Missing required recording fields (fileId, downloadUrl, zoomAccountId)" },
        { status: 400 }
      );
    }

    // 1. Fetch Zoom credentials directly from database
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

    // 2. Stream real-time progress while watermarking
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (obj: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        try {
          const result = await renderWatermarkOnly(
            {
              meetingTopic: recording.topic || "Class Recording",
              meetingDate: recording.startTime || recording.recording_start,
              downloadUrl: downloadUrl,
              fileId: fileId,
              zoomAccessToken: zoomToken,
              watermark: watermark,
              resolution: resolution || watermark?.resolution,
            },
            (prog) => {
              sendEvent({
                percent: prog.percent,
                stage: prog.stage,
                msg: prog.message,
              });
            }
          );

          if (!result.success) {
            sendEvent({ success: false, error: result.error });
          } else {
            sendEvent({
              success: true,
              percent: 100,
              fileId: result.fileId,
              previewUrl: `/api/zoom-youtube/recordings/preview-processed?fileId=${encodeURIComponent(result.fileId)}`,
              msg: "Watermark rendered successfully! Ready to preview and upload.",
            });
          }
        } catch (err: any) {
          sendEvent({ success: false, error: err.message || "Watermarking failed" });
        } finally {
          controller.close();
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
    const msg = error instanceof Error ? error.message : "Watermark rendering failed";
    console.error("POST /api/zoom-youtube/recordings/watermark error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
