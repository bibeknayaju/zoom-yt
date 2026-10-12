export interface AutoWatermarkTemplate {
  watermarkType: "both" | "image" | "text" | "none";
  selectedResolution: "1080p" | "720p" | "480p" | "original";
  logoPresetId: string;
  logoPath: string;
  imageScale: number; // 0.05 to 0.50 (e.g. 0.18 = 18%)
  imageOpacity: number; // 0.10 to 1.00 (e.g. 0.85 = 85%)
  imagePosX: number; // 0.0 to 1.0 (e.g. 0.78 = 78% from left)
  imagePosY: number; // 0.0 to 1.0 (e.g. 0.04 = 4% from top)
  watermarkText: string; // e.g. "Union Education"
  fontSize: number; // e.g. 24 or 28
  textOpacity: number; // 0.10 to 1.00 (e.g. 0.85 = 85%)
  textPosX: number; // 0.0 to 1.0 (e.g. 0.04 = 4% from left)
  textPosY: number; // 0.0 to 1.0 (e.g. 0.90 = 90% from top)
  updatedAt?: string;
}

export const DEFAULT_WATERMARK_TEMPLATE: AutoWatermarkTemplate = {
  watermarkType: "both",
  selectedResolution: "720p",
  logoPresetId: "crest",
  logoPath: "/assets/images/logo_main.png",
  imageScale: 0.18,
  imageOpacity: 0.85,
  imagePosX: 0.78,
  imagePosY: 0.04,
  watermarkText: "Union Education",
  fontSize: 24,
  textOpacity: 0.85,
  textPosX: 0.04,
  textPosY: 0.90,
  updatedAt: "2026-10-10T00:00:00.000Z",
};
