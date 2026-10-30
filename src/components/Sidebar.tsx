"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  Film,
  ListVideo,
  History,
  Sliders,
  Shield,
  UploadCloud,
  Laptop,
  Cloud,
  CheckCircle2,
  Menu,
  X,
  Radio,
  Sparkles,
} from "lucide-react";
import { useUploadQueue } from "@/lib/upload-queue-store";
import { ThemeToggle } from "@/components/ThemeToggle";

interface SidebarProps {
  onOpenQueue?: () => void;
}

export function Sidebar({ onOpenQueue }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { queue, setDrawerOpen } = useUploadQueue();
  const activeCount = queue.filter(
    (item) => item.status === "queued" || item.status === "uploading"
  ).length;

  const [processingTarget, setProcessingTarget] = useState<"local" | "cloud">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zoomyt_processing_target");
      if (saved === "local" || saved === "cloud") return saved;
    }
    return "cloud";
  });

  const handleTargetChange = (target: "local" | "cloud") => {
    setProcessingTarget(target);
    try {
      localStorage.setItem("zoomyt_processing_target", target);
      window.dispatchEvent(new Event("storage"));
    } catch {}
  };

  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Film, description: "Overview & queues" },
    { href: "/dashboard/discovered", label: "Discovered Videos", icon: ListVideo, description: "Zoom classes discovered" },
    { href: "/dashboard/activity", label: "Activity Logs", icon: History, description: "Live & audit logs" },
    { href: "/dashboard/studio", label: "Watermark Studio", icon: Sliders, description: "Canvas editor & render" },
    ...(userRole === "admin"
      ? [{ href: "/dashboard/admin", label: "Admin Settings", icon: Shield, description: "User permissions" }]
      : []),
  ];

  const handleOpenQueueDrawer = () => {
    if (onOpenQueue) onOpenQueue();
    else setDrawerOpen(true);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-black border-r border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-slate-200">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-rose-600 flex items-center justify-center shadow-md shadow-indigo-600/20 group-hover:scale-105 transition-transform">
            <UploadCloud className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Union Studio</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Media & YouTube Pipeline</p>
          </div>
        </Link>
        <ThemeToggle />
      </div>

      {/* Target Runner Mode Segmented Control */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
            Active Target Runner
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Radio className="w-2.5 h-2.5 animate-pulse" /> Live
          </span>
        </div>
        <div className="grid grid-cols-2 p-1 bg-slate-200/70 dark:bg-zinc-900 rounded-xl border border-slate-300/60 dark:border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => handleTargetChange("local")}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              processingTarget === "local"
                ? "bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Laptop</span>
          </button>
          <button
            type="button"
            onClick={() => handleTargetChange("cloud")}
            className={`inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              processingTarget === "cloud"
                ? "bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Cloud</span>
          </button>
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all group ${
                active
                  ? "bg-indigo-50 dark:bg-indigo-600/15 text-indigo-700 dark:text-indigo-400 font-semibold border border-indigo-200/80 dark:border-indigo-500/20"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-900/60"
              }`}
            >
              <div
                className={`p-1.5 rounded-lg transition-colors ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.label}</div>
                <div className="text-[10px] text-slate-400 dark:text-slate-400 truncate font-normal">
                  {item.description}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Upload Queue Trigger Card */}
      <div className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-black">
        <button
          type="button"
          onClick={handleOpenQueueDrawer}
          className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition shadow-xs ${
            activeCount > 0
              ? "bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/20 animate-pulse"
              : "bg-white dark:bg-black text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${activeCount > 0 ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400"}`}>
              <UploadCloud className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="font-bold">Upload Queue</div>
              <div className={`text-[10px] ${activeCount > 0 ? "text-indigo-100" : "text-slate-400 dark:text-slate-400"}`}>
                {activeCount > 0 ? `${activeCount} active job${activeCount > 1 ? "s" : ""}` : "All tasks complete"}
              </div>
            </div>
          </div>
          {activeCount > 0 ? (
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          )}
        </button>
      </div>

      {/* User Footer Profile */}
      <div className="p-4 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-black">
        <div className="flex items-center gap-3 min-w-0">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8 rounded-full border border-slate-300 dark:border-zinc-700",
              },
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {user?.fullName || user?.firstName || "Teacher / Admin"}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-400 truncate">
              {user?.primaryEmailAddress?.emailAddress || "admin@union.edu"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Navbar Bar with Hamburger */}
      <div className="lg:hidden sticky top-0 z-40 bg-white dark:bg-black border-b border-slate-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between shadow-xs">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
            <UploadCloud className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">Union Studio</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            aria-label="Toggle Navigation Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Desktop Fixed Left Sidebar (256px) */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30 shadow-xs">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Collapsible) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-full h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
