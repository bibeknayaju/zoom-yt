import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface StorageStatus {
  targetPath: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  totalGB: number;
  freeGB: number;
  usedGB: number;
  freePercentage: number;
  status: "healthy" | "warning" | "critical";
  message: string;
}

export interface DeviceSystemInfo {
  hostname: string;
  platform: string;
  arch: string;
  cpus: number;
  cpuModel: string;
  totalMemoryGB: number;
  freeMemoryGB: number;
  storage: StorageStatus;
}

export interface StorageCheckOptions {
  targetDir?: string;
  warningThresholdGB?: number;  // Alert warning if below this (default: 20 GB)
  criticalThresholdGB?: number; // Pause/block downloads if below this (default: 10 GB)
}

/**
 * Returns a writable temp directory safe across local machines and cloud/serverless hosts.
 */
export function getSafeTempDir(): string {
  if (process.env.LOCAL_TEMP_DIR) {
    return path.resolve(process.env.LOCAL_TEMP_DIR);
  }
  // In Vercel or AWS Lambda, process.cwd() (/var/task) is read-only
  const isServerless =
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT) ||
    (typeof process.cwd === "function" && (process.cwd().includes("var/task") || process.cwd() === "/"));

  if (isServerless) {
    return path.join(os.tmpdir(), "zoomyt-tmp");
  }
  return path.join(process.cwd(), ".zoomyt-tmp");
}

/**
 * Ensures the target working directory exists and returns storage statistics.
 */
export async function checkDeviceStorage(options: StorageCheckOptions = {}): Promise<StorageStatus> {
  const defaultDir = getSafeTempDir();
  const targetPath = options.targetDir || defaultDir;
  const warningThresholdGB = options.warningThresholdGB ?? 20;
  const criticalThresholdGB = options.criticalThresholdGB ?? 10;

  try {
    await fs.mkdir(targetPath, { recursive: true });
  } catch {
    // Ignore if already exists
  }

  const pathToInspect = (await fs.stat(targetPath).catch(() => null)) ? targetPath : process.cwd();
  const stats = await fs.statfs(pathToInspect);

  const bsize = BigInt(stats.bsize);
  const totalBytes = Number(BigInt(stats.blocks) * bsize);
  const freeBytes = Number(BigInt(stats.bavail) * bsize);
  const usedBytes = totalBytes - freeBytes;

  const toGB = (bytes: number) => Math.round((bytes / 1024 ** 3) * 100) / 100;
  const totalGB = toGB(totalBytes);
  const freeGB = toGB(freeBytes);
  const usedGB = toGB(usedBytes);

  const freePercentage = totalBytes > 0 ? Math.round((freeBytes / totalBytes) * 1000) / 10 : 0;

  let status: "healthy" | "warning" | "critical" = "healthy";
  let message = `Storage healthy (${freeGB} GB free of ${totalGB} GB).`;

  if (freeGB < criticalThresholdGB) {
    status = "critical";
    message = `CRITICAL: Low disk space (${freeGB} GB free). Video processing may fail.`;
  } else if (freeGB < warningThresholdGB) {
    status = "warning";
    message = `WARNING: Disk space getting low (${freeGB} GB free).`;
  }

  return {
    targetPath,
    totalBytes,
    freeBytes,
    usedBytes,
    totalGB,
    freeGB,
    usedGB,
    freePercentage,
    status,
    message,
  };
}

/**
 * Returns complete hardware and memory diagnostics.
 */
export async function getDeviceSystemInfo(targetDir?: string): Promise<DeviceSystemInfo> {
  const storage = await checkDeviceStorage({ targetDir });
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  const toGB = (bytes: number) => Math.round((bytes / 1024 ** 3) * 100) / 100;

  return {
    hostname: os.hostname(),
    platform: `${os.platform()} (${os.release()})`,
    arch: os.arch(),
    cpus: cpus.length,
    cpuModel: cpus[0]?.model || "Unknown CPU",
    totalMemoryGB: toGB(totalMem),
    freeMemoryGB: toGB(freeMem),
    storage,
  };
}
