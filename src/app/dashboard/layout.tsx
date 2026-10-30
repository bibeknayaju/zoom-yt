import React from "react";
import { Sidebar } from "@/components/Sidebar";
import { DashboardHeader } from "@/components/DashboardHeader";
import { SidebarProvider } from "@/components/SidebarContext";

export const metadata = {
  title: "Vidia | Zoom to YouTube Automation Studio",
  description: "Automated Zoom recording watermarking and YouTube publishing pipeline",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-slate-100 flex flex-col antialiased transition-colors duration-200">
        {/* Background Ambience */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-indigo-500/5 dark:from-indigo-900/15 via-purple-500/5 dark:via-purple-900/10 to-transparent pointer-events-none blur-3xl -z-10" />

        {/* Persistent Professional Left Sidebar (Desktop + Mobile Drawer) */}
        <Sidebar />

        {/* Main Content Area with Unified Dashboard Header */}
        <main className="lg:pl-60 flex-1 flex flex-col min-w-0">
          <DashboardHeader />
          <div className="flex-1 flex flex-col min-w-0">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
