import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  AutoWatermarkTemplate,
  DEFAULT_WATERMARK_TEMPLATE,
} from "./watermark-template";

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// In-memory cache for ultra-fast response without redundant DB calls
let cachedTemplate: AutoWatermarkTemplate | null = null;

export async function getWatermarkTemplate(): Promise<AutoWatermarkTemplate> {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("zy_settings")
        .select("template_data")
        .eq("id", "default")
        .maybeSingle();

      if (!error && data?.template_data && typeof data.template_data === "object" && Object.keys(data.template_data).length > 0) {
        const tpl: AutoWatermarkTemplate = { ...DEFAULT_WATERMARK_TEMPLATE, ...data.template_data };
        cachedTemplate = tpl;
        return tpl;
      }
    } catch (err) {
      console.error("Failed to fetch watermark template from database:", err);
    }
  }

  return cachedTemplate || DEFAULT_WATERMARK_TEMPLATE;
}

export async function saveWatermarkTemplate(template: Partial<AutoWatermarkTemplate>): Promise<AutoWatermarkTemplate> {
  const current = await getWatermarkTemplate();
  const merged: AutoWatermarkTemplate = {
    ...current,
    ...template,
    updatedAt: new Date().toISOString(),
  };

  cachedTemplate = merged;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_settings").upsert(
        {
          id: "default",
          template_data: merged,
          watermark_type: merged.watermarkType,
          watermark_image_url: merged.logoPath,
          watermark_text: merged.watermarkText,
          watermark_scale: merged.imageScale,
          watermark_opacity: merged.imageOpacity,
          watermark_pos_x: merged.imagePosX,
          watermark_pos_y: merged.imagePosY,
          updated_at: merged.updatedAt,
        },
        { onConflict: "id" }
      );
    } catch (err) {
      console.error("Failed to save watermark template to database:", err);
    }
  }

  return merged;
}
