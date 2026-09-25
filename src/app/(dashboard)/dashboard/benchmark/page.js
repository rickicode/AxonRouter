"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "@/lib/ui/navigation.js";
import { Badge, Button, Card, Combobox, ConfirmModal, Input, Modal, SegmentedControl } from "@/shared/components";
import BenchmarkResults from "./components/BenchmarkResults";
import BenchmarkLogs from "./components/BenchmarkLogs";
import BenchmarkInspector from "./components/BenchmarkInspector";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import Icon from "@/shared/components/Icon";

const SUITES = [
  { id: "pong", label: "PONG Gate", subtitle: "Liveness test (mandatory prerequisite to unlock test suites)", icon: "bolt" },
  { id: "coding", label: "Coding Benchmark", subtitle: "Python TokenBucketRateLimiter (thread-safe lock verification)", icon: "code" },
  { id: "logic", label: "Logic Deduction", subtitle: "Four professions and vehicles deduction puzzle", icon: "psychology" },
  { id: "tool", label: "Tool Calling", subtitle: "Native function calling (Jakarta weather query)", icon: "build" },
];

const REVIEWER_PRESETS = [
  { id: "judge-router", label: "judge-router" },
  { id: "ag/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4.1 Flash" },
  { id: "kcf/deepseek-v3", label: "Kilo DeepSeek V3" },
];

const MODEL_PRESETS = [
  { id: "free", label: "Free Models", icon: "savings" },
  { id: "coding", label: "Coding Champions", icon: "code" },
  { id: "fast", label: "Flash & Fast", icon: "bolt" },
  { id: "all", label: "All Active", icon: "select_all" },
  { id: "clear", label: "Clear Selection", icon: "clear_all" },
];

const TABS = [
  { value: "configure", label: "Configure" },
  { value: "results", label: "Results" },
  { value: "history", label: "History" },
];

const TAB_COPY = {
  configure: {
    title: "Benchmark Configuration",
    body: "Pick the test suites, target models, and reviewer judge, then run the benchmark against your gateway.",
  },
  results: {
    title: "Benchmark Results",
    body: "Live run progress, per-attempt results, and today's median performance across every tested model.",
  },
  history: {
    title: "Execution History",
    body: "Past benchmark runs with retention controls and on-demand AI advisor evaluation.",
  },
};

export default function BenchmarkPage() {
  return (
    <Suspense fallback={null}>
      <BenchmarkContent />
    </Suspense>
  );
}

function BenchmarkContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get("tab");
  const activeTab =
    tabFromUrl && ["configure", "results", "history"].includes(tabFromUrl)
      ? tabFromUrl
      : "configure";
  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/benchmark?${params.toString()}`, { scroll: false });
  };
  const copy = TAB_COPY[activeTab];
  const tabsRef = useRef(null);

  // Keep the active tab visible in the scrollable strip (same as usage page).
  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const active = strip.querySelector('[data-active="true"]');
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, left - 8);
    }
  }, [activeTab]);
  // 1. Build catalog of providers with LLM models
  const catalog = useMemo(() => {
    return Object.values(AI_PROVIDERS)
      .filter((provider) => !provider.hidden)
      .map((provider) => {
        const alias = PROVIDER_ID_TO_ALIAS[provider.id] || provider.id;
        const rawModels = getModelsByProviderId(provider.id) || [];
        const models = rawModels
          .filter((model) => (model.kind || model.type || "llm") === "llm")
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            fullId: `${alias}/${m.id}`,
            alias,
            providerId: provider.id,
            providerName: provider.name || provider.id,
          }));
        return {
          id: provider.id,
          alias,
          name: provider.name || provider.id,
          models,
        };
      })
      .filter((p) => p.models.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // State: Permanent active selection for benchmark execution (default: curated free models)
  const [selectedModelIds, setSelectedModelIds] = useState(() => {
    const initial = new Set();
    catalog.forEach((p) => {
      p.models.forEach((m) => {
        const lower = `${m.id} ${m.fullId} ${p.name}`.toLowerCase();
        if (lower.includes("free") || lower.includes("opencode") || lower.includes("kcf") || lower.includes("gemini")) {
          initial.add(m.fullId);
        }
      });
    });
    return initial;
  });

  // State: Modal Staging (buffer selection before user clicks Apply)
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  const [modalSelectedModelIds, setModalSelectedModelIds] = useState(new Set());
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerExpandedProviders, setPickerExpandedProviders] = useState(() => new Set(["antigravity", "kilocode-free"]));

  // State: Reviewer Model Selector Modal
  const [isReviewerModalOpen, setIsReviewerModalOpen] = useState(false);
  const [reviewerPickerSearch, setReviewerPickerSearch] = useState("");
  const [expandedSelectedProviders, setExpandedSelectedProviders] = useState(() => new Set());
  const [suites, setSuites] = useState(["pong", "coding", "logic", "tool"]);
  const [reviewer, setReviewer] = useState("judge-router");

  // State: Detailed Inspector modal
  const [inspectAttempt, setInspectAttempt] = useState(null);

  // State: Live Logs modal
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  // State: Pre-run confirmation modal
  const [showRunConfirmModal, setShowRunConfirmModal] = useState(false);

  // State: Confirm delete modal
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState(null);

  const [jobs, setJobs] = useState([]);
  const [daily, setDaily] = useState([]);
  const [selectedHistoryJobs, setSelectedHistoryJobs] = useState([]);
  const [active, setActive] = useState(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [advising, setAdvising] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [savedRetentionToast, setSavedRetentionToast] = useState(false);

  const activeIdRef = useRef(null);
  useEffect(() => {
    activeIdRef.current = active?.id;
  }, [active?.id]);

  // Reviewer options for Combobox & Modal
  const reviewerModelOptions = useMemo(() => {
    const list = [
      {
        value: "judge-router",
        label: "judge-router",
        subtitle: "Internal automated router judge",
        badge: "Default",
      },
    ];
    catalog.forEach((p) => {
      p.models.forEach((m) => {
        list.push({
          value: m.fullId,
          label: `${m.name} (${m.fullId})`,
          subtitle: p.name,
          badge: p.alias,
        });
      });
    });
    return list;
  }, [catalog]);

  // Active providers derived from selected models
  const activeProviders = useMemo(() => {
    const provs = new Set();
    catalog.forEach((p) => {
      if (p.models.some((m) => selectedModelIds.has(m.fullId))) {
        provs.add(p.id);
      }
    });
    return Array.from(provs);
  }, [catalog, selectedModelIds]);

  // Models grouped by Provider for displaying as tags on main page
  const selectedGroupedByProvider = useMemo(() => {
    const list = [];
    catalog.forEach((provider) => {
      const picked = provider.models.filter((m) => selectedModelIds.has(m.fullId));
      if (picked.length > 0) {
        list.push({
          provider,
          models: picked,
        });
      }
    });
    return list;
  }, [catalog, selectedModelIds]);

  // Filtered catalog for picker modal
  const pickerCatalog = useMemo(() => {
    const q = pickerSearch.toLowerCase().trim();
    if (!q) return catalog;
    return catalog
      .map((provider) => {
        const providerMatch = provider.name.toLowerCase().includes(q) || provider.id.toLowerCase().includes(q);
        const matchingModels = provider.models.filter(
          (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.fullId.toLowerCase().includes(q)
        );
        if (providerMatch) return provider;
        if (matchingModels.length > 0) return { ...provider, models: matchingModels };
        return null;
      })
      .filter(Boolean);
  }, [catalog, pickerSearch]);

  // Refresh data from server with automatic background job adoption
  async function refresh(targetId = null) {
    let idToFetch = targetId !== null ? targetId : activeIdRef.current;
    try {
      const listRes = await fetch("/api/benchmark", { cache: "no-store" });
      if (listRes.ok) {
        const listData = await listRes.json();
        const serverJobs = listData.jobs || [];
        setJobs(serverJobs);
        setDaily(listData.daily || []);

        if (!idToFetch || idToFetch === "pending" || !activeIdRef.current) {
          const ongoing = serverJobs.find((j) => j.status === "running" || j.status === "queued");
          if (ongoing) {
            idToFetch = ongoing.id;
            activeIdRef.current = ongoing.id;
          }
        }
      }

      if (idToFetch && idToFetch !== "pending") {
        const jobRes = await fetch(`/api/benchmark?id=${idToFetch}`, { cache: "no-store" });
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          setActive(jobData);
        }
      }
    } catch (err) {
      console.warn("[benchmark] refresh error:", err.message);
    }
  }

  // Check if any job is running in background
  const isAnyJobRunning = useMemo(() => {
    return (
      starting ||
      active?.status === "running" ||
      active?.status === "queued" ||
      active?.status === "starting" ||
      jobs.some((j) => j.status === "running" || j.status === "queued")
    );
  }, [starting, active?.status, jobs]);

  // Polling with fast tick (3s) when active job is running
  useEffect(() => {
    queueMicrotask(() => refresh());
    const intervalMs = isAnyJobRunning ? 3000 : 8000;
    const timer = setInterval(() => {
      refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isAnyJobRunning]);

  // Load settings on mount
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const d = Number(data?.benchmarkRetentionDays);
        if (Number.isFinite(d)) setRetentionDays(d);
      })
      .catch(() => {});
  }, []);


  function toggleSuite(suiteId) {
    setSuites((prev) => (prev.includes(suiteId) ? prev.filter((s) => s !== suiteId) : [...prev, suiteId]));
  }

  function removeSingleModelTag(fullId) {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      next.delete(fullId);
      return next;
    });
  }

  function removeWholeProvider(providerId) {
    const p = catalog.find((item) => item.id === providerId);
    if (!p) return;
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      p.models.forEach((m) => next.delete(m.fullId));
      return next;
    });
  }

  function toggleSelectedProviderExpand(providerId) {
    setExpandedSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  // Smart Presets handler
  const applyModelPreset = (presetId) => {
    const next = new Set();
    if (presetId === "free") {
      catalog.forEach((p) => {
        p.models.forEach((m) => {
          const lower = `${m.id} ${m.fullId} ${p.name}`.toLowerCase();
          if (lower.includes("free") || lower.includes("opencode") || lower.includes("kcf")) {
            next.add(m.fullId);
          }
        });
      });
    } else if (presetId === "coding") {
      catalog.forEach((p) => {
        p.models.forEach((m) => {
          const lower = m.id.toLowerCase();
          if (
            lower.includes("coder") ||
            lower.includes("code") ||
            lower.includes("claude") ||
            lower.includes("deepseek") ||
            lower.includes("qwen")
          ) {
            next.add(m.fullId);
          }
        });
      });
    } else if (presetId === "fast") {
      catalog.forEach((p) => {
        p.models.forEach((m) => {
          const lower = m.id.toLowerCase();
          if (
            lower.includes("flash") ||
            lower.includes("mini") ||
            lower.includes("lite") ||
            lower.includes("haiku") ||
            lower.includes("turbo")
          ) {
            next.add(m.fullId);
          }
        });
      });
    } else if (presetId === "all") {
      catalog.forEach((p) => {
        p.models.forEach((m) => next.add(m.fullId));
      });
    }
    setSelectedModelIds(next);
  };

  // Modal Open Handler
  function openPickerModal() {
    setModalSelectedModelIds(new Set(selectedModelIds));
    setPickerSearch("");
    setIsPickerModalOpen(true);
  }

  // Modal Apply Handler
  function applyPickerModal() {
    setSelectedModelIds(new Set(modalSelectedModelIds));
    setIsPickerModalOpen(false);
  }

  function toggleModalModel(fullId) {
    setModalSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(fullId)) next.delete(fullId);
      else next.add(fullId);
      return next;
    });
  }

  function toggleModalProviderModels(provider) {
    const allSelected = provider.models.every((m) => modalSelectedModelIds.has(m.fullId));
    setModalSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        provider.models.forEach((m) => next.delete(m.fullId));
      } else {
        provider.models.forEach((m) => next.add(m.fullId));
      }
      return next;
    });
  }

  function togglePickerExpand(providerId) {
    setPickerExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) next.delete(providerId);
      else next.add(providerId);
      return next;
    });
  }

  // Trigger start benchmark flow with safety check
  function handleInitiateBenchmark() {
    if (selectedModelIds.size === 0 || suites.length === 0) return;
    setShowRunConfirmModal(true);
  }

  // Execute benchmark
  async function executeBenchmark() {
    handleTabChange("results");
    setShowRunConfirmModal(false);
    setError("");
    setStarting(true);

    const modelsList = Array.from(selectedModelIds);

    setActive({
      id: "pending",
      status: "starting",
      providers: activeProviders,
      suites,
      reviewer: reviewer || null,
      progress: { done: 0, total: modelsList.length, phase: "Initializing benchmark execution on gateway server..." },
      attempts: [],
      reports: [],
      created_at: new Date().toISOString(),
    });

    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providers: activeProviders,
          models: modelsList,
          suites,
          reviewer: reviewer ? reviewer.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start benchmark");
        setActive(null);
        return;
      }
      activeIdRef.current = data.id;
      await refresh(data.id);
    } catch (err) {
      setError(err.message || "Failed to connect to benchmark API");
      setActive(null);
    } finally {
      setStarting(false);
    }
  }

  async function handleCancelBenchmark() {
    if (!active?.id || active.id === "pending") return;
    setCancelling(true);
    try {
      await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", id: active.id }),
      });
      await refresh(active.id);
    } catch (err) {
      setError(err.message || "Failed to cancel benchmark");
    } finally {
      setCancelling(false);
    }
  }

  async function handleConfirmDeleteJob() {
    const id = confirmDeleteJobId;
    setConfirmDeleteJobId(null);
    if (!id) return;

    try {
      await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (active?.id === id) {
        setActive(null);
        activeIdRef.current = null;
      }
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to delete benchmark record");
    }
  }

  async function handleAskAdvice() {
    if (selectedHistoryJobs.length === 0) return;
    setError("");
    setAdvising(true);
    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "advice", reviewer, jobIds: selectedHistoryJobs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate AI advice");
        return;
      }
      activeIdRef.current = data.id;
      await refresh(data.id);
    } catch (err) {
      setError(err.message || "Failed to generate AI advice");
    } finally {
      setAdvising(false);
    }
  }

  async function handleSaveRetention() {
    const days = Math.max(1, Math.min(365, Number(retentionDays) || 30));
    setRetentionDays(days);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkRetentionDays: days }),
      });
      if (res.ok) {
        setSavedRetentionToast(true);
        setTimeout(() => setSavedRetentionToast(false), 2500);
      } else {
        setError("Failed to save benchmark retention settings");
      }
    } catch (err) {
      setError(err.message || "Failed to save benchmark retention settings");
    }
  }

  const rawAttempts = useMemo(() => active?.attempts || [], [active?.attempts]);

  const counts = useMemo(() => {
    return rawAttempts.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] || 0) + Number(row.n || 1);
        return acc;
      },
      { passed: 0, failed: 0, rate_limited: 0, skipped: 0, cancelled: 0 }
    );
  }, [rawAttempts]);

  const report = active?.reports?.[0];
  const isJobRunning = isAnyJobRunning;

  const progressTotal = active?.progress?.total || selectedModelIds.size || 1;
  const progressDone = active?.progress?.done || 0;
  const progressPct = Math.min(100, Math.round((progressDone / Math.max(progressTotal, 1)) * 100));

  const totalEstimatedCalls = useMemo(() => {
    const suitesCount = suites.includes("pong") ? suites.length + 1 : suites.length;
    return selectedModelIds.size * Math.max(1, suitesCount);
  }, [selectedModelIds.size, suites]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ─── Page Header ─── */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-base font-semibold tracking-tight text-text-main">{copy.title}</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{copy.body}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="md"
            variant="primary"
            icon="play_arrow"
            loading={starting || (isJobRunning && active?.id === "pending")}
            disabled={selectedModelIds.size === 0 || suites.length === 0 || isJobRunning}
            onClick={handleInitiateBenchmark}
            className="shadow-sm font-semibold"
          >
            {isJobRunning ? "Benchmark Running…" : `Run Benchmark (${selectedModelIds.size} Models)`}
          </Button>
        </div>
      </div>

      {/* Sticky control bar: mirrors the usage page so the active view stays
          reachable instead of scrolling off in a long page. */}
      <div className="-mx-3 flex items-center gap-2 border-b border-border bg-bg px-3 py-2 sm:mx-0 sm:rounded-lg sm:border sm:px-3">
        <div
          ref={tabsRef}
          className="tab-scroll-fade w-full min-w-0 overflow-x-auto no-scrollbar"
        >
          <SegmentedControl
            options={TABS}
            value={activeTab}
            onChange={handleTabChange}
            size="touch"
            snap
            className="w-full min-w-max sm:w-auto"
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-sm border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="text-base" name="error" size={18} />
            <span>{error}</span>
          </div>
          <Button
            size="xs"
            variant="ghost"
            icon="close"
            onClick={() => setError("")}
            aria-label="Dismiss error"
            className="shrink-0"
          />
        </div>
      ) : null}

      {activeTab === "configure" && (
        <>
      {/* ─── Suite & Reviewer Configuration Card ─── */}
      <Card
        title="Suite & Reviewer Configuration"
        subtitle="Select benchmark suites to execute and optionally assign an AI reviewer to evaluate outputs"
        icon="tune"
      >
        <div className="space-y-4">
          {/* Suite Selection */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-2">
              Test Suites
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {SUITES.map((s) => {
                const checked = suites.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSuite(s.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") toggleSuite(s.id);
                    }}
                    className={`relative flex items-start gap-3 rounded-lg border p-3 text-left cursor-pointer transition-colors ${
                      checked
                        ? "border-primary/50 bg-primary/5 shadow-xs"
                        : "border-border bg-surface hover:border-border-subtle"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSuite(s.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${s.label}`}
                      className="mt-0.5 rounded border-border text-primary focus:ring-primary size-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium text-sm text-text-main">
                        <Icon name={s.icon} size={16} className="text-primary" />
                        <span>{s.label}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-text-muted leading-relaxed line-clamp-2">{s.subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reviewer Configuration */}
          <div className="border-t border-border pt-3.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted block mb-2">
              Reviewer Judge Model (Optional)
            </span>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-center">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[240px] max-w-md">
                    <Combobox
                      id="reviewer-model-picker"
                      value={reviewer}
                      onChange={(val) => setReviewer(val)}
                      options={reviewerModelOptions}
                      placeholder="Select reviewer judge or type custom alias..."
                      allowCustom
                      clearable
                      icon="psychology"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="format_list_bulleted"
                    onClick={() => setIsReviewerModalOpen(true)}
                    title="Browse all available reviewer models"
                  >
                    Browse Models
                  </Button>
                  {reviewer ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReviewer("")}
                      className="text-xs text-text-muted hover:text-text-main"
                    >
                      No Reviewer
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
                  <span className="text-[11px]">Quick presets:</span>
                  {REVIEWER_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setReviewer(p.id)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors min-h-10 sm:min-h-0 sm:py-0.5 ${
                        reviewer === p.id
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border bg-surface-2 hover:bg-surface-3 text-text-muted"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-left lg:text-right lg:border-l lg:border-border lg:pl-6 text-xs text-text-muted pt-2 lg:pt-0">
                <div className="text-text-main font-semibold text-sm">{selectedModelIds.size} Models Selected</div>
                <div className="text-[11px] text-text-muted mt-0.5">
                  ~{totalEstimatedCalls} estimated calls across {activeProviders.length} providers
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ─── Target Models Card with Smart Presets ─── */}
      <Card
        title="Target Models Under Test"
        subtitle={`${selectedModelIds.size} models from ${selectedGroupedByProvider.length} providers selected. Expand a provider to manage individual model tags.`}
        icon="checklist"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {selectedGroupedByProvider.length > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                icon={expandedSelectedProviders.size === selectedGroupedByProvider.length ? "unfold_less" : "unfold_more"}
                onClick={() => {
                  if (expandedSelectedProviders.size === selectedGroupedByProvider.length) {
                    setExpandedSelectedProviders(new Set());
                  } else {
                    setExpandedSelectedProviders(new Set(selectedGroupedByProvider.map((item) => item.provider.id)));
                  }
                }}
              >
                {expandedSelectedProviders.size === selectedGroupedByProvider.length ? "Collapse All" : "Expand All"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              icon="tune"
              onClick={openPickerModal}
              className="shadow-xs"
            >
              Select Models ({selectedModelIds.size})
            </Button>
            {selectedModelIds.size > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setSelectedModelIds(new Set())}>
                Clear
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3">
          {/* Smart Presets Bar */}
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border text-xs">
            <span className="text-[11px] font-medium text-text-muted mr-1">Smart Presets:</span>
            {MODEL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyModelPreset(p.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm border border-border bg-surface text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors min-h-10 sm:min-h-0 sm:py-1 text-xs"
              >
                <Icon name={p.icon} size={15} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {selectedGroupedByProvider.length > 0 ? (
            <div className="space-y-2">
              {selectedGroupedByProvider.map(({ provider, models }) => {
                const isExpanded = expandedSelectedProviders.has(provider.id);
                return (
                  <div
                    key={provider.id}
                    className="rounded-sm border border-border bg-surface-2 transition-colors hover:border-border-subtle overflow-hidden"
                  >
                    {/* Provider Row */}
                    <div
                      className="flex items-center justify-between gap-3 p-3 cursor-pointer select-none bg-surface-2 hover:bg-surface-3/60 transition-colors"
                      onClick={() => toggleSelectedProviderExpand(provider.id)}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon name="expand_more" size={20} className="text-lg text-text-muted transition-transform duration-200" />
                        <span className="font-semibold text-sm text-text-main truncate">{provider.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-3 text-primary uppercase tracking-wider">
                          {provider.alias}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                          {models.length} {models.length === 1 ? "model" : "models"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-primary font-medium hidden sm:inline">
                          {isExpanded ? "Hide models" : "View models"}
                        </span>
                        <Button
                          size="xs"
                          variant="ghost"
                          icon="delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeWholeProvider(provider.id);
                          }}
                          title={`Remove all models from ${provider.name}`}
                          aria-label={`Remove all models from ${provider.name}`}
                        >
                          <span className="hidden sm:inline">Remove</span>
                        </Button>
                      </div>
                    </div>

                    {/* Model Tags (Expanded) */}
                    {isExpanded ? (
                      <div className="p-3 border-t border-border bg-surface">
                        <div className="flex flex-wrap gap-2">
                          {models.map((m) => (
                            <span
                              key={m.fullId}
                              className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-surface-2 px-2.5 py-1 text-xs text-text-main font-medium group"
                            >
                              <span className="text-text-main font-medium">{m.name}</span>
                              <span className="text-[10px] text-text-muted font-mono opacity-80">
                                ({m.id})
                              </span>
                              <button
                                type="button"
                                onClick={() => removeSingleModelTag(m.fullId)}
                                className="text-text-muted hover:text-rose-400 transition-colors p-0.5 rounded-full hover:bg-surface-3 leading-none size-6 flex items-center justify-center"
                                title={`Remove model ${m.name}`}
                                aria-label={`Remove model ${m.name}`}
                              >
                                <Icon className="text-sm leading-none" name="close" size={18} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-text-muted">
              <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                <Icon className="text-4xl opacity-30 text-primary" name="add_chart" size={18} />
                <span className="font-semibold text-text-main text-base">No Models Selected</span>
                <p className="text-xs text-text-muted leading-relaxed">
                  Choose a quick preset above or click below to browse the model catalog and select target models for benchmark evaluation.
                </p>
                <Button
                  size="md"
                  variant="primary"
                  icon="tune"
                  onClick={openPickerModal}
                  className="mt-2 shadow-sm font-semibold"
                >
                  Browse Model Catalog
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
        </>
      )}

      {activeTab === "results" && (
        <>

      {/* ─── Active Job Live Progress Card ─── */}
      {active ? (
        <Card
          title="Active Benchmark Run"
          subtitle={`Run ID: ${active.id?.slice(0, 8) || "..."} · Started: ${
            active.created_at ? new Date(active.created_at).toLocaleTimeString() : "-"
          }`}
          icon="monitoring"
          action={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon="terminal"
                onClick={() => setIsLogModalOpen(true)}
                disabled={rawAttempts.length === 0}
                title="View live request and AI response logs"
              >
                View Live Logs ({rawAttempts.length})
              </Button>
              {isJobRunning && active.id !== "pending" ? (
                <Button
                  size="sm"
                  variant="danger"
                  icon="cancel"
                  loading={cancelling}
                  onClick={handleCancelBenchmark}
                >
                  Cancel Benchmark
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                icon="refresh"
                onClick={() => refresh(active.id)}
                title="Refresh Status"
              >
                Refresh
              </Button>
              {isJobRunning ? (
                <Badge variant="warning" className="animate-pulse">
                  Running
                </Badge>
              ) : active.status === "completed" ? (
                <Badge variant="success">Completed</Badge>
              ) : active.status === "cancelled" ? (
                <Badge variant="warning">Cancelled</Badge>
              ) : active.status === "review_failed" ? (
                <Badge variant="warning">Review Failed</Badge>
              ) : (
                <Badge variant="error">{active.status || "Failed"}</Badge>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            {/* Progress Bar & Phase Text */}
            <div>
              <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-text-main">
                  {isJobRunning ? (
                    <span className="inline-block size-2 rounded-full bg-emerald-400 animate-ping" />
                  ) : null}
                  {active.progress?.phase ||
                    (active.progress?.currentModel
                      ? `Testing ${active.progress.currentModel} · Suite ${active.progress.currentSuite?.toUpperCase()}`
                      : "Processing benchmark tests…")}
                </span>
                <span className="font-semibold text-text-main font-mono">
                  {progressDone} / {progressTotal} models ({progressPct}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className={`h-full transition-[width] duration-300 ${
                    active.status === "failed"
                      ? "bg-rose-500"
                      : active.status === "cancelled"
                      ? "bg-orange-500"
                      : isJobRunning
                      ? "bg-gradient-to-r from-primary to-emerald-400"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {active.progress?.currentAccount ? (
                <div className="mt-1.5 text-xs text-text-muted flex items-center gap-2 font-mono">
                  <Icon className="text-sm" name="badge" size={18} />
                  <span>Account: {active.progress.currentAccount}</span>
                  {active.progress.retrying ? (
                    <span className="text-amber-400 font-medium">
                      · {active.progress.retrying} in 429 retry queue
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border text-center">
              <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2.5">
                <div className="text-[11px] text-text-muted uppercase">Passed</div>
                <div className="text-xl font-bold text-emerald-400 mt-0.5">{counts.passed || 0}</div>
              </div>
              <div className="rounded-md bg-rose-500/5 border border-rose-500/20 p-2.5">
                <div className="text-[11px] text-text-muted uppercase">Failed</div>
                <div className="text-xl font-bold text-rose-400 mt-0.5">{counts.failed || 0}</div>
              </div>
              <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-2.5">
                <div className="text-[11px] text-text-muted uppercase">Rate Limit (429)</div>
                <div className="text-xl font-bold text-amber-400 mt-0.5">{counts.rate_limited || 0}</div>
              </div>
              <div className="rounded-md bg-slate-500/5 border border-slate-500/20 p-2.5">
                <div className="text-[11px] text-text-muted uppercase">Skipped</div>
                <div className="text-xl font-bold text-slate-400 mt-0.5">{counts.skipped || 0}</div>
              </div>
            </div>

            {/* Reviewer Output */}
            {report ? (
              <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4">
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Icon className="text-base" name="psychology" size={18} />
                  <span>Reviewer Assessment ({report.reviewer})</span>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-main font-sans">
                  {report.report}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* ─── Live Test Results Table ─── */}
      <BenchmarkResults
        attempts={rawAttempts}
        isJobRunning={isJobRunning}
        onInspect={setInspectAttempt}
      />

      {/* ─── Daily Median Summary ─── */}
      <Card
        title="Daily Performance Trends (Median Quality & Latency)"
        subtitle="Aggregated median performance metrics from test attempts executed today (00:00 - now)"
        icon="leaderboard"
        padding="none"
        className="overflow-hidden"
      >
        <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
          <table className="data-table data-table-sticky-first w-full min-w-[760px] text-left text-xs" aria-label="Daily benchmark metrics">
            <thead className="text-xs text-text-muted">
              <tr>
                <th scope="col" className="h-8 px-3 text-left">Model</th>
                <th scope="col" className="h-8 px-3 text-left">PONG Gate (Passed/Total)</th>
                <th scope="col" className="h-8 px-3 text-right">Median Quality</th>
                <th scope="col" className="h-8 px-3 text-right">Median TTFT</th>
                <th scope="col" className="h-8 px-3 text-right">Median Latency</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {daily.map((row) => (
                <tr key={`${row.provider}-${row.model}`}>
                  <td className="py-2 px-3 font-medium text-text-main">{row.model}</td>
                  <td className="py-2 px-3">
                    {row.pong_total ? (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <span className={row.pong_passed === row.pong_total ? "text-success font-semibold" : "text-warning"}>
                          {row.pong_passed}/{row.pong_total}
                        </span>
                        <span className="text-[10px] text-text-muted">
                          ({Math.round((row.pong_passed / row.pong_total) * 100)}%)
                        </span>
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    {row.median_score !== null && row.median_score !== undefined ? (
                      <span
                        className={
                          row.median_score >= 80
                            ? "text-success"
                            : row.median_score >= 50
                            ? "text-warning"
                            : "text-danger"
                        }
                      >
                        {row.median_score}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-text-muted">
                    {row.median_ttft ? `${row.median_ttft}ms` : "-"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-text-muted">
                    {row.median_ms ? `${row.median_ms}ms` : "-"}
                  </td>
                </tr>
              ))}
              {daily.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-text-muted">
                    No benchmark runs recorded for today yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
        </>
      )}

      {activeTab === "history" && (
        <>

      {/* ─── Execution History & AI Advisor ─── */}
      <Card
        title="Benchmark Execution History"
        subtitle="Historical benchmark runs with attempt logs and automated AI advisor evaluation"
        icon="history"
        action={
          <Button
            size="sm"
            icon="psychology"
            variant="secondary"
            loading={advising}
            disabled={selectedHistoryJobs.length === 0 || !reviewer}
            onClick={handleAskAdvice}
          >
            Request AI Advisor ({selectedHistoryJobs.length} Selected)
          </Button>
        }
      >
        <div className="space-y-3">
          {/* Retention Setting Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-sm border border-border bg-surface-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon name="auto_delete" size={18} className="text-base text-text-muted" />
              <span>History Retention: Automatically prune job logs older than</span>
              <input
                type="number"
                min="1"
                max="365"
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                className="w-16 rounded border border-border bg-surface px-2 py-1 text-center font-mono text-xs focus:border-primary focus:outline-none"
              />
              <span>days.</span>
            </div>
            <div className="flex items-center gap-2">
              {savedRetentionToast ? (
                <span className="text-success font-medium">Saved!</span>
              ) : null}
              <Button size="xs" variant="secondary" onClick={handleSaveRetention}>
                Save Retention
              </Button>
            </div>
          </div>

          {/* History List */}
          <div className="divide-y divide-border border border-border rounded-sm overflow-hidden">
            {jobs.map((job) => {
              const isSelected = selectedHistoryJobs.includes(job.id);
              const isCurrent = active?.id === job.id;
              return (
                <div
                  key={job.id}
                  className={`flex items-center justify-between gap-3 p-3 text-xs transition-colors ${
                    isCurrent ? "bg-primary/10" : "hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelectedHistoryJobs((prev) =>
                          prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id]
                        );
                      }}
                      aria-label="Select benchmark run for advice"
                      className="rounded border-border text-primary focus:ring-primary size-4 shrink-0"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        activeIdRef.current = job.id;
                        refresh(job.id);
                        handleTabChange("results");
                      }}
                      className="flex flex-1 items-center justify-between gap-3 text-left min-w-0"
                    >
                      <div className="truncate">
                        <div className="font-semibold text-text-main flex items-center gap-2 truncate">
                          <span>{new Date(job.created_at).toLocaleString()}</span>
                          {isCurrent ? (
                            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold text-[10px]">
                              CURRENT VIEW
                            </span>
                          ) : null}
                        </div>
                        <div className="text-text-muted mt-0.5 truncate text-[11px] font-mono">
                          {(job.providers || []).length} Providers · Suites: {(job.suites || []).join(", ")}
                          {job.reviewer ? ` · Judge: ${job.reviewer}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "success"
                              : job.status === "running" || job.status === "queued"
                              ? "warning"
                              : job.status === "cancelled"
                              ? "default"
                              : "error"
                          }
                          className={`uppercase ${job.status === "running" || job.status === "queued" ? "animate-pulse" : ""}`}
                        >
                          {job.status}
                        </Badge>
                      </div>
                    </button>
                  </div>

                  <Button
                    size="xs"
                    variant="ghost"
                    icon="delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteJobId(job.id);
                    }}
                    title="Delete benchmark record"
                    aria-label="Delete benchmark record"
                    className="shrink-0"
                  />
                </div>
              );
            })}

            {jobs.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted">
                No historical benchmark runs recorded yet.
              </div>
            ) : null}
          </div>
        </div>
      </Card>
        </>
      )}

      {/* ─── Modal 1: Model Catalog Picker ─── */}
      <Modal
        isOpen={isPickerModalOpen}
        onClose={() => setIsPickerModalOpen(false)}
        title="Select Benchmark Target Models"
        size="full"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-xs text-text-muted">
              Selected: <strong className="text-text-main">{modalSelectedModelIds.size}</strong> models
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setIsPickerModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" icon="check" onClick={applyPickerModal} className="shadow-sm font-semibold">
                Apply Selection ({modalSelectedModelIds.size} Models)
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Select the models you want to evaluate, then click Apply Selection.
          </p>

          {/* Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <Input
                placeholder="Search provider or model name..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setModalSelectedModelIds((prev) => {
                    const next = new Set(prev);
                    pickerCatalog.forEach((p) => p.models.forEach((m) => next.add(m.fullId)));
                    return next;
                  });
                }}
              >
                Select All
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setModalSelectedModelIds(new Set())}>
                Clear All
              </Button>
            </div>
          </div>

          {/* Provider List */}
          <div className="space-y-3">
            {pickerCatalog.map((provider) => {
              const totalInProv = provider.models.length;
              const selectedInProv = provider.models.filter((m) => modalSelectedModelIds.has(m.fullId)).length;
              const isAllSelected = totalInProv > 0 && selectedInProv === totalInProv;
              const isPartiallySelected = selectedInProv > 0 && selectedInProv < totalInProv;
              const isExpanded = pickerExpandedProviders.has(provider.id);

              return (
                <div
                  key={provider.id}
                  className={`rounded-sm border transition-colors overflow-hidden bg-surface-2 ${
                    selectedInProv > 0
                      ? "border-primary/50 shadow-xs"
                      : "border-border shadow-2xs hover:border-border"
                  }`}
                >
                  {/* Provider Row */}
                  <div className="flex items-center justify-between p-3 gap-3 bg-surface-2">
                    <div
                      className="flex min-w-0 flex-1 items-center gap-3 cursor-pointer"
                      onClick={() => toggleModalProviderModels(provider)}
                    >
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = isPartiallySelected;
                        }}
                        onChange={() => toggleModalProviderModels(provider)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select all models from ${provider.name}`}
                        className="size-4 rounded border-border text-primary focus:ring-primary shrink-0"
                      />
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-bold text-sm text-text-main truncate block">
                          {provider.name}
                        </span>
                        <span className="text-xs text-text-muted font-mono">{provider.alias}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          selectedInProv > 0
                            ? "bg-primary/10 text-primary"
                            : "bg-surface-3 text-text-muted"
                        }`}
                      >
                        {selectedInProv} / {totalInProv}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePickerExpand(provider.id)}
                        className="size-10 sm:size-8 flex items-center justify-center rounded-sm text-text-muted hover:text-text-main hover:bg-surface-3 transition-colors"
                        title={isExpanded ? "Collapse model list" : "Expand model list"}
                        aria-label={isExpanded ? "Collapse model list" : "Expand model list"}
                      >
                        <Icon name={isExpanded ? "expand_less" : "expand_more"} size={20} className="leading-none" />
                      </button>
                    </div>
                  </div>

                  {/* Model Sub-list (Expanded) */}
                  {isExpanded ? (
                    <div className="border-t border-border bg-surface-2 p-3 space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border text-[11px] text-text-muted">
                        <span>Models ({provider.name}):</span>
                        <div className="flex gap-2 font-medium">
                          <button
                            type="button"
                            onClick={() => {
                              setModalSelectedModelIds((prev) => {
                                const next = new Set(prev);
                                provider.models.forEach((m) => next.add(m.fullId));
                                return next;
                              });
                            }}
                            className="text-primary hover:underline"
                          >
                            Select All
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => {
                              setModalSelectedModelIds((prev) => {
                                const next = new Set(prev);
                                provider.models.forEach((m) => next.delete(m.fullId));
                                return next;
                              });
                            }}
                            className="text-danger hover:underline"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {provider.models.map((model) => {
                          const isModelChecked = modalSelectedModelIds.has(model.fullId);
                          return (
                            <div
                              key={model.fullId}
                              onClick={() => toggleModalModel(model.fullId)}
                              className={`flex items-center justify-between gap-2.5 p-2.5 rounded-sm text-xs cursor-pointer transition-colors border ${
                                isModelChecked
                                  ? "border-primary/50 bg-primary/10 text-text-main font-semibold shadow-xs"
                                  : "border-border bg-surface-3 text-text-muted hover:bg-surface-2 hover:text-text-main"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isModelChecked}
                                  onChange={() => toggleModalModel(model.fullId)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Select model ${model.name}`}
                                  className="size-4 rounded border-border text-primary focus:ring-primary shrink-0"
                                />
                                <div className="min-w-0 flex-1 truncate">
                                  <div className="font-medium truncate text-text-main">{model.name}</div>
                                  <div className="text-[10px] text-text-muted font-mono truncate">{model.id}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* ─── Modal 2: Attempt Inspector ─── */}
      <BenchmarkInspector attempt={inspectAttempt} onClose={() => setInspectAttempt(null)} />

      {/* ─── Modal 3: Reviewer Model Selector Modal ─── */}
      <Modal
        isOpen={isReviewerModalOpen}
        onClose={() => setIsReviewerModalOpen(false)}
        title="Select Reviewer Judge Model"
        size="xl"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-xs text-text-muted truncate max-w-sm">
              Selected: <span className="font-bold text-text-main">{reviewer || "No Reviewer"}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => setIsReviewerModalOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-2">
          <p className="text-xs text-text-muted">
            Choose an AI model to evaluate and summarize benchmark results upon completion.
          </p>

          <div className="border-b border-border pb-2">
            <Input
              placeholder="Search reviewer models..."
              value={reviewerPickerSearch}
              onChange={(e) => setReviewerPickerSearch(e.target.value)}
            />
          </div>

          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setReviewer("judge-router");
                setIsReviewerModalOpen(false);
              }
            }}
            onClick={() => {
              setReviewer("judge-router");
              setIsReviewerModalOpen(false);
            }}
            className={`flex items-center justify-between p-3 rounded-sm border cursor-pointer transition-colors bg-surface-2 ${
              reviewer === "judge-router"
                ? "border-primary/50 bg-primary/10 text-primary font-bold"
                : "border-border hover:border-border text-text-main"
            }`}
          >
            <div>
              <div className="font-semibold text-sm">judge-router</div>
              <div className="text-xs text-text-muted">Internal automated router judge</div>
            </div>
            <Badge variant="default">Default</Badge>
          </div>

          {reviewerModelOptions
            .filter((opt) => opt.value !== "judge-router")
            .filter((opt) => {
              if (!reviewerPickerSearch) return true;
              const q = reviewerPickerSearch.toLowerCase();
              return opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q) || opt.subtitle?.toLowerCase().includes(q);
            })
            .map((opt) => {
              const isSelected = reviewer === opt.value;
              return (
                <div
                  key={opt.value}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setReviewer(opt.value);
                      setIsReviewerModalOpen(false);
                    }
                  }}
                  onClick={() => {
                    setReviewer(opt.value);
                    setIsReviewerModalOpen(false);
                  }}
                  className={`flex items-center justify-between p-3 rounded-sm border cursor-pointer transition-colors bg-surface-2 ${
                    isSelected
                      ? "border-primary/50 bg-primary/10 text-primary font-semibold"
                      : "border-border hover:border-border text-text-main"
                  }`}
                >
                  <div className="truncate pr-2">
                    <div className="font-medium text-xs truncate text-text-main">{opt.label}</div>
                    <div className="text-[10px] text-text-muted font-mono">{opt.value}</div>
                  </div>
                  <Badge variant="primary">{opt.badge}</Badge>
                </div>
              );
            })}
        </div>
      </Modal>

      {/* ─── Modal 4: Live Logs ─── */}
      <BenchmarkLogs
        open={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        attempts={rawAttempts}
        isJobRunning={isJobRunning}
        active={active}
        onRefresh={() => refresh(active?.id)}
        onInspect={setInspectAttempt}
      />

      {/* ─── Modal 5: Pre-run Confirmation Modal ─── */}
      <Modal
        isOpen={showRunConfirmModal}
        onClose={() => setShowRunConfirmModal(false)}
        title="Confirm Benchmark Execution"
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-sm border border-border bg-surface-2 p-3 space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Target Models:</span>
              <span className="font-semibold text-text-main font-mono">{selectedModelIds.size} models</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Active Providers:</span>
              <span className="font-semibold text-text-main font-mono">{activeProviders.length} providers</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Test Suites:</span>
              <span className="font-semibold text-text-main uppercase font-mono">{suites.join(", ")}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Estimated API Calls:</span>
              <span className="font-semibold text-primary font-mono text-sm">~{totalEstimatedCalls} calls</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Reviewer Judge:</span>
              <span className="font-semibold text-text-main font-mono">{reviewer || "None"}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-sm bg-warning/10 border border-warning/30 text-warning text-xs">
            <Icon name="info" size={18} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              This benchmark sends real requests across your configured provider endpoints. Upstream rate limits, token quotas, and provider usage will apply.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => setShowRunConfirmModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon="play_arrow"
              onClick={executeBenchmark}
              className="font-semibold"
            >
              Start Benchmark ({selectedModelIds.size} Models)
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal 6: Delete Confirmation Modal ─── */}
      <ConfirmModal
        isOpen={!!confirmDeleteJobId}
        onClose={() => setConfirmDeleteJobId(null)}
        onConfirm={handleConfirmDeleteJob}
        title="Delete Benchmark Record"
        message="Are you sure you want to delete this historical benchmark run and all of its attempt logs? This action cannot be undone."
        variant="danger"
      />
    </div>
  );
}
