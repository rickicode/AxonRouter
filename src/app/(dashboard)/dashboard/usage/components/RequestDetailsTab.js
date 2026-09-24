"use client";

import { useState, useEffect, useCallback } from "react";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Drawer from "@/shared/components/Drawer";
import Pagination from "@/shared/components/Pagination";
import { cn } from "@/shared/utils/cn";
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";
import Icon from "@/shared/components/Icon";

let providerNameCache = null;
let providerNodesCache = null;

async function fetchProviderNames() {
 if (providerNameCache && providerNodesCache) {
 return { providerNameCache, providerNodesCache };
 }

 const nodesRes = await fetch("/api/provider-nodes");
 const nodesData = await nodesRes.json();
 const nodes = nodesData.nodes || [];
 providerNodesCache = {};

 for (const node of nodes) {
 providerNodesCache[node.id] = node.name;
 }

 providerNameCache = {
 ...AI_PROVIDERS,
 ...providerNodesCache
 };

 return { providerNameCache, providerNodesCache };
}

function getProviderName(providerId, cache) {
 if (!providerId) return providerId;
 if (!cache) return providerId;

 const cached = cache[providerId];

 if (typeof cached === 'string') {
 return cached;
 }

 if (cached?.name) {
 return cached.name;
 }

 const providerConfig = getProviderByAlias(providerId) || AI_PROVIDERS[providerId];
 return providerConfig?.name || providerId;
}

function CollapsibleSection({ title, children, defaultOpen = false, icon = null }) {
 const [isOpen, setIsOpen] = useState(defaultOpen);
 
 return (
 <div className="border border-border rounded-sm overflow-hidden">
 <button 
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 className="w-full flex items-center justify-between p-3 bg-surface hover:bg-surface-2 h-8"
 >
 <div className="flex items-center gap-2">
          {icon && <Icon name={icon} size={18} className="text-text-muted" />}
 <span className="font-semibold text-sm text-text-main">{title}</span>
 </div>
          <Icon
            name="chevron_right"
            size={18}
            className={cn(
              "text-text-muted transition-transform",
              isOpen ? "rotate-90" : ""
            )}
          />
 </button>
 
 {isOpen && (
 <div className="p-3 border-t border-border">
 {children}
 </div>
 )}
 </div>
 );
}

function getCachedTokens(tokens) {
 return tokens?.cached_tokens || tokens?.cache_read_input_tokens || 0;
}

function getCacheCreationTokens(tokens) {
 return tokens?.cache_creation_input_tokens || 0;
}

function getInputTokens(tokens) {
 const prompt = tokens?.prompt_tokens || tokens?.input_tokens || 0;
 // Canonical storage keeps prompt cache-inclusive. Legacy Claude rows may have
 // stored prompt cache-exclusive; fall back to cache when it's larger so old
 // rows don't under-report input.
 const cache = getCachedTokens(tokens);
 return prompt < cache ? cache : prompt;
}

