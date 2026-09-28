"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Modal, Button, Input, Badge } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { cn } from "@/shared/utils/cn";

/**
 * Modal for scanning & probing free models for a provider.
 * Streams real-time progress via SSE, retries transient errors up to 3x,
 * and skips paid/insufficient-credit models immediately.
 */
export default function ScanFreeModelsModal({
  isOpen,
  onClose,
  providerId,
  providerAlias,
  connections = [],
  onAddModels,
}) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("free");
  const abortCtrlRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setResults(null);
      setProgress(null);
      setError(null);
      setSelectedIds(new Set());
      setQuery("");
      setActiveTab("free");
    } else {
      abortCtrlRef.current?.abort();
    }
  }, [isOpen]);

  const runScan = async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setScanning(true);
    setError(null);
    setResults({ freeModels: [], paidModels: [], failedModels: [], results: [] });
    setProgress({ current: 0, total: 0, currentModel: "Discovering candidate models..." });

    try {
      const res = await fetch(`/api/providers/${providerId}/scan-free-models?stream=1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({}),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Scan failed with HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;
          let eventType = "message";
          let dataStr = "";

          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr = line.slice(5).trim();
            }
          }

          if (!dataStr) continue;
          let data;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (eventType === "start") {
            setProgress({
              current: 0,
              total: data.totalCandidates,
              currentModel: `Found ${data.totalCandidates} candidates. Starting probe...`,
            });
          } else if (eventType === "probe") {
            setProgress({
              current: data.testedCount,
              total: data.totalCandidates,
              currentModel: data.id,
            });

            setResults((prev) => {
              const currentList = prev?.results ? [...prev.results] : [];
              const exists = currentList.some((r) => r.id === data.id);
              const nextList = exists ? currentList : [...currentList, data];
              const free = nextList.filter((r) => r.ok);
              const paid = nextList.filter((r) => r.isPaid);
              const failed = nextList.filter((r) => !r.ok && !r.isPaid);

              return {
                provider: providerId,
                alias: providerAlias,
                totalCandidates: data.totalCandidates,
                testedCount: data.testedCount,
                freeModels: free,
                paidModels: paid,
                failedModels: failed,
                results: nextList,
              };
            });

            if (data.ok) {
              setSelectedIds((prev) => new Set([...prev, data.id]));
            }
          } else if (eventType === "done") {
            setResults(data);
            const freeIds = new Set((data.freeModels || []).map((m) => m.id));
            setSelectedIds(freeIds);
            setProgress(null);
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err?.message || "Failed to scan free models");
      }
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const allIds = new Set(freeModels.map((m) => m.id));
    setSelectedIds(allIds);
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleAdd = async () => {
    if (!onAddModels || selectedIds.size === 0) return;
    setAdding(true);
    try {
      await onAddModels(Array.from(selectedIds));
      onClose();
    } finally {
      setAdding(false);
    }
  };

  const freeModels = results?.freeModels || [];
  const paidModels = results?.paidModels || [];
  const failedModels = results?.failedModels || [];

  const q = query.trim().toLowerCase();
  const matchesQuery = (m) =>
    !q || m.id.toLowerCase().includes(q) || (m.name || "").toLowerCase().includes(q);

  const tabData = useMemo(() => {
    if (activeTab === "free") return freeModels.filter(matchesQuery);
    if (activeTab === "paid") return paidModels.filter(matchesQuery);
    if (activeTab === "failed") return failedModels.filter(matchesQuery);
    return [];
  }, [activeTab, freeModels, paidModels, failedModels, q]);

  const hasAnyResults = results && (freeModels.length > 0 || paidModels.length > 0 || failedModels.length > 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Scan &amp; Probe Free Models" size="2xl">
      <div className="flex flex-col gap-4">
        <div className="rounded-sm border border-border bg-surface-2 p-3 text-xs text-text-muted leading-relaxed">
          Probe free candidate models for <span className="font-mono font-semibold text-text-main">{providerAlias || providerId}</span> using active connection credentials.
          Transient errors (429, 502, 503) retry up to 3x across rotating connections.
          Paid models (402, insufficient quota) skip immediately without retries.
        </div>

        {error && (
          <div className="rounded-sm border border-danger/40 bg-danger/10 p-3 text-xs text-danger flex items-center gap-2">
            <Icon name="error" size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {connections.length === 0 && !providerId.includes("free") && (
          <div className="rounded-sm border border-warning/40 bg-warning/10 p-3 text-xs text-warning flex items-center gap-2">
            <Icon name="warning" size={16} className="shrink-0" />
            <span>No active connections available for this provider. Add an account first to run model probes.</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            icon="radar"
            onClick={runScan}
            loading={scanning}
            disabled={scanning}
          >
            {scanning ? "Scanning..." : results ? "Rescan" : "Start Scan"}
          </Button>
          {scanning && (
            <Button
              size="sm"
              variant="secondary"
              icon="close"
              onClick={() => abortCtrlRef.current?.abort()}
            >
              Stop
            </Button>
          )}
          {hasAnyResults && (
            <>
              <Badge variant="success">{freeModels.length} Free</Badge>
              <Badge variant="error">{paidModels.length} Paid</Badge>
              <Badge variant="warning">{failedModels.length} Error</Badge>
              {results.totalCandidates > 0 && (
                <span className="text-xs text-text-subtle font-mono">
                  {results.testedCount} / {results.totalCandidates} tested
                </span>
              )}
            </>
          )}
        </div>

        {/* Real-time scanning progress bar */}
        {scanning && progress && (
          <div className="flex flex-col gap-1.5 rounded-sm border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-primary flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Probing: <span className="font-mono text-text-main truncate max-w-xs">{progress.currentModel}</span>
              </span>
              <span className="font-mono text-xs text-primary font-medium">
                {progress.total > 0 ? `${progress.current} / ${progress.total} (${Math.round((progress.current / progress.total) * 100)}%)` : "Initializing..."}
              </span>
            </div>
            {progress.total > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 border border-border">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%` }}
                />
              </div>
            )}
          </div>
        )}

        {hasAnyResults && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("free")}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                    activeTab === "free"
                      ? "bg-success/15 text-success"
                      : "text-text-muted hover:bg-surface-2"
                  )}
                >
                  Free &amp; Active ({freeModels.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("paid")}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                    activeTab === "paid"
                      ? "bg-danger/15 text-danger"
                      : "text-text-muted hover:bg-surface-2"
                  )}
                >
                  Paid / Excluded ({paidModels.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("failed")}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                    activeTab === "failed"
                      ? "bg-warning/15 text-warning"
                      : "text-text-muted hover:bg-surface-2"
                  )}
                >
                  Unreachable ({failedModels.length})
                </button>
              </div>
              <div className="w-full max-w-xs">
                <Input
                  icon="search"
                  placeholder="Filter models..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {activeTab === "free" && freeModels.length > 0 && (
              <div className="flex items-center justify-between text-xs text-text-muted px-0.5">
                <span>{selectedIds.size} of {freeModels.length} free models selected</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-primary hover:underline font-medium text-[11px]"
                  >
                    Select All
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-text-subtle hover:text-text-main font-medium text-[11px]"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            <div className="max-h-80 overflow-y-auto rounded-sm border border-border divide-y divide-border custom-scrollbar">
              {tabData.length === 0 && (
                <div className="p-4 text-center text-xs text-text-subtle">
                  No models found in this tab.
                </div>
              )}
              {tabData.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-2.5 hover:bg-surface-2 transition-colors">
                  {activeTab === "free" && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      className="h-4 w-4 rounded-sm border-border text-primary shrink-0"
                    />
                  )}
                  {activeTab !== "free" && (
                    <Icon
                      name={activeTab === "paid" ? "lock" : "error"}
                      size={16}
                      className={activeTab === "paid" ? "text-danger shrink-0" : "text-warning shrink-0"}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-medium text-text-main">{m.id}</div>
                    {m.name && m.name !== m.id && (
                      <div className="truncate text-[11px] text-text-subtle">{m.name}</div>
                    )}
                    {m.error && (
                      <div className="truncate text-[11px] text-text-subtle" title={m.error}>
                        {m.error}
                      </div>
                    )}
                  </div>
                  {m.ok && m.latencyMs != null && (
                    <span className="shrink-0 rounded-sm bg-success/10 px-1.5 py-0.5 text-[10px] font-mono text-success">
                      {m.latencyMs}ms
                    </span>
                  )}
                  {m.connectionName && (
                    <span
                      className="shrink-0 truncate max-w-[140px] text-[10px] text-text-subtle"
                      title={m.connectionName}
                    >
                      {m.connectionName}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs text-text-muted">
                {selectedIds.size} model{selectedIds.size === 1 ? "" : "s"} selected
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={onClose}>
                  Close
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon="add"
                  onClick={handleAdd}
                  loading={adding}
                  disabled={adding || selectedIds.size === 0}
                >
                  Add Selected {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </Button>
              </div>
            </div>
          </>
        )}

        {!hasAnyResults && !scanning && (
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
