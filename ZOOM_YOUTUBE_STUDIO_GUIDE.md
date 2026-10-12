# Zoom to YouTube Automation Studio - Architecture & Integration Guide

This document provides a comprehensive overview of all architectural components, features implemented, and the exact steps to connect this application (`unioneducation`) with the standalone **Zoom YouTube Studio** app (`zoom-youtube-studio`) running on another machine or location.

---

## 1. What We Built & Implemented

### A. Core Video Pipeline (`src/lib/pipeline.ts`)
- **Direct & Simultaneous Stream Watermarking**: Downloads Zoom cloud recordings and streams bytes into `ffmpeg` hardware encoders (`h264_videotoolbox` on macOS with fallback to `libx264 ultrafast`) to watermark and transcode on the fly.
- **Resumable HTTP Range Downloads**: Recovers from network drops by resuming from the exact byte offset using HTTP `Range` headers rather than re-downloading multi-gigabyte videos.
- **Live ETA & Progress Telemetry**: Emits Server-Sent Events (SSE) indicating stage (`downloading`, `watermarking`, `uploading`), percentage, speed, and remaining time.
- **Immediate Task Cancellation**: Spawns tasks with `AbortSignal` listeners and registers active processes. If cancelled:
  - Immediately sends `SIGKILL` to `ffmpeg`.
  - Aborts the network streams.
  - Automatically unlinks partial temporary files (`.zoomyt-tmp/raw_*.mp4`, `.zoomyt-tmp/proc_*.mp4`).
  - Cleans up state so disk space and memory are never leaked.

### B. Upload Queue Store & Floating UI
- **Persistent Global Queue (`src/lib/upload-queue-store.ts`)**: In-memory and `localStorage` queue ensuring page transitions in Next.js do not disrupt ongoing transfers.
- **Non-blocking Floating Pill Drawer (`UploadQueueDrawer.tsx`)**:
  - Minimized state: Compact floating pill (`Queue (1/4) 45%`) in the bottom-right corner that never blocks background dashboard buttons.
  - Expanded state: Interactive popup with Quality preset switcher (`⚡ 720p`, `1080p`, `480p`, `Original`), Auto-Watermark preset selector, and real-time progress bars.
  - Controls: Dedicated **"Cancel"** / **"Stop"** buttons on ongoing tasks, individual dismiss `✕` buttons, and a **"Cancel All"** master abort button.
- **Network Drop & Regain**: Browser `online`/`offline` listeners that pause transfers during disconnects and automatically resume once connectivity returns.

### C. Visual Watermark Template Editor (`AutoWatermarkTemplateModal.tsx`)
- **16:9 Canvas Preview**: Live visual positioning for logos and text badge overlays.
- **Configurable Parameters**:
  - Logo scale slider & opacity slider.
  - Logo position coordinates (X/Y) with corner snap shortcuts (`Top-Right`, `Top-Left`, `Bottom-Right`, `Bottom-Left`).
  - Text badge font size, badge opacity, and position.
- **Persistence**: Saved via `/api/zoom-youtube/watermark-template` directly into PostgreSQL (`public.zy_settings.template_data`) with in-memory caching. No local JSON state files are generated. Automatically applied as default whenever `✨ Auto WM` direct uploads are started.

### D. Activity Logging & Database Audit History (`src/lib/activity-logger.ts`)
- **PostgreSQL / Supabase Table (`public.zy_activity_logs`)**: Permanent table storing every transfer:
  - Video Topic, Account Name, YouTube URL, Video ID.
  - Privacy status, Resolution, Watermark mode.
  - File size, Duration, Execution time in seconds, Error message (if failed/cancelled).
- **Audit Dashboard Section (`ActivityLogsSection.tsx`)**: Filterable, searchable data table displaying all past upload history with copyable YouTube links.

---

## 2. Connecting This App With the External Zoom Studio App

The project is structured so that multiple machines (e.g. office Mac, dedicated server, or personal laptop running `/Users/bibek/Developer/zoom-youtube-studio`) can work together or operate standalone using the same Supabase database and YouTube channel.

