import { NextRequest, NextResponse } from "next/server";
import { setPrimaryDevice } from "@/lib/zoomyt-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeId } = body;

    if (!nodeId) {
      return NextResponse.json({ success: false, error: "nodeId is required" }, { status: 400 });
    }

    const updatedState = await setPrimaryDevice(nodeId);

    return NextResponse.json({
      success: true,
      primaryNodeId: updatedState.primaryNodeId,
      message: `Device ${nodeId} is now set as Primary.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("POST /api/zoom-youtube/devices/set-primary error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
