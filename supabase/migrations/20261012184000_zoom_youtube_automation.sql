-- ==============================================================================
-- Supabase Migration: 20261012184000_zoom_youtube_automation.sql
-- Description: Isolated Zoom -> YouTube Automation Schema & Atomic Job Queue
-- Tables:
--   1. zy_worker_nodes    : Multi-laptop heartbeat and live storage tracking
--   2. zy_youtube_channel : Connected YouTube channel with encrypted refresh token
--   3. zy_zoom_accounts   : Zoom Server-to-Server credentials (encrypted)
--   4. zy_settings        : Global defaults (watermark position, templates, quota)
--   5. zy_recordings      : Job queue for discovered, downloading, and uploaded recordings
--   6. zy_activity_logs   : Upload history and audit trail logs
--   7. zy_events          : System event logs
--   8. zy_claim_job()     : Atomic RPC function with FOR UPDATE SKIP LOCKED
--
-- Safety: Completely isolated via `zy_` prefix. Touches ZERO existing tables.
-- ==============================================================================

-- 1. Worker Devices & Storage Monitor
CREATE TABLE IF NOT EXISTS public.zy_worker_nodes (
  node_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  system_info JSONB DEFAULT '{}'::jsonb
);

-- 2. YouTube Channel Connection (Single Channel target)
CREATE TABLE IF NOT EXISTS public.zy_youtube_channel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  thumbnail_url TEXT,
  refresh_token_enc TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  quota_used_today INT DEFAULT 0,
  last_quota_reset_date TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Zoom S2S Accounts
CREATE TABLE IF NOT EXISTS public.zy_zoom_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name TEXT NOT NULL,
  account_id TEXT NOT NULL,
  client_id_enc TEXT NOT NULL,
  client_secret_enc TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Global Settings & Watermark Configuration
CREATE TABLE IF NOT EXISTS public.zy_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  title_template TEXT DEFAULT '{topic} | {date}',
  description_template TEXT DEFAULT 'Class recording: {topic}\nDate: {date}',
  tags TEXT[] DEFAULT ARRAY['education', 'recording', 'class'],
  privacy_status TEXT DEFAULT 'unlisted', -- unlisted | public | private
  category_id TEXT DEFAULT '27',          -- 27 = Education
  min_duration_minutes INT DEFAULT 5,
  delete_from_zoom BOOLEAN DEFAULT false,
  watermark_type TEXT DEFAULT 'none',     -- none | image | text | both
  template_data JSONB DEFAULT '{}'::jsonb,
  watermark_image_url TEXT,
  watermark_text TEXT DEFAULT 'Union Education',
  watermark_scale NUMERIC(4,2) DEFAULT 0.18,
  watermark_opacity NUMERIC(3,2) DEFAULT 0.85,
  watermark_pos_x NUMERIC(4,3) DEFAULT 0.78,
  watermark_pos_y NUMERIC(4,3) DEFAULT 0.04,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default settings row if it doesn't exist
INSERT INTO public.zy_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 5. Recordings & Job Queue Table
CREATE TABLE IF NOT EXISTS public.zy_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoom_account_id UUID REFERENCES public.zy_zoom_accounts(id) ON DELETE SET NULL,
  zoom_meeting_uuid TEXT NOT NULL,
  zoom_meeting_id TEXT NOT NULL,
  zoom_file_id TEXT UNIQUE NOT NULL,
  topic TEXT NOT NULL,
  recording_start TIMESTAMPTZ NOT NULL,
  duration_minutes INT DEFAULT 0,
  file_size_bytes BIGINT DEFAULT 0,
  download_url TEXT,
  status TEXT DEFAULT 'discovered',
  -- States: 'discovered' -> 'downloading' -> 'watermarking' -> 'ready' -> 'uploading' -> 'uploaded' | 'failed' | 'skipped'
  claimed_by TEXT REFERENCES public.zy_worker_nodes(node_id) ON DELETE SET NULL,
  lease_expires_at TIMESTAMPTZ,
  attempts INT DEFAULT 0,
  error_message TEXT,
  youtube_video_id TEXT,
  youtube_url TEXT,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Activity History Log Table
CREATE TABLE IF NOT EXISTS public.zy_activity_logs (
  id TEXT PRIMARY KEY,
  file_id TEXT,
  topic TEXT,
  custom_title TEXT,
  account_name TEXT,
  status TEXT DEFAULT 'processing',
  youtube_url TEXT,
  youtube_video_id TEXT,
  privacy_status TEXT,
  resolution TEXT,
  watermark_type TEXT,
  file_size_bytes BIGINT DEFAULT 0,
  duration_minutes INT DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Audit Events Log
CREATE TABLE IF NOT EXISTS public.zy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID REFERENCES public.zy_recordings(id) ON DELETE CASCADE,
  node_id TEXT,
  level TEXT DEFAULT 'info', -- info | warn | error
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lightning fast lookups & job queueing
CREATE INDEX IF NOT EXISTS idx_zy_rec_status ON public.zy_recordings(status);
CREATE INDEX IF NOT EXISTS idx_zy_rec_lease ON public.zy_recordings(lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_zy_rec_start ON public.zy_recordings(recording_start DESC);
CREATE INDEX IF NOT EXISTS idx_zy_act_created ON public.zy_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_zy_events_created ON public.zy_events(created_at DESC);

-- 8. Atomic Job Lease RPC Function (Prevents race conditions between laptops)
CREATE OR REPLACE FUNCTION public.zy_claim_job(p_node_id TEXT, p_lease_seconds INT DEFAULT 1800)
RETURNS SETOF public.zy_recordings AS $$
DECLARE
  v_rec public.zy_recordings;
BEGIN
  -- Select oldest pending or lease-expired recording
  SELECT *
  INTO v_rec
  FROM public.zy_recordings
  WHERE (status IN ('discovered', 'ready') AND (lease_expires_at IS NULL OR lease_expires_at < now()))
     OR (status IN ('downloading', 'watermarking', 'uploading') AND lease_expires_at < now())
  ORDER BY recording_start ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    UPDATE public.zy_recordings
    SET claimed_by = p_node_id,
        lease_expires_at = now() + (p_lease_seconds || ' seconds')::INTERVAL,
        attempts = attempts + 1,
        status = CASE 
                   WHEN status = 'ready' THEN 'uploading'
                   ELSE 'downloading'
                 END,
        updated_at = now()
    WHERE id = v_rec.id;

    RETURN QUERY SELECT * FROM public.zy_recordings WHERE id = v_rec.id;
  END IF;
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- 9. Row Level Security Policies
ALTER TABLE public.zy_worker_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zy_youtube_channel ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zy_zoom_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zy_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zy_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zy_events ENABLE ROW LEVEL SECURITY;

-- Allow unrestricted select/insert/update for dashboard & worker (authenticated via backend service / anon API)
CREATE POLICY "zy_worker_nodes_all" ON public.zy_worker_nodes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zy_youtube_channel_all" ON public.zy_youtube_channel FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zy_zoom_accounts_all" ON public.zy_zoom_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zy_settings_all" ON public.zy_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zy_recordings_all" ON public.zy_recordings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zy_activity_logs_all" ON public.zy_activity_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "zy_events_all" ON public.zy_events FOR ALL USING (true) WITH CHECK (true);
