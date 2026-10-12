import { NextRequest, NextResponse } from "next/server";
import { uploadWatermarkedToYouTube } from "@/lib/pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileId, topic, startTime, customTitle, customDescription, privacyStatus, accountName, durationMinutes, fileSizeBytes } = body;

    if (!fileId) {
      return NextResponse.json({ success: false, error: "fileId is required" }, { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendEvent = (obj: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        try {
          const result = await uploadWatermarkedToYouTube(
            {
              fileId,
              meetingTopic: topic || "Class Recording",
              meetingDate: startTime,
              customTitle,
              customDescription,
              privacyStatus: privacyStatus || "unlisted",
              accountName,
              durationMinutes,
              fileSizeBytes,
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
              youtubeUrl: result.youtubeUrl,
              youtubeVideoId: result.youtubeVideoId,
              msg: "Uploaded to YouTube successfully! Local files cleaned up.",
            });
          }
        } catch (err: any) {
          sendEvent({ success: false, error: err.message || "YouTube upload failed" });
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
    const msg = error instanceof Error ? error.message : "YouTube upload failed";
    console.error("POST /api/zoom-youtube/recordings/upload error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
