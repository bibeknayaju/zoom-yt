"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Film, Sliders, Shield, Layers, UploadCloud, ListVideo, History } from "lucide-react";
import { useUploadQueue } from "@/lib/upload-queue-store";

interface NavbarProps {
  userRole?: "admin" | "user";
  userEmail?: string | null;
  onOpenQueue?: () => void;
}

export function Navbar({ userRole = "user", userEmail, onOpenQueue }: NavbarProps) {
  const pathname = usePathname();
  const { queue } = useUploadQueue();
  const activeCount = queue.filter((i) => i.status === "uploading" || i.status === "queued").length;

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Film },
    { href: "/dashboard/discovered", label: "Discovered Videos", icon: ListVideo },
    { href: "/dashboard/activity", label: "Activity Logs", icon: History },
    { href: "/dashboard/studio", label: "Watermark Studio", icon: Sliders },
    ...(userRole === "admin"
      ? [{ href: "/dashboard/admin", label: "Admin Settings", icon: Shield }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="group">
            <div className="text-xl font-black text-white tracking-tight flex items-center gap-2 font-sans">
              <span>Vidia</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Video Automation</p>
          </Link>
        </div>

        {/* Center Nav */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  active
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/80"
                }`}>
                <Icon className={`w-3.5 h-3.5 ${active ? "text-blue-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Actions & User Profile */}
        <div className="flex items-center gap-3">
          {/* Background Upload Queue Drawer Trigger */}
          {onOpenQueue && (
            <button
              onClick={onOpenQueue}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                activeCount > 0
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 border-zinc-900 dark:border-white shadow-xs"
                  : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
              }`}>
              <Layers className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
              <span className="hidden sm:inline">Upload Queue</span>
              {activeCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900">
                  {activeCount}
                </span>
              )}
            </button>
          )}

          {/* Role Badge */}
          <div className="hidden sm:flex items-center gap-1.5">
            {userRole === "admin" ? (
              <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Shield className="w-3 h-3 text-amber-400" />
                Admin
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-lg text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
                Team Member
              </span>
            )}
          </div>

          {/* Clerk User Button */}
          <div className="pl-1 border-l border-slate-800">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8 rounded-xl",
                },
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
