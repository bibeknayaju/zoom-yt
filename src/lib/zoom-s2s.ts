/**
 * Zoom Server-to-Server (S2S) OAuth Client Utility
 */

export interface ZoomS2STokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface ZoomUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  type: number;
  status: string;
}

export interface ZoomRecordingFile {
  id: string;
  meeting_id: string;
  recording_start: string;
  recording_end: string;
  file_type: string;
  file_extension: string;
  file_size: number;
  play_url: string;
  download_url: string;
  status: string;
  recording_type: string;
}

export interface ZoomMeetingRecording {
  uuid: string;
  id: number;
  account_id: string;
  host_id: string;
  topic: string;
  start_time: string;
  duration: number;
  total_size: number;
  recording_count: number;
  recording_files: ZoomRecordingFile[];
}

// In-memory cache for Zoom S2S access tokens to prevent 429 rate limits
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Exchanges Zoom S2S Account ID + Client Credentials for an access token with in-memory caching.
 */
export async function getZoomS2SToken(
  accountId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const cacheKey = `${accountId}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();

  // Return cached token if valid (buffer of 2 minutes before expiry)
  if (cached && cached.expiresAt > now + 120_000) {
    return cached.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const params = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: accountId,
  });

  const response = await fetch(`https://zoom.us/oauth/token?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom OAuth Error (${response.status}): ${errorText}`);
  }

  const data: ZoomS2STokenResponse = await response.json();
  const expiresInMs = (data.expires_in || 3600) * 1000;
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: now + expiresInMs,
  });

  return data.access_token;
}

/**
 * Validates Zoom S2S credentials by fetching users from the account.
 */
export async function verifyZoomS2SConnection(
  accountId: string,
  clientId: string,
  clientSecret: string
): Promise<{ success: boolean; usersCount: number; sampleUsers: ZoomUser[]; error?: string }> {
  try {
    const token = await getZoomS2SToken(accountId, clientId, clientSecret);

    const res = await fetch("https://api.zoom.us/v2/users?page_size=10&status=active", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list users (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const users: ZoomUser[] = data.users || [];

    return {
      success: true,
      usersCount: data.total_records ?? users.length,
      sampleUsers: users,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      usersCount: 0,
      sampleUsers: [],
      error: message,
    };
  }
}

/**
 * Fetches cloud recordings for a user within a date range (YYYY-MM-DD).
 */
export async function fetchUserRecordings(
  token: string,
  userId: string,
  from?: string,
  to?: string
): Promise<ZoomMeetingRecording[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("page_size", "50");

  const url = `https://api.zoom.us/v2/users/${userId}/recordings?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zoom list recordings error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.meetings || [];
}
