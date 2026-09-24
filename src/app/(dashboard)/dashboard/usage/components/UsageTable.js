"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import Badge from "@/shared/components/Badge";
import Icon from "@/shared/components/Icon";

const fmt = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
const fmtCost = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const DETAIL_ROW_CAP = 100;

function fmtTime(iso) {
 if (!iso) return "Never";
 const diffMins = Math.floor((Date.now() - new Date(iso)) / 60000);
 if (diffMins < 1) return "Just now";
 if (diffMins < 60) return `${diffMins}m ago`;
 if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
 return new Date(iso).toLocaleDateString("en-US");
}

function SortIcon({ field, currentSort, currentOrder }) {
 if (currentSort !== field) return <span className="ml-1 text-text-muted">↕</span>;
 return <span className="ml-1">{currentOrder === "asc" ? "↑" : "↓"}</span>;
}

SortIcon.propTypes = {
 field: PropTypes.string.isRequired,
 currentSort: PropTypes.string.isRequired,
 currentOrder: PropTypes.string.isRequired,
};

/**
 * Render 3 token or cost cells based on viewMode
 */
function ValueCells({ item, viewMode, isSummary = false }) {
 if (viewMode === "tokens") {
 return (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted text-sm">
 {isSummary && item.promptTokens === undefined ? "—" : fmt(item.promptTokens)}
 </td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted text-sm">
 {item.cachedTokens ? fmt(item.cachedTokens) : "—"}
 </td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted text-sm">
 {isSummary && item.completionTokens === undefined ? "—" : fmt(item.completionTokens)}
 </td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right font-medium text-sm">
 {fmt(item.totalTokens)}
 </td>
 </>
 );
 }
 return (
 <>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted text-sm">
 {isSummary && item.inputCost === undefined ? "—" : fmtCost(item.inputCost)}
 </td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted text-sm">
 {item.cachedCost ? fmtCost(item.cachedCost) : "—"}
 </td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right text-text-muted text-sm">
 {isSummary && item.outputCost === undefined ? "—" : fmtCost(item.outputCost)}
 </td>
 <td className="px-3 sm:px-3 h-8 sm:py-3 text-right font-medium text-warning text-sm">
 {fmtCost(item.totalCost || item.cost)}
 </td>
 </>
 );
}

ValueCells.propTypes = {
 item: PropTypes.object.isRequired,
 viewMode: PropTypes.string.isRequired,
 isSummary: PropTypes.bool,
};

/**
 * Reusable sortable usage table with expandable group rows.
 *
 * @param {object} props
 * @param {string} props.title - Table title
 * @param {Array} props.columns - Column definitions [{field, label}]
 * @param {Array} props.groupedData - Grouped data from groupDataByKey
 * @param {string} props.tableType - Table type key for sort URL params
 * @param {string} props.sortBy - Current sort field
 * @param {string} props.sortOrder - Current sort order
 * @param {function} props.onToggleSort - Sort toggle handler
 * @param {string} props.viewMode - "tokens" or "costs"
 * @param {string} props.storageKey - localStorage key for expanded state
 * @param {function} props.renderGroupLabel - Render group summary first cell content
 * @param {function} props.renderDetailCells - Render detail row custom cells (before value cells)
 * @param {function} props.renderSummaryCells - Render summary row cells after group label (placeholder cols)
 * @param {string} props.emptyMessage - Empty state message
 */
