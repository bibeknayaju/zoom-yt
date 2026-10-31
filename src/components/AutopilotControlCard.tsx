"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Zap,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Video,
  Send,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  RefreshCw,
  BellRing,
} from "lucide-react";

interface WorkflowRunInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  createdAt: string;
}

interface AutopilotData {
  config: {
    enabled: boolean;
    morningScheduleNpt: string;
    eveningScheduleNpt: string;
    discordWebhookUrl: string;
    lastRunAt: string | null;
    lastRunStatus: string;
    lastRunMessage: string | null;
    lastRunDiscoveredCount: number;
    lastRunQueuedCount: number;
    lastRunUploadedCount: number;
  };
  nextRunNpt: string;
  activeAccountsCount: number;
  queuedRecordingsCount: number;
  latestWorkflowRun: WorkflowRunInfo | null;
}

export function AutopilotControlCard() {
  const [data, setData] = useState<AutopilotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{
    success: boolean;
    message: string;
    newlyQueued?: number;
    totalFound?: number;
    workflowTriggered?: boolean;
  } | null>(null);

  // Discord & Advanced Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [discordUrl, setDiscordUrl] = useState("");
  const [savingDiscord, setSavingDiscord] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [discordMsg, setDiscordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Fetch status
  const fetchAutopilotStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/zoom-youtube/autopilot");
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (json.config?.discordWebhookUrl) {
          setDiscordUrl(json.config.discordWebhookUrl);
        }
      }
    } catch (err) {
      console.error("Failed to fetch autopilot status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAutopilotStatus();
    const interval = setInterval(fetchAutopilotStatus, 15000);
    return () => clearInterval(interval);
  }, [fetchAutopilotStatus]);

  // Run Auto-Pilot immediately
  const handleTriggerNow = async () => {
    setTriggering(true);
    setTriggerResult(null);

    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "trigger", reason: "Manual trigger from UI control card" }),
      });
      const json = await res.json();
      if (json.success) {
        setTriggerResult({
          success: true,
          message: json.message || "Auto-Pilot scan completed successfully!",
          newlyQueued: json.newlyQueuedCount,
          totalFound: json.totalDiscoveredToday,
          workflowTriggered: json.workflowTriggered,
        });
        fetchAutopilotStatus();
      } else {
        setTriggerResult({
          success: false,
          message: json.error || "Failed to trigger Auto-Pilot",
        });
      }
    } catch (err: unknown) {
      setTriggerResult({
        success: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setTriggering(false);
    }
  };

  // Toggle Auto-Pilot ON/OFF
  const handleToggle = async () => {
    if (!data) return;
    const nextState = !data.config.enabled;
    setToggling(true);

    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", enabled: nextState }),
      });
      const json = await res.json();
      if (json.success) {
        setData((prev) => (prev ? { ...prev, config: { ...prev.config, enabled: nextState } } : prev));
      }
    } catch (err) {
      console.error("Failed to toggle autopilot:", err);
    } finally {
      setToggling(false);
    }
  };

  // Save Discord webhook
  const handleSaveDiscord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDiscord(true);
    setDiscordMsg(null);

    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_discord", discordWebhookUrl: discordUrl.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setDiscordMsg({ type: "success", text: "Discord webhook saved successfully!" });
        fetchAutopilotStatus();
      } else {
        setDiscordMsg({ type: "error", text: json.error || "Failed to save webhook" });
      }
    } catch {
      setDiscordMsg({ type: "error", text: "Network error saving webhook" });
    } finally {
      setSavingDiscord(false);
    }
  };

  // Send Test Discord Message
  const handleTestDiscord = async () => {
    setTestingDiscord(true);
    setDiscordMsg(null);

    try {
      const res = await fetch("/api/zoom-youtube/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_discord", discordWebhookUrl: discordUrl.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setDiscordMsg({ type: "success", text: "Test card delivered to your Discord channel!" });
      } else {
        setDiscordMsg({ type: "error", text: json.error || "Discord delivery failed" });
      }
    } catch {
      setDiscordMsg({ type: "error", text: "Network error sending test ping" });
    } finally {
      setTestingDiscord(false);
    }
  };

  // Copy external cron webhook URL
  const copyPrecisionWebhook = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://zoom-yt.vercel.app";
    const url = `${origin}/api/zoom-youtube/autopilot?cron=true`;
    navigator.clipboard.writeText(url);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  if (loading && !data) {
    return (
      <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 bg-white dark:bg-zinc-950 animate-pulse flex items-center justify-center min-h-[160px]">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
          <span>Loading Auto-Pilot status...</span>
        </div>
      </div>
    );
  }

  const isEnabled = data?.config.enabled ?? true;
  const isCloudRunning = data?.latestWorkflowRun?.status === "in_progress";

  return (
    <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 overflow-hidden shadow-xs transition">
      {/* Top Main Section */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Header bar: Title + Toggle + Run Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs">
                <Zap className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Auto-Pilot Scheduled Publishing
                </h3>
                {isEnabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-zinc-700">
                    Paused
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scans all active Zoom accounts twice daily for today&apos;s classes, watermarks them in the cloud, and sends video links to Discord.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {/* Toggle Button */}
            <button
              type="button"
              onClick={handleToggle}
              disabled={toggling}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition ${
                isEnabled
                  ? "bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-800"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100"
              }`}>
              {toggling ? "Saving..." : isEnabled ? "Pause Auto-Pilot" : "Enable Auto-Pilot"}
            </button>

            {/* Run Auto-Pilot Now Button */}
            <button
              type="button"
              onClick={handleTriggerNow}
              disabled={triggering || isCloudRunning}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition disabled:opacity-50">
              {triggering || isCloudRunning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{triggering ? "Scanning Zoom..." : isCloudRunning ? "Cloud Runner In Progress..." : "Run Auto-Pilot Now"}</span>
            </button>
          </div>
        </div>

        {/* Trigger Result Banner */}
        {triggerResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 transition animate-in fade-in-50 ${
              triggerResult.success
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
            }`}>
            {triggerResult.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            )}
            <div className="space-y-0.5 min-w-0 flex-1">
              <p className="font-semibold">{triggerResult.message}</p>
              {triggerResult.success && triggerResult.totalFound !== undefined && (
                <p className="text-[11px] opacity-90">
                  {triggerResult.newlyQueued && triggerResult.newlyQueued > 0
                    ? `Queued ${triggerResult.newlyQueued} class(es) for cloud watermarking and YouTube upload.`
                    : "All classes recorded today are already processed and uploaded to YouTube."}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Active Zoom Accounts */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <span className="text-[11px] font-medium">Scanned Accounts</span>
              <Video className="w-3.5 h-3.5" />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              {data?.activeAccountsCount ?? 0} Accounts
            </p>
            <Link
              href="/dashboard/zoom-accounts"
              className="text-[11px] font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 underline underline-offset-2">
              <span>Manage Zoom accounts</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>

          {/* Schedule Times */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <span className="text-[11px] font-medium">Daily Schedule</span>
              <Clock className="w-3.5 h-3.5" />
            </div>
            <p className="text-lg font-bold text-slate-900 dark:text-white">
              7:00 AM & 11:00 PM
            </p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
              Nepal Time (UTC+5:45)
            </p>
          </div>

          {/* Next Batch Run */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <span className="text-[11px] font-medium">Next Scheduled Run</span>
              <RefreshCw className="w-3.5 h-3.5" />
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate" title={data?.nextRunNpt}>
              {data?.nextRunNpt || "Twice Daily"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              {data?.queuedRecordingsCount ? `${data.queuedRecordingsCount} queued in cloud` : "Queue is clear"}
            </p>
          </div>

          {/* Discord Notifications Status */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/40 space-y-1">
            <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
              <span className="text-[11px] font-medium">Discord Alert Bot</span>
              <BellRing className="w-3.5 h-3.5 text-indigo-500" />
            </div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Connected</span>
            </p>
            <button
              type="button"
              onClick={handleTestDiscord}
              disabled={testingDiscord}
              className="text-[11px] font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 underline underline-offset-2 disabled:opacity-50">
              <span>{testingDiscord ? "Sending ping..." : "Test Discord Ping"}</span>
              <Send className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>

        {/* Latest Cloud Runner Status Bar */}
        {data?.latestWorkflowRun && (
          <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-slate-50/40 dark:bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-700 dark:text-zinc-300">GitHub Cloud Runner:</span>
              {data.latestWorkflowRun.status === "in_progress" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Running Now
                </span>
              ) : data.latestWorkflowRun.conclusion === "success" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Last Run Succeeded
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300">
                  {data.latestWorkflowRun.status}
                </span>
              )}
              <span className="text-slate-400 dark:text-zinc-600 hidden sm:inline">•</span>
              <span className="text-slate-500 dark:text-zinc-400 text-[11px] truncate">
                Run #{data.latestWorkflowRun.id}
              </span>
            </div>

            <a
              href={data.latestWorkflowRun.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white underline underline-offset-2">
              <span>View GitHub Runner Logs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Accordion Toggle for Precision Webhook & Discord Settings */}
      <div className="border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/30">
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition">
          <span>Precision Cron Webhook & Discord Configuration</span>
          {showSettings ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showSettings && (
          <div className="p-5 border-t border-slate-200 dark:border-zinc-800 space-y-5 animate-in slide-in-from-top-2 duration-150">
            {/* Precision Cron Webhook URL (For cron-job.org / Vercel Cron) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Precision Cron Trigger URL (Bypasses GitHub Schedule Delays)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    GitHub&apos;s internal cron schedule can have a 15–45 min queue delay. For 100% on-the-second execution at 7:00 AM & 11:00 PM, ping this URL from a free cron service like <strong>cron-job.org</strong> or Vercel Cron.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/api/zoom-youtube/autopilot?cron=true`
                      : "https://zoom-yt.vercel.app/api/zoom-youtube/autopilot?cron=true"
                  }
                  className="flex-1 font-mono text-[11px] px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-700 dark:text-zinc-300 select-all"
                />
                <button
                  type="button"
                  onClick={copyPrecisionWebhook}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 rounded-xl transition shadow-xs">
                  {copiedWebhook ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWebhook ? "Copied!" : "Copy URL"}</span>
                </button>
              </div>
            </div>

            {/* Discord Webhook Configuration */}
            <form onSubmit={handleSaveDiscord} className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                Discord Webhook Notification Channel
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Receives one notification per video with live YouTube watch link, duration, and teacher details upon successful upload.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={discordUrl}
                  onChange={(e) => setDiscordUrl(e.target.value)}
                  className="flex-1 font-mono text-[11px] px-3 py-2 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                />
                <button
                  type="submit"
                  disabled={savingDiscord}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl transition shadow-xs disabled:opacity-50">
                  {savingDiscord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>{savingDiscord ? "Saving..." : "Save Webhook"}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTestDiscord}
                  disabled={testingDiscord || !discordUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 rounded-xl transition shadow-xs disabled:opacity-50">
                  {testingDiscord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Test Ping</span>
                </button>
              </div>

              {discordMsg && (
                <p
                  className={`text-[11px] font-medium ${
                    discordMsg.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                  }`}>
                  {discordMsg.text}
                </p>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
