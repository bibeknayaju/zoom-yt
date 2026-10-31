"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  Film,
  ListVideo,
  Video,
  History,
  Sliders,
  Palette,
  Shield,
  ChevronRight,
  Menu,
  UploadCloud,
  Loader2,
  Sparkles,
} from "lucide-react";
import { useSidebar } from "@/components/SidebarContext";
import { useUploadQueue } from "@/lib/upload-queue-store";
import { ThemeToggle } from "@/components/ThemeToggle";

interface RouteMeta {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

const ROUTE_CONFIG: Record<string, RouteMeta> = {
  "/dashboard": {
    title: "Pipeline & Runs",
    icon: Film,
    description: "Live recording monitor & cloud runs",
  },
  "/dashboard/discovered": {
    title: "Discovered Videos",
    icon: ListVideo,
    description: "Cloud recordings awaiting processing",
  },
  "/dashboard/zoom-accounts": {
    title: "Zoom Accounts",
    icon: Video,
    description: "Connected S2S OAuth instances",
  },
  "/dashboard/activity": {
    title: "Activity Logs",
    icon: History,
    description: "Historical runs, errors & YouTube links",
  },
  "/dashboard/thumbnails": {
    title: "Thumbnail Studio",
    icon: Palette,
    description: "Multi-template YouTube title card & teacher generator",
  },
  "/dashboard/studio": {
    title: "Watermark Studio",
    icon: Sliders,
    description: "Brand overlay & template editor",
  },
  "/dashboard/admin": {
    title: "Admin Settings",
    icon: Shield,
    description: "User access & system configuration",
  },
};

export function DashboardHeader() {
  const pathname = usePathname();
  const { toggleMobile } = useSidebar();
  const { user } = useUser();
  const { queue, setDrawerOpen } = useUploadQueue();

  const activeCount = queue.filter(
    (item) => item.status === "queued" || item.status === "uploading"
  ).length;

  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  // Determine current active route metadata
  const currentRoute: RouteMeta = ROUTE_CONFIG[pathname] || {
    title: pathname.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "Dashboard",
    icon: Film,
  };
  const CurrentIcon = currentRoute.icon;

  return (
    <header className="sticky top-0 z-30 w-full h-14 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 transition-colors">
      <div className="h-full px-4 sm:px-6 flex items-center justify-between gap-3">
        {/* ================= LEFT SECTION: Navigation & Breadcrumbs ================= */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={toggleMobile}
            className="lg:hidden p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
            aria-label="Open sidebar menu">
            <Menu className="w-4 h-4" />
          </button>

          {/* Mobile Brand (Vidia) */}
          <Link href="/dashboard" className="lg:hidden font-black text-base tracking-tight text-slate-900 dark:text-white font-sans">
            Vidia
          </Link>

          {/* Mobile Separator */}
          <span className="lg:hidden text-slate-300 dark:text-zinc-700 font-light">/</span>

          {/* Breadcrumb Trail */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
            <Link
              href="/dashboard"
              className="hidden lg:inline text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white font-medium transition">
              Dashboard
            </Link>

            <ChevronRight className="hidden lg:inline w-3.5 h-3.5 text-slate-400 dark:text-zinc-600" />

            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded-md bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-800">
                <CurrentIcon className="w-3.5 h-3.5" />
              </span>
              <span className="font-bold text-slate-900 dark:text-white truncate">
                {currentRoute.title}
              </span>
            </div>
          </nav>
        </div>

        {/* ================= RIGHT SECTION: Actions, Queue, Theme, User ================= */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Cloud Runner Pulse Pill (Desktop only) */}
          <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Cloud Runner Ready</span>
          </div>

          {/* Quick Studio Action (Visible when not on studio) */}
          {pathname !== "/dashboard/studio" && (
            <Link
              href="/dashboard/studio"
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800 transition shadow-xs"
              title="Open Watermark Studio">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Studio</span>
            </Link>
          )}

          {/* Upload Queue Trigger Button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition shadow-xs ${
              activeCount > 0
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white"
                : "bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800"
            }`}
            title="Open Upload Queue Drawer">
            {activeCount > 0 ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UploadCloud className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
            )}
            <span className="hidden sm:inline">Queue</span>
            {activeCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900">
                {activeCount}
              </span>
            ) : null}
          </button>

          {/* Theme Toggle (Dark / Light) */}
          <ThemeToggle />

          {/* Role Pill (Admin / Team) */}
          {userRole === "admin" ? (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800">
              <Shield className="w-3 h-3 text-amber-500" />
              Admin
            </span>
          ) : (
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800">
              Team
            </span>
          )}

          {/* Clerk User Profile */}
          <div className="flex items-center pl-1 border-l border-slate-200 dark:border-zinc-800">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-7 h-7 rounded-full border border-slate-200 dark:border-zinc-800",
                },
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
