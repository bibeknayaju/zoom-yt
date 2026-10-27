import { NextRequest, NextResponse } from "next/server";
import { triggerGitHubWorkflow } from "@/lib/github-actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const reason = body?.reason || "Manual run requested from Dashboard UI";

    const result = await triggerGitHubWorkflow(reason);
    return NextResponse.json({
      success: result.triggered,
      message: result.message,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to trigger workflow";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
