import { NextRequest, NextResponse } from "next/server";
import { readZoomYtState, updateDeviceHeartbeat } from "@/lib/zoomyt-store";

export async function GET() {
  try {
    const state = await readZoomYtState();
    const now = Date.now();

    const deviceList = Object.values(state.devices).map((device) => {
      const lastSeenMs = new Date(device.lastHeartbeat).getTime();
      const secondsAgo = Math.max(0, Math.floor((now - lastSeenMs) / 1000));
      const isOnline = secondsAgo < 120; // Active if seen in the last 2 minutes

      return {
        ...device,
        secondsAgo,
        isOnline,
      };
    });

    return NextResponse.json({
      success: true,
      primaryNodeId: state.primaryNodeId,
      devices: deviceList,
    });
  } catch (error) {
    console.error("GET /api/zoom-youtube/devices error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nodeId, label, system } = body;

    if (!nodeId || !system) {
      return NextResponse.json({ success: false, error: "Missing nodeId or system info" }, { status: 400 });
    }

    const { isPrimary, state } = await updateDeviceHeartbeat({ nodeId, label, system });

    return NextResponse.json({
      success: true,
      nodeId,
      isPrimary,
      primaryNodeId: state.primaryNodeId,
    });
  } catch (error) {
    console.error("POST /api/zoom-youtube/devices heartbeat error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const nodeId = searchParams.get("nodeId");
    if (!nodeId) {
      return NextResponse.json({ success: false, error: "nodeId is required" }, { status: 400 });
    }

    const { removeDevice } = await import("@/lib/zoomyt-store");
    const updated = await removeDevice(nodeId);

    return NextResponse.json({
      success: true,
      message: `Device ${nodeId} removed`,
      primaryNodeId: updated.primaryNodeId,
    });
  } catch (error) {
    console.error("DELETE /api/zoom-youtube/devices error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
