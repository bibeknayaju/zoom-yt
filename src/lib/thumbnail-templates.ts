/**
 * High-Converting 1280x720 YouTube Thumbnail Template Engine for Vidia
 *
 * Supports 6 distinct modern styles with authentic Unicode Devanagari typography:
 * 1. glassmorphism      - Modern Dark Glassmorphism (Glow + Frosted Glass)
 * 2. edtech-split        - High-Contrast Academy (Two-column split with subject bar)
 * 3. teacher-spotlight   - Teacher Spotlight (Instructor portrait + bold headline)
 * 4. royal-gold          - Classic Union Gold (Imperial navy with gold foil borders)
 * 5. neon-stream         - Cyber Neon Broadcast (High-energy mesh + live badge)
 * 6. nepali-editorial    - Traditional Devanagari (Devanagari-first typography + saffron accents)
 */

import NepaliDate from "nepali-date-converter";

export type ThumbnailTemplateId =
  | "glassmorphism"
  | "edtech-split"
  | "teacher-spotlight"
  | "royal-gold"
  | "neon-stream"
  | "nepali-editorial";

export interface ThumbnailTemplateMeta {
  id: ThumbnailTemplateId;
  name: string;
  tagline: string;
  description: string;
  badgeColor: string;
  category: "Modern" | "Institutional" | "Spotlight" | "High-CTR";
}

export const THUMBNAIL_TEMPLATES: ThumbnailTemplateMeta[] = [
  {
    id: "glassmorphism",
    name: "Modern Dark Glassmorphism",
    tagline: "Frosted Glass & Ambient Glow",
    description: "Deep obsidian backdrop with glowing subject accents, frosted glass containers, and crisp Devanagari typography.",
    badgeColor: "#06b6d4", // Cyan
    category: "Modern",
  },
  {
    id: "edtech-split",
    name: "EdTech Split-Screen Academy",
    tagline: "Two-Column High-Contrast",
    description: "Solid high-contrast sidebar with vibrant subject color bar, huge crest watermark, and institutional badges.",
    badgeColor: "#3b82f6", // Blue
    category: "High-CTR",
  },
  {
    id: "teacher-spotlight",
    name: "Teacher Spotlight & Portrait",
    tagline: "Instructor Avatar & Bold Headline",
    description: "Highlights the active teacher with a circular avatar cutout, instructor badge, and large bold class topic.",
    badgeColor: "#10b981", // Emerald
    category: "Spotlight",
  },
  {
    id: "royal-gold",
    name: "Royal Navy & Imperial Gold",
    tagline: "Formal Institutional Aesthetic",
    description: "Deep royal navy canvas with warm gold foil borders, star emblem, and refined formal typography.",
    badgeColor: "#d97706", // Gold
    category: "Institutional",
  },
  {
    id: "neon-stream",
    name: "Cyber Neon & Live Broadcast",
    tagline: "Maximum YouTube CTR",
    description: "High-energy gradient mesh, neon rim lights, bold red recorded class badge, and condensed punchy typography.",
    badgeColor: "#ec4899", // Pink
    category: "High-CTR",
  },
  {
    id: "nepali-editorial",
    name: "Devanagari Editorial",
    tagline: "Traditional Saffron & Crimson",
    description: "Specially crafted for Nepali Language, TSC, and Social classes with authentic Devanagari script prominence.",
    badgeColor: "#dc2626", // Crimson
    category: "Institutional",
  },
];

export interface ThumbnailRenderOptions {
  templateId?: ThumbnailTemplateId;
  subject?: string;
  topic: string;
  teachers?: string[];
  nepaliDateStr?: string;
  dateObj?: Date;
  logoPath?: string;
}

// Global font-family ensuring authentic Unicode Devanagari (like 'मलाई') renders crisply across browsers & Resvg
export const THUMBNAIL_FONT_FAMILY = "'Noto Sans Devanagari', 'Noto Sans', 'Kohinoor Devanagari', 'Devanagari MT', 'Arial Unicode MS', Arial, sans-serif";

