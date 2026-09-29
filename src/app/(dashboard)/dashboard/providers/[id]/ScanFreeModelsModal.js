"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Modal, Button, Input, Badge } from "@/shared/components";
import Icon from "@/shared/components/Icon";
import { cn } from "@/shared/utils/cn";

/**
 * Modal for scanning & probing free models for a provider.
 * Streams real-time progress via SSE, retries transient errors up to 3x,
 * and skips paid/insufficient-credit models immediately.
 *
 * Fully responsive across mobile, tablet, and desktop with throttled
 * state updates to preserve 60fps UI responsiveness during high-throughput probing.
 */
export default function ScanFreeModelsModal({
  isOpen,
  onClose,
  providerId,
  providerAlias,
  connections = [],
  onAddModels,
  isFreeNoAuth = false,
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
  const bufferRef = useRef({ list: [], set: new Set(), total: 0 });
  const animFrameRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setResults(null);
      setProgress(null);
      setError(null);
      setSelectedIds(new Set());
      setQuery("");
      setActiveTab("free");
      bufferRef.current = { list: [], set: new Set(), total: 0 };
    } else {
      abortCtrlRef.current?.abort();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [isOpen]);

  const flushBufferToState = useCallback(() => {
    const { list, set, total } = bufferRef.current;
    if (list.length === 0 && total === 0) return;

    const free = list.filter((r) => r.ok);
    const paid = list.filter((r) => r.isPaid);
    const failed = list.filter((r) => !r.ok && !r.isPaid);

    setResults({
      provider: providerId,
      alias: providerAlias,
      totalCandidates: total,
      testedCount: list.length,
      freeModels: free,
      paidModels: paid,
      failedModels: failed,
      results: [...list],
    });

    // Auto-select free models
    setSelectedIds(new Set(set));
  }, [providerId, providerAlias]);

  const runScan = async () => {
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setScanning(true);
    setError(null);
    setResults({ freeModels: [], paidModels: [], failedModels: [], results: [] });
    setProgress({ current: 0, total: 0, currentModel: "Discovering candidate models..." });
    bufferRef.current = { list: [], set: new Set(), total: 0 };

    let lastFlush = Date.now();

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
            bufferRef.current.total = data.totalCandidates;
            setProgress({
              current: 0,
              total: data.totalCandidates,
              currentModel: `Found ${data.totalCandidates} candidates. Starting probe...`,
            });
          } else if (eventType === "probe") {
            bufferRef.current.total = data.totalCandidates;
            if (!bufferRef.current.list.some((r) => r.id === data.id)) {
              bufferRef.current.list.push(data);
            }
            if (data.ok) {
              bufferRef.current.set.add(data.id);
            }

            setProgress({
              current: data.testedCount,
              total: data.totalCandidates,
              currentModel: data.id,
            });

            // Throttle state update to at most once per 120ms to avoid UI stutter
            const now = Date.now();
            if (now - lastFlush > 120) {
              lastFlush = now;
              flushBufferToState();
            }
          } else if (eventType === "error") {
            flushBufferToState();
            setError(data?.error || "Scan error from server");
          } else if (eventType === "done") {
            setResults(data);
            const freeIds = new Set((data.freeModels || []).map((m) => m.id));
            setSelectedIds(freeIds);
            setProgress(null);
          }
        }
      }

      // Final flush
      flushBufferToState();
    } catch (err) {
      if (err.name !== "AbortError") {
        flushBufferToState();
        if (bufferRef.current.list.length > 0) {
          setError(
            `Koneksi terputus (${err?.message || "Network error"}). ${bufferRef.current.list.length} model yang berhasil diprobe tetap tersimpan di bawah.`
          );
        } else {
          setError(err?.message || "Failed to scan free models");
        }
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
      const cleanIds = Array.from(selectedIds).map((id) =>
        String(id).replace(/^(cline-free|clf)\//, "")
      );
      await onAddModels(cleanIds);
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scan &amp; Probe Free Models"
      size="2xl"
      bodyClassName="p-2.5 sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:gap-4 max-w-full">
        {/* Helper Note */}
        <div className="rounded-sm border border-border bg-surface-2 p-2.5 sm:p-3 text-xs text-text-muted leading-relaxed">
          Probe free candidate models for <span className="font-mono font-semibold text-text-main">{providerAlias || providerId}</span> using active connection credentials.
          Transient errors (429, 502, 503) retry up to 3x across rotating connections.
          Paid models (402, insufficient quota) skip immediately without retries.
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-sm border border-danger/40 bg-danger/10 p-2.5 sm:p-3 text-xs text-danger flex items-start sm:items-center gap-2">
            <Icon name="error" size={16} className="shrink-0 mt-0.5 sm:mt-0" />
            <span className="break-words flex-1">{error}</span>
          </div>
        )}

        {/* Warning if No Active Credentials */}
        {connections.length === 0 && !isFreeNoAuth && !providerId.endsWith("-free") && (
          <div className="rounded-sm border border-warning/40 bg-warning/10 p-2.5 sm:p-3 text-xs text-warning flex items-start sm:items-center gap-2">
            <Icon name="warning" size={16} className="shrink-0 mt-0.5 sm:mt-0" />
            <span className="flex-1">No active connections available for this provider. Add an account first to run model probes.</span>
          </div>
        )}

        {/* Action Controls & Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="primary"
              icon="radar"
              onClick={runScan}
              loading={scanning}
              disabled={scanning}
              className="w-full xs:w-auto"
            >
              {scanning ? "Scanning..." : results ? "Rescan" : "Start Scan"}
            </Button>
            {scanning && (
              <Button
                size="sm"
                variant="secondary"
                icon="close"
                onClick={() => abortCtrlRef.current?.abort()}
                className="w-full xs:w-auto"
              >
                Stop
              </Button>
            )}
          </div>

          {hasAnyResults && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="success" className="text-[10px] sm:text-xs">{freeModels.length} Free</Badge>
              <Badge variant="error" className="text-[10px] sm:text-xs">{paidModels.length} Paid</Badge>
              <Badge variant="warning" className="text-[10px] sm:text-xs">{failedModels.length} Error</Badge>
              {results.totalCandidates > 0 && (
                <span className="text-[10px] sm:text-xs text-text-subtle font-mono ml-0.5">
                  {results.testedCount}/{results.totalCandidates}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Real-time Scanning Progress Bar */}
        {scanning && progress && (
          <div className="flex flex-col gap-1.5 rounded-sm border border-primary/30 bg-primary/5 p-2.5 sm:p-3">
            <div className="flex items-center justify-between text-xs gap-2 min-w-0">
              <span className="font-medium text-primary flex items-center gap-1.5 min-w-0 flex-1">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                <span className="shrink-0">Probing:</span>
                <span className="font-mono text-text-main truncate min-w-0 flex-1">{progress.currentModel}</span>
              </span>
              <span className="font-mono text-[11px] sm:text-xs text-primary font-medium shrink-0">
                {progress.total > 0 ? `${progress.current}/${progress.total} (${Math.round((progress.current / progress.total) * 100)}%)` : "Init..."}
              </span>
            </div>
            {progress.total > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 border border-border">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{ width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* Results Section */}
        {hasAnyResults && (
          <>
            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
              {/* Tab Pills with horizontal scroll on mobile */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 no-scrollbar touch-pan-x shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab("free")}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                    activeTab === "free"
                      ? "bg-success/15 text-success font-semibold"
                      : "text-text-muted hover:bg-surface-2"
                  )}
                >
                  Free ({freeModels.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("paid")}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                    activeTab === "paid"
                      ? "bg-danger/15 text-danger font-semibold"
                      : "text-text-muted hover:bg-surface-2"
                  )}
                >
                  Paid ({paidModels.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("failed")}
                  className={cn(
                    "rounded-sm px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                    activeTab === "failed"
                      ? "bg-warning/15 text-warning font-semibold"
                      : "text-text-muted hover:bg-surface-2"
                  )}
                >
                  Unreachable ({failedModels.length})
                </button>
              </div>

              {/* Filter Search Input */}
              <div className="w-full sm:w-56 shrink-0">
                <Input
                  icon="search"
                  placeholder="Filter models..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  inputClassName="h-8 text-xs"
                />
              </div>
            </div>

            {/* Selection Status & Batch Toggle */}
            {activeTab === "free" && freeModels.length > 0 && (
              <div className="flex items-center justify-between text-xs text-text-muted px-0.5">
                <span className="truncate">{selectedIds.size} of {freeModels.length} selected</span>
                <div className="flex items-center gap-2 shrink-0">
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

            {/* Scrollable Model List */}
            <div className="h-64 sm:h-80 md:h-96 overflow-y-auto rounded-sm border border-border divide-y divide-border custom-scrollbar overscroll-contain">
              {tabData.length === 0 && (
                <div className="p-6 text-center text-xs text-text-subtle">
                  No models found in this tab.
                </div>
              )}
              {tabData.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 p-2.5 hover:bg-surface-2 transition-colors cursor-pointer"
                  onClick={() => activeTab === "free" && toggleSelect(m.id)}
                >
                  <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                    {activeTab === "free" && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 sm:mt-0 h-4 w-4 rounded-sm border-border text-primary shrink-0 cursor-pointer"
                      />
                    )}
                    {activeTab !== "free" && (
                      <Icon
                        name={activeTab === "paid" ? "lock" : "error"}
                        size={16}
                        className={cn("mt-0.5 sm:mt-0 shrink-0", activeTab === "paid" ? "text-danger" : "text-warning")}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-medium text-text-main" title={m.id}>
                        {String(m.id).replace(/^(cline-free|clf)\//, "")}
                      </div>
                      {m.name && m.name !== m.id && (
                        <div className="truncate text-[11px] text-text-subtle" title={m.name}>
                          {m.name}
                        </div>
                      )}
                      {m.error && (
                        <div className="truncate text-[11px] text-danger/80" title={m.error}>
                          {m.error}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metadata Chips: Latency and Connection */}
                  <div className="flex items-center gap-2 pl-6 sm:pl-0 shrink-0 self-start sm:self-center">
                    {m.ok && m.latencyMs != null && (
                      <span className="shrink-0 rounded-sm bg-success/10 px-1.5 py-0.5 text-[10px] font-mono text-success">
                        {m.latencyMs}ms
                      </span>
                    )}
                    {m.connectionName && (
                      <span
                        className="shrink-0 truncate max-w-[120px] sm:max-w-[160px] text-[10px] text-text-subtle"
                        title={m.connectionName}
                      >
                        {m.connectionName}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions Footer */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 border-t border-border pt-3">
              <span className="text-xs text-text-muted text-center sm:text-left">
                {selectedIds.size} model{selectedIds.size === 1 ? "" : "s"} selected
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button size="sm" variant="secondary" onClick={onClose} className="flex-1 sm:flex-initial">
                  Close
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon="add"
                  onClick={handleAdd}
                  loading={adding}
                  disabled={adding || selectedIds.size === 0}
                  className="flex-1 sm:flex-initial"
                >
                  Add Selected {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Empty State Footer */}
        {!hasAnyResults && !scanning && (
          <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button size="sm" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
              Close
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
