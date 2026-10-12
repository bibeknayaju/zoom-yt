"use client";

import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import {
  Shield,
  Users,
  Video,
  HardDrive,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Key,
  Loader2,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Youtube } from "@/components/icons/Youtube";
import Link from "next/link";

interface TeamUser {
  id: string;
  email: string;
  name: string;
  imageUrl?: string;
  role: "admin" | "user";
  createdAt: number;
}

interface ZoomAccount {
  id: string;
  accountName: string;
  accountId: string;
  isActive: boolean;
  createdAt: string;
}

interface YouTubeStatus {
  connected: boolean;
  channel: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    status: string;
  } | null;
  quota: {
    unitsUsedToday: number;
    unitsLimit: number;
    datePacific: string;
    remainingUnits: number;
  };
}

interface StorageStatus {
  targetPath: string;
  totalGB: number;
  freeGB: number;
  usedGB: number;
  freePercentage: number;
  status: "healthy" | "warning" | "critical";
  message: string;
}

export default function AdminSettingsPage() {
  const { user, isLoaded } = useUser();
  const userRole = (user?.publicMetadata?.role as string) === "admin" ? "admin" : "user";
  const isAdmin = userRole === "admin";

  const [activeTab, setActiveTab] = useState<"team" | "zoom" | "youtube" | "system">("team");
  const [loading, setLoading] = useState(false);

  // Team users state
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Zoom accounts state
  const [zoomAccounts, setZoomAccounts] = useState<ZoomAccount[]>([]);
  const [showAddZoom, setShowAddZoom] = useState(false);
  const [newZoom, setNewZoom] = useState({
    accountName: "",
    accountId: "",
    clientId: "",
    clientSecret: "",
  });
  const [savingZoom, setSavingZoom] = useState(false);
  const [testingZoomId, setTestingZoomId] = useState<string | null>(null);
  const [zoomTestMsg, setZoomTestMsg] = useState<Record<string, string>>({});

  // YouTube state
  const [ytStatus, setYtStatus] = useState<YouTubeStatus | null>(null);

  // Storage state
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [purgingCache, setPurgingCache] = useState(false);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // 1. Fetch team users
      const usersRes = await fetch("/api/admin/users");
      const usersData = await usersRes.json();
      if (usersData.success) {
        setTeamUsers(usersData.users);
      }

      // 2. Fetch zoom accounts
      const zoomRes = await fetch("/api/zoom-youtube/zoom/accounts");
      const zoomData = await zoomRes.json();
      if (zoomData.success) {
        setZoomAccounts(zoomData.accounts);
      }

      // 3. Fetch YouTube status
      const ytRes = await fetch("/api/zoom-youtube/youtube/status");
      const ytData = await ytRes.json();
      if (ytData.success) {
        setYtStatus(ytData);
      }

      // 4. Fetch Storage status
      const storageRes = await fetch("/api/zoom-youtube/storage");
      const storageData = await storageRes.json();
      if (storageData.status) {
        setStorage(storageData);
      }
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && isAdmin) {
      fetchAdminData();
    }
  }, [isLoaded, isAdmin]);

  const handleToggleUserRole = async (targetUser: TeamUser) => {
    const newRole = targetUser.role === "admin" ? "user" : "admin";
    if (!confirm(`Change role of ${targetUser.email} to ${newRole.toUpperCase()}?`)) return;

    setUpdatingUserId(targetUser.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: targetUser.id, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setTeamUsers((prev) =>
          prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u))
        );
      } else {
        alert(data.error || "Failed to update role");
      }
    } catch {
      alert("Failed to update user role");
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleCreateZoomAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoom.accountName || !newZoom.accountId || !newZoom.clientId || !newZoom.clientSecret) {
      alert("Please fill all fields");
      return;
    }
    setSavingZoom(true);
    try {
      const res = await fetch("/api/zoom-youtube/zoom/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newZoom),
      });
      const data = await res.json();
      if (data.success) {
        alert("Zoom account added and encrypted successfully!");
        setNewZoom({ accountName: "", accountId: "", clientId: "", clientSecret: "" });
        setShowAddZoom(false);
        fetchAdminData();
      } else {
        alert(data.error || "Failed to add Zoom account");
      }
    } finally {
      setSavingZoom(false);
    }
  };

  const handleDeleteZoomAccount = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete Zoom account "${name}"?`)) return;
    try {
      const res = await fetch(`/api/zoom-youtube/zoom/accounts?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        fetchAdminData();
      } else {
        alert(data.error || "Failed to delete account");
      }
    } catch {
      alert("Error deleting account");
    }
  };

  const handleTestZoomConnection = async (id: string) => {
    setTestingZoomId(id);
    setZoomTestMsg((prev) => ({ ...prev, [id]: "Testing connection..." }));
    try {
      const res = await fetch("/api/zoom-youtube/zoom/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: id }),
      });
      const data = await res.json();
      if (data.success) {
        setZoomTestMsg((prev) => ({ ...prev, [id]: "✅ Connected! Token generated." }));
      } else {
        setZoomTestMsg((prev) => ({ ...prev, [id]: `❌ Failed: ${data.error}` }));
      }
    } catch {
      setZoomTestMsg((prev) => ({ ...prev, [id]: "❌ Connection error" }));
    } finally {
      setTestingZoomId(null);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar userRole="user" userEmail={user?.primaryEmailAddress?.emailAddress} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Administrator Access Required</h2>
          <p className="text-sm text-slate-400 mt-2 max-w-md">
            This settings area is restricted to administrators. Contact an existing admin to grant you the Admin role.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl border border-slate-700 transition">
            <span>Return to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar userRole="admin" userEmail={user?.primaryEmailAddress?.emailAddress} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full flex-1 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-amber-400" />
              <h1 className="text-2xl font-bold tracking-tight text-white">Admin Management & Settings</h1>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Configure team roles, manage multi-account Zoom S2S credentials, and monitor YouTube quotas.
            </p>
          </div>
          <button
            onClick={fetchAdminData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-xl hover:bg-slate-800 transition disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Data
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 max-w-xl">
          {[
            { id: "team", label: "Team & Roles", icon: Users },
            { id: "zoom", label: "Zoom S2S Accounts", icon: Video },
            { id: "youtube", label: "YouTube Channel", icon: Youtube },
            { id: "system", label: "System & Storage", icon: HardDrive },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 ${
                  active ? "bg-slate-800 text-white shadow" : "text-slate-400 hover:text-slate-200"
                }`}>
                <Icon className={`w-3.5 h-3.5 ${active ? "text-amber-400" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: Team & Roles */}
        {activeTab === "team" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Team Members ({teamUsers.length})</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Admins can configure Zoom/YouTube and manage settings. Team members can watermark and upload recordings.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-800">
              {teamUsers.map((u) => {
                const isTargetAdmin = u.role === "admin";
                const isCurrentSelf = u.id === user?.id;
                return (
                  <div key={u.id} className="p-4 flex items-center justify-between hover:bg-slate-800/40 transition">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white flex items-center gap-2">
                          <span>{u.name}</span>
                          {isCurrentSelf && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border ${
                          isTargetAdmin
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                            : "bg-slate-800 border-slate-700 text-slate-300"
                        }`}>
                        {isTargetAdmin ? "Admin" : "Team Member"}
                      </span>

                      {!isCurrentSelf && (
                        <button
                          onClick={() => handleToggleUserRole(u)}
                          disabled={updatingUserId === u.id}
                          className="text-xs font-semibold px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition disabled:opacity-50">
                          {updatingUserId === u.id
                            ? "Updating..."
                            : isTargetAdmin
                            ? "Demote to Member"
                            : "Promote to Admin"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: Zoom S2S Accounts */}
        {activeTab === "zoom" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Zoom Server-to-Server OAuth Accounts</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connect multiple Zoom enterprise/pro accounts for multi-account cloud recording processing.
                </p>
              </div>
              <button
                onClick={() => setShowAddZoom(!showAddZoom)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow">
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddZoom ? "Cancel" : "Add Zoom Account"}</span>
              </button>
            </div>

            {/* Add Zoom Account Form */}
            {showAddZoom && (
              <form
                onSubmit={handleCreateZoomAccount}
                className="bg-slate-900 border border-blue-500/40 rounded-2xl p-5 space-y-4 shadow-xl">
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                  New Zoom S2S Credentials
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Account Display Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Union Education TSC"
                      value={newZoom.accountName}
                      onChange={(e) => setNewZoom({ ...newZoom, accountName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Zoom Account ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. z9X7Yw..."
                      value={newZoom.accountId}
                      onChange={(e) => setNewZoom({ ...newZoom, accountId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Client ID
                    </label>
                    <input
                      type="text"
                      value={newZoom.clientId}
                      onChange={(e) => setNewZoom({ ...newZoom, clientId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Client Secret (Encrypted via AES-256)
                    </label>
                    <input
                      type="password"
                      value={newZoom.clientSecret}
                      onChange={(e) => setNewZoom({ ...newZoom, clientSecret: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddZoom(false)}
                    className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingZoom}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50">
                    {savingZoom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    <span>Encrypt & Save Account</span>
                  </button>
                </div>
              </form>
            )}

            {/* Accounts Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="divide-y divide-slate-800">
                {zoomAccounts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No Zoom accounts configured. Click &quot;Add Zoom Account&quot; to connect your first account.
                  </div>
                ) : (
                  zoomAccounts.map((acc) => (
                    <div key={acc.id} className="p-4 flex items-center justify-between hover:bg-slate-800/40 transition">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{acc.accountName}</span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                            {acc.accountId}
                          </span>
                        </div>
                        {zoomTestMsg[acc.id] && (
                          <p className="text-[11px] text-blue-400 mt-1">{zoomTestMsg[acc.id]}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTestZoomConnection(acc.id)}
                          disabled={testingZoomId === acc.id}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition disabled:opacity-50">
                          {testingZoomId === acc.id ? "Testing..." : "Test Token"}
                        </button>
                        <button
                          onClick={() => handleDeleteZoomAccount(acc.id, acc.accountName)}
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                          title="Delete Account">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: YouTube Channel */}
        {activeTab === "youtube" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Youtube className="w-5 h-5 text-red-500" />
                  YouTube Channel Connection
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Connected channel for video uploads and daily API quota tracker.
                </p>
              </div>

              <a
                href="/api/zoom-youtube/youtube/auth"
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition shadow">
                <span>{ytStatus?.connected ? "Reconnect Channel" : "Connect YouTube Channel"}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {ytStatus?.channel ? (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {ytStatus.channel.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ytStatus.channel.thumbnailUrl}
                      alt={ytStatus.channel.title}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold">
                      YT
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-bold text-white">{ytStatus.channel.title}</h4>
                    <p className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5">
                      <CheckCircle2 className="w-3 h-3" />
                      Active & Authorized for Video Uploads
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-slate-300">
                    {ytStatus.quota?.unitsUsedToday ?? 0} / {ytStatus.quota?.unitsLimit ?? 10000} units used
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Resets daily at 12:00 AM Pacific
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs bg-slate-950 rounded-xl border border-slate-800">
                No YouTube channel connected yet. Click &quot;Connect YouTube Channel&quot; to authorize via Google OAuth.
              </div>
            )}
          </div>
        )}

        {/* TAB 4: System & Storage */}
        {activeTab === "system" && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-indigo-400" />
                  Local System Storage Health
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Monitors disk space in the temporary video working directory.
                </p>
              </div>
            </div>

            {storage && (
              <div className="p-5 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Working Directory Free Space</span>
                  <span className="font-bold text-emerald-400">
                    {storage.freeGB} GB Free / {storage.totalGB} GB Total ({storage.freePercentage}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${storage.freePercentage}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400">{storage.message}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
