import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { decryptToken } from "@/lib/crypto";
import { readZoomYtState } from "@/lib/zoomyt-store";
import {
  ThumbnailTemplateId,
  generateThumbnailSvg,
  formatNepaliBikramSambat,
} from "./thumbnail-templates";

/**
 * Reads local Union Education logo as base64 data URI so SVG can embed it self-contained
 */
export function getLocalLogoBase64(): string {
  try {
    const candidates = [
      path.join(process.cwd(), "public", "assets", "images", "logo1.png"),
      path.join(process.cwd(), "public", "assets", "images", "logo.png"),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        const buf = fs.readFileSync(c);
        return `data:image/png;base64,${buf.toString("base64")}`;
      }
    }
  } catch {}
  return "";
}

/**
 * Render SVG string to a crisp 1280x720 PNG buffer using Rust-based Resvg
 */
export async function renderThumbnailToPng(
  svgContent: string,
  outputPath?: string
): Promise<Buffer> {
  const fontDevanagari = path.join(
    process.cwd(),
    "public",
    "assets",
    "fonts",
    "NotoSansDevanagari.ttf"
  );
  const fontEnglish = path.join(
    process.cwd(),
    "public",
    "assets",
    "fonts",
    "NotoSans.ttf"
  );

  const fontFiles = [
    fontDevanagari,
    fontEnglish,
    "/System/Library/Fonts/Kohinoor.ttc",
    "/System/Library/Fonts/Supplemental/DevanagariMT.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
  ].filter((p) => fs.existsSync(p));

  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: "width",
      value: 1280,
    },
    font: {
      loadSystemFonts: false, // Prevents loading legacy ASCII fonts (like Preeti / CV Nepali)
      fontFiles,
      defaultFontFamily: "Noto Sans Devanagari",
    },
  });

  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  if (outputPath) {
    await fsp.writeFile(outputPath, pngBuffer);
  }

  return pngBuffer;
}

/**
 * Resolves active thumbnail settings from Supabase, extracts dynamic topic/teachers,
 * generates the 1280x720 SVG, and renders it to a PNG buffer ready for YouTube API upload.
 */
export async function generateAutoThumbnailForUpload(options: {
  accountName?: string;
  meetingTopic?: string;
  meetingDate?: string;
}): Promise<{
  pngBuffer: Buffer;
  templateId: ThumbnailTemplateId;
  subject: string;
  topic: string;
  teachers: string[];
  nepaliDate: string;
} | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settingsRow } = await supabase
      .from("zy_settings")
      .select("template_data")
      .eq("id", "default")
      .maybeSingle();

    const templateData = (settingsRow?.template_data as any) || {};

    // Check if auto thumbnail upload is explicitly disabled
    if (templateData.thumbnail_auto_upload === false) {
      console.log("ℹ️ [Thumbnail] Auto thumbnail upload disabled in settings.");
      return null;
    }

    const templateId: ThumbnailTemplateId =
      templateData.active_thumbnail_template || "glassmorphism";
    const subjectsConfig = templateData.thumbnail_subjects_config || {};

    const subject = options.accountName?.trim() || "Union Education";
    const subjectCfg =
      subjectsConfig[subject] ||
      subjectsConfig[options.accountName || ""] ||
      null;

    // 1. Resolve Active Teachers for this subject
    let teacherNames: string[] = [];
    if (subjectCfg?.teachers && Array.isArray(subjectCfg.teachers)) {
      teacherNames = subjectCfg.teachers
        .filter((t: any) => t.isActive !== false)
        .map((t: any) => t.name.trim())
        .filter(Boolean);
    }
    if (teacherNames.length === 0) {
      teacherNames = ["Union Education"];
    }

    // 2. Resolve Dynamic Topic
    let topic = options.meetingTopic?.trim() || "";
    const isGenericPmr =
      !topic ||
      /personal meeting room/i.test(topic) ||
      /zoom meeting/i.test(topic) ||
      /^[0-9\s-]+$/.test(topic);

    if (isGenericPmr && subjectCfg?.currentTopic && subjectCfg.currentTopic.trim()) {
      topic = subjectCfg.currentTopic.trim();
    } else if (isGenericPmr) {
      topic = `${subject} Live Class`;
    }

    const dateObj = options.meetingDate ? new Date(options.meetingDate) : new Date();
    const nepaliDate = formatNepaliBikramSambat(dateObj);

    const svg = generateThumbnailSvg({
      templateId,
      subject,
      topic,
      teachers: teacherNames,
      nepaliDateStr: nepaliDate,
      dateObj,
      logoPath: getLocalLogoBase64(),
    });

    const pngBuffer = await renderThumbnailToPng(svg);

    return {
      pngBuffer,
      templateId,
      subject,
      topic,
      teachers: teacherNames,
      nepaliDate,
    };
  } catch (err) {
    console.warn("⚠️ [Thumbnail] Could not generate auto thumbnail:", err);
    return null;
  }
}

/**
 * Uploads a custom thumbnail to a YouTube video.
 * Handles channel verification and quota limits gracefully without failing the video pipeline.
 */
export async function uploadThumbnailToYouTube(
  videoId: string,
  pngBuffer: Buffer
): Promise<boolean> {
  try {
    const state = await readZoomYtState();
    let refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

    if (state.youtube?.encryptedRefreshToken) {
      try {
        refreshToken = decryptToken(state.youtube.encryptedRefreshToken);
      } catch {}
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

    if (!clientId || !clientSecret || !refreshToken) {
      console.warn("⚠️ [YouTube] Credentials missing for thumbnail upload");
      return false;
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });

    const { Readable } = await import("node:stream");
    const mediaStream = Readable.from(pngBuffer);

    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: "image/png",
        body: mediaStream,
      },
    });

    console.log(`🎨 [YouTube] Successfully set custom thumbnail for video ${videoId}!`);
    return true;
  } catch (err: any) {
    console.warn(
      `⚠️ [YouTube] Thumbnail upload warning (video upload was successful): ${
        err?.message || err
      }`
    );
    return false;
  }
}
