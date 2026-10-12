import { NextRequest, NextResponse } from "next/server";
import { cancelPipelineTask } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json({ success: false, error: "fileId is required" }, { status: 400 });
    }

    const cancelled = await cancelPipelineTask(fileId);
    return NextResponse.json({
      success: true,
      cancelled,
      message: "Task cancelled and resources cleaned up",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to cancel task";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
