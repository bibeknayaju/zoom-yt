import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { runAutopilotDiscovery, getNepalDateString } from "@/lib/autopilot";
import { triggerGitHubWorkflow } from "@/lib/github-actions";
import { sendDiscordVideoSuccess } from "@/lib/discord";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getNextScheduledRunNpt(): string {
  try {
    const now = new Date();
    const nptFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kathmandu",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = nptFormatter.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const currentMinutes = hour * 60 + minute;

    const morningMinutes = 7 * 60; // 07:00 (420 min)
    const eveningMinutes = 23 * 60; // 23:00 (1380 min)

    if (currentMinutes < morningMinutes) {
      return "Today at 7:00 AM NPT (Morning Batch)";
    } else if (currentMinutes < eveningMinutes) {
      return "Today at 11:00 PM NPT (Evening Batch)";
    } else {
      return "Tomorrow at 7:00 AM NPT (Morning Batch)";
    }
  } catch {
    return "Daily at 7:00 AM & 11:00 PM NPT";
  }
}

async function getLatestWorkflowRun() {
  const token = process.env.GITHUB_PAT || process.env.GH_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER || "bibeknayaju";
  const repo = process.env.GITHUB_REPO_NAME || "zoom-yt";
  if (!token) return null;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=1`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.trim()}`,
        "User-Agent": "Zoom-YouTube-Studio",
      },
      next: { revalidate: 15 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const latest = data.workflow_runs?.[0];
    if (!latest) return null;
    return {
      id: latest.id,
      name: latest.name,
      status: latest.status,
      conclusion: latest.conclusion,
      htmlUrl: latest.html_url,
      createdAt: latest.created_at,
    };
  } catch {
    return null;
  }
}

