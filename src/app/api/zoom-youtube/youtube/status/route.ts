import { NextResponse } from "next/server";
import { readZoomYtState } from "@/lib/zoomyt-store";

export async function GET() {
  try {
    const hasEnvCredentials = Boolean(
      process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      process.env.YOUTUBE_REFRESH_TOKEN
    );

    const state = await readZoomYtState();
    const stored = state.youtube;

    // Check quota based on Pacific date (Google quota resets at Midnight Pacific)
    const nowPacific = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const isConnected = hasEnvCredentials || Boolean(stored?.status === "active");

    return NextResponse.json({
      success: true,
      connected: isConnected,
      channel: stored
        ? {
            id: stored.channelId,
            title: stored.channelTitle,
            thumbnailUrl: stored.thumbnailUrl,
            status: stored.status,
          }
        : hasEnvCredentials
        ? {
            id: "configured_in_env",
            title: "Configured via .env",
            thumbnailUrl: null,
            status: "active",
          }
        : null,
      quota: {
        unitsUsedToday: stored?.quotaUsedToday ?? 0,
        unitsLimit: 48000,
        datePacific: nowPacific,
        remainingUnits: 48000 - (stored?.quotaUsedToday ?? 0),
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/zoom-youtube/youtube/status error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
