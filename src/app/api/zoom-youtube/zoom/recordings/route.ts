import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { getZoomS2SToken, fetchUserRecordings } from "@/lib/zoom-s2s";
import fs from "node:fs/promises";
import path from "node:path";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountDbId = searchParams.get("accountId");
    const days = parseInt(searchParams.get("days") || "30", 10);

    if (!accountDbId) {
      return NextResponse.json({ success: false, error: "accountId query parameter is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    let accountRow: any = null;

    if (supabase) {
      const { data } = await supabase.from("zy_zoom_accounts").select("*").eq("id", accountDbId).maybeSingle();
      accountRow = data;
    }

    if (!accountRow) {
      return NextResponse.json({ success: false, error: "Zoom account not found" }, { status: 404 });
    }

    const clientId = decryptToken(accountRow.client_id_enc);
    const clientSecret = decryptToken(accountRow.client_secret_enc);
    const token = await getZoomS2SToken(accountRow.account_id, clientId, clientSecret);

    // Date range
    const toDate = new Date().toISOString().split("T")[0];
    const fromDateObj = new Date();
    fromDateObj.setDate(fromDateObj.getDate() - days);
    const fromDate = fromDateObj.toISOString().split("T")[0];

    // Fetch account users
    const usersRes = await fetch("https://api.zoom.us/v2/users?page_size=30", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!usersRes.ok) {
      const err = await usersRes.text();
      throw new Error(`Failed to list users from Zoom (${usersRes.status}): ${err}`);
    }

    const usersData = await usersRes.json();
    const users = usersData.users || [];

    const availableRecordings: any[] = [];

    // Fetch user recordings in parallel with error isolation per user
    const userMeetingResults = await Promise.all(
      users.map(async (user: any) => {
        try {
          const meetings = await fetchUserRecordings(token, user.id, fromDate, toDate);
          return { user, meetings };
        } catch (err) {
          console.warn(`Could not fetch recordings for Zoom user ${user.email}:`, err);
          return { user, meetings: [] };
        }
      })
    );

    for (const { user, meetings } of userMeetingResults) {
      for (const m of meetings) {
        const rawMp4Files = (m.recording_files || []).filter(
          (f: any) => f.file_type === "MP4" && f.status === "completed" && f.file_size > 0
        );

        if (rawMp4Files.length === 0) continue;

        // Sort chronologically by recording_start
        rawMp4Files.sort((a: any, b: any) => {
          const tA = new Date(a.recording_start || m.start_time).getTime();
          const tB = new Date(b.recording_start || m.start_time).getTime();
          if (tA !== tB) return tA - tB;
          return a.file_size - b.file_size;
        });

        // Helper to prioritize views if two files recorded the exact same time window (<60s)
        const getViewPriority = (type: string) => {
          if (type === "shared_screen_with_speaker_view") return 4;
          if (type === "shared_screen") return 3;
          if (type === "active_speaker") return 2;
          return 1;
        };

        // Group simultaneous streams (started within 60s of each other) to prevent duplicate camera angles of the same minute
        const mp4Files: any[] = [];
        for (const file of rawMp4Files) {
          const fileStart = file.recording_start ? new Date(file.recording_start).getTime() : null;
          if (fileStart !== null) {
            const existingIndex = mp4Files.findIndex((existing) => {
              const existingStart = existing.recording_start ? new Date(existing.recording_start).getTime() : null;
              return existingStart !== null && Math.abs(fileStart - existingStart) < 60000;
            });

            if (existingIndex >= 0) {
              const existing = mp4Files[existingIndex];
              if (getViewPriority(file.recording_type) > getViewPriority(existing.recording_type)) {
                mp4Files[existingIndex] = file;
              }
              continue;
            }
          }
          mp4Files.push(file);
        }

        const totalParts = mp4Files.length;

        mp4Files.forEach((file: any, index: number) => {
          let fileDuration = 0;
          if (file.recording_start && file.recording_end) {
            const diffMs = new Date(file.recording_end).getTime() - new Date(file.recording_start).getTime();
            fileDuration = Math.max(1, Math.round(diffMs / 60000));
          } else {
            fileDuration = m.duration ? Math.round(m.duration / totalParts) : 0;
          }

          const baseTopic = m.topic || "Class Recording";
          const displayTopic = totalParts > 1 ? `${baseTopic} (Part ${index + 1})` : baseTopic;

          availableRecordings.push({
            meetingUuid: m.uuid,
            meetingId: String(m.id),
            fileId: file.id,
            topic: displayTopic,
            baseTopic: baseTopic,
            partNumber: totalParts > 1 ? index + 1 : undefined,
            totalParts: totalParts > 1 ? totalParts : undefined,
            hostEmail: user.email,
            hostName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email,
            startTime: file.recording_start || m.start_time,
            durationMinutes: fileDuration,
            meetingDurationMinutes: m.duration || 0,
            fileSizeBytes: file.file_size,
            recordingType: file.recording_type,
            downloadUrl: file.download_url,
            zoomAccountId: accountRow.id,
            accountName: accountRow.account_name,
          });
        });
      }
    }

    // Sort newest first
    availableRecordings.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    if (supabase && availableRecordings.length > 0) {
      try {
        const payloads = availableRecordings.map((r) => ({
          zoom_account_id: r.zoomAccountId,
          zoom_meeting_uuid: r.meetingUuid,
          zoom_meeting_id: r.meetingId,
          zoom_file_id: r.fileId,
          topic: r.topic,
          recording_start: r.startTime,
          duration_minutes: r.durationMinutes,
          file_size_bytes: r.fileSizeBytes,
          download_url: r.downloadUrl,
          status: "discovered",
        }));
        await supabase.from("zy_recordings").upsert(payloads, {
          onConflict: "zoom_file_id",
          ignoreDuplicates: true,
        });
      } catch (dbErr) {
        console.warn("Could not auto-cache browsed recordings to DB:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      accountName: accountRow.account_name,
      totalFound: availableRecordings.length,
      recordings: availableRecordings,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch Zoom recordings";
    console.error("GET /api/zoom-youtube/zoom/recordings error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
