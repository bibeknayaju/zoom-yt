import { NextRequest, NextResponse } from "next/server";
import { getActivityLogs, clearAllActivityLogs } from "@/lib/activity-logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);
    const logs = await getActivityLogs(limit);
    return NextResponse.json({ success: true, logs });
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
