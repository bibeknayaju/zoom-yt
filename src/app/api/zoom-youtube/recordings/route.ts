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
    const searchParams = req.nextUrl.searchParams;
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const statusParam = searchParams.get("status");
    const searchParam = searchParams.get("search");

    const isPaginated = pageParam !== null;
    const page = Math.max(1, parseInt(pageParam || "1", 10));
    const limit = Math.max(1, Math.min(200, parseInt(limitParam || (isPaginated ? "25" : "100"), 10)));
    const offset = (page - 1) * limit;

    let recordings: any[] = [];
    let total = 0;

    if (supabase) {
      let query = supabase
        .from("zy_recordings")
        .select(
          `
          *,
          zy_zoom_accounts ( account_name )
        `,
          { count: "exact" }
        );

      if (statusParam && statusParam !== "all") {
        query = query.eq("status", statusParam);
      }

      if (searchParam && searchParam.trim()) {
        const term = `%${searchParam.trim()}%`;
        query = query.or(`topic.ilike.${term},meeting_id.ilike.${term}`);
      }

      query = query.order("recording_start", { ascending: false });

      if (isPaginated) {
        query = query.range(offset, offset + limit - 1);
      } else {
        query = query.limit(limit);
      }

      const { data, error, count } = await query;

      if (!error && data) {
        recordings = data.map((r: any) => ({
          ...r,
          accountName: r.zy_zoom_accounts?.account_name || "Zoom Account",
        }));
        total = count ?? recordings.length;
      }
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      success: true,
      recordings,
      total,
      page,
      limit,
      totalPages,
    });
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
