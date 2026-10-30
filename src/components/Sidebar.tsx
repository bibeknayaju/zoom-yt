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
  CheckCircle2,
  Menu,
  X,
  Loader2,
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

  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Film },
    { href: "/dashboard/discovered", label: "Discovered Videos", icon: ListVideo },
    { href: "/dashboard/activity", label: "Activity Logs", icon: History },
    { href: "/dashboard/studio", label: "Watermark Studio", icon: Sliders },
    ...(userRole === "admin"
      ? [{ href: "/dashboard/admin", label: "Admin Settings", icon: Shield }]
      : []),
  ];

  const handleOpenQueueDrawer = () => {
    if (onOpenQueue) onOpenQueue();
    else setDrawerOpen(true);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white dark:bg-black border-r border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-slate-200">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
        <Link href="/dashboard" className="group block">
          <div className="text-xl font-black tracking-tight text-slate-900 dark:text-white font-sans">
            Vidia
          </div>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">Video Automation</p>
        </Link>
        <ThemeToggle />
      </div>

      {/* Navigation Items */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
          Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors ${
                active
                  ? "bg-slate-100 dark:bg-zinc-900 text-slate-900 dark:text-white font-semibold"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-zinc-900/50 font-medium"
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-zinc-500"}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Upload Queue Trigger Card */}
      <div className="p-3 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-black">
        <button
          type="button"
          onClick={handleOpenQueueDrawer}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-slate-50 dark:hover:bg-zinc-900 text-xs transition shadow-xs"
        >
          <div className="flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-slate-400 dark:text-zinc-400" />
            <span className="font-medium text-slate-800 dark:text-slate-200">Upload Queue</span>
          </div>
          {activeCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-zinc-700">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              {activeCount} active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-zinc-500">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Idle
            </span>
          )}
        </button>
      </div>

      {/* User Footer Profile */}
      <div className="p-3.5 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-black">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-7 h-7 rounded-full border border-slate-200 dark:border-zinc-800",
              },
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
              {user?.fullName || user?.firstName || "Teacher / Admin"}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
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
        <Link href="/dashboard">
          <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white font-sans">
            Vidia
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            aria-label="Toggle Navigation Menu"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Desktop Fixed Left Sidebar (240px) */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-60 z-30 shadow-xs">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Collapsible) */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 max-w-full h-full z-10 shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
