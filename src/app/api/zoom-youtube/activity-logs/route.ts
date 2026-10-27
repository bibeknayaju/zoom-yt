import { NextRequest, NextResponse } from "next/server";
import { getActivityLogs, clearAllActivityLogs } from "@/lib/activity-logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const pageParam = searchParams.get("page");
    const limit = parseInt(searchParams.get("limit") || (pageParam !== null ? "25" : "100"), 10);
    const page = Math.max(1, parseInt(pageParam || "1", 10));
    const status = searchParams.get("status") || undefined;
    const search = searchParams.get("search") || undefined;

    const { logs, total } = await getActivityLogs({ limit, page, status, search });
    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      success: true,
      logs,
      total,
      page,
      limit,
      totalPages,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch activity logs";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await clearAllActivityLogs();
    return NextResponse.json({ success: true, message: "Activity logs cleared" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to clear activity logs";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