```
                      ┌─────────────────────────────────────────┐
                      │            Supabase Cloud               │
                      │  - zy_zoom_accounts  (Encrypted Zoom)   │
                      │  - zy_youtube_channel(Encrypted YouTube)│
                      │  - zy_settings       (Watermark config) │
                      │  - zy_activity_logs  (Audit History)    │
                      │  - zy_worker_nodes   (Heartbeats)       │
                      └────────────────────┬────────────────────┘
                                           │
                  ┌────────────────────────┴────────────────────────┐
                  │                                                 │
       (Central App)                                     (Worker / Studio Laptop)
  unioneducation/code/main                          zoom-youtube-studio
  Port: 3000                                        Port: 3001
  Role: Admin Dashboard + Direct Uploader           Role: Dedicated Encoding & Upload Node
```

### Step 1: Share the Same Environment Variables
Both applications must point to the same Supabase instance and YouTube credentials. Ensure the `.env` or `.env.local` file in both locations contains:

```env
# 1. Supabase (Database & State)
NEXT_PUBLIC_SUPABASE_URL="https://anmvjxexmxpfgksrsgfx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<YOUR_SUPABASE_ANON_KEY>"
DATABASE_URL="postgresql://postgres.anmvjxexmxpfgksrsgfx:<PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.anmvjxexmxpfgksrsgfx:<PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"

# 2. YouTube OAuth2 Credentials
YOUTUBE_CLIENT_ID="<YOUR_YOUTUBE_CLIENT_ID>.apps.googleusercontent.com"
YOUTUBE_CLIENT_SECRET="<YOUR_YOUTUBE_CLIENT_SECRET>"
YOUTUBE_REFRESH_TOKEN="<YOUR_YOUTUBE_REFRESH_TOKEN>"

# 3. Encryption Secret (Must match across both machines for decrypting Zoom/YT tokens)
ENCRYPTION_SECRET="<YOUR_32_CHAR_SECRET_KEY>"
```

---

### Step 2: Database Synchronization

Both apps share the `zy_` tables. The database schema includes:
1. `public.zy_zoom_accounts`: Zoom Server-to-Server app credentials (encrypted).
2. `public.zy_youtube_channel`: YouTube channel target and refresh tokens.
3. `public.zy_activity_logs`: Live record of all upload attempts and video links.
4. `public.zy_settings`: Watermark layout, default privacy (`unlisted`), and resolution templates.
5. `public.zy_worker_nodes`: Heartbeats showing active devices and available disk space.

Any Zoom account connected in `unioneducation` or template saved in one app is immediately readable by `zoom-youtube-studio`.

---

### Step 3: Running the Apps Concurrently

When running both applications on the same machine for testing:

1. **Start the Main App**:
   ```bash
   cd /Users/bibek/Developer/unioneducation/code/main
   npm run dev
   # Runs on http://localhost:3000
   ```

2. **Start the Zoom YouTube Studio App**:
   ```bash
   cd /Users/bibek/Developer/zoom-youtube-studio
   PORT=3001 npm run dev
   # Runs on http://localhost:3001
   ```

If running `zoom-youtube-studio` on a separate laptop or remote machine:
- Run `npm run dev` or `npm run worker` on the target machine.
- The worker registers its hardware specs and free disk space to `zy_worker_nodes`.
- The dashboard at `unioneducation/code/main` will display that machine under **Storage & Processing Devices**.

---

### Step 4: Synchronizing Code Updates

Whenever updates are made to the video processing pipeline or queue components:
1. Keep the core library files aligned:
   - `src/lib/pipeline.ts`
   - `src/lib/upload-queue-store.ts`
   - `src/lib/activity-logger.ts`
   - `src/lib/watermark-template.ts`
   - `src/lib/watermark-template-server.ts`
2. Keep the API endpoints aligned:
   - `/api/zoom-youtube/recordings/process`
   - `/api/zoom-youtube/recordings/cancel`
   - `/api/zoom-youtube/watermark-template`
   - `/api/zoom-youtube/activity-logs`

---

## 3. Key Operational Features Summary

| Feature | Description | Location |
| :--- | :--- | :--- |
| **Cancel Ongoing Task** | Stops encoding & downloads instantly via `SIGKILL` + removes temp files | Floating popup & browse rows |
| **Cancel All** | Flushes the entire queue and aborts active processes | Floating popup header button |
| **Resumable Downloads** | Auto-resumes interrupted Zoom downloads from the exact byte offset | `src/lib/pipeline.ts` |
| **Activity History** | Audit log with YouTube links, duration, and status in PostgreSQL | Dashboard audit table & `zy_activity_logs` |
| **Watermark Template** | Visual 16:9 template designer to configure logo & text positions | "Watermark Template" button |
| **Quality Preset** | Toggle between 720p, 1080p, 480p, or Original on the fly | Top of Queue drawer |
