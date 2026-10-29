import { NextRequest, NextResponse } from "next/server";
import { spawn, execSync, ChildProcess } from "node:child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const globalStore = globalThis as unknown as { __zyLocalWorker?: ChildProcess };

function externalWorkerPids(): number[] {
  try {
    const out = execSync("pgrep -f '[s]cripts/worker.ts'", { encoding: "utf8" }).trim();
    if (!out) return [];
    return out
      .split("\n")
      .map((pid) => Number(pid.trim()))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  } catch {
    return [];
  }
}

function isRunning() {
  const child = globalStore.__zyLocalWorker;
  return Boolean((child && child.exitCode === null && !child.killed) || externalWorkerPids().length > 0);
}

function startWorker() {
  if (isRunning()) {
    return {
      started: false,
      pid: globalStore.__zyLocalWorker?.pid ?? externalWorkerPids()[0] ?? null,
      message: "Local worker is already running.",
    };
  }

  const child = spawn("npm", ["run", "worker"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.unref();
  globalStore.__zyLocalWorker = child;

  return {
    started: true,
    pid: child.pid ?? null,
    message: "Local worker started with npm run worker.",
  };
}

function stopWorker() {
  const child = globalStore.__zyLocalWorker;
  const pids = new Set<number>(externalWorkerPids());

  if (child?.pid) pids.add(child.pid);
  if (pids.size === 0) {
    return { stopped: false, message: "No local worker is running." };
  }

  for (const pid of pids) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
  }

  globalStore.__zyLocalWorker = undefined;
  return { stopped: true, message: "Local worker stopped." };
}

export async function GET() {
  const pids = externalWorkerPids();
  return NextResponse.json({
    success: true,
    running: isRunning(),
    pid: globalStore.__zyLocalWorker?.pid ?? pids[0] ?? null,
  });
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Local worker cannot be started from the hosted dashboard. Run `npm run worker` on your laptop instead.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === "start") {
    return NextResponse.json({ success: true, ...startWorker() });
  }
  if (action === "stop") {
    return NextResponse.json({ success: true, ...stopWorker() });
  }

  return NextResponse.json(
    { success: false, error: "action must be either 'start' or 'stop'" },
    { status: 400 }
  );
}
