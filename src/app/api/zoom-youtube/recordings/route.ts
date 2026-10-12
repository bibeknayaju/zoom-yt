import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    let recordings: any[] = [];

    if (supabase) {
      const { data, error } = await supabase
        .from("zy_recordings")
        .select(`
          *,
          zy_zoom_accounts ( account_name )
        `)
        .order("recording_start", { ascending: false })
        .limit(100);

      if (!error && data) {
        recordings = data.map((r: any) => ({
          ...r,
          accountName: r.zy_zoom_accounts?.account_name || "Zoom Account",
        }));
      }
    }

    return NextResponse.json({ success: true, recordings });
  } catch (error) {
    console.error("GET /api/zoom-youtube/recordings error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: "id and status are required" }, { status: 400 });
    }

    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase
        .from("zy_recordings")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        throw new Error(error.message);
      }
    }

    return NextResponse.json({ success: true, message: `Status updated to ${status}` });
  } catch (error: any) {
    console.error("PATCH /api/zoom-youtube/recordings error:", error);
    return NextResponse.json({ success: false, error: error?.message || "Internal server error" }, { status: 500 });
  }
}