export default function UsageTable({
 title,
 columns,
 groupedData,
 tableType,
 sortBy,
 sortOrder,
 onToggleSort,
 viewMode,
 storageKey,
 renderDetailCells,
 renderSummaryCells,
 emptyMessage,
}) {
 const [expanded, setExpanded] = useState(new Set());

  // Load expanded state from localStorage (deferred: avoid setState sync in effect)
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) setExpanded(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error(`Failed to load ${storageKey}:`, e);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

 // Save expanded state to localStorage
 useEffect(() => {
 try {
 localStorage.setItem(storageKey, JSON.stringify([...expanded]));
 } catch (e) {
 console.error(`Failed to save ${storageKey}:`, e);
 }
 }, [expanded, storageKey]);

 const toggleGroup = useCallback((groupKey) => {
 setExpanded((prev) => {
 const next = new Set(prev);
 next.has(groupKey) ? next.delete(groupKey) : next.add(groupKey);
 return next;
 });
 }, []);

 const valueColumns = useMemo(() => {
 if (viewMode === "tokens") {
 return [
 { field: "promptTokens", label: "Input Tokens" },
 { field: "cachedTokens", label: "Cached" },
 { field: "completionTokens", label: "Output Tokens" },
 { field: "totalTokens", label: "Total Tokens" },
 ];
 }
 return [
 { field: "promptTokens", label: "Input Cost" },
 { field: "cachedCost", label: "Cached Cost" },
 { field: "completionTokens", label: "Output Cost" },
 { field: "cost", label: "Total Cost" },
 ];
 }, [viewMode]);

 const totalColSpan = columns.length + valueColumns.length;

 return (
 <Card className="overflow-hidden">
 {title && (
 <div className="p-3 sm:p-3 border-b border-border bg-surface-2">
 <h3 className="font-semibold text-sm">{title}</h3>
 </div>
 )}

 {/* Mobile Card List (< sm) */}
 <div className="sm:hidden data-cards">
 {groupedData.length === 0 ? (
 <div className="px-3 py-3 text-center text-xs text-text-muted">
 {emptyMessage}
 </div>
 ) : (
 groupedData.map((group) => {
 const isExpanded = expanded.has(group.groupKey);
 return (
 <div key={group.groupKey} className="p-3 space-y-3">
 <button
 type="button"
 onClick={() => toggleGroup(group.groupKey)}
 className="w-full flex items-center justify-between text-left gap-2 py-1 cursor-pointer"
 >
 <div className="flex items-center gap-2 min-w-0">
 <Icon name="chevron_right" size={18} className={`text-text-muted transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
 <span className={`font-semibold text-xs truncate ${group.summary.pending > 0 ? "text-primary" : "text-text-main"}`}>
 {group.groupKey}
 </span>
 </div>
 <span className="text-xs font-mono font-medium text-warning shrink-0">
 {viewMode === "tokens" ? `${fmt(group.summary.totalTokens)} tok` : fmtCost(group.summary.totalCost || group.summary.cost)}
 </span>
 </button>

 {/* Summary quick stats */}
 <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-border text-[11px]">
 <div>
 <span className="text-text-muted block text-[11px]">Requests</span>
 <span className="font-medium">{fmt(group.summary.requests)}</span>
 </div>
 <div>
 <span className="text-text-muted block text-[11px]">{viewMode === "tokens" ? "Input" : "Input Cost"}</span>
 <span className="font-mono text-text-muted">
 {viewMode === "tokens" ? fmt(group.summary.promptTokens) : fmtCost(group.summary.inputCost)}
 </span>
 </div>
 <div>
 <span className="text-text-muted block text-[11px]">{viewMode === "tokens" ? "Output" : "Output Cost"}</span>
 <span className="font-mono text-text-muted">
 {viewMode === "tokens" ? fmt(group.summary.completionTokens) : fmtCost(group.summary.outputCost)}
 </span>
 </div>
 </div>

  {/* Expanded items */}
  {isExpanded && (
  <div className="mt-2 space-y-3 pl-3 border-l-2 border-primary/30">
  {group.items.slice(0, DETAIL_ROW_CAP).map((item) => (
 <div key={`mobile-item-${item.key}`} className="p-3 rounded-sm bg-surface-2/60 border border-border text-xs space-y-3">
 <div className="flex items-center justify-between gap-2">
 <span className="font-medium text-text-main truncate">
 {item.rawModel || item.accountName || item.keyName || item.endpoint || item.key}
 </span>
 {item.provider && (
 <Badge variant={item.pending > 0 ? "primary" : "neutral"} size="sm">
 {item.provider}
 </Badge>
 )}
 </div>
 <div className="flex items-center justify-between text-[11px] text-text-muted">
 <span>{fmt(item.requests)} reqs</span>
 <span className="font-mono font-medium text-text-main">
 {viewMode === "tokens" ? `${fmt(item.totalTokens)} tok` : fmtCost(item.totalCost || item.cost)}
 </span>
 </div>
  </div>
  ))}
  {group.items.length > DETAIL_ROW_CAP && (
  <p className="text-[11px] text-text-muted pt-1">
  Showing first 100 — refine filters
  </p>
  )}
  </div>
  )}
  </div>
  );
  })
  )}
  </div>

 {/* Desktop Table (sm+) */}
 <div className="hidden sm:block overflow-x-auto">
 <table className="data-table w-full text-sm text-left" aria-label={title || "Usage breakdown table"}>
 <thead className="text-text-muted text-xs">
 <tr>
 {columns.map((col) => {
 const isSorted = sortBy === col.field;
 const sortState = isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : "none";
 return (
  <th
  scope="col"
  key={col.field}
  aria-sort={sortState}
  className={`h-8 text-left text-xs font-medium text-text-muted p-0 ${col.align === "right" ? "text-right" : ""}`}
  >
  <button type="button" onClick={() => onToggleSort(tableType, col.field)}
  aria-label={`Sort by ${col.label}, currently ${isSorted ? (sortOrder === "asc" ? "sorted ascending" : "sorted descending") : "not sorted"}`}
  className={`w-full px-3 sm:px-3 h-8 sm:py-3 cursor-pointer hover:bg-surface-2 text-inherit font-inherit text-xs inline-flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-primary/40 ${col.align === "right" ? "justify-end" : "justify-start"}`}
  >
  <span>{col.label}</span>{" "}
  <SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
  </button>
  </th>
  );
  })}
  {valueColumns.map((col) => {
  const isSorted = sortBy === col.field;
  const sortState = isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : "none";
  return (
  <th
  scope="col"
  key={col.field}
  aria-sort={sortState}
  className="p-0 text-right h-8 text-xs font-medium text-text-muted"
  >
  <button type="button" onClick={() => onToggleSort(tableType, col.field)}
  aria-label={`Sort by ${col.label}, currently ${isSorted ? (sortOrder === "asc" ? "sorted ascending" : "sorted descending") : "not sorted"}`}
  className="w-full px-3 sm:px-3 h-8 sm:py-3 cursor-pointer hover:bg-surface-2 text-inherit font-inherit text-xs inline-flex items-center justify-end gap-1 focus-visible:ring-2 focus-visible:ring-primary/40"
  >
 <span>{col.label}</span>{" "}
 <SortIcon field={col.field} currentSort={sortBy} currentOrder={sortOrder} />
 </button>
 </th>
 );
 })}
 </tr>
 </thead>
 <tbody>
 {groupedData.map((group) => (
 <Fragment key={group.groupKey}>
 {/* Group summary row */}
 <tr
 role="button"
 tabIndex={0}
 aria-expanded={expanded.has(group.groupKey)}
 aria-label={`${group.groupKey} group details`}
 className="group-summary cursor-pointer hover:bg-surface-2 focus:outline-none focus:bg-surface-2"
 onClick={() => toggleGroup(group.groupKey)}
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 toggleGroup(group.groupKey);
 }
 }}
 >
 <th scope="row" className="px-3 sm:px-3 h-8 sm:py-3 font-normal text-left text-xs font-medium text-text-muted">
 <div className="flex items-center gap-2">
 <Icon name="chevron_right" size={18} className={`text-text-muted transition-transform ${expanded.has(group.groupKey) ? "rotate-90" : ""}`} />
 <span className={`font-medium ${group.summary.pending > 0 ? "text-primary" : ""}`}>
 {group.groupKey}
 </span>
 </div>
 </th>
 {renderSummaryCells(group)}
 <ValueCells item={group.summary} viewMode={viewMode} isSummary />
 </tr>
  {/* Detail rows */}
  {expanded.has(group.groupKey) && group.items.slice(0, DETAIL_ROW_CAP).map((item) => (
  <tr
  key={`detail-${item.key}`}
  className="group-detail hover:bg-surface-2"
  >
  {renderDetailCells(item)}
  <ValueCells item={item} viewMode={viewMode} />
  </tr>
  ))}
  {expanded.has(group.groupKey) && group.items.length > DETAIL_ROW_CAP && (
  <tr className="group-detail">
  <td colSpan={totalColSpan} className="px-3 sm:px-3 py-2 text-center text-[11px] text-text-muted">
  Showing first 100 — refine filters
  </td>
  </tr>
  )}
  </Fragment>
 ))}
 {groupedData.length === 0 && (
 <tr>
 <td colSpan={totalColSpan} className="px-3 sm:px-3 py-3 sm:py-3 text-center text-text-muted h-8 text-sm">
 {emptyMessage}
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </Card>
 );
}

UsageTable.propTypes = {
 title: PropTypes.string.isRequired,
 columns: PropTypes.arrayOf(PropTypes.shape({
 field: PropTypes.string.isRequired,
 label: PropTypes.string.isRequired,
 align: PropTypes.string,
 })).isRequired,
 groupedData: PropTypes.array.isRequired,
 tableType: PropTypes.string.isRequired,
 sortBy: PropTypes.string.isRequired,
 sortOrder: PropTypes.string.isRequired,
 onToggleSort: PropTypes.func.isRequired,
 viewMode: PropTypes.string.isRequired,
 storageKey: PropTypes.string.isRequired,
 renderDetailCells: PropTypes.func.isRequired,
 renderSummaryCells: PropTypes.func.isRequired,
 emptyMessage: PropTypes.string.isRequired,
};

// Re-export utilities for use in UsageStats orchestrator
export { fmt, fmtCost, fmtTime };
