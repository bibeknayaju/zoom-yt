import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { getZoomS2SToken } from "@/lib/zoom-s2s";
import fs from "node:fs/promises";
import path from "node:path";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const downloadUrl = searchParams.get("downloadUrl");
    const zoomAccountId = searchParams.get("zoomAccountId");

    if (!downloadUrl || !zoomAccountId) {
      return NextResponse.json({ error: "Missing downloadUrl or zoomAccountId" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "Zoom account not found" }, { status: 404 });
    }

    const clientId = decryptToken(accountRow.client_id_enc);
    const clientSecret = decryptToken(accountRow.client_secret_enc);
    const zoomToken = await getZoomS2SToken(accountRow.account_id, clientId, clientSecret);

    const urlObj = new URL(downloadUrl);
    const isZoomHost =
      urlObj.hostname.endsWith(".zoom.us") ||
      urlObj.hostname.endsWith(".zoomgov.com") ||
      urlObj.hostname === "zoom.us";

    if (!isZoomHost || (urlObj.protocol !== "https:" && urlObj.protocol !== "http:")) {
      return NextResponse.json({ error: "Invalid download URL: Only authorized Zoom domains are allowed" }, { status: 400 });
    }

    urlObj.searchParams.set("access_token", zoomToken);

    // Zoom download URLs redirect to AWS S3 / CloudFront
    // Fetch with redirect: manual to capture the actual presigned media location
    const initialRes = await fetch(urlObj.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${zoomToken}`,
      },
      redirect: "manual",
    });

    const location = initialRes.headers.get("location");
    if (location) {
      return NextResponse.redirect(location, 307);
    }

    // If Zoom served content directly without redirect:
    if (!initialRes.ok) {
      return NextResponse.json(
        { error: `Zoom media request failed with status ${initialRes.status}` },
        { status: initialRes.status }
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", initialRes.headers.get("content-type") || "video/mp4");
    if (initialRes.headers.has("content-length")) {
      headers.set("Content-Length", initialRes.headers.get("content-length")!);
    }
    if (initialRes.headers.has("accept-ranges")) {
      headers.set("Accept-Ranges", initialRes.headers.get("accept-ranges")!);
    }

    return new NextResponse(initialRes.body as any, {
      status: initialRes.status,
      headers,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load video stream";
    console.error("Video preview stream error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
