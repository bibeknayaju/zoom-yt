import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { DeviceSystemInfo } from "./storage";

export interface StoredDevice {
  nodeId: string;
  label: string;
  isPrimary: boolean;
  lastHeartbeat: string;
  system: DeviceSystemInfo;
}

export interface YouTubeChannelInfo {
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string;
  connectedAt: string;
  status: "active" | "needs_reconnect";
  encryptedRefreshToken?: string;
  quotaUsedToday: number;
  lastQuotaResetDatePacific: string;
}

export interface ZoomYtState {
  primaryNodeId: string | null;
  devices: Record<string, StoredDevice>;
  youtube: YouTubeChannelInfo | null;
}

const DEFAULT_STATE: ZoomYtState = {
  primaryNodeId: null,
  devices: {},
  youtube: null,
};

let memoryStateCache: ZoomYtState = { ...DEFAULT_STATE };

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Reads state directly from Supabase zy_worker_nodes and zy_youtube_channel.
 */
export async function readZoomYtState(): Promise<ZoomYtState> {
  const supabase = getSupabase();
  if (!supabase) return memoryStateCache;

  try {
    const [devicesRes, ytRes] = await Promise.all([
      supabase.from("zy_worker_nodes").select("*"),
      supabase.from("zy_youtube_channel").select("*").limit(1).maybeSingle(),
    ]);

    const state: ZoomYtState = {
      primaryNodeId: null,
      devices: {},
      youtube: null,
    };

    if (devicesRes.data) {
      for (const row of devicesRes.data) {
        state.devices[row.node_id] = {
          nodeId: row.node_id,
          label: row.label,
          isPrimary: row.is_primary,
          lastHeartbeat: row.last_heartbeat,
          system: row.system_info,
        };
        if (row.is_primary) {
          state.primaryNodeId = row.node_id;
        }
      }
      if (!state.primaryNodeId && devicesRes.data.length > 0) {
        const physical = devicesRes.data.find((d: any) => !d.node_id.startsWith("github-"));
        if (physical) state.primaryNodeId = physical.node_id;
      }
    }

    if (ytRes.data) {
      const row = ytRes.data;
      const nowPacific = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const quotaReset = row.last_quota_reset_date !== nowPacific;
      state.youtube = {
        channelId: row.channel_id,
        channelTitle: row.channel_title,
        thumbnailUrl: row.thumbnail_url,
        connectedAt: row.connected_at,
        status: row.status,
        encryptedRefreshToken: row.refresh_token_enc,
        quotaUsedToday: quotaReset ? 0 : row.quota_used_today || 0,
        lastQuotaResetDatePacific: nowPacific,
      };
    }

    memoryStateCache = state;
    return state;
  } catch (err) {
    console.error("Failed to read ZoomYtState from database:", err);
    return memoryStateCache;
  }
}

/**
 * Records a heartbeat from a worker device directly to zy_worker_nodes.
 */
export async function recordHeartbeat(payload: {
  nodeId: string;
  label?: string;
  system: DeviceSystemInfo;
}): Promise<{ isPrimary: boolean; state: ZoomYtState }> {
  const currentState = await readZoomYtState();
  const isCloudRunner = payload.nodeId.startsWith("github-");
  const existing = currentState.devices[payload.nodeId];

  if (!currentState.primaryNodeId && !isCloudRunner) {
    currentState.primaryNodeId = payload.nodeId;
  }

  const isPrimary = !isCloudRunner && currentState.primaryNodeId === payload.nodeId;
  const label = payload.label || existing?.label || payload.system.hostname;

  currentState.devices[payload.nodeId] = {
    nodeId: payload.nodeId,
    label,
    isPrimary,
    lastHeartbeat: new Date().toISOString(),
    system: payload.system,
  };
  memoryStateCache = currentState;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_worker_nodes").upsert({
        node_id: payload.nodeId,
        label,
        is_primary: isPrimary,
        last_heartbeat: new Date().toISOString(),
        system_info: payload.system,
      });
    } catch (err) {
      console.error("Failed to update heartbeat in database:", err);
    }
  }

  return { isPrimary, state: currentState };
}

/**
 * Sets which device is designated as Primary directly in zy_worker_nodes.
 */
export async function setPrimaryDevice(nodeId: string): Promise<ZoomYtState> {
  const currentState = await readZoomYtState();
  if (!currentState.devices[nodeId]) {
    throw new Error(`Device ${nodeId} not found`);
  }

  currentState.primaryNodeId = nodeId;
  for (const id of Object.keys(currentState.devices)) {
    currentState.devices[id].isPrimary = id === nodeId;
  }
  memoryStateCache = currentState;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await Promise.all(
        Object.keys(currentState.devices).map((id) =>
          supabase.from("zy_worker_nodes").update({ is_primary: id === nodeId }).eq("node_id", id)
        )
      );
    } catch (err) {
      console.error("Failed to set primary device in database:", err);
    }
  }

  return currentState;
}

/**
 * Updates YouTube connection details directly in zy_youtube_channel.
 */
export async function saveYouTubeConnection(info: YouTubeChannelInfo): Promise<ZoomYtState> {
  const currentState = await readZoomYtState();
  currentState.youtube = info;
  memoryStateCache = currentState;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_youtube_channel").upsert({
        channel_id: info.channelId,
        channel_title: info.channelTitle,
        thumbnail_url: info.thumbnailUrl,
        refresh_token_enc: info.encryptedRefreshToken || "",
        status: info.status,
        quota_used_today: info.quotaUsedToday,
        last_quota_reset_date: info.lastQuotaResetDatePacific,
      });
    } catch (err) {
      console.error("Failed to save YouTube connection in database:", err);
    }
  }

  return currentState;
}

/**
 * Removes a device directly from zy_worker_nodes.
 */
export async function removeDevice(nodeId: string): Promise<ZoomYtState> {
  const currentState = await readZoomYtState();
  delete currentState.devices[nodeId];

  if (currentState.primaryNodeId === nodeId) {
    currentState.primaryNodeId = Object.keys(currentState.devices)[0] || null;
    if (currentState.primaryNodeId && currentState.devices[currentState.primaryNodeId]) {
      currentState.devices[currentState.primaryNodeId].isPrimary = true;
    }
  }
  memoryStateCache = currentState;

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from("zy_worker_nodes").delete().eq("node_id", nodeId);
    } catch (err) {
      console.error("Failed to remove device in database:", err);
    }
  }

  return currentState;
}

export const updateDeviceHeartbeat = recordHeartbeat;
