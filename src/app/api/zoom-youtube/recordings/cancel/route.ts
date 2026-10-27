import { NextRequest, NextResponse } from "next/server";
import { cancelPipelineTask } from "@/lib/pipeline";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json({ success: false, error: "fileId is required" }, { status: 400 });
    }

    const cancelled = await cancelPipelineTask(fileId);

    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from("zy_recordings")
        .update({
          status: "discovered",
          claimed_by: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("zoom_file_id", fileId);
    }

    return NextResponse.json({
      success: true,
      cancelled,
      message: "Task cancelled and reset to discovered",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to cancel task";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
