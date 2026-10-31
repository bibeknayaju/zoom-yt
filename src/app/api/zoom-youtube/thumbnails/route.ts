import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  THUMBNAIL_TEMPLATES,
  ThumbnailTemplateId,
  generateThumbnailSvg,
  formatNepaliBikramSambat,
} from "@/lib/thumbnail-templates";
import { renderThumbnailToPng, getLocalLogoBase64 } from "@/lib/thumbnail-server";

export const dynamic = "force-dynamic";

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface TeacherItem {
  id: string;
  name: string;
  isActive: boolean;
}

export interface SubjectConfigItem {
  teachers: TeacherItem[];
  currentTopic: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 });
    }

    // 1. Fetch settings from zy_settings
    const { data: settingsRow } = await supabase
      .from("zy_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    const templateData = (settingsRow?.template_data as any) || {};
    const activeTemplateId: ThumbnailTemplateId =
      templateData.active_thumbnail_template || "glassmorphism";
    const autoUploadThumbnail = templateData.thumbnail_auto_upload ?? true;
    const subjectsConfig: Record<string, SubjectConfigItem> =
      templateData.thumbnail_subjects_config || {};

    // 2. Fetch active Zoom accounts (subjects)
    const { data: accounts } = await supabase
      .from("zy_zoom_accounts")
      .select("id, account_name, is_active")
      .order("account_name", { ascending: true });

    // Seed default teacher list for each account if not already configured
    const formattedAccounts = (accounts || []).map((acc) => {
      const cfg = subjectsConfig[acc.account_name] || {
        teachers: [{ id: "t1", name: "Union Education", isActive: true }],
        currentTopic: "",
      };
      return {
        id: acc.id,
        accountName: acc.account_name,
        isActive: acc.is_active,
        teachers: cfg.teachers || [],
        currentTopic: cfg.currentTopic || "",
      };
    });

    return NextResponse.json({
      success: true,
      activeTemplateId,
      autoUploadThumbnail,
      availableTemplates: THUMBNAIL_TEMPLATES,
      accounts: formattedAccounts,
      subjectsConfig,
      nepaliDateToday: formatNepaliBikramSambat(new Date()),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Load current template_data
    const { data: settingsRow } = await supabase
      .from("zy_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    const templateData = (settingsRow?.template_data as any) || {};

    // Action 1: Switch active thumbnail template
    if (action === "set_active_template") {
      const templateId = body.templateId as ThumbnailTemplateId;
      const valid = THUMBNAIL_TEMPLATES.some((t) => t.id === templateId);
      if (!valid) {
        return NextResponse.json({ success: false, error: `Invalid template ID: ${templateId}` }, { status: 400 });
      }

      const updatedTemplateData = {
        ...templateData,
        active_thumbnail_template: templateId,
      };

      await supabase
        .from("zy_settings")
        .update({
          template_data: updatedTemplateData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return NextResponse.json({
        success: true,
        activeTemplateId: templateId,
        message: `Active thumbnail template updated to "${templateId}"!`,
      });
    }

    // Action 2: Save Subject & Teacher Config
    if (action === "save_subject_config") {
      const { accountName, teachers, currentTopic } = body;
      if (!accountName) {
        return NextResponse.json({ success: false, error: "accountName is required" }, { status: 400 });
      }

      const prevConfigs = templateData.thumbnail_subjects_config || {};
      const updatedConfigs = {
        ...prevConfigs,
        [accountName]: {
          teachers: Array.isArray(teachers) ? teachers : [],
          currentTopic: typeof currentTopic === "string" ? currentTopic.trim() : "",
        },
      };

      await supabase
        .from("zy_settings")
        .update({
          template_data: {
            ...templateData,
            thumbnail_subjects_config: updatedConfigs,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return NextResponse.json({
        success: true,
        message: `Teacher settings for "${accountName}" saved successfully!`,
      });
    }

    // Action 3: Toggle auto-upload thumbnail
    if (action === "toggle_auto_upload") {
      const enabled = Boolean(body.enabled);
      await supabase
        .from("zy_settings")
        .update({
          template_data: {
            ...templateData,
            thumbnail_auto_upload: enabled,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return NextResponse.json({
        success: true,
        enabled,
        message: enabled ? "Auto thumbnail upload enabled" : "Auto thumbnail upload disabled",
      });
    }

    // Action 4: Render PNG for download or live preview
    if (action === "render_png") {
      const svg = generateThumbnailSvg({
        templateId: body.templateId || templateData.active_thumbnail_template || "glassmorphism",
        subject: body.subject || "Science",
        topic: body.topic || "Class Recording",
        teachers: body.teachers || ["Union Education"],
        nepaliDateStr: body.nepaliDateStr,
        logoPath: getLocalLogoBase64(),
      });

      const pngBuffer = await renderThumbnailToPng(svg);
      const base64 = `data:image/png;base64,${pngBuffer.toString("base64")}`;

      return NextResponse.json({
        success: true,
        base64,
        sizeBytes: pngBuffer.length,
      });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("❌ [/api/zoom-youtube/thumbnails] Error:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
