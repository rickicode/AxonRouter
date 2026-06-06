"use client";

import AppIcon from "@/shared/components/AppIcon";
import { ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { debounce } from "@tanstack/pacer";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useUrlQueryControls } from "@/shared/hooks";
import Pagination from "@/shared/components/Pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/shared/utils/cn";
import { AI_PROVIDERS, MORPH_MANAGED_PROVIDER_ID, getProviderByAlias } from "@/shared/constants/providers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DataState } from "@/shared/components/data";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

let moduleProviderNameCache: Record<string, any> | null = null;
let moduleProviderNodesCache: Record<string, string> | null = null;

async function fetchProviderNames() {
  if (moduleProviderNameCache && moduleProviderNodesCache) {
    return { providerNameCache: moduleProviderNameCache, providerNodesCache: moduleProviderNodesCache };
  }

  const nodesRes = await fetch("/api/provider-nodes");
  const nodesData = await nodesRes.json();
  const nodes = nodesData.nodes || [];
  moduleProviderNodesCache = {};

  for (const node of nodes) {
    moduleProviderNodesCache[node.id] = node.name;
  }

  moduleProviderNameCache = {
    ...AI_PROVIDERS,
    ...moduleProviderNodesCache
  };

  return { providerNameCache: moduleProviderNameCache, providerNodesCache: moduleProviderNodesCache };
}

function getProviderName(providerId, cache) {
  if (!providerId) return "Unknown provider";
  if (providerId === MORPH_MANAGED_PROVIDER_ID) return AI_PROVIDERS[MORPH_MANAGED_PROVIDER_ID]?.name || "Morph Fast Models";
  if (!cache) return providerId;

  const cached = cache[providerId];

  if (typeof cached === 'string') {
    return cached;
  }

  if (cached?.name) {
    return cached.name;
  }

  const providerConfig = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
  return providerConfig?.name || providerId || "Unknown provider";
}

