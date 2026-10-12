import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { getSafeTempDir } from "@/lib/storage";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId parameter" }, { status: 400 });
    }

    const tempDir = getSafeTempDir();
    const procPath = path.join(tempDir, `proc_${fileId}.mp4`);

    if (!fs.existsSync(procPath)) {
      return NextResponse.json({ error: "Processed video not found on disk" }, { status: 404 });
    }

    const stat = await fsp.stat(procPath);
    const fileSize = stat.size;
    const range = req.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(procPath, { start, end });

      const headers = new Headers();
      headers.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", chunksize.toString());
      headers.set("Content-Type", "video/mp4");

      return new NextResponse(fileStream as any, {
        status: 206,
        headers,
      });
    } else {
      const fileStream = fs.createReadStream(procPath);
      const headers = new Headers();
      headers.set("Content-Length", fileSize.toString());
      headers.set("Content-Type", "video/mp4");
      headers.set("Accept-Ranges", "bytes");

      return new NextResponse(fileStream as any, {
        status: 200,
        headers,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error streaming preview video";
    console.error("Preview processed stream error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
