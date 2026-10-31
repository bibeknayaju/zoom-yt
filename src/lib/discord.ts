/**
 * Discord Webhook Notification Service for Vidia Auto-Pilot
 *
 * Dispatches rich embedded notifications to Discord channels for class video
 * upload successes, processing failures, and daily auto-pilot runs.
 */

const DEFAULT_DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1484594086798299349/d91Gfpxu_9K3H1zZZ86yhKmsjvNf-hJhRgVzY_wtpiSjV7K1S6wipfcdH_mQzIqO-ySM";

function formatNepalTime(isoDate: string | Date): string {
  try {
    const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kathmandu",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d) + " NPT";
  } catch {
    return String(isoDate);
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "N/A";
  const mb = Math.round(bytes / (1024 * 1024));
  return `${mb} MB`;
}

export interface VideoSuccessNotificationParams {
  topic: string;
  hostName?: string;
  accountName?: string;
  durationMinutes?: number;
  fileSizeBytes?: number;
  startTime?: string;
  youtubeUrl: string;
  youtubeVideoId?: string;
  resolution?: string;
  webhookUrl?: string;
}

export interface VideoFailureNotificationParams {
  topic: string;
  hostName?: string;
  accountName?: string;
  startTime?: string;
  fileId?: string;
  error: string;
  webhookUrl?: string;
}

export interface AutopilotSummaryParams {
  runLabel?: string;
  totalFound: number;
  totalSuccess: number;
  totalFailed: number;
  totalSkipped: number;
  activeAccountsCount: number;
  webhookUrl?: string;
}

/**
 * Send raw Discord Webhook payload
 */
export async function sendDiscordPayload(
  payload: Record<string, any>,
  webhookUrl = DEFAULT_DISCORD_WEBHOOK_URL
): Promise<boolean> {
  const url = webhookUrl || DEFAULT_DISCORD_WEBHOOK_URL;
  if (!url) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`⚠️ [Discord Webhook] Failed to deliver notification (${res.status}): ${txt}`);
      return false;
    }
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`⚠️ [Discord Webhook] Delivery error: ${msg}`);
    return false;
  }
}

/**
 * Send Per-Video SUCCESS notification to Discord
 */
export async function sendDiscordVideoSuccess(
  params: VideoSuccessNotificationParams
): Promise<boolean> {
  const timeStr = params.startTime ? formatNepalTime(params.startTime) : formatNepalTime(new Date());

  const embed = {
    title: "🎬 Video Successfully Watermarked & Uploaded!",
    description: `**${params.topic}** has been processed and is now live on YouTube.`,
    color: 0x10b981, // Emerald Green
    fields: [
      {
        name: "📚 Class / Topic",
        value: `**${params.topic}**`,
        inline: false,
      },
      {
        name: "🔗 YouTube Watch Link",
        value: `▶️ [**Click here to watch on YouTube**](${params.youtubeUrl})\n\`${params.youtubeUrl}\``,
        inline: false,
      },
      {
        name: "⏱️ Duration",
        value: params.durationMinutes ? `${params.durationMinutes} mins` : "N/A",
        inline: true,
      },
      {
        name: "💾 Video Size",
        value: formatBytes(params.fileSizeBytes),
        inline: true,
      },
      {
        name: "🏢 Zoom Account",
        value: params.accountName || "Default",
        inline: true,
      },
      {
        name: "👨‍🏫 Teacher / Host",
        value: params.hostName || "Union Education",
        inline: true,
      },
      {
        name: "📅 Class Time",
        value: timeStr,
        inline: true,
      },
      {
        name: "🔒 Privacy",
        value: "Unlisted",
        inline: true,
      },
    ],
    footer: {
      text: "Vidia Auto-Pilot • Cloud Pipeline",
    },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordPayload(
    {
      username: "Vidia Auto-Pilot",
      embeds: [embed],
    },
    params.webhookUrl
  );
}

/**
 * Send Per-Video FAILURE notification to Discord
 */
export async function sendDiscordVideoFailure(
  params: VideoFailureNotificationParams
): Promise<boolean> {
  const timeStr = params.startTime ? formatNepalTime(params.startTime) : formatNepalTime(new Date());

  const embed = {
    title: "❌ Video Processing Failed",
    description: `Failed to process class video: **${params.topic}**.`,
    color: 0xef4444, // Red
    fields: [
      {
        name: "📚 Class / Topic",
        value: `**${params.topic}**`,
        inline: false,
      },
      {
        name: "⚠️ Error Details",
        value: `\`\`\`${(params.error || "Unknown error").slice(0, 950)}\`\`\``,
        inline: false,
      },
      {
        name: "🏢 Zoom Account",
        value: params.accountName || "Default",
        inline: true,
      },
      {
        name: "👨‍🏫 Teacher / Host",
        value: params.hostName || "Union Education",
        inline: true,
      },
      {
        name: "📅 Class Time",
        value: timeStr,
        inline: true,
      },
    ],
    footer: {
      text: "Vidia Auto-Pilot • Alert",
    },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordPayload(
    {
      username: "Vidia Auto-Pilot",
      embeds: [embed],
    },
    params.webhookUrl
  );
}

/**
 * Send Auto-Pilot Batch Summary to Discord
 */
export async function sendDiscordAutopilotSummary(
  params: AutopilotSummaryParams
): Promise<boolean> {
  const isAllSuccess = params.totalFailed === 0;
  const embed = {
    title: isAllSuccess ? "🚀 Auto-Pilot Schedule Completed" : "⚠️ Auto-Pilot Schedule Finished with Errors",
    description: `Automated scan across **${params.activeAccountsCount} active Zoom accounts** for today's classes.`,
    color: isAllSuccess ? 0x3b82f6 : 0xf59e0b, // Blue or Amber
    fields: [
      {
        name: "📥 Found Today",
        value: `${params.totalFound} classes`,
        inline: true,
      },
      {
        name: "✅ Uploaded",
        value: `${params.totalSuccess} videos`,
        inline: true,
      },
      {
        name: "❌ Failed",
        value: `${params.totalFailed} videos`,
        inline: true,
      },
    ],
    footer: {
      text: `Vidia Auto-Pilot • ${params.runLabel || "Scheduled Run"}`,
    },
    timestamp: new Date().toISOString(),
  };

  return sendDiscordPayload(
    {
      username: "Vidia Auto-Pilot",
      embeds: [embed],
    },
    params.webhookUrl
  );
}