function CollapsibleSection({ title, children, defaultOpen = false, icon = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-border rounded overflow-hidden bg-bg">
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-bg-subtle hover:bg-bg-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <AppIcon name={icon} size={18} className="text-text-muted" />}
          <span className="font-semibold text-sm text-text-main">{title}</span>
        </div>
        <ChevronRight
          className={cn(
            "h-5 w-5 text-text-muted transition-transform duration-200",
            isOpen ? "rotate-90" : ""
          )}
          strokeWidth={2}
        />
      </button>
      
      {isOpen && (
        <div className="p-4 border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

function getTrace(detail) {
  return detail?.providerResponse?.trace || detail?.response?.trace || detail?.request?.trace || null;
}

function getInputTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return null;
  const prompt = tokens.prompt_tokens ?? tokens.input_tokens;
  const cache = tokens.cached_tokens ?? tokens.cache_read_input_tokens;

  if (prompt === undefined && cache === undefined) return null;
  if (prompt === undefined) return cache;
  if (cache === undefined) return prompt;
  return prompt < cache ? cache : prompt;
}

function fmtTokens(n) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtLatency(n) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v}ms`;
}

function fmtTraceValue(value) {
  if (typeof value === "string" && value.trim().length === 0) return "—";
  return value || "—";
}

function hasPayload(value) {
  if (!value) return false;
  if (typeof value !== "object") return true;
  return Object.keys(value).length > 0;
}

function prettyJson(value) {
  return value == null ? "[No payload]" : JSON.stringify(value, null, 2);
}

function prettyContent(value) {
  if (value === null || value === undefined || value === "") return "[No content]";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function getOutputTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return null;
  return tokens.completion_tokens ?? tokens.output_tokens ?? null;
}

function getTraceSummary(detail) {
  return detail?.traceSummary || null;
}

function getUsageStateLabel(tokens) {
  const inputTokens = getInputTokens(tokens);
  const outputTokens = getOutputTokens(tokens);
  if (inputTokens === null && outputTokens === null) return "Unknown";
  return null;
}

function getDetailTrace(detail) {
  return getTrace(detail);
}

function getPayloadForRender(value) {
  return hasPayload(value) ? prettyJson(value) : "[No payload]";
}

export default function RequestDetailsTab() {
  const [details, setDetails] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalItems: 0,
    totalPages: 0
  });
  const [loading, setLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [providers, setProviders] = useState([]);
  const [providerNameCache, setProviderNameCache] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayResult, setReplayResult] = useState(null);
  const [draftFilters, setDraftFilters] = useState({
    provider: "",
    startDate: "",
    endDate: ""
  });
  const [filters, setFilters] = useState({
    provider: "",
    startDate: "",
    endDate: ""
  });
  const detailsScrollRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual keeps request-detail pages responsive with larger page sizes.
  const detailsVirtualizer = useVirtualizer({
    count: details.length,
    getScrollElement: () => detailsScrollRef.current,
    estimateSize: () => 76,
    overscan: 8,
  });

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/usage/providers");
      const data = await res.json();
      setProviders(data.providers || []);

      const cache = await fetchProviderNames();
      setProviderNameCache(cache.providerNameCache);
    } catch (error) {
      console.error("Failed to fetch providers:", error);
    }
  }, []);

  const fetchDetails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString()
      });
      if (filters.provider) params.append("provider", filters.provider);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

      const res = await fetch(`/api/usage/request-details?${params}`);
      const data = await res.json();

      setDetails(data.details || []);
      setPagination(prev => ({ ...prev, ...data.pagination }));
    } catch (error) {
      console.error("Failed to fetch request details:", error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, filters]);

  const applyFilters = useMemo(
    () =>
      debounce((nextFilters: typeof filters) => {
        setPagination(prev => ({ ...prev, page: 1 }));
        setFilters(nextFilters);
      }, { key: "request-details-filters", wait: 350 }),
    []
  );

  const updateDraftFilters = useCallback((nextFilters: typeof filters) => {
    setDraftFilters(nextFilters);
    applyFilters(nextFilters);
  }, [applyFilters]);

  useEffect(() => {
    Promise.resolve().then(fetchProviders);
  }, [fetchProviders]);

  useEffect(() => {
    Promise.resolve().then(fetchDetails);
  }, [fetchDetails]);

  const handleViewDetail = async (detail) => {
    setSelectedDetail(detail);
    setReplayResult(null);
    setIsDrawerOpen(true);
    setLoadingDetail(true);

    try {
      const res = await fetch(`/api/usage/request-details/${detail.id}`);
      const data = await res.json();
      if (res.ok && data.detail) {
        setSelectedDetail(data.detail);
      }
    } catch (error) {
      console.error("Failed to fetch request detail by id:", error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize) => {
    setPagination(prev => ({ ...prev, pageSize: newPageSize, page: 1 }));
  };

  const handleClearFilters = () => {
    const emptyFilters = { provider: "", startDate: "", endDate: "" };
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleReplay = async (detailId, execute = false) => {
    setReplayLoading(true);
    try {
      const res = await fetch(`/api/usage/request-details/${detailId}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ execute }),
      });
      const data = await res.json();
      if (res.ok) setReplayResult(data);
    } catch (error) {
      console.error("Failed to replay request detail:", error);
    } finally {
      setReplayLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end justify-between gap-3 overflow-x-auto whitespace-nowrap">
            <div className="grid min-w-[180px] gap-2">
              <Label>Provider</Label>
              <Select
                value={draftFilters.provider || "all"}
                onValueChange={(value) => updateDraftFilters({ ...draftFilters, provider: value === "all" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid min-w-[220px] gap-2">
              <Label htmlFor="start-date-filter">Start date</Label>
              <Input
                id="start-date-filter"
                type="datetime-local"
                value={draftFilters.startDate}
                onChange={(e) => updateDraftFilters({ ...draftFilters, startDate: e.target.value })}
              />
            </div>

            <div className="grid min-w-[220px] gap-2">
              <Label htmlFor="end-date-filter">End date</Label>
              <Input
                id="end-date-filter"
                type="datetime-local"
                value={draftFilters.endDate}
                onChange={(e) => updateDraftFilters({ ...draftFilters, endDate: e.target.value })}
              />
            </div>

            <div className="flex min-w-fit flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-transparent" aria-hidden="true">Actions</span>
              <Button
                variant="ghost"
                className="shrink-0 border border-border bg-secondary"
                onClick={handleClearFilters}
                disabled={!draftFilters.provider && !draftFilters.startDate && !draftFilters.endDate}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden">
        <div ref={detailsScrollRef} className="max-h-[720px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="p-4 text-sm font-semibold text-foreground">Timestamp</TableHead>
              <TableHead className="p-4 text-sm font-semibold text-foreground">Model</TableHead>
              <TableHead className="p-4 text-sm font-semibold text-foreground">Provider</TableHead>
              <TableHead className="p-4 text-sm font-semibold text-foreground">Trace</TableHead>
              <TableHead className="p-4 text-right text-sm font-semibold text-foreground">Input Tokens</TableHead>
              <TableHead className="p-4 text-right text-sm font-semibold text-foreground">Output Tokens</TableHead>
              <TableHead className="p-4 text-sm font-semibold text-foreground">Latency</TableHead>
              <TableHead className="p-4 text-center text-sm font-semibold text-foreground">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody style={details.length > 0 ? { height: detailsVirtualizer.getTotalSize(), position: "relative" } : undefined}>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="p-8">
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-10/12" />
                  </div>
                </TableCell>
              </TableRow>
            ) : details.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-6">
                  <DataState title="No request details found" description="Try a different provider or date range." icon="search" />
                </TableCell>
              </TableRow>
            ) : (
              detailsVirtualizer.getVirtualItems().map((virtualRow) => {
                const detail = details[virtualRow.index];
                const traceSummary = getTraceSummary(detail);
                const usageStateLabel = getUsageStateLabel(detail.tokens);
                return (
                <TableRow
                  key={`${detail.id}-${virtualRow.index}`}
                  className="absolute left-0 right-0 grid grid-cols-[180px_minmax(160px,1fr)_160px_180px_130px_130px_140px_110px] hover:bg-muted/40"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TableCell className="p-4 text-sm text-foreground">
                    {new Date(detail.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="p-4 font-mono text-sm text-foreground">
                    {detail.model}
                  </TableCell>
                  <TableCell className="p-4 text-sm text-foreground">
                    <span className="font-medium">
                      {getProviderName(detail.provider, providerNameCache)}
                    </span>
                  </TableCell>
                  <TableCell className="p-4 text-sm text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <div>{fmtTraceValue(traceSummary?.mode)}</div>
                      <div className="font-mono text-xs">{fmtTraceValue(traceSummary?.lastEventType)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="p-4 text-right font-mono text-sm text-foreground">
                    {fmtTokens(getInputTokens(detail.tokens))}
                  </TableCell>
                  <TableCell className="p-4 text-right font-mono text-sm text-foreground">
                    {fmtTokens(getOutputTokens(detail.tokens))}
                  </TableCell>
                  <TableCell className="p-4 text-sm text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <div>TTFT: <span className="font-mono">{fmtLatency(detail.latency?.ttft)}</span></div>
                      <div>Total: <span className="font-mono">{fmtLatency(detail.latency?.total)}</span></div>
                      {usageStateLabel ? <div className="text-xs">Usage: {usageStateLabel}</div> : null}
                    </div>
                  </TableCell>
                  <TableCell className="p-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDetail(detail)}
                    >
                      Detail
                    </Button>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>

        {!loading && details.length > 0 && (
          <div className="border-t border-border">
            <Pagination
              className="px-2 py-2"
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        )}
      </Card>

      <Sheet open={isDrawerOpen} onOpenChange={(open) => !open && setIsDrawerOpen(false)}>
        <SheetContent side="right" className="w-[min(100vw,37.5rem)] overflow-y-auto sm:max-w-[37.5rem]">
          <SheetHeader>
            <SheetTitle>Request Details</SheetTitle>
            <SheetDescription>Inspect translated request data, route traces, and replay output.</SheetDescription>
          </SheetHeader>
          {selectedDetail && (
          <div className="mt-4 space-y-6">
            {(() => {
              const detailTrace = getDetailTrace(selectedDetail);
              const traceSummary = getTraceSummary(selectedDetail);
              const usageStateLabel = getUsageStateLabel(selectedDetail.tokens);
              return (
                <>
            {loadingDetail ? (
              <div className="flex flex-col gap-3 rounded-[4px] border border-border bg-card/40 p-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleReplay(selectedDetail.id, false)} disabled={replayLoading}>
                {replayLoading ? <Spinner className="size-4" /> : null}
                Build Replay Payload
              </Button>
              <Button variant="secondary" size="sm" onClick={() => handleReplay(selectedDetail.id, true)} disabled={replayLoading}>
                {replayLoading ? <Spinner className="size-4" /> : null}
                Execute Replay
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">ID:</span>{" "}
                <span className="font-mono text-foreground">{selectedDetail.id}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Timestamp:</span>{" "}
                <span className="text-foreground">{new Date(selectedDetail.timestamp).toLocaleString()}</span>
              </div>
              <div>
                 <span className="text-muted-foreground">Provider:</span>{" "}
                 <span className="font-medium text-foreground">{getProviderName(selectedDetail.provider, providerNameCache)}</span>
               </div>
              <div>
                <span className="text-muted-foreground">Model:</span>{" "}
                <span className="font-mono text-foreground">{selectedDetail.model}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{" "}
                <Badge variant={selectedDetail.status === "success" ? "secondary" : "destructive"}>
                  {selectedDetail.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Latency:</span>{" "}
                <span className="font-mono text-foreground">
                  TTFT {fmtLatency(selectedDetail.latency?.ttft)} / Total {fmtLatency(selectedDetail.latency?.total)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Input Tokens:</span>{" "}
                <span className="font-mono text-foreground">
                  {fmtTokens(getInputTokens(selectedDetail.tokens))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Output Tokens:</span>{" "}
                <span className="font-mono text-foreground">
                  {fmtTokens(getOutputTokens(selectedDetail.tokens))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Trace:</span>{" "}
                <span className="font-mono text-foreground">
                  {fmtTraceValue(traceSummary?.mode)} / {fmtTraceValue(traceSummary?.lastEventType)}
                </span>
              </div>
              {usageStateLabel ? (
                <div>
                  <span className="text-muted-foreground">Usage State:</span>{" "}
                  <span className="text-foreground">{usageStateLabel}</span>
                </div>
              ) : null}
            </div>
            <Separator />
            
            <div className="space-y-4">
              <CollapsibleSection title="1. Client Request (Input)" defaultOpen={true} icon="input">
                <pre className="bg-bg-subtle p-4 rounded overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-border">
                  {getPayloadForRender(selectedDetail.request)}
                </pre>
              </CollapsibleSection>

              {hasPayload(selectedDetail.providerRequest) && (
                <CollapsibleSection title="2. Provider Request (Translated)" icon="translate">
                  <pre className="bg-bg-subtle p-4 rounded overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-border">
                    {prettyJson(selectedDetail.providerRequest)}
                  </pre>
                </CollapsibleSection>
              )}

              {hasPayload(selectedDetail.providerResponse) && (
                <CollapsibleSection title="3. Provider Response (Raw)" icon="data_object">
                  <pre className="bg-bg-subtle p-4 rounded overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-border">
                    {typeof selectedDetail.providerResponse === 'object'
                      ? prettyJson(selectedDetail.providerResponse)
                      : selectedDetail.providerResponse
                    }
                  </pre>
                </CollapsibleSection>
              )}

              {detailTrace && (
                <CollapsibleSection title="3b. Route Decision Trace" icon="route">
                  <pre className="bg-bg-subtle p-4 rounded overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-border">
                    {prettyJson(detailTrace)}
                  </pre>
                </CollapsibleSection>
              )}
              
              {replayResult && (
                <CollapsibleSection title="3c. Replay Result" icon="history">
                  <div className="space-y-3">
                    {replayResult.comparison && (
                      <div className="rounded border border-border bg-bg-subtle p-3 text-sm text-text-main">
                        <div className="font-medium">Changed: {replayResult.comparison.changed ? "Yes" : "No"}</div>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-wide text-text-muted">Previous</div>
                            <pre className="max-h-[160px] overflow-auto text-xs font-mono">{JSON.stringify(replayResult.comparison.previousContent, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="mb-1 text-xs uppercase tracking-wide text-text-muted">Replay</div>
                            <pre className="max-h-[160px] overflow-auto text-xs font-mono">{JSON.stringify(replayResult.comparison.nextContent, null, 2)}</pre>
                          </div>
                        </div>
                      </div>
                    )}
                    <pre className="bg-bg-subtle p-4 rounded overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-border">
                      {JSON.stringify(replayResult, null, 2)}
                    </pre>
                  </div>
                </CollapsibleSection>
              )}

              <CollapsibleSection title="4. Client Response (Final)" defaultOpen={true} icon="output">
                {selectedDetail.response?.thinking && (
                  <div className="mb-4">
                    <h4 className="font-semibold text-text-main mb-2 flex items-center gap-2 text-xs uppercase tracking-wide opacity-70">
                      <AppIcon name="psychology" size={16} />
                      Thinking Process
                    </h4>
                    <pre className="bg-[var(--color-warning-soft)] p-4 rounded overflow-auto max-h-[200px] text-xs font-mono text-[var(--color-warning)] border border-[var(--color-warning-border)]">
                      {selectedDetail.response.thinking}
                    </pre>
                  </div>
                )}
                
                <h4 className="font-semibold text-text-main mb-2 text-xs uppercase tracking-wide opacity-70">
                  Content
                </h4>
                <pre className="bg-bg-subtle p-4 rounded overflow-auto max-h-[300px] text-xs font-mono text-text-main border border-border">
                  {prettyContent(selectedDetail.response?.content)}
                </pre>
              </CollapsibleSection>
            </div>
                </>
              );
            })()}
          </div>
        )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
