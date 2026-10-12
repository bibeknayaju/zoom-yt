import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { encryptToken } from "@/lib/crypto";
import { saveYouTubeConnection } from "@/lib/zoomyt-store";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const origin = req.nextUrl.origin;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/dashboard?error=${encodeURIComponent(error || "No code provided")}`);
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const envUri = process.env.YOUTUBE_REDIRECT_URI;
  const redirectUri = (envUri && envUri !== "http://localhost" && envUri !== "http://localhost/")
    ? envUri
    : `${origin}/api/zoom-youtube/youtube/callback`;

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const channelRes = await youtube.channels.list({
      part: ["snippet"],
      mine: true,
    });

    const channelItem = channelRes.data.items?.[0];
    const channelId = channelItem?.id || "unknown";
    const channelTitle = channelItem?.snippet?.title || "My YouTube Channel";
    const thumbnailUrl = channelItem?.snippet?.thumbnails?.default?.url || "";

    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined;

    const nowPacific = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    await saveYouTubeConnection({
      channelId,
      channelTitle,
      thumbnailUrl,
      connectedAt: new Date().toISOString(),
      status: "active",
      encryptedRefreshToken,
      quotaUsedToday: 0,
      lastQuotaResetDatePacific: nowPacific,
    });

    return NextResponse.redirect(`${origin}/dashboard?connected=true`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to connect YouTube";
    console.error("YouTube OAuth callback error:", err);
    return NextResponse.redirect(`${origin}/dashboard?error=${encodeURIComponent(msg)}`);
  }
}