// Convert Date to Nepali Bikram Sambat String (e.g. २०८३ कार्तिक १४)
export function formatNepaliBikramSambat(date = new Date()): string {
  try {
    const bs = new NepaliDate(date);
    return bs.format("YYYY MMMM DD", "np");
  } catch {
    return "२०८३";
  }
}

// Sanitize XML/SVG text entities
function escapeXml(unsafe?: string): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Format teacher names
function formatTeachers(teachers?: string[]): string {
  if (!teachers || teachers.length === 0) return "Union Education";
  if (teachers.length === 1) return teachers[0];
  if (teachers.length === 2) return `${teachers[0]} & ${teachers[1]}`;
  return `${teachers[0]} & ${teachers.length - 1} others`;
}

// Read logo as base64 data URI or asset URL
export function getLogoDataUri(customPath?: string): string {
  return customPath || "/assets/images/logo1.png";
}

// Subject color map
const SUBJECT_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  science: { bg: "#06b6d4", text: "#ffffff", glow: "rgba(6, 182, 212, 0.45)" },
  nepali: { bg: "#e11d48", text: "#ffffff", glow: "rgba(225, 29, 72, 0.45)" },
  social: { bg: "#f59e0b", text: "#ffffff", glow: "rgba(245, 158, 11, 0.45)" },
  mathematics: { bg: "#8b5cf6", text: "#ffffff", glow: "rgba(139, 92, 246, 0.45)" },
  english: { bg: "#3b82f6", text: "#ffffff", glow: "rgba(59, 130, 246, 0.45)" },
  webinar: { bg: "#10b981", text: "#ffffff", glow: "rgba(16, 185, 129, 0.45)" },
  license: { bg: "#f97316", text: "#ffffff", glow: "rgba(249, 115, 22, 0.45)" },
};

function getSubjectPalette(subject = "") {
  const key = subject.toLowerCase().trim();
  for (const [sKey, val] of Object.entries(SUBJECT_COLORS)) {
    if (key.includes(sKey)) return val;
  }
  return { bg: "#3b82f6", text: "#ffffff", glow: "rgba(59, 130, 246, 0.4)" };
}

/**
 * Generate 1280x720 SVG String for any of the 6 templates
 */
