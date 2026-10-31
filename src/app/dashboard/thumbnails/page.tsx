"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Sparkles,
  Check,
  Download,
  Palette,
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  Video,
  Eye,
  RefreshCw,
  Loader2,
  ExternalLink,
  ChevronRight,
  Sliders,
  Shield,
  Layers,
  Calendar,
} from "lucide-react";
import {
  THUMBNAIL_TEMPLATES,
  ThumbnailTemplateId,
  generateThumbnailSvg,
  formatNepaliBikramSambat,
} from "@/lib/thumbnail-templates";

interface TeacherItem {
  id: string;
  name: string;
  isActive: boolean;
}

interface AccountConfig {
  id: string;
  accountName: string;
  isActive: boolean;
  teachers: TeacherItem[];
  currentTopic: string;
}

export default function ThumbnailStudioPage() {
  const [loading, setLoading] = useState(true);
  const [activeTemplateId, setActiveTemplateId] = useState<ThumbnailTemplateId>("glassmorphism");
  const [previewTemplateId, setPreviewTemplateId] = useState<ThumbnailTemplateId>("glassmorphism");
  const [autoUploadThumbnail, setAutoUploadThumbnail] = useState(true);
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [downloadingPng, setDownloadingPng] = useState(false);

  // Live Preview Form State
  const [selectedSubject, setSelectedSubject] = useState("Science");
  const [customTopic, setCustomTopic] = useState("प्रकाश र अपवर्तन (Optics & Refraction)");
  
  // Native HTML Date Picker defaulting automatically to today (YYYY-MM-DD)
  const [dateInput, setDateInput] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [nepaliDate, setNepaliDate] = useState(() => formatNepaliBikramSambat(new Date()));

  const handleDateChange = (val: string) => {
    setDateInput(val);
    if (val) {
      const d = new Date(`${val}T12:00:00`);
      if (!isNaN(d.getTime())) {
        setNepaliDate(formatNepaliBikramSambat(d));
      }
    }
  };

  // Teacher editing state
  const [editingAccountName, setEditingAccountName] = useState<string>("Science");
  const [newTeacherName, setNewTeacherName] = useState("");
  const [savingAccountCfg, setSavingAccountCfg] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Fetch thumbnail studio status
  const fetchThumbnailData = useCallback(async () => {
    try {
      const res = await fetch("/api/zoom-youtube/thumbnails");
      const json = await res.json();
      if (json.success) {
        setActiveTemplateId(json.activeTemplateId || "glassmorphism");
        setPreviewTemplateId(json.activeTemplateId || "glassmorphism");
        setAutoUploadThumbnail(json.autoUploadThumbnail ?? true);
        setAccounts(json.accounts || []);
        if (json.nepaliDateToday) {
          setNepaliDate(json.nepaliDateToday);
        }

        // Set initial selected subject from first account
        if (json.accounts?.length > 0) {
          const first = json.accounts[0];
          setSelectedSubject(first.accountName);
          setEditingAccountName(first.accountName);
          if (first.currentTopic) {
            setCustomTopic(first.currentTopic);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load thumbnail studio data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchThumbnailData();
  }, [fetchThumbnailData]);

  // Current active teachers for the selected subject
  const currentSubjectTeachers = useMemo(() => {
    const acc = accounts.find((a) => a.accountName === selectedSubject);
    if (!acc || !acc.teachers || acc.teachers.length === 0) {
      return ["Union Education"];
    }
    const active = acc.teachers.filter((t) => t.isActive).map((t) => t.name);
    return active.length > 0 ? active : [acc.teachers[0].name];
  }, [accounts, selectedSubject]);

  // Generate real-time SVG string for the main preview canvas
  const previewSvg = useMemo(() => {
    return generateThumbnailSvg({
      templateId: previewTemplateId,
      subject: selectedSubject,
      topic: customTopic || "Class Session",
      teachers: currentSubjectTeachers,
      nepaliDateStr: nepaliDate,
    });
  }, [previewTemplateId, selectedSubject, customTopic, currentSubjectTeachers, nepaliDate]);

  // Set selected template as ACTIVE for YouTube
  const handleSetActiveTemplate = async (templateId: ThumbnailTemplateId) => {
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/zoom-youtube/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_active_template", templateId }),
      });
      const json = await res.json();
      if (json.success) {
        setActiveTemplateId(templateId);
        setPreviewTemplateId(templateId);
      }
    } catch (err) {
      console.error("Error setting active template:", err);
    } finally {
      setSavingTemplate(false);
    }
  };

  // Toggle automatic upload of thumbnail to YouTube
  const handleToggleAutoUpload = async () => {
    const nextVal = !autoUploadThumbnail;
    setAutoUploadThumbnail(nextVal);
    try {
      await fetch("/api/zoom-youtube/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_auto_upload", enabled: nextVal }),
      });
    } catch {}
  };

  // Download high-res PNG
  const handleDownloadPng = async () => {
    setDownloadingPng(true);
    try {
      const res = await fetch("/api/zoom-youtube/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "render_png",
          templateId: previewTemplateId,
          subject: selectedSubject,
          topic: customTopic,
          teachers: currentSubjectTeachers,
          nepaliDateStr: nepaliDate,
        }),
      });
      const json = await res.json();
      if (json.success && json.base64) {
        const a = document.createElement("a");
        a.href = json.base64;
        a.download = `${selectedSubject}_${customTopic.slice(0, 20)}_thumbnail.png`.replace(/\s+/g, "_");
        a.click();
      }
    } catch (err) {
      alert("Failed to download thumbnail PNG");
    } finally {
      setDownloadingPng(false);
    }
  };

  // Subject Teacher Management
  const currentEditingAccount = accounts.find((a) => a.accountName === editingAccountName);

  // Toggle active status of a teacher
  const handleToggleTeacherActive = (teacherId: string) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.accountName !== editingAccountName) return acc;
        return {
          ...acc,
          teachers: acc.teachers.map((t) => (t.id === teacherId ? { ...t, isActive: !t.isActive } : t)),
        };
      })
    );
  };

  // Add a new teacher to current subject
  const handleAddTeacher = () => {
    if (!newTeacherName.trim()) return;
    const newT: TeacherItem = {
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newTeacherName.trim(),
      isActive: true,
    };
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.accountName !== editingAccountName) return acc;
        return { ...acc, teachers: [...acc.teachers, newT] };
      })
    );
    setNewTeacherName("");
  };

  // Remove teacher from subject
  const handleRemoveTeacher = (teacherId: string) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.accountName !== editingAccountName) return acc;
        return { ...acc, teachers: acc.teachers.filter((t) => t.id !== teacherId) };
      })
    );
  };

  // Save subject & teacher configuration
  const handleSaveSubjectConfig = async () => {
    if (!currentEditingAccount) return;
    setSavingAccountCfg(true);
    setSaveSuccessMsg(null);

    try {
      const res = await fetch("/api/zoom-youtube/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_subject_config",
          accountName: editingAccountName,
          teachers: currentEditingAccount.teachers,
          currentTopic: currentEditingAccount.currentTopic,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveSuccessMsg(`Settings saved for ${editingAccountName}!`);
        setTimeout(() => setSaveSuccessMsg(null), 3000);
      }
    } catch {
      alert("Failed to save teacher configuration");
    } finally {
      setSavingAccountCfg(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-500" />
          <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400">Loading Thumbnail Studio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full flex-1">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <Palette className="w-6 h-6 text-slate-900 dark:text-white" />
            <span>YouTube Thumbnail Studio</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Pick from 6 attractive designs, configure multi-teacher assignments per subject, and auto-upload branded 1080p thumbnails with Nepali Bikram Sambat dates.
          </p>
        </div>

        {/* Global Auto-Upload Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleAutoUpload}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border transition shadow-xs ${
              autoUploadThumbnail
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                : "bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800"
            }`}>
            <span className={`w-2 h-2 rounded-full ${autoUploadThumbnail ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            <span>{autoUploadThumbnail ? "Auto-Upload to YouTube: ON" : "Auto-Upload: OFF"}</span>
          </button>
        </div>
      </div>

      {/* ================= SECTION 1: LIVE 1280x720 PREVIEW & CONTROLS ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: 16:9 Canvas Preview */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Live 16:9 Thumbnail Canvas (1280 × 720)
              </span>
              {previewTemplateId === activeTemplateId ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Active Template
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                  Previewing Only
                </span>
              )}
            </div>

            {/* Quick Template Switcher Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {THUMBNAIL_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPreviewTemplateId(t.id)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition shrink-0 ${
                    previewTemplateId === t.id
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                      : "text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-900"
                  }`}>
                  {t.name.split(" ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Canvas Box (Exact 16:9 aspect ratio) */}
          <div className="w-full aspect-video rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-black shadow-lg relative group flex items-center justify-center">
            <div
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block pointer-events-none"
              dangerouslySetInnerHTML={{ __html: previewSvg }}
            />
          </div>

          {/* Canvas Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Style: <strong>{THUMBNAIL_TEMPLATES.find((t) => t.id === previewTemplateId)?.name}</strong> —{" "}
              {THUMBNAIL_TEMPLATES.find((t) => t.id === previewTemplateId)?.tagline}
            </p>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownloadPng}
                disabled={downloadingPng}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl hover:bg-slate-50 dark:hover:bg-zinc-800 transition shadow-xs disabled:opacity-50">
                {downloadingPng ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{downloadingPng ? "Rendering PNG..." : "Download 1080p PNG"}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetActiveTemplate(previewTemplateId)}
                disabled={savingTemplate || previewTemplateId === activeTemplateId}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl shadow-xs transition disabled:opacity-50 ${
                  previewTemplateId === activeTemplateId
                    ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                    : "bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900"
                }`}>
                {savingTemplate ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : previewTemplateId === activeTemplateId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{previewTemplateId === activeTemplateId ? "Active Template" : "Set as Active for YouTube"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Preview Controls */}
        <div className="lg:col-span-4 border border-slate-200 dark:border-zinc-800 rounded-2xl p-5 bg-white dark:bg-zinc-950 space-y-4 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" />
              <span>Canvas Controls</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">1280 × 720</span>
          </div>

          {/* Subject Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
              Subject / Zoom Account
            </label>
            <select
              value={selectedSubject}
              onChange={(e) => {
                const s = e.target.value;
                setSelectedSubject(s);
                const matched = accounts.find((a) => a.accountName === s);
                if (matched?.currentTopic) {
                  setCustomTopic(matched.currentTopic);
                }
              }}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white">
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.accountName}>
                  {acc.accountName} {acc.isActive ? "" : "(Inactive)"}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic Topic Title Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
              <span>Lesson Topic Title</span>
              <span className="text-[10px] text-slate-400">Devanagari / English</span>
            </label>
            <textarea
              rows={2}
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. प्रकाश र अपवर्तन (Optics & Refraction)"
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white resize-none"
            />
          </div>

          {/* Calendar Date Picker with Automatic Bikram Sambat (BS) Conversion */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
              <span>Class Date (Auto-Converts to Nepali BS)</span>
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
            </label>
            <input
              type="date"
              value={dateInput}
              onChange={(e) => handleDateChange(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
            />
            {/* Converted Authentic Nepali BS Date Display */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-900 dark:text-amber-300">
              <span className="flex items-center gap-1.5">
                <span>🇳🇵</span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">नेपाली मिति (वि.सं.):</span>
              </span>
              <span className="font-bold tracking-wide">{nepaliDate}</span>
            </div>
          </div>

          {/* Active Teacher Display */}
          <div className="p-3 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Active Instructor(s) on Thumbnail
            </span>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {currentSubjectTeachers.join(" & ")}
            </p>
            <p className="text-[10px] text-slate-400">
              Change instructors below in Subject &amp; Teacher Manager.
            </p>
          </div>
        </div>
      </div>

      {/* ================= SECTION 2: TEMPLATE GALLERY (ALL 6 DESIGNS) ================= */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
            <span>Choose Your Active Template (6 Professional Designs)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Select any template to set it as the default for all future automated Zoom-to-YouTube uploads.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {THUMBNAIL_TEMPLATES.map((tmpl) => {
            const isActive = tmpl.id === activeTemplateId;
            const isPreviewing = tmpl.id === previewTemplateId;

            // Generate miniature SVG preview
            const miniSvg = generateThumbnailSvg({
              templateId: tmpl.id,
              subject: selectedSubject,
              topic: customTopic,
              teachers: currentSubjectTeachers,
              nepaliDateStr: nepaliDate,
            });

            return (
              <div
                key={tmpl.id}
                className={`border rounded-2xl overflow-hidden bg-white dark:bg-zinc-950 transition flex flex-col ${
                  isActive
                    ? "border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20 shadow-md"
                    : isPreviewing
                    ? "border-zinc-900 dark:border-white shadow-xs"
                    : "border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700"
                }`}>
                {/* 16:9 Thumbnail Image */}
                <div
                  className="w-full aspect-video bg-black cursor-pointer relative group overflow-hidden flex items-center justify-center"
                  onClick={() => setPreviewTemplateId(tmpl.id)}>
                  <div
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:block pointer-events-none"
                    dangerouslySetInnerHTML={{ __html: miniSvg }}
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    <span className="px-3 py-1.5 rounded-lg bg-white/90 text-zinc-900 text-xs font-bold shadow-md flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      Preview on Canvas
                    </span>
                  </div>

                  {isActive && (
                    <div className="absolute top-2.5 right-2.5">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-xs">
                        <Check className="w-3 h-3 stroke-[3]" />
                        Active
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Info & Select Button */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {tmpl.name}
                      </h4>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-800">
                        {tmpl.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2">
                      {tmpl.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPreviewTemplateId(tmpl.id)}
                      className="flex-1 py-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-xl transition">
                      Preview
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetActiveTemplate(tmpl.id)}
                      disabled={isActive || savingTemplate}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50 ${
                        isActive
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold"
                          : "bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900"
                      }`}>
                      {isActive ? "✓ Active" : "Choose Active"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= SECTION 3: SUBJECT & TEACHER MANAGEMENT ================= */}
      <div className="border border-slate-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 p-6 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-700 dark:text-zinc-300" />
              <span>Subject &amp; Teacher Assignment</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Assign multiple teachers per subject and toggle who is currently active. Also set current unit/chapter topics.
            </p>
          </div>

          {/* Subject Tab Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {accounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => setEditingAccountName(acc.accountName)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition shrink-0 ${
                  editingAccountName === acc.accountName
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-xs"
                    : "bg-slate-100 dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800"
                }`}>
                {acc.accountName}
              </button>
            ))}
          </div>
        </div>

        {currentEditingAccount && (
          <div className="space-y-6 animate-in fade-in-50 duration-150">
            {/* Subject Default Topic */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-900 dark:text-white">
                  Current Chapter / Topic for {editingAccountName}
                </label>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  When Zoom records a generic meeting room, Vidia automatically pulls this topic for thumbnails and titles.
                </p>
                <input
                  type="text"
                  value={currentEditingAccount.currentTopic}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAccounts((prev) =>
                      prev.map((acc) =>
                        acc.accountName === editingAccountName ? { ...acc, currentTopic: val } : acc
                      )
                    );
                  }}
                  placeholder="e.g. विद्युत र चुम्बकत्व (Electricity & Magnetism)"
                  className="w-full text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
                />
              </div>

              {/* Add New Teacher */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-900 dark:text-white">
                  Add Instructor for {editingAccountName}
                </label>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  Type teacher name with title (e.g. Er. Ramesh Bhattarai, Prof. K.P. Sharma).
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTeacher())}
                    placeholder="Teacher name..."
                    className="flex-1 text-xs px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddTeacher}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl transition shadow-xs">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Teacher List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  Assigned Instructors ({currentEditingAccount.teachers.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  Check the box to mark who is currently active / teaching today.
                </span>
              </div>

              {currentEditingAccount.teachers.length === 0 ? (
                <div className="p-4 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl text-center text-xs text-slate-400">
                  No teachers added yet for {editingAccountName}. Add one above!
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {currentEditingAccount.teachers.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                        t.isActive
                          ? "bg-slate-50 dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 shadow-xs"
                          : "bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800 opacity-60"
                      }`}>
                      <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={t.isActive}
                          onChange={() => handleToggleTeacherActive(t.id)}
                          className="w-4 h-4 rounded text-zinc-900 focus:ring-zinc-900 dark:focus:ring-white border-slate-300 dark:border-zinc-700 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {t.name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {t.isActive ? "Active (Shown on thumbnail)" : "Inactive"}
                          </p>
                        </div>
                      </label>

                      <button
                        type="button"
                        onClick={() => handleRemoveTeacher(t.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition"
                        title="Remove teacher">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save Button for Subject Config */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-zinc-800">
              {saveSuccessMsg ? (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {saveSuccessMsg}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Changes will apply automatically to future thumbnail renders.
                </span>
              )}

              <button
                type="button"
                onClick={handleSaveSubjectConfig}
                disabled={savingAccountCfg}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-100 dark:text-zinc-900 rounded-xl transition shadow-xs disabled:opacity-50">
                {savingAccountCfg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{savingAccountCfg ? "Saving..." : `Save ${editingAccountName} Config`}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
