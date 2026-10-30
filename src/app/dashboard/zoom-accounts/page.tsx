"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Youtube } from "@/components/icons/Youtube";
import {
  Video,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  Edit,
  Film,
  Search,
  ExternalLink,
  Shield,
  Loader2,
  Clock,
  Sparkles,
  Info,
  KeyRound,
  Check,
  ChevronRight,
  Cloud,
} from "lucide-react";

interface ZoomAccount {
  id: string;
  accountName: string;
  accountId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface TestResult {
  success: boolean;
  message: string;
  usersCount?: number;
  sampleUsers?: { id: string; email: string; name: string }[];
}

interface BrowsedRecording {
  fileId: string;
  topic: string;
  baseTopic?: string;
  partNumber?: number;
  totalParts?: number;
  hostEmail?: string;
  hostName?: string;
  startTime: string;
  durationMinutes: number;
  meetingDurationMinutes?: number;
  fileSizeBytes: number;
  recordingType?: string;
  downloadUrl?: string;
  zoomAccountId?: string;
  accountName?: string;
  status?: string;
  youtubeUrl?: string;
  meetingUuid?: string;
  meetingId?: string;
}

export default function ZoomAccountsPage() {
  const router = useRouter();

  // Accounts state
  const [accounts, setAccounts] = useState<ZoomAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // Test connection state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Add Account Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({
    accountName: "",
    accountId: "",
    clientId: "",
    clientSecret: "",
  });

  // Edit Account Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<{
    id: string;
    accountName: string;
    accountId: string;
    clientId: string;
    clientSecret: string;
    isActive: boolean;
  } | null>(null);

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Browse Cloud Recordings Modal State
  const [browsingAccount, setBrowsingAccount] = useState<ZoomAccount | null>(null);
  const [browsedRecordings, setBrowsedRecordings] = useState<BrowsedRecording[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [browseDays, setBrowseDays] = useState(30);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [enqueuingId, setEnqueuingId] = useState<string | null>(null);
  const [enqueuingAll, setEnqueuingAll] = useState(false);
  const [enqueuedSuccess, setEnqueuedSuccess] = useState<Record<string, boolean>>({});

  // Fetch all Zoom accounts
  const fetchAccounts = useCallback(async () => {
    try {
      setRefreshing(true);
      const res = await fetch("/api/zoom-youtube/zoom/accounts");
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      }
    } catch (err: unknown) {
      console.error("Failed to fetch Zoom accounts:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase().trim();
    return accounts.filter(
      (acc) =>
        acc.accountName.toLowerCase().includes(q) ||
        acc.accountId.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  // Filter browsed recordings by topic/host
  const filteredBrowsedRecordings = useMemo(() => {
    if (!browseSearch.trim()) return browsedRecordings;
    const q = browseSearch.toLowerCase().trim();
    return browsedRecordings.filter(
      (r) =>
        (r.topic && r.topic.toLowerCase().includes(q)) ||
        (r.hostName && r.hostName.toLowerCase().includes(q)) ||
        (r.fileId && r.fileId.toLowerCase().includes(q))
    );
  }, [browsedRecordings, browseSearch]);

  // Test account connection
  const handleTestConnection = async (accId: string) => {
    setTestingId(accId);
    try {
      const res = await fetch("/api/zoom-youtube/zoom/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: accId }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResults((prev) => ({
          ...prev,
          [accId]: {
            success: true,
            message: `Connected! Found ${data.usersCount} active users (${data.sampleUsers?.map((u: any) => u.email).slice(0, 2).join(", ")})`,
            usersCount: data.usersCount,
            sampleUsers: data.sampleUsers,
          },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [accId]: {
            success: false,
            message: data.error || "Connection test failed",
          },
        }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection test failed";
      setTestResults((prev) => ({
        ...prev,
        [accId]: { success: false, message: msg },
      }));
    } finally {
      setTestingId(null);
    }
  };

  // Add new account
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAdd(true);
    setAddError(null);

    try {
      const res = await fetch("/api/zoom-youtube/zoom/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAccount),
      });
      const data = await res.json();
      if (data.success) {
        setNewAccount({ accountName: "", accountId: "", clientId: "", clientSecret: "" });
        setShowAddModal(false);
        fetchAccounts();
      } else {
        setAddError(data.error || "Failed to add Zoom account");
      }
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingAdd(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (acc: ZoomAccount) => {
    setEditingAccount({
      id: acc.id,
      accountName: acc.accountName,
      accountId: acc.accountId,
      clientId: "",
      clientSecret: "",
      isActive: acc.isActive,
    });
    setEditError(null);
    setShowEditModal(true);
  };

  // Update existing account
  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setSavingEdit(true);
    setEditError(null);

    try {
      const payload: Record<string, any> = {
        id: editingAccount.id,
        accountName: editingAccount.accountName,
        accountId: editingAccount.accountId,
        isActive: editingAccount.isActive,
      };

      // Only pass credentials if entered
      if (editingAccount.clientId.trim()) {
        payload.clientId = editingAccount.clientId.trim();
      }
      if (editingAccount.clientSecret.trim()) {
        payload.clientSecret = editingAccount.clientSecret.trim();
      }

      const res = await fetch("/api/zoom-youtube/zoom/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setShowEditModal(false);
        setEditingAccount(null);
        fetchAccounts();
      } else {
        setEditError(data.error || "Failed to update Zoom account");
      }
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSavingEdit(false);
    }
  };

  // Quick toggle active status
  const handleToggleActive = async (acc: ZoomAccount) => {
    try {
      const nextStatus = !acc.isActive;
      setAccounts((prev) =>
        prev.map((a) => (a.id === acc.id ? { ...a, isActive: nextStatus } : a))
      );

      const res = await fetch("/api/zoom-youtube/zoom/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: acc.id, isActive: nextStatus }),
      });
      const data = await res.json();
      if (!data.success) {
        fetchAccounts();
        alert(data.error || "Failed to update status");
      }
    } catch {
      fetchAccounts();
      alert("Error toggling account status");
    }
  };

  // Delete account
  const handleDeleteAccount = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove Zoom account "${name}"? Existing saved recordings will not be deleted.`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/zoom-youtube/zoom/accounts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      } else {
        alert(data.error || "Failed to delete account");
      }
    } catch {
      alert("Error deleting account");
    } finally {
      setDeletingId(null);
    }
  };

  // Browse recordings for an account
  const handleBrowseAccount = async (acc: ZoomAccount, days = browseDays) => {
    setBrowsingAccount(acc);
    setLoadingRecordings(true);
    setBrowseError(null);
    setBrowsedRecordings([]);
    setBrowseSearch("");

    try {
      const res = await fetch(`/api/zoom-youtube/zoom/recordings?accountId=${encodeURIComponent(acc.id)}&days=${days}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.recordings)) {
        setBrowsedRecordings(data.recordings);
      } else {
        setBrowseError(data.error || "Failed to load cloud recordings from Zoom");
      }
    } catch (err: unknown) {
      setBrowseError(err instanceof Error ? err.message : "Error browsing recordings");
    } finally {
      setLoadingRecordings(false);
    }
  };

  // Enqueue a browsed recording
  const handleEnqueueBrowsed = async (rec: BrowsedRecording) => {
    const fileId = rec.fileId;
    setEnqueuingId(fileId);

    try {
      const payload = {
        recordings: [
          {
            fileId: rec.fileId,
            topic: rec.topic,
            downloadUrl: rec.downloadUrl,
            zoomAccountId: rec.zoomAccountId || browsingAccount?.id,
            startTime: rec.startTime,
            fileSizeBytes: rec.fileSizeBytes,
            durationMinutes: rec.durationMinutes,
            meetingUuid: rec.meetingUuid || rec.fileId,
            meetingId: rec.meetingId || String(rec.fileId),
          },
        ],
        target: "cloud",
      };

      const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setEnqueuedSuccess((prev) => ({ ...prev, [fileId]: true }));
        setBrowsedRecordings((prev) =>
          prev.map((r) => (r.fileId === fileId ? { ...r, status: "queued" } : r))
        );
      } else {
        alert(data.error || "Failed to queue recording");
      }
    } catch {
      alert("Error queueing recording");
    } finally {
      setEnqueuingId(null);
    }
  };

  // Enqueue all un-uploaded browsed recordings
  const handleQueueAll = async () => {
    const unUploaded = browsedRecordings.filter(
      (r) => r.status !== "uploaded" && !r.youtubeUrl && r.status !== "queued"
    );
    if (unUploaded.length === 0) {
      alert("All recordings in this list are already queued or uploaded!");
      return;
    }

    setEnqueuingAll(true);
    try {
      const payload = {
        recordings: unUploaded.map((r) => ({
          fileId: r.fileId,
          topic: r.topic,
          downloadUrl: r.downloadUrl,
          zoomAccountId: r.zoomAccountId || browsingAccount?.id,
          startTime: r.startTime,
          fileSizeBytes: r.fileSizeBytes,
          durationMinutes: r.durationMinutes,
          meetingUuid: r.meetingUuid || r.fileId,
          meetingId: r.meetingId || String(r.fileId),
        })),
        target: "cloud",
      };

      const res = await fetch("/api/zoom-youtube/recordings/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        const enqueuedSet = new Set(unUploaded.map((r) => r.fileId));
        setEnqueuedSuccess((prev) => {
          const next = { ...prev };
          enqueuedSet.forEach((id) => {
            next[id] = true;
          });
          return next;
        });
        setBrowsedRecordings((prev) =>
          prev.map((r) => (enqueuedSet.has(r.fileId) ? { ...r, status: "queued" } : r))
        );
      } else {
        alert(data.error || "Failed to bulk queue recordings");
      }
    } catch {
      alert("Error bulk queueing recordings");
    } finally {
      setEnqueuingAll(false);
    }
  };

  const toMB = (bytes: number) => (bytes ? `${Math.round(bytes / (1024 * 1024))} MB` : "—");
  const activeCount = accounts.filter((a) => a.isActive).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-500/10 text-blue-500 dark:text-blue-400 rounded-xl border border-blue-500/20">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Zoom Cloud Accounts</span>
                <span className="text-xs px-2 py-0.5 font-mono rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700">
                  {accounts.length}
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connect and manage Server-to-Server OAuth accounts to automatically discover and watermark class recordings.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={fetchAccounts}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition shadow-xs disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-slate-500" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewAccount({ accountName: "", accountId: "", clientId: "", clientSecret: "" });
              setAddError(null);
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Zoom S2S Account</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 bg-white dark:bg-zinc-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Accounts</span>
            <Video className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{accounts.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Configured S2S OAuth instances</p>
        </div>

        <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 bg-white dark:bg-zinc-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Syncing</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{activeCount}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Auto-discovery enabled</p>
        </div>

        <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl p-4 bg-white dark:bg-zinc-950 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">OAuth Mode</span>
            <Shield className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-sm font-bold text-slate-900 dark:text-white mt-2">Server-to-Server (Zero User Login)</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Encrypted at rest with AES-256</p>
        </div>
      </div>

      {/* Search Filter */}
      {accounts.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by account name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
            />
          </div>
        </div>
      )}

      {/* Accounts List */}
      {loading ? (
        <div className="text-center py-16 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950">
          <Loader2 className="w-7 h-7 text-slate-400 animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading Zoom accounts...</p>
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950">
          <div className="p-3 bg-slate-100 dark:bg-zinc-900 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
            <Video className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {search ? "No matching Zoom accounts" : "No Zoom accounts connected"}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            {search
              ? "Try searching with a different term."
              : "Connect your first Zoom Server-to-Server OAuth app to automatically discover cloud recordings."}
          </p>
          {!search && (
            <button
              onClick={() => {
                setNewAccount({ accountName: "", accountId: "", clientId: "", clientSecret: "" });
                setAddError(null);
                setShowAddModal(true);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Your First Zoom S2S Account</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAccounts.map((acc) => {
            const test = testResults[acc.id];
            const isTesting = testingId === acc.id;
            const isDeleting = deletingId === acc.id;

            return (
              <div
                key={acc.id}
                className="border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 bg-white dark:bg-zinc-950 shadow-xs hover:border-slate-300 dark:hover:border-zinc-700 transition flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-blue-500/10 text-blue-500 dark:text-blue-400 rounded-xl shrink-0">
                        <Video className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate" title={acc.accountName}>
                          {acc.accountName}
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate" title={acc.accountId}>
                          ID: {acc.accountId}
                        </p>
                      </div>
                    </div>

                    {/* Active toggle badge */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(acc)}
                      title={`Click to ${acc.isActive ? "Deactivate" : "Activate"}`}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition cursor-pointer shrink-0 ${
                        acc.isActive
                          ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                          : "text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-800"
                      }`}>
                      {acc.isActive ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 text-slate-400" />
                          <span>Inactive</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Test Result Banner */}
                  {test && (
                    <div
                      className={`p-2.5 rounded-xl text-xs flex items-start gap-2 ${
                        test.success
                          ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                          : "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300"
                      }`}>
                      {test.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <span className="leading-snug">{test.message}</span>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Connected {new Date(acc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-900 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleBrowseAccount(acc)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 px-2.5 py-1.5 rounded-lg shadow-xs transition">
                      <Film className="w-3.5 h-3.5" />
                      <span>Browse</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTestConnection(acc.id)}
                      disabled={isTesting}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition disabled:opacity-50">
                      {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      <span>{isTesting ? "Testing..." : "Test"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEditModal(acc)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-lg transition"
                      title="Edit Account Details">
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteAccount(acc.id, acc.accountName)}
                      disabled={isDeleting}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition disabled:opacity-50"
                      title="Remove Account">
                      {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Information Box */}
      <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 bg-white dark:bg-zinc-950 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-500" />
          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            How to get Zoom Server-to-Server OAuth Credentials
          </h4>
        </div>
        <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>
            Go to the <a href="https://marketplace.zoom.us" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-blue-500">Zoom App Marketplace</a> and click <strong>Develop → Build App</strong>.
          </li>
          <li>Choose <strong>Server-to-Server OAuth</strong> as the app type and name it (e.g. <em>Vidia Automation</em>).</li>
          <li>Copy your <strong>Account ID</strong>, <strong>Client ID</strong>, and <strong>Client Secret</strong> from the App Credentials tab.</li>
          <li>
            In the <strong>Scopes</strong> tab, add: <code className="bg-slate-100 dark:bg-zinc-900 px-1 py-0.5 rounded text-[11px] font-mono">recording:read:admin</code> and <code className="bg-slate-100 dark:bg-zinc-900 px-1 py-0.5 rounded text-[11px] font-mono">user:read:admin</code>.
          </li>
          <li>Click <strong>Activate your app</strong> in Zoom. Once active, paste your credentials into Vidia to start automatic watermarking!</li>
        </ol>
      </div>

      {/* ==================== ADD ZOOM ACCOUNT MODAL ==================== */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          if (!savingAdd) setShowAddModal(false);
        }}
        title="Add Zoom S2S Account"
        description="Connect a Zoom Server-to-Server OAuth application. Credentials are validated live and encrypted with AES-256."
        icon={<Video className="w-5 h-5 text-blue-500" />}
        size="lg">
        <form onSubmit={handleAddAccount} className="space-y-4 pt-2">
          {addError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{addError}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Account Label / Nickname <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Science Class Account, Union Math, Main Host"
              value={newAccount.accountName}
              onChange={(e) => setNewAccount({ ...newAccount, accountName: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Zoom Account ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Found under App Credentials in Zoom Marketplace"
              value={newAccount.accountId}
              onChange={(e) => setNewAccount({ ...newAccount, accountId: e.target.value.trim() })}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Client ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Client ID"
                value={newAccount.clientId}
                onChange={(e) => setNewAccount({ ...newAccount, clientId: e.target.value.trim() })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Client Secret <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                placeholder="Client Secret"
                value={newAccount.clientSecret}
                onChange={(e) => setNewAccount({ ...newAccount, clientSecret: e.target.value.trim() })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={savingAdd}
              onClick={() => setShowAddModal(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-xl transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition disabled:opacity-50">
              {savingAdd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{savingAdd ? "Verifying & Saving..." : "Verify & Connect Account"}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* ==================== EDIT / UPDATE ZOOM ACCOUNT MODAL ==================== */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          if (!savingEdit) setShowEditModal(false);
        }}
        title="Update Zoom S2S Account"
        description="Update account nickname, account ID, active status, or re-enter new credentials."
        icon={<Edit className="w-5 h-5 text-blue-500" />}
        size="lg">
        {editingAccount && (
          <form onSubmit={handleUpdateAccount} className="space-y-4 pt-2">
            {editError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Account Label / Nickname <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editingAccount.accountName}
                onChange={(e) => setEditingAccount({ ...editingAccount, accountName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Zoom Account ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={editingAccount.accountId}
                onChange={(e) => setEditingAccount({ ...editingAccount, accountId: e.target.value.trim() })}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Update Credentials (Optional)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Leave both Client ID and Client Secret blank to keep your current encrypted credentials unchanged.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    New Client ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank to keep current"
                    value={editingAccount.clientId}
                    onChange={(e) => setEditingAccount({ ...editingAccount, clientId: e.target.value.trim() })}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    New Client Secret (Optional)
                  </label>
                  <input
                    type="password"
                    placeholder="Leave blank to keep current"
                    value={editingAccount.clientSecret}
                    onChange={(e) => setEditingAccount({ ...editingAccount, clientSecret: e.target.value.trim() })}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
                  />
                </div>
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="space-y-0.5">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Account Active Status
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  When active, newly finished Zoom cloud recordings from this account will be automatically discovered.
                </p>
              </div>

              <input
                type="checkbox"
                checked={editingAccount.isActive}
                onChange={(e) => setEditingAccount({ ...editingAccount, isActive: e.target.checked })}
                className="w-4 h-4 rounded text-zinc-900 focus:ring-zinc-900 dark:focus:ring-white cursor-pointer"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setShowEditModal(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-xl transition">
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl shadow-xs transition disabled:opacity-50">
                {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{savingEdit ? "Updating..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ==================== BROWSE RECORDINGS MODAL ==================== */}
      <Modal
        isOpen={Boolean(browsingAccount)}
        onClose={() => setBrowsingAccount(null)}
        title={browsingAccount ? `Cloud Recordings: ${browsingAccount.accountName}` : "Cloud Recordings"}
        description="Browse recordings directly from this Zoom account's cloud storage and queue them for processing."
        icon={<Film className="w-5 h-5 text-blue-500" />}
        size="5xl">
        <div className="space-y-4 pt-2">
          {/* Days filter & Quick actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-zinc-800">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Timeframe:</span>
              {[7, 14, 30, 60].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setBrowseDays(d);
                    if (browsingAccount) handleBrowseAccount(browsingAccount, d);
                  }}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                    browseDays === d
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                      : "bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
                  }`}>
                  Last {d} Days
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => browsingAccount && handleBrowseAccount(browsingAccount, browseDays)}
                disabled={loadingRecordings}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-lg transition disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingRecordings ? "animate-spin" : ""}`} />
                <span>Refresh Zoom</span>
              </button>

              {browsedRecordings.length > 0 && (
                <button
                  type="button"
                  onClick={handleQueueAll}
                  disabled={enqueuingAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-lg shadow-xs transition disabled:opacity-50">
                  {enqueuingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                  <span>
                    Queue All for Cloud (
                    {
                      browsedRecordings.filter(
                        (r) => r.status !== "uploaded" && !r.youtubeUrl && r.status !== "queued"
                      ).length
                    }
                    )
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Search inside modal */}
          {browsedRecordings.length > 0 && (
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by class topic, teacher name, or ID..."
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white transition"
              />
            </div>
          )}

          {browseError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{browseError}</span>
            </div>
          )}

          {loadingRecordings ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Scanning Zoom Cloud for meetings in the last {browseDays} days...
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Fetching cloud recordings and cross-referencing your upload status.
              </p>
            </div>
          ) : filteredBrowsedRecordings.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
              <Film className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {browseSearch
                  ? "No recordings match your search filter."
                  : `No cloud recordings found for this account in the last ${browseDays} days.`}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Ensure cloud recording was enabled during the meeting and has finished processing in Zoom.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {filteredBrowsedRecordings.map((rec) => {
                const isEnqueued = enqueuedSuccess[rec.fileId] || rec.status === "queued";
                const isEnqueuing = enqueuingId === rec.fileId;
                const isUploaded = rec.status === "uploaded" || Boolean(rec.youtubeUrl);
                const isProcessing =
                  rec.status === "downloading" ||
                  rec.status === "watermarking" ||
                  rec.status === "uploading";

                return (
                  <div
                    key={rec.fileId}
                    className="border border-slate-200 dark:border-zinc-800 rounded-xl p-4 bg-slate-50/60 dark:bg-zinc-950/80 hover:border-slate-300 dark:hover:border-zinc-700 transition space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                            {rec.topic}
                          </h4>
                          {rec.totalParts && rec.totalParts > 1 && (
                            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 px-2 py-0.5 rounded-full">
                              Part {rec.partNumber} of {rec.totalParts}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          {rec.hostName && (
                            <>
                              <span>
                                Host: <strong className="text-slate-700 dark:text-slate-200">{rec.hostName}</strong>
                              </span>
                              <span>•</span>
                            </>
                          )}
                          <span>
                            {new Date(rec.startTime).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>•</span>
                          <span>{rec.durationMinutes} mins</span>
                          <span>•</span>
                          <span className="font-mono bg-slate-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-zinc-800">
                            {toMB(rec.fileSizeBytes)}
                          </span>
                          {rec.recordingType && (
                            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                              {rec.recordingType.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                        {isUploaded ? (
                          <a
                            href={rec.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition shadow-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Uploaded (View YT)</span>
                            <ExternalLink className="w-3 h-3 text-emerald-500" />
                          </a>
                        ) : isProcessing ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                            <span className="capitalize">Cloud: {rec.status}...</span>
                          </div>
                        ) : isEnqueued ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            <span>Queued for Cloud</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const sel = {
                                  fileId: rec.fileId,
                                  topic: rec.topic,
                                  downloadUrl: rec.downloadUrl,
                                  zoomAccountId: rec.zoomAccountId || browsingAccount?.id,
                                  startTime: rec.startTime,
                                  fileSizeBytes: rec.fileSizeBytes,
                                  durationMinutes: rec.durationMinutes,
                                  meetingUuid: rec.meetingUuid,
                                  meetingId: rec.meetingId,
                                };
                                try {
                                  sessionStorage.setItem("zoomyt_selected_recording", JSON.stringify(sel));
                                } catch {}
                                router.push("/dashboard/studio");
                              }}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800 px-2.5 py-1.5 rounded-lg transition shadow-xs">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                              <span>Studio</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleEnqueueBrowsed(rec)}
                              disabled={isEnqueuing}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 px-3 py-1.5 rounded-lg transition shadow-xs disabled:opacity-50">
                              {isEnqueuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                              <span>{isEnqueuing ? "Queueing..." : "Queue for Cloud"}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => router.push("/dashboard/discovered")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:underline">
              <span>Go to Discovered Videos Page</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setBrowsingAccount(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-xl transition">
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