export function generateThumbnailSvg(options: ThumbnailRenderOptions): string {
  const templateId = options.templateId || "glassmorphism";
  const subject = options.subject || "Class Recording";
  const topic = options.topic || "Daily Live Session";
  const teachersStr = formatTeachers(options.teachers);
  const nepaliDate = options.nepaliDateStr || formatNepaliBikramSambat(options.dateObj || new Date());
  const logoUri = getLogoDataUri(options.logoPath);
  const palette = getSubjectPalette(subject);

  const safeSubject = escapeXml(subject.toUpperCase());
  const safeTopic = escapeXml(topic);
  const safeTeachers = escapeXml(teachersStr);
  const safeDate = escapeXml(nepaliDate);

  switch (templateId) {
    case "glassmorphism":
      return `
<svg width="100%" height="100%" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#050811" />
      <stop offset="50%" stop-color="#090f1d" />
      <stop offset="100%" stop-color="#020408" />
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="30%" r="50%">
      <stop offset="0%" stop-color="${palette.glow}" />
      <stop offset="100%" stop-color="transparent" />
    </radialGradient>
    <radialGradient id="cardGlow" cx="20%" cy="80%" r="60%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.06)" />
      <stop offset="100%" stop-color="transparent" />
    </radialGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1280" height="720" fill="url(#bg)" />
  <rect width="1280" height="720" fill="url(#glow)" />

  <!-- Accent Geometry -->
  <circle cx="1180" cy="120" r="220" fill="none" stroke="${palette.bg}" stroke-width="1.5" stroke-opacity="0.2" />
  <circle cx="1180" cy="120" r="160" fill="none" stroke="${palette.bg}" stroke-width="1" stroke-dasharray="6,6" stroke-opacity="0.3" />

  <!-- Glass Card Container -->
  <g filter="url(#shadow)">
    <rect x="60" y="60" width="1160" height="600" rx="28" fill="rgba(15, 23, 42, 0.65)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1.5" />
    <rect x="60" y="60" width="1160" height="600" rx="28" fill="url(#cardGlow)" />
  </g>

  <!-- Top Header Inside Glass -->
  <g transform="translate(100, 100)">
    ${
      logoUri
        ? `<image href="${logoUri}" x="0" y="0" width="180" height="55" preserveAspectRatio="xMinYMid meet" />`
        : `<text x="0" y="40" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="34" fill="#ffffff" letter-spacing="1">VIDIA</text>`
    }

    <!-- Subject Badge -->
    <rect x="860" y="6" width="200" height="42" rx="21" fill="${palette.bg}" />
    <text x="960" y="32" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="16" fill="${palette.text}" text-anchor="middle" letter-spacing="1.5">${safeSubject}</text>
  </g>

  <!-- Center Topic Content -->
  <g transform="translate(100, 250)">
    <!-- Topic Title -->
    <text x="0" y="60" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="54" fill="#ffffff" letter-spacing="-0.5">
      ${safeTopic.length > 40 ? safeTopic.slice(0, 38) + "..." : safeTopic}
    </text>

    <!-- Subtitle divider line -->
    <line x1="0" y1="100" x2="320" y2="100" stroke="${palette.bg}" stroke-width="4" stroke-linecap="round" />
  </g>

  <!-- Bottom Badges: Teacher & Date -->
  <g transform="translate(100, 550)">
    <!-- Teacher Pill -->
    <rect x="0" y="0" width="500" height="64" rx="16" fill="rgba(0, 0, 0, 0.55)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1.2" />
    <circle cx="32" cy="32" r="16" fill="${palette.bg}" />
    <path d="M26 36c0-3.3 2.7-6 6-6s6 2.7 6 6v1H26v-1zm6-8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" fill="#ffffff"/>
    <text x="60" y="26" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="600" font-size="11" fill="rgba(255,255,255,0.6)" letter-spacing="1">प्रशिक्षक (INSTRUCTOR)</text>
    <text x="60" y="47" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="18" fill="#ffffff">${safeTeachers}</text>

    <!-- Nepali Date Pill -->
    <rect x="740" y="0" width="320" height="64" rx="16" fill="rgba(0, 0, 0, 0.55)" stroke="rgba(255, 255, 255, 0.14)" stroke-width="1.2" />
    <circle cx="772" cy="32" r="16" fill="rgba(255,255,255,0.15)" />
    <rect x="765" y="25" width="14" height="14" rx="3" fill="none" stroke="#ffffff" stroke-width="1.5"/>
    <line x1="765" y1="29" x2="779" y2="29" stroke="#ffffff" stroke-width="1.2"/>
    <text x="802" y="26" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="600" font-size="11" fill="rgba(255,255,255,0.6)" letter-spacing="1">मिति (NEPALI DATE)</text>
    <text x="802" y="47" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="18" fill="#ffffff">${safeDate}</text>
  </g>
</svg>
`;

    case "edtech-split":
      return `
<svg width="100%" height="100%" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="splitRightBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
  </defs>

  <!-- Left Sidebar (440px) -->
  <rect x="0" y="0" width="440" height="720" fill="#020617" />
  <rect x="436" y="0" width="4" height="720" fill="${palette.bg}" />

  <!-- Right Canvas (840px) -->
  <rect x="440" y="0" width="840" height="720" fill="url(#splitRightBg)" />

  <!-- Background Emblems in Right Canvas -->
  <circle cx="980" cy="360" r="280" fill="none" stroke="${palette.bg}" stroke-width="2" stroke-opacity="0.08" />
  <circle cx="980" cy="360" r="200" fill="none" stroke="${palette.bg}" stroke-width="1" stroke-dasharray="10,10" stroke-opacity="0.12" />

  <!-- Left Column Content -->
  <g transform="translate(60, 70)">
    ${
      logoUri
        ? `<image href="${logoUri}" x="0" y="0" width="220" height="65" preserveAspectRatio="xMinYMid meet" />`
        : `<text x="0" y="45" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="34" fill="#ffffff">UNION EDUCATION</text>`
    }

    <rect x="0" y="140" width="320" height="3" fill="${palette.bg}" />

    <!-- Subject Pill -->
    <rect x="0" y="170" width="180" height="36" rx="6" fill="${palette.bg}" />
    <text x="90" y="194" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="15" fill="${palette.text}" text-anchor="middle" letter-spacing="1.5">${safeSubject}</text>

    <!-- Teacher Info -->
    <text x="0" y="270" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="600" font-size="12" fill="rgba(255,255,255,0.5)" letter-spacing="1.5">प्रशिक्षक (INSTRUCTOR)</text>
    <text x="0" y="302" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="24" fill="#ffffff">${safeTeachers}</text>

    <!-- Date Info -->
    <text x="0" y="390" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="600" font-size="12" fill="rgba(255,255,255,0.5)" letter-spacing="1.5">मिति (NEPALI DATE BS)</text>
    <text x="0" y="422" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="24" fill="#ffffff">${safeDate}</text>

    <!-- Live Session Badge -->
    <g transform="translate(0, 520)">
      <rect x="0" y="0" width="220" height="42" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
      <circle cx="20" cy="21" r="5" fill="#ef4444" />
      <text x="36" y="26" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="700" font-size="12" fill="#ffffff" letter-spacing="1">FULL CLASS ARCHIVE</text>
    </g>
  </g>

  <!-- Right Column Content (Topic Dominance) -->
  <g transform="translate(520, 240)">
    <text x="0" y="60" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="58" fill="#ffffff" letter-spacing="-0.5">
      ${safeTopic.length > 40 ? safeTopic.slice(0, 38) + "..." : safeTopic}
    </text>

    <text x="0" y="130" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="500" font-size="24" fill="rgba(255,255,255,0.65)">
      Comprehensive Lesson &amp; Problem Solving
    </text>
  </g>
</svg>
`;

    case "teacher-spotlight":
      return `
<svg width="100%" height="100%" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="spotBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="avatarGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg}" />
      <stop offset="100%" stop-color="#818cf8" />
    </linearGradient>
  </defs>

  <rect width="1280" height="720" fill="url(#spotBg)" />

  <!-- Top Bar -->
  <g transform="translate(80, 60)">
    ${
      logoUri
        ? `<image href="${logoUri}" x="0" y="0" width="180" height="50" preserveAspectRatio="xMinYMid meet" />`
        : `<text x="0" y="38" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="32" fill="#ffffff">UNION EDUCATION</text>`
    }
    <rect x="920" y="6" width="200" height="38" rx="19" fill="${palette.bg}" />
    <text x="1020" y="31" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="14" fill="${palette.text}" text-anchor="middle" letter-spacing="1.5">${safeSubject}</text>
  </g>

  <!-- Large Topic Headline (Left Side) -->
  <g transform="translate(80, 240)">
    <text x="0" y="60" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="52" fill="#ffffff" letter-spacing="-0.5">
      ${safeTopic.length > 34 ? safeTopic.slice(0, 32) + "..." : safeTopic}
    </text>

    <!-- Nepali Date -->
    <g transform="translate(0, 130)">
      <rect x="0" y="0" width="260" height="44" rx="10" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" stroke-width="1" />
      <text x="130" y="28" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="700" font-size="16" fill="#ffffff" text-anchor="middle">मिति: ${safeDate}</text>
    </g>
  </g>

  <!-- Teacher Spotlight Avatar / Card (Right Side) -->
  <g transform="translate(860, 200)">
    <!-- Glow Ring -->
    <circle cx="160" cy="140" r="130" fill="none" stroke="url(#avatarGlow)" stroke-width="5" />
    <circle cx="160" cy="140" r="118" fill="#0f172a" />
    <!-- Vector Portrait Silhouette -->
    <g transform="translate(136, 105) scale(2)">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#ffffff" fill-opacity="0.85"/>
    </g>

    <!-- Teacher Name Card -->
    <rect x="0" y="300" width="320" height="68" rx="16" fill="rgba(15, 23, 42, 0.95)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.5" />
    <text x="160" y="326" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="600" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle" letter-spacing="1.5">मुख्य प्रशिक्षक (LEAD INSTRUCTOR)</text>
    <text x="160" y="350" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="18" fill="#ffffff" text-anchor="middle">${safeTeachers}</text>
  </g>
</svg>
`;

    case "royal-gold":
      return `
<svg width="100%" height="100%" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
  </defs>

  <rect width="1280" height="720" fill="#070d19" />

  <!-- Elegant Gold Borders -->
  <rect x="30" y="30" width="1220" height="660" rx="16" fill="none" stroke="url(#goldGradient)" stroke-width="2.5" />
  <rect x="42" y="42" width="1196" height="636" rx="12" fill="none" stroke="url(#goldGradient)" stroke-width="1" stroke-opacity="0.3" />

  <!-- Corner Ornaments -->
  <circle cx="30" cy="30" r="6" fill="#fbbf24" />
  <circle cx="1250" cy="30" r="6" fill="#fbbf24" />
  <circle cx="30" cy="690" r="6" fill="#fbbf24" />
  <circle cx="1250" cy="690" r="6" fill="#fbbf24" />

  <!-- Top Institutional Crest -->
  <g transform="translate(80, 80)">
    ${
      logoUri
        ? `<image href="${logoUri}" x="0" y="0" width="200" height="60" preserveAspectRatio="xMinYMid meet" />`
        : `<text x="0" y="45" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="34" fill="#fbbf24">UNION EDUCATION</text>`
    }

    <!-- Subject Pill -->
    <rect x="940" y="10" width="180" height="40" rx="8" fill="url(#goldGradient)" />
    <text x="1030" y="36" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="15" fill="#0f172a" text-anchor="middle" letter-spacing="1.5">${safeSubject}</text>
  </g>

  <!-- Center Topic in Gold Box -->
  <g transform="translate(80, 260)">
    <text x="0" y="50" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="bold" font-size="54" fill="#ffffff">
      ${safeTopic.length > 40 ? safeTopic.slice(0, 38) + "..." : safeTopic}
    </text>
    <line x1="0" y1="90" x2="420" y2="90" stroke="#fbbf24" stroke-width="2" />
  </g>

  <!-- Bottom Gold Bar -->
  <g transform="translate(80, 560)">
    <rect x="0" y="0" width="1120" height="64" rx="10" fill="rgba(251, 191, 36, 0.08)" stroke="url(#goldGradient)" stroke-width="1.2" />
    <text x="30" y="38" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="700" font-size="19" fill="#ffffff">प्रशिक्षक: ${safeTeachers}</text>
    <text x="1090" y="38" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="700" font-size="19" fill="#fbbf24" text-anchor="end">मिति: ${safeDate}</text>
  </g>
</svg>
`;

    case "neon-stream":
      return `
<svg width="100%" height="100%" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="neonBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a051b" />
      <stop offset="50%" stop-color="#180d38" />
      <stop offset="100%" stop-color="#02000a" />
    </linearGradient>
    <linearGradient id="neonBar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f43f5e" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
  </defs>

  <rect width="1280" height="720" fill="url(#neonBg)" />

  <!-- Top Bar -->
  <g transform="translate(80, 60)">
    ${
      logoUri
        ? `<image href="${logoUri}" x="0" y="0" width="180" height="50" preserveAspectRatio="xMinYMid meet" />`
        : `<text x="0" y="40" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="34" fill="#ffffff">VIDIA</text>`
    }

    <!-- High CTR LIVE RECORDING Badge -->
    <rect x="880" y="6" width="240" height="42" rx="10" fill="#e11d48" />
    <circle cx="905" cy="27" r="6" fill="#ffffff" />
    <text x="925" y="33" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="14" fill="#ffffff" letter-spacing="1">RECORDED CLASS</text>
  </g>

  <!-- Large Topic with Neon Accent -->
  <g transform="translate(80, 240)">
    <rect x="0" y="0" width="180" height="34" rx="8" fill="url(#neonBar)" />
    <text x="90" y="23" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="14" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">${safeSubject}</text>

    <text x="0" y="95" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="56" fill="#ffffff" letter-spacing="-0.5">
      ${safeTopic.length > 38 ? safeTopic.slice(0, 36) + "..." : safeTopic}
    </text>

    <line x1="0" y1="135" x2="1120" y2="135" stroke="url(#neonBar)" stroke-width="3" />
  </g>

  <!-- Bottom Badges -->
  <g transform="translate(80, 560)">
    <text x="0" y="35" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="22" fill="#ffffff">
      <tspan fill="#ec4899">प्रशिक्षक:</tspan> ${safeTeachers}
    </text>
    <text x="1120" y="35" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="22" fill="#ffffff" text-anchor="end">
      <tspan fill="#a855f7">मिति:</tspan> ${safeDate}
    </text>
  </g>
</svg>
`;

    case "nepali-editorial":
      return `
<svg width="100%" height="100%" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="nepBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1c1917" />
      <stop offset="100%" stop-color="#0c0a09" />
    </linearGradient>
  </defs>

  <rect width="1280" height="720" fill="url(#nepBg)" />

  <!-- Crimson & Saffron Borders -->
  <rect x="25" y="25" width="1230" height="670" rx="12" fill="none" stroke="#dc2626" stroke-width="3" />
  <rect x="35" y="35" width="1210" height="650" rx="8" fill="none" stroke="#d97706" stroke-width="1.5" stroke-dasharray="8,6" />

  <!-- Top Header -->
  <g transform="translate(80, 75)">
    ${
      logoUri
        ? `<image href="${logoUri}" x="0" y="0" width="200" height="60" preserveAspectRatio="xMinYMid meet" />`
        : `<text x="0" y="45" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="34" fill="#ffffff">UNION EDUCATION</text>`
    }

    <!-- Saffron Subject Badge -->
    <rect x="920" y="8" width="200" height="44" rx="8" fill="#d97706" />
    <text x="1020" y="36" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="16" fill="#ffffff" text-anchor="middle" letter-spacing="1">${safeSubject}</text>
  </g>

  <!-- Center Topic in Devanagari Prominence -->
  <g transform="translate(80, 240)">
    <rect x="0" y="0" width="260" height="34" rx="6" fill="#991b1b" />
    <text x="130" y="23" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="14" fill="#ffffff" text-anchor="middle" letter-spacing="1">शिक्षक सेवा / लोकसेवा तयारी</text>

    <text x="0" y="100" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="900" font-size="56" fill="#ffffff">
      ${safeTopic.length > 38 ? safeTopic.slice(0, 36) + "..." : safeTopic}
    </text>

    <line x1="0" y1="135" x2="400" y2="135" stroke="#dc2626" stroke-width="4" />
  </g>

  <!-- Bottom Teacher & Nepali Date Panel -->
  <g transform="translate(80, 550)">
    <rect x="0" y="0" width="1120" height="65" rx="12" fill="#292524" stroke="rgba(255,255,255,0.12)" stroke-width="1.2" />
    <text x="35" y="40" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="20" fill="#ffffff">
      <tspan fill="#f59e0b">प्रशिक्षक:</tspan> ${safeTeachers}
    </text>
    <text x="1085" y="40" font-family="${THUMBNAIL_FONT_FAMILY}" font-weight="800" font-size="20" fill="#ffffff" text-anchor="end">
      <tspan fill="#f59e0b">मिति:</tspan> ${safeDate}
    </text>
  </g>
</svg>
`;

    default:
      return "";
  }
}
