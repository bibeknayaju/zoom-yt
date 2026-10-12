import { NextRequest, NextResponse } from "next/server";
import { getWatermarkTemplate, saveWatermarkTemplate } from "@/lib/watermark-template-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const template = await getWatermarkTemplate();
    return NextResponse.json({ success: true, template });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to get template";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const template = await saveWatermarkTemplate(body);
    return NextResponse.json({ success: true, template });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to save template";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
