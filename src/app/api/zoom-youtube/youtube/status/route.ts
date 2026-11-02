import { NextResponse } from "next/server";
import { google } from "googleapis";
import { readZoomYtState } from "@/lib/zoomyt-store";
import { decryptToken } from "@/lib/crypto";

function getTimeUntilMidnightPacific(): { hours: number; minutes: number; formatted: string } {
  const now = new Date();
  const pacificFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = pacificFormatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const second = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);

  const secondsPassedToday = hour * 3600 + minute * 60 + second;
  const totalSecondsInDay = 86400;
  const secondsLeft = Math.max(0, totalSecondsInDay - secondsPassedToday);

  const hoursLeft = Math.floor(secondsLeft / 3600);
  const minutesLeft = Math.floor((secondsLeft % 3600) / 60);

  return {
    hours: hoursLeft,
    minutes: minutesLeft,
    formatted: `${hoursLeft}h ${minutesLeft}m`,
  };
}

async function fetchCloudMonitoringNetUsage(refreshToken?: string): Promise<number | null> {
  if (!refreshToken) return null;
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth2.getAccessToken();
    if (!token) return null;

    const projectId = process.env.GOOGLE_PROJECT_ID || "union-edu-youtube";
    const now = new Date();
    const startTime = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const endTime = now.toISOString();

    const url =
      `https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries?` +
      new URLSearchParams({
        filter:
          'metric.type="serviceruntime.googleapis.com/quota/rate/net_usage" AND resource.labels.service="youtube.googleapis.com"',
        "interval.startTime": startTime,
        "interval.endTime": endTime,
      });

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000), // Max 3s non-blocking timeout
    });

    if (!res.ok) return null;
    const json = await res.json();
    let sum = 0;
    if (Array.isArray(json.timeSeries)) {
      for (const ts of json.timeSeries) {
        for (const pt of ts.points || []) {
          sum += Number(pt.value?.int64Value || pt.value?.doubleValue || 0);
        }
      }
    }
    return sum > 0 ? sum : null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const hasEnvCredentials = Boolean(
      process.env.YOUTUBE_CLIENT_ID &&
      process.env.YOUTUBE_CLIENT_SECRET &&
      process.env.YOUTUBE_REFRESH_TOKEN
    );

    const state = await readZoomYtState();
    const stored = state.youtube;

    let refreshToken = process.env.YOUTUBE_REFRESH_TOKEN || "";
    if (!refreshToken && stored?.encryptedRefreshToken) {
      try {
        refreshToken = decryptToken(stored.encryptedRefreshToken);
      } catch {}
    }

    // Attempt non-blocking Google Cloud Monitoring query
    const liveGoogleUsage = await fetchCloudMonitoringNetUsage(refreshToken);

    // Check quota based on Pacific date (Google quota resets at Midnight Pacific / 1:45 PM NPT)
    const nowPacific = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const isConnected = hasEnvCredentials || Boolean(stored?.status === "active");

    const timeUntilReset = getTimeUntilMidnightPacific();

    // Extension expiry calculation: June 25 + 6 months = ~Late Nov / Dec 2026 (~3 weeks left)
    const extensionExpiryDate = "2026-11-25";
    const expiryTime = new Date(extensionExpiryDate).getTime();
    const nowTime = Date.now();
    const daysUntilExpiry = Math.max(0, Math.ceil((expiryTime - nowTime) / (1000 * 3600 * 24)));

    const unitsLimit = 48000;
    const unitsUsed = liveGoogleUsage ?? stored?.quotaUsedToday ?? 0;
    const remainingUnits = Math.max(0, unitsLimit - unitsUsed);
    const remainingVideosToday = Math.floor(remainingUnits / 1600);

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
        unitsUsedToday: unitsUsed,
        unitsLimit,
        datePacific: nowPacific,
        remainingUnits,
        remainingVideosToday,
        isLiveGoogleMetric: liveGoogleUsage !== null,
        resetCountdown: timeUntilReset.formatted,
        resetAtNpt: "01:45 PM NPT",
        extensionExpiryDate,
        daysUntilExpiry,
        isExpiringSoon: daysUntilExpiry <= 30,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/zoom-youtube/youtube/status error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
