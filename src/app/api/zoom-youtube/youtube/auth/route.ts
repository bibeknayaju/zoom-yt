import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: NextRequest) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const origin = req.nextUrl.origin;
  
  // Use explicit env URI if set and not bare localhost, otherwise fallback to this app's callback
  const envUri = process.env.YOUTUBE_REDIRECT_URI;
  const redirectUri = (envUri && envUri !== "http://localhost" && envUri !== "http://localhost/")
    ? envUri
    : `${origin}/api/zoom-youtube/youtube/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET is missing in environment variables" },
      { status: 500 }
    );
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
  });

  return NextResponse.redirect(authUrl);
}
