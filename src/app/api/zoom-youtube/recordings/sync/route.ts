import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "@/lib/crypto";
import { getZoomS2SToken, fetchUserRecordings } from "@/lib/zoom-s2s";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const { days = 7, minDurationMinutes = 5 } = await req.json().catch(() => ({}));

    const supabase = getSupabase();
    let accounts: any[] = [];

    if (supabase) {
      const { data } = await supabase.from("zy_zoom_accounts").select("*").eq("is_active", true);
      if (data && data.length > 0) accounts = data;
    }

    if (accounts.length === 0) {
      return NextResponse.json({ success: false, error: "No active Zoom accounts found to sync" }, { status: 400 });
    }

    // Calculate from/to dates (YYYY-MM-DD)
    const toDate = new Date().toISOString().split("T")[0];
    const fromDateObj = new Date();
    fromDateObj.setDate(fromDateObj.getDate() - days);
    const fromDate = fromDateObj.toISOString().split("T")[0];

    let totalMeetingsFound = 0;
    let newRecordingsCount = 0;
    const syncedRecords: any[] = [];

    for (const acc of accounts) {
      try {
        const clientId = decryptToken(acc.client_id_enc);
        const clientSecret = decryptToken(acc.client_secret_enc);
        const token = await getZoomS2SToken(acc.account_id, clientId, clientSecret);

        // Fetch users in account
        const usersRes = await fetch("https://api.zoom.us/v2/users?page_size=30", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!usersRes.ok) continue;
        const usersData = await usersRes.json();
        const users = usersData.users || [];
        const userMeetingResults = await Promise.all(
          users.map(async (user: any) => {
            try {
              const meetings = await fetchUserRecordings(token, user.id, fromDate, toDate);
              return { user, meetings };
            } catch (err) {
              console.warn(`Could not sync recordings for Zoom user ${user.email}:`, err);
              return { user, meetings: [] };
            }
          })
        );

        for (const { user, meetings } of userMeetingResults) {
          totalMeetingsFound += meetings.length;

          for (const m of meetings) {
            const duration = m.duration || 0;
            if (duration < minDurationMinutes) continue; // Skip test/short clips

            // Filter completed MP4 files
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

            const getViewPriority = (type: string) => {
              if (type === "shared_screen_with_speaker_view") return 4;
              if (type === "shared_screen") return 3;
              if (type === "active_speaker") return 2;
              return 1;
            };

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

            for (let i = 0; i < totalParts; i++) {
              const file = mp4Files[i];
              let fileDuration = 0;
              if (file.recording_start && file.recording_end) {
                const diffMs = new Date(file.recording_end).getTime() - new Date(file.recording_start).getTime();
                fileDuration = Math.max(1, Math.round(diffMs / 60000));
              } else {
                fileDuration = duration ? Math.round(duration / totalParts) : 0;
              }

              const baseTopic = m.topic || "Class Recording";
              const displayTopic = totalParts > 1 ? `${baseTopic} (Part ${i + 1})` : baseTopic;

              const recordPayload = {
                zoom_account_id: acc.id.startsWith("zoom-") ? null : acc.id,
                zoom_meeting_uuid: m.uuid,
                zoom_meeting_id: String(m.id),
                zoom_file_id: file.id,
                topic: displayTopic,
                recording_start: file.recording_start || m.start_time,
                duration_minutes: fileDuration,
                file_size_bytes: file.file_size,
                download_url: file.download_url,
                status: "discovered",
              };

              syncedRecords.push({
                ...recordPayload,
                accountName: acc.account_name,
              });

              if (supabase) {
                const { error } = await supabase.from("zy_recordings").upsert(recordPayload, {
                  onConflict: "zoom_file_id",
                  ignoreDuplicates: true,
                });
                if (!error) newRecordingsCount++;
              } else {
                newRecordingsCount++;
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error syncing Zoom account ${acc.account_name}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sync complete! Scanned ${totalMeetingsFound} meetings, queued ${syncedRecords.length} class recordings.`,
      meetingsFound: totalMeetingsFound,
      queuedRecordings: syncedRecords.length,
    });
  } catch (error) {
    console.error("POST /api/zoom-youtube/recordings/sync error:", error);
    return NextResponse.json({ success: false, error: "Failed to sync recordings" }, { status: 500 });
  }
}
