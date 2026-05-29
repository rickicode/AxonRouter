"use client";

import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import PropTypes from "prop-types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DataState } from "@/shared/components/data";

const fmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

function fmtTime(iso: any) {
  if (!iso) return "Never";
  const diffMins = Math.floor((Date.now() - new Date(iso as any).getTime()) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const columnHelper = createColumnHelper<any>();

function SortIcon({ field, currentSort, currentOrder }) {
  if (currentSort !== field) return <span className="ml-1 opacity-20">↕</span>;
  return <span className="ml-1">{currentOrder === "asc" ? "↑" : "↓"}</span>;
}

SortIcon.propTypes = {
  field: PropTypes.string.isRequired,
  currentSort: PropTypes.string.isRequired,
  currentOrder: PropTypes.string.isRequired,
};

function ValueCells({ item, viewMode, isSummary = false }) {
  if (viewMode === "tokens") {
    return (
      <>
        <TableCell className="px-6 py-3 text-right text-muted-foreground">
          {isSummary && item.promptTokens === undefined ? "—" : fmt(item.promptTokens)}
        </TableCell>
        <TableCell className="px-6 py-3 text-right text-muted-foreground">
          {isSummary && item.completionTokens === undefined ? "—" : fmt(item.completionTokens)}
        </TableCell>
        <TableCell className="px-6 py-3 text-right font-medium">
          {fmt(item.totalTokens)}
        </TableCell>
      </>
    );
  }
  return (
    <>
      <TableCell className="px-6 py-3 text-right text-muted-foreground">—</TableCell>
      <TableCell className="px-6 py-3 text-right text-muted-foreground">—</TableCell>
      <TableCell className="px-6 py-3 text-right font-medium text-[var(--color-warning)]">
        {fmtCost(item.totalCost || item.cost)}
      </TableCell>
    </>
  );
}

ValueCells.propTypes = {
  item: PropTypes.object.isRequired,
  viewMode: PropTypes.string.isRequired,
  isSummary: PropTypes.bool,
};

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
  const [expanded, setExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch (e) {
      console.error(`Failed to load ${storageKey}:`, e);
      return new Set();
    }
  });

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
        { field: "completionTokens", label: "Output Tokens" },
        { field: "totalTokens", label: "Total Tokens" },
      ];
    }
    return [
      { field: "promptTokens", label: "Input Cost" },
      { field: "completionTokens", label: "Output Cost" },
      { field: "cost", label: "Total Cost" },
    ];
  }, [viewMode]);

  const totalColSpan = columns.length + valueColumns.length;
  const tableColumns = useMemo(() => {
    const baseColumns = columns.map((column) => columnHelper.accessor(column.field, {
      id: column.field,
      header: () => column.label,
      meta: { align: column.align },
    }));
    const metricColumns = valueColumns.map((column) => columnHelper.accessor(column.field, {
      id: column.field,
      header: () => column.label,
      meta: { align: "right" },
    }));
    return [...baseColumns, ...metricColumns];
  }, [columns, valueColumns]);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table standardizes header/sort metadata for complex usage rows.
  const table = useReactTable({
    data: [],
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });
  const virtualRows = useMemo(() => {
    return groupedData.flatMap((group) => {
      const rows = [{ type: "summary", key: `summary-${group.groupKey}`, group }];
      if (expanded.has(group.groupKey)) {
        rows.push(...group.items.map((item) => ({ type: "detail", key: `detail-${item.key}`, item })));
      }
      return rows;
    });
  }, [expanded, groupedData]);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 54,
    overscan: 8,
  });

  return (
    <Card className="overflow-hidden bg-card/95 shadow-[var(--shadow-card)]">
      {title ? (
        <CardHeader className="border-b border-border bg-muted/40 px-5 py-4">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</CardTitle>
        </CardHeader>
      ) : null}
      <div ref={scrollParentRef} className="max-h-[720px] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/50 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const align = (header.column.columnDef.meta as { align?: string } | undefined)?.align;
                const field = header.column.id;
                return (
                  <TableHead
                    key={header.id}
                    className={cn("px-6 py-3", align === "right" && "text-right")}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn("h-auto rounded-xl px-0 text-[11px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground", align === "right" && "ml-auto")}
                      onClick={() => onToggleSort(tableType, field)}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())} <SortIcon field={field} currentSort={sortBy} currentOrder={sortOrder} />
                    </Button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody style={virtualRows.length > 0 ? { height: rowVirtualizer.getTotalSize(), position: "relative" } : undefined}>
          {virtualRows.length > 0 && rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = virtualRows[virtualRow.index];
            if (row.type === "summary") {
              const { group } = row;
              return (
                <TableRow
                  key={row.key}
                  className="absolute left-0 right-0 grid cursor-pointer bg-card/80 hover:bg-muted/45"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                  onClick={() => toggleGroup(group.groupKey)}
                >
                  <TableCell className="px-6 py-3">
                    <div className="flex items-center gap-2">
                      <ChevronRight className={cn("text-muted-foreground transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]", expanded.has(group.groupKey) && "rotate-90")} />
                      <span className={cn("font-medium transition-colors", group.summary.pending > 0 && "text-primary")}>{group.groupKey}</span>
                    </div>
                  </TableCell>
                  {renderSummaryCells(group)}
                  <ValueCells item={group.summary} viewMode={viewMode} isSummary />
                </TableRow>
              );
            }

            return (
              <TableRow
                key={row.key}
                className="absolute left-0 right-0 grid hover:bg-muted/40"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderDetailCells(row.item)}
                <ValueCells item={row.item} viewMode={viewMode} />
              </TableRow>
            );
          })}
          {groupedData.length === 0 && (
            <TableRow>
              <TableCell colSpan={totalColSpan} className="px-6 py-10">
                <DataState title="No usage data" description={emptyMessage} icon="analytics" />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
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

export { fmt, fmtCost, fmtTime };
