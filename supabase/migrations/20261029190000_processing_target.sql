-- Add processing_target so a recording can be routed to the local laptop worker
-- ('local') or the GitHub Actions cloud runner ('cloud').

ALTER TABLE public.zy_recordings
  ADD COLUMN IF NOT EXISTS processing_target TEXT DEFAULT 'cloud';

CREATE INDEX IF NOT EXISTS idx_zy_rec_target ON public.zy_recordings(processing_target);

-- Persist the per-job watermark/upload options chosen in the dashboard so the
-- local worker and cloud runner honour "Auto WM: ON" / "Raw" for each video.
ALTER TABLE public.zy_recordings
  ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{}'::jsonb;