// GET: Fetches current Auto-Pilot configuration & status, or executes cron if requested
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const isCronExecution = searchParams.get("cron") === "true" || searchParams.get("trigger") === "true";

    // If external cron service calls this URL to trigger the batch run:
    if (isCronExecution) {
      return await executeAutopilotBatch(supabase, "External Cron Schedule Trigger");
    }

    // Otherwise, return full Auto-Pilot UI status & settings
    const { data: settingsRow } = await supabase.from("zy_settings").select("*").eq("id", "default").maybeSingle();
    const templateData = (settingsRow?.template_data as any) || {};
    const autopilotConfig = templateData.autopilot || {};

    const { count: activeAccountsCount } = await supabase
      .from("zy_zoom_accounts")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    const { count: queuedRecordingsCount } = await supabase
      .from("zy_recordings")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .eq("processing_target", "cloud");

    const latestRun = await getLatestWorkflowRun();

    return NextResponse.json({
      success: true,
      config: {
        enabled: autopilotConfig.enabled ?? true,
        morningScheduleNpt: autopilotConfig.morningScheduleNpt || "07:00 AM",
        eveningScheduleNpt: autopilotConfig.eveningScheduleNpt || "11:00 PM",
        discordWebhookUrl: autopilotConfig.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL || "",
        lastRunAt: autopilotConfig.lastRunAt || null,
        lastRunStatus: autopilotConfig.lastRunStatus || "idle",
        lastRunMessage: autopilotConfig.lastRunMessage || null,
        lastRunDiscoveredCount: autopilotConfig.lastRunDiscoveredCount || 0,
        lastRunQueuedCount: autopilotConfig.lastRunQueuedCount || 0,
        lastRunUploadedCount: autopilotConfig.lastRunUploadedCount || 0,
      },
      nextRunNpt: getNextScheduledRunNpt(),
      activeAccountsCount: activeAccountsCount || 0,
      queuedRecordingsCount: queuedRecordingsCount || 0,
      latestWorkflowRun: latestRun,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST: Handles UI actions (run now, toggle on/off, update Discord webhook, test Discord ping)
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: "Database not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "trigger";

    if (action === "trigger") {
      return await executeAutopilotBatch(supabase, body.reason || "Manual UI trigger from Dashboard");
    }

    if (action === "toggle") {
      const { data: settingsRow } = await supabase.from("zy_settings").select("*").eq("id", "default").maybeSingle();
      const templateData = (settingsRow?.template_data as any) || {};
      const nextAutopilot = {
        ...(templateData.autopilot || {}),
        enabled: Boolean(body.enabled),
      };

      await supabase
        .from("zy_settings")
        .update({
          template_data: {
            ...templateData,
            autopilot: nextAutopilot,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return NextResponse.json({
        success: true,
        enabled: nextAutopilot.enabled,
        message: nextAutopilot.enabled ? "Auto-Pilot enabled successfully" : "Auto-Pilot paused",
      });
    }

    if (action === "update_discord") {
      const { data: settingsRow } = await supabase.from("zy_settings").select("*").eq("id", "default").maybeSingle();
      const templateData = (settingsRow?.template_data as any) || {};
      const nextAutopilot = {
        ...(templateData.autopilot || {}),
        discordWebhookUrl: (body.discordWebhookUrl || "").trim(),
      };

      await supabase
        .from("zy_settings")
        .update({
          template_data: {
            ...templateData,
            autopilot: nextAutopilot,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");

      return NextResponse.json({
        success: true,
        message: "Discord webhook URL updated successfully",
      });
    }

    if (action === "test_discord") {
      const webhookUrl = body.discordWebhookUrl || process.env.DISCORD_WEBHOOK_URL;
      const sent = await sendDiscordVideoSuccess({
        topic: "Vidia Auto-Pilot Live Connection Test",
        hostName: "Union Education",
        accountName: "Discord Bot",
        durationMinutes: 45,
        fileSizeBytes: 125000000,
        startTime: new Date().toISOString(),
        youtubeUrl: "https://youtu.be/quRuU2-f9iw",
        webhookUrl: webhookUrl || undefined,
      });

      if (!sent) {
        return NextResponse.json({ success: false, error: "Failed to send message to Discord webhook" }, { status: 400 });
      }

      return NextResponse.json({ success: true, message: "Test notification sent to Discord channel successfully!" });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// Internal helper to run the discovery & cloud workflow dispatch
async function executeAutopilotBatch(supabase: SupabaseClient, reason: string) {
  const todayNepal = getNepalDateString();
  const discovery = await runAutopilotDiscovery(supabase, todayNepal);

  const { count: queuedCount } = await supabase
    .from("zy_recordings")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .eq("processing_target", "cloud");

  const totalToProcess = queuedCount ?? discovery.newlyQueuedCount;

  let workflowResult = { triggered: false, message: "No un-uploaded classes found for today." };
  if (totalToProcess > 0) {
    workflowResult = await triggerGitHubWorkflow(
      `${reason} (${totalToProcess} class(es) for ${todayNepal} NPT)`
    );
  }

  // Update last run status in zy_settings
  try {
    const { data: settingsRow } = await supabase.from("zy_settings").select("*").eq("id", "default").maybeSingle();
    const templateData = (settingsRow?.template_data as any) || {};
    const nextAutopilot = {
      ...(templateData.autopilot || {}),
      lastRunAt: new Date().toISOString(),
      lastRunStatus: workflowResult.triggered ? "running" : totalToProcess === 0 ? "success" : "failed",
      lastRunMessage: workflowResult.triggered
        ? `Found ${discovery.totalDiscoveredToday} classes for today (${discovery.newlyQueuedCount} newly queued, ${discovery.alreadyUploadedCount} already uploaded). Cloud Runner started!`
        : `Found ${discovery.totalDiscoveredToday} classes for today. All are already uploaded to YouTube.`,
      lastRunDiscoveredCount: discovery.totalDiscoveredToday,
      lastRunQueuedCount: discovery.newlyQueuedCount,
      lastRunUploadedCount: discovery.alreadyUploadedCount,
    };

    await supabase
      .from("zy_settings")
      .update({
        template_data: {
          ...templateData,
          autopilot: nextAutopilot,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
  } catch {}

  return NextResponse.json({
    success: true,
    scanDateNepal: discovery.scanDateNepal,
    activeAccountsCount: discovery.activeAccountsCount,
    totalDiscoveredToday: discovery.totalDiscoveredToday,
    newlyQueuedCount: discovery.newlyQueuedCount,
    alreadyUploadedCount: discovery.alreadyUploadedCount,
    totalInCloudQueue: totalToProcess,
    workflowTriggered: workflowResult.triggered,
    message: workflowResult.message,
  });
}