export default function RequestDetailsTab({ initialFilters }) {
 const [details, setDetails] = useState([]);
 const [pagination, setPagination] = useState({
 page: 1,
 pageSize: 20,
 totalItems: 0,
 totalPages: 0
 });
 const [loading, setLoading] = useState(false);
 const [fetchError, setFetchError] = useState(null);
 const [selectedDetail, setSelectedDetail] = useState(null);
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);
 const [providers, setProviders] = useState([]);
 const [providerNameCache, setProviderNameCache] = useState(null);
  const [filters, setFilters] = useState({
    provider: "",
    status: "",
    startDate: "",
    endDate: "",
    ...initialFilters,
  });

 const STATUS_OPTIONS = [
 { value: "", label: "All Status" },
 { value: "success", label: "✓ Success (200)" },
 { value: "failed", label: "✗ Request Failed (all errors)" },
 { value: "400", label: "400 Bad Request" },
 { value: "401", label: "401 Unauthorized" },
 { value: "402", label: "402 Payment Required" },
 { value: "403", label: "403 Forbidden" },
 { value: "404", label: "404 Not Found" },
 { value: "408", label: "408 Timeout" },
 { value: "429", label: "429 Rate Limited" },
 { value: "500", label: "500 Internal Error" },
 { value: "502", label: "502 Bad Gateway" },
 { value: "503", label: "503 Unavailable" },
 { value: "504", label: "504 Gateway Timeout" },
 ];

 const fetchProviders = useCallback(async () => {
 try {
 const res = await fetch("/api/usage/providers");
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
 setFetchError(null);
 try {
 const params = new URLSearchParams({
 page: pagination.page.toString(),
 pageSize: pagination.pageSize.toString()
 });
 if (filters.provider) params.append("provider", filters.provider);
 if (filters.status) params.append("status", filters.status);
 if (filters.startDate) params.append("startDate", filters.startDate);
 if (filters.endDate) params.append("endDate", filters.endDate);

 const res = await fetch(`/api/usage/request-details?${params}`);
 if (!res.ok) {
 let errMsg = `Failed to fetch request details (${res.status})`;
 try {
 const errData = await res.json();
 if (errData?.error) errMsg = errData.error;
 } catch {}
 throw new Error(errMsg);
 }
 const data = await res.json();

 setDetails(data.details || []);
 setPagination(prev => ({ ...prev, ...data.pagination }));
 } catch (error) {
 console.error("Failed to fetch request details:", error);
 setFetchError(error.message || "Failed to fetch request details");
 } finally {
 setLoading(false);
 }
 }, [pagination.page, pagination.pageSize, filters]);

 useEffect(() => {
  queueMicrotask(() => fetchProviders());
  }, [fetchProviders]);

  useEffect(() => {
  queueMicrotask(() => fetchDetails());
  }, [fetchDetails]);

 const handleViewDetail = (detail) => {
 setSelectedDetail(detail);
 setIsDrawerOpen(true);
 };

 const handlePageChange = (newPage) => {
 setPagination(prev => ({ ...prev, page: newPage }));
 };

 const handlePageSizeChange = (newPageSize) => {
 setPagination(prev => ({ ...prev, pageSize: newPageSize, page: 1 }));
 };

 const handleClearFilters = () => {
 setFilters({ provider: "", status: "", startDate: "", endDate: "" });
 };

 const getStatusBadge = (detail) => {
 const httpStatus = detail.response?.status || detail.providerResponse?.status || detail.errorCode;
 const isSuccess = detail.status === "success";
 if (isSuccess) return { label: "200 OK", color: "emerald" };
 if (httpStatus) return { label: `HTTP ${httpStatus}`, color: httpStatus === 429 ? "amber" : httpStatus >= 500 ? "rose" : "orange" };
 return { label: detail.status || "Error", color: "rose" };
 };

 return (
 <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1 pt-2">
        <h3 className="text-sm font-semibold text-text-main">Archived Request Traces</h3>
        <p className="text-xs text-text-muted">Full request/response payloads, latency metrics, and upstream error details.</p>
      </div>
 <Card padding="md">
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
 <div className="flex min-w-0 flex-col gap-1.5">
 <label htmlFor="provider-filter" className="text-xs font-medium text-text-muted">Provider</label>
 <select
 id="provider-filter"
 value={filters.provider}
 onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
 className={cn(
 "h-8 px-2.5 rounded-sm border border-border bg-surface",
 "text-sm text-text-main focus:outline-none",
 "w-full min-w-0 cursor-pointer"
 )}
 style={{ colorScheme: 'auto' }}
 >
 <option value="">All Providers</option>
 {providers.map((provider) => (
 <option key={provider.id} value={provider.id}>
 {provider.name}
 </option>
 ))}
 </select>
 </div>

 <div className="flex min-w-0 flex-col gap-1.5">
 <label htmlFor="status-filter" className="text-xs font-medium text-text-muted">Status</label>
 <select
 id="status-filter"
 value={filters.status}
 onChange={(e) => setFilters({ ...filters, status: e.target.value })}
 className={cn(
 "h-8 px-2.5 rounded-sm border border-border bg-surface",
 "text-sm text-text-main focus:outline-none",
 "w-full min-w-0 cursor-pointer"
 )}
 style={{ colorScheme: 'auto' }}
 >
 {STATUS_OPTIONS.map((opt) => (
 <option key={opt.value} value={opt.value}>{opt.label}</option>
 ))}
 </select>
 </div>
 
 <div className="flex min-w-0 flex-col gap-1.5">
 <label htmlFor="start-date-filter" className="text-xs font-medium text-text-muted">Start Date</label>
 <input
 id="start-date-filter"
 type="datetime-local"
 value={filters.startDate}
 onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
 className={cn(
 "h-8 px-2.5 rounded-sm border border-border bg-surface",
 "w-full min-w-0 text-sm text-text-main focus:outline-none",
 )}
 />
 </div>

 <div className="flex min-w-0 flex-col gap-1.5">
 <label htmlFor="end-date-filter" className="text-xs font-medium text-text-muted">End Date</label>
 <input
 id="end-date-filter"
 type="datetime-local"
 value={filters.endDate}
 onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
 className={cn(
 "h-8 px-2.5 rounded-sm border border-border bg-surface",
 "w-full min-w-0 text-sm text-text-main focus:outline-none",
 )}
 />
 </div>
 
 <div className="flex min-w-0 flex-col gap-1.5 justify-end">
 <Button 
 variant="ghost" 
 onClick={handleClearFilters}
 disabled={!filters.provider && !filters.status && !filters.startDate && !filters.endDate}
 className="w-full h-8"
 >
 Clear
 </Button>
 </div>
 </div>
 </Card>

 <Card padding="none" className="overflow-hidden">
 {/* Mobile Card List (< sm) */}
 <div className="sm:hidden data-cards">
 {fetchError ? (
 <div className="p-3 text-center">
 <div role="alert" className="flex flex-col items-center justify-center gap-2 text-danger text-sm">
 <div className="flex items-center gap-1.5 font-medium">
 <Icon name="error" size={18} />
 {fetchError}
 </div>
 <Button
 variant="outline"
 size="sm"
 onClick={fetchDetails}
 className="mt-1 text-xs"
 >
 Retry
 </Button>
 </div>
 </div>
 ) : loading ? (
 <div className="p-3 text-center text-text-muted text-xs">
 <div className="flex items-center justify-center gap-2">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 Loading...
 </div>
 </div>
 ) : details.length === 0 ? (
 <div className="p-3 text-center text-text-muted text-xs">
 No request details found
 </div>
 ) : (
 details.map((detail, index) => {
 const badge = getStatusBadge(detail);
 const isSuccess = detail.status === "success";
 return (
 <div
 key={`mob-detail-${detail.id}-${index}`}
 className="p-3 space-y-3 hover:bg-surface-2"
 >
 {/* Row 1: Status badge, Provider, Time */}
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-1.5 flex-wrap">
 <span
 className={cn(
 "inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-medium border",
 badge.color === "emerald"
 ? "bg-success/10 text-success border-success/30"
 : badge.color === "amber"
 ? "bg-warning/10 text-warning border-warning/30"
 : badge.color === "orange"
 ? "bg-warning/10 text-warning border-warning/30"
 : "bg-danger/10 text-danger border-danger/30"
 )}
 >
          <Icon
            name={isSuccess ? "check_circle" : badge.color === "amber" ? "warning" : "error"}
            size={18}
          />
 {badge.label}
 </span>
 <span className="px-1.5 py-1 rounded-sm bg-surface border border-border text-[11px] font-medium text-text-muted">
 {getProviderName(detail.provider, providerNameCache)}
 </span>
 </div>
 <div className="text-right text-[11px] text-text-muted font-mono whitespace-nowrap">
 <div>{new Date(detail.timestamp).toLocaleDateString("en-US")}</div>
 <div className="text-[11px] text-text-muted/70">{new Date(detail.timestamp).toLocaleTimeString("en-US")}</div>
 </div>
 </div>

 {/* Row 2: Model (break-all font-mono) */}
 <div className="font-mono text-xs font-medium text-text-main break-all" title={detail.model}>
 {detail.model}
 </div>

 {/* Row 3: Stats Grid (In/Cached, Out, Latency) */}
 <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border text-[11px]">
 <div>
 <span className="text-[11px] text-text-muted block">In / Cached</span>
 <div className="font-mono text-text-main">{getInputTokens(detail.tokens).toLocaleString("en-US")}</div>
 {getCachedTokens(detail.tokens) > 0 && (
 <div className="text-[11px] text-success truncate">↻ {getCachedTokens(detail.tokens).toLocaleString("en-US")}</div>
 )}
 </div>
 <div>
 <span className="text-[11px] text-text-muted block">Out</span>
 <div className="font-mono text-text-main">{(detail.tokens?.completion_tokens || 0).toLocaleString("en-US")}</div>
 </div>
 <div>
 <span className="text-[11px] text-text-muted block">Latency</span>
 <div className="font-mono text-text-muted text-[11px]">
 <div>{detail.latency?.ttft || 0}ms <span className="opacity-70">TTFT</span></div>
 <div>{detail.latency?.total || 0}ms <span className="opacity-70">tot</span></div>
 </div>
 </div>
 </div>

 {/* Row 4: Detail button min 44px touch */}
 <div className="pt-1">
 <Button
 variant="outline"
 size="sm"
 onClick={() => handleViewDetail(detail)}
 aria-label={`View detail for ${detail.model} request at ${new Date(detail.timestamp).toLocaleTimeString("en-US")}`}
 className="w-full min-h-[44px] text-xs font-medium flex items-center justify-center gap-1.5"
 >
 <Icon name="visibility" size={18} />
 Detail
 </Button>
 </div>
 </div>
 );
 })
 )}
 </div>

 {/* Desktop Table (sm+) */}
 <div className="hidden sm:block overflow-x-auto">
 <table className="data-table w-full min-w-[980px]" aria-label="Request details table">
 <thead>
 <tr>
 <th scope="col" className="text-left px-3 py-3 text-xs text-text-muted h-8 font-medium">Time</th>
 <th scope="col" className="text-center px-3 py-3 text-xs text-text-muted w-28 h-8 font-medium">Status</th>
 <th scope="col" className="text-left px-3 py-3 text-xs text-text-muted h-8 font-medium">Model</th>
 <th scope="col" className="text-left px-3 py-3 text-xs text-text-muted h-8 font-medium">Provider</th>
 <th scope="col" className="text-right px-3 py-3 text-xs text-text-muted h-8 font-medium">In / Cached</th>
 <th scope="col" className="text-right px-3 py-3 text-xs text-text-muted h-8 font-medium">Out</th>
 <th scope="col" className="text-left px-3 py-3 text-xs text-text-muted h-8 font-medium">Latency</th>
 <th scope="col" className="text-center px-3 py-3 text-xs text-text-muted w-20 h-8 font-medium">Detail</th>
 </tr>
 </thead>
 <tbody>
 {fetchError ? (
 <tr>
 <td colSpan="8" className="p-3 text-center h-8 px-3 text-sm">
 <div role="alert" className="flex flex-col items-center justify-center gap-2 text-danger text-sm">
 <div className="flex items-center gap-1.5 font-medium">
 <Icon name="error" size={18} />
 {fetchError}
 </div>
 <Button
 variant="outline"
 size="sm"
 onClick={fetchDetails}
 className="mt-1 text-xs"
 >
 Retry
 </Button>
 </div>
 </td>
 </tr>
 ) : loading ? (
 <tr>
 <td colSpan="8" className="p-3 text-center text-text-muted h-8 px-3 text-sm">
 <div className="flex items-center justify-center gap-2">
 <Icon className="animate-spin" name="progress_activity" size={18} />
 Loading...
 </div>
 </td>
 </tr>
 ) : details.length === 0 ? (
 <tr>
 <td colSpan="8" className="p-3 text-center text-text-muted h-8 px-3 text-sm">
 No request details found
 </td>
 </tr>
 ) : (
 details.map((detail, index) => {
 const badge = getStatusBadge(detail);
 const isSuccess = detail.status === "success";
 return (
 <tr
 key={`${detail.id}-${index}`}
 className={cn(
 "",
 !isSuccess && "row-failed"
 )}
 >
 <th scope="row" className="whitespace-nowrap px-3 py-3 text-xs text-text-main font-normal text-left h-8 font-medium text-text-muted">
 <div className="font-medium">{new Date(detail.timestamp).toLocaleDateString("en-US")}</div>
 <div className="text-[11px] text-text-muted">{new Date(detail.timestamp).toLocaleTimeString("en-US")}</div>
 </th>
 <td className="px-3 py-3 text-center whitespace-nowrap h-8 text-sm">
 <span
 className={cn(
 "inline-flex items-center gap-1 px-2 py-1 rounded-sm text-[11px] font-medium border",
 badge.color === "emerald"
 ? "bg-success/10 text-success border-success/30"
 : badge.color === "amber"
 ? "bg-warning/10 text-warning border-warning/30"
 : badge.color === "orange"
 ? "bg-warning/10 text-warning border-warning/30"
 : "bg-danger/10 text-danger border-danger/30"
 )}
 >
          <Icon
            name={isSuccess ? "check_circle" : badge.color === "amber" ? "warning" : "error"}
            size={18}
          />
 {badge.label}
 </span>
 </td>
 <td className="max-w-[220px] truncate px-3 py-3 font-mono text-xs text-text-main h-8 text-sm" title={detail.model}>
 {detail.model}
 </td>
 <td className="max-w-[140px] truncate px-3 py-3 text-xs text-text-main h-8 text-sm">
 <span className="font-medium">
 {getProviderName(detail.provider, providerNameCache)}
 </span>
 </td>
 <td className="px-3 py-3 text-xs text-text-main text-right font-mono h-8 text-sm">
 <div>{getInputTokens(detail.tokens).toLocaleString("en-US")}</div>
 {getCachedTokens(detail.tokens) > 0 && (
 <div className="text-[11px] text-success">↻ {getCachedTokens(detail.tokens).toLocaleString("en-US")} cached</div>
 )}
 </td>
 <td className="px-3 py-3 text-xs text-text-main text-right font-mono h-8 text-sm">
 {(detail.tokens?.completion_tokens || 0).toLocaleString("en-US")}
 </td>
 <td className="px-3 py-3 text-[11px] text-text-muted h-8 text-sm">
 <div className="flex flex-col gap-0.5">
 <span className="font-mono">{detail.latency?.ttft || 0}ms <span className="text-text-muted/60">TTFT</span></span>
 <span className="font-mono">{detail.latency?.total || 0}ms <span className="text-text-muted/60">total</span></span>
 </div>
 </td>
 <td className="px-3 py-3 text-center h-8 text-sm">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => handleViewDetail(detail)}
 aria-label={`View detail for ${detail.model} request at ${new Date(detail.timestamp).toLocaleTimeString("en-US")}`}
 className="h-8 px-2 text-xs"
 >
 Detail
 </Button>
 </td>
 </tr>
 );
 })
 )}
 </tbody>
 </table>
 </div>

 {!loading && details.length > 0 && (
 <div className="border-t border-border">
 <Pagination
 currentPage={pagination.page}
 pageSize={pagination.pageSize}
 totalItems={pagination.totalItems}
 onPageChange={handlePageChange}
 onPageSizeChange={handlePageSizeChange}
 />
 </div>
 )}
 </Card>

 <Drawer
 isOpen={isDrawerOpen}
 onClose={() => setIsDrawerOpen(false)}
 title="Request Details"
 width="lg"
 >
 {selectedDetail && (
 <div className="space-y-3">
 <div className="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
 <div>
 <span className="text-text-muted">ID:</span>{" "}
 <span className="break-all font-mono text-text-main">{selectedDetail.id}</span>
 </div>
 <div>
 <span className="text-text-muted">Timestamp:</span>{" "}
 <span className="text-text-main">{new Date(selectedDetail.timestamp).toLocaleString("en-US")}</span>
 </div>
 <div>
 <span className="text-text-muted">Provider:</span>{" "}
 <span className="text-text-main font-medium">{getProviderName(selectedDetail.provider, providerNameCache)}</span>
 </div>
 <div>
 <span className="text-text-muted">Model:</span>{" "}
 <span className="text-text-main font-mono">{selectedDetail.model}</span>
 </div>
 <div>
 <span className="text-text-muted">Status:</span>{" "}
 <span className={cn(
 "font-medium",
 selectedDetail.status === "success" ? "text-success" : "text-danger"
 )}>
 {selectedDetail.status}
 </span>
 </div>
 <div>
 <span className="text-text-muted">Latency:</span>{" "}
 <span className="text-text-main font-mono">
 TTFT {selectedDetail.latency?.ttft || 0}ms / Total {selectedDetail.latency?.total || 0}ms
 </span>
 </div>
 <div>
 <span className="text-text-muted">Input Tokens:</span>{" "}
 <span className="text-text-main font-mono">
 {getInputTokens(selectedDetail.tokens).toLocaleString("en-US")}
 </span>
 </div>
 {getCachedTokens(selectedDetail.tokens) > 0 && (
 <div>
 <span className="text-text-muted">Cached Tokens:</span>{" "}
 <span className="text-text-main font-mono">
 {getCachedTokens(selectedDetail.tokens).toLocaleString("en-US")}
 </span>
 </div>
 )}
 {getCacheCreationTokens(selectedDetail.tokens) > 0 && (
 <div>
 <span className="text-text-muted">Cache Creation:</span>{" "}
 <span className="text-text-main font-mono">
 {getCacheCreationTokens(selectedDetail.tokens).toLocaleString("en-US")}
 </span>
 </div>
 )}
 <div>
 <span className="text-text-muted">Output Tokens:</span>{" "}
 <span className="text-text-main font-mono">
 {selectedDetail.tokens?.completion_tokens?.toLocaleString("en-US") || 0}
 </span>
 </div>
 </div>

 {/* Prominent Error Details Banner */}
 {(selectedDetail.status !== "success" || selectedDetail.error || selectedDetail.response?.error) && (
 <div className="rounded-sm border border-danger/30 bg-danger/10 p-3 space-y-3">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Icon className="text-danger" name="error" size={18} />
 <span className="font-semibold text-danger text-sm">
 Request Error {selectedDetail.response?.status ? `(${selectedDetail.response.status})` : ""}
 </span>
 </div>
 {selectedDetail.response?.status && (
 <span className="font-mono text-xs font-medium px-2 py-1 rounded-sm bg-danger/10 text-danger">
 HTTP {selectedDetail.response.status}
 </span>
 )}
 </div>
 <pre className="max-h-[250px] overflow-auto rounded-sm border border-danger/30 bg-surface/90 p-3 font-mono text-xs text-danger whitespace-pre-wrap break-words border-border bg-surface text-text-main">
 {selectedDetail.error || (typeof selectedDetail.response?.error === 'object' ? JSON.stringify(selectedDetail.response.error, null, 2) : selectedDetail.response?.error) || JSON.stringify(selectedDetail.response, null, 2) || "Error occurred during request processing"}
 </pre>
 </div>
 )}

 {selectedDetail.pxpipe && (
 <div className="rounded-sm border border-border p-3">
 <div className="flex items-center gap-2 mb-2">
 <Icon className="text-text-muted" name="image" size={18} />
 <span className="font-semibold text-sm text-text-main">PXPIPE</span>
 <span className={cn(
 "text-xs px-2 py-1 rounded-sm",
 selectedDetail.pxpipe.applied
 ? "bg-success/10 text-success"
 : "bg-warning/10 text-warning"
 )}>
 {selectedDetail.pxpipe.applied ? "Activated" : "Skipped"}
 </span>
 </div>
 {selectedDetail.pxpipe.applied ? (
 <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
 <div>
 <span className="text-text-muted block text-xs">Original (est.)</span>
 <span className="font-mono">{(selectedDetail.pxpipe.tokensBeforeEst || 0).toLocaleString("en-US")} tokens</span>
 </div>
 <div>
 <span className="text-text-muted block text-xs">Compressed (est.)</span>
 <span className="font-mono">{(selectedDetail.pxpipe.tokensAfterEst || 0).toLocaleString("en-US")} tokens</span>
 </div>
 <div>
 <span className="text-text-muted block text-xs">Saved</span>
 <span className="font-mono text-success">{selectedDetail.pxpipe.savedPct || 0}%</span>
 </div>
 <div>
 <span className="text-text-muted block text-xs">Images</span>
 <span className="font-mono">{selectedDetail.pxpipe.imageCount || 0} ({selectedDetail.pxpipe.durationMs || 0}ms)</span>
 </div>
 </div>
 ) : (
 <p className="text-sm text-text-muted">
 Reason: <span className="font-mono">{selectedDetail.pxpipe.reason}</span>
 {selectedDetail.pxpipe.detail ? ` — ${selectedDetail.pxpipe.detail}` : ""}
 </p>
 )}
 </div>
 )}

 <div className="space-y-3">
 <CollapsibleSection title="1. Client Request (Input)" defaultOpen={true} icon="input">
 <pre className="max-h-[300px] max-w-full overflow-auto rounded-sm border border-border p-3 font-mono text-xs text-text-main sm:p-3 bg-surface">
 {JSON.stringify(selectedDetail.request, null, 2)}
 </pre>
 </CollapsibleSection>

 {selectedDetail.providerRequest && (
 <CollapsibleSection title="2. Provider Request (Translated)" icon="translate">
 <pre className="max-h-[300px] max-w-full overflow-auto rounded-sm border border-border p-3 font-mono text-xs text-text-main sm:p-3 bg-surface">
 {JSON.stringify(selectedDetail.providerRequest, null, 2)}
 </pre>
 </CollapsibleSection>
 )}

 {selectedDetail.providerResponse && (
 <CollapsibleSection title="3. Provider Response (Raw)" icon="data_object">
 <pre className="max-h-[300px] max-w-full overflow-auto rounded-sm border border-border p-3 font-mono text-xs text-text-main sm:p-3 bg-surface">
 {typeof selectedDetail.providerResponse === 'object'
 ? JSON.stringify(selectedDetail.providerResponse, null, 2)
 : selectedDetail.providerResponse
 }
 </pre>
 </CollapsibleSection>
 )}
 
 <CollapsibleSection title="4. Client Response (Final)" defaultOpen={true} icon="output">
 {selectedDetail.response?.error ? (
 <div>
 <h4 className="font-medium text-danger mb-2 text-xs flex items-center gap-1.5">
 <Icon name="error" size={18} />
 Error Response
 </h4>
 <pre className="max-h-[300px] max-w-full overflow-auto rounded-sm border border-danger/30 bg-danger/10 p-3 font-mono text-xs text-danger whitespace-pre-wrap break-words sm:p-3 border-border bg-surface text-text-main">
 {typeof selectedDetail.response.error === "object"
 ? JSON.stringify(selectedDetail.response.error, null, 2)
 : selectedDetail.response.error}
 </pre>
 </div>
 ) : (
 <>
 {selectedDetail.response?.thinking && (
 <div className="mb-3">
 <h4 className="font-medium text-text-main mb-2 flex items-center gap-2 text-xs opacity-70">
 <Icon name="psychology" size={18} />
 Thinking Process
 </h4>
 <pre className="max-h-[200px] max-w-full overflow-auto rounded-sm border border-warning/30 bg-warning/10 p-3 font-mono text-xs text-warning  sm:p-3 border-border bg-surface text-text-main">
 {selectedDetail.response.thinking}
 </pre>
 </div>
 )}
 
 <h4 className="font-medium text-text-main mb-2 text-xs opacity-70">
 Content
 </h4>
 <pre className="max-h-[300px] max-w-full overflow-auto rounded-sm border border-border p-3 font-mono text-xs text-text-main sm:p-3 bg-surface">
 {selectedDetail.response?.content || (selectedDetail.response?.redacted ? "[Redacted]" : "[No content]")}
 </pre>
 </>
 )}
 </CollapsibleSection>
 </div>
 </div>
 )}
 </Drawer>
 </div>
 );
}
