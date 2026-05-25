"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Card, CardContent } from "@/components/ui/card";
import { translate } from "@/i18n/runtime";
import { DataState } from "@/shared/components/data";

export default function RequestLogger() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const parsedLogs = useMemo(() => logs.map((log, index) => {
    const parts = String(log).split(" | ");
    if (parts.length < 7) return null;
    const status = parts[6];
    return {
      key: `${parts[0]}-${index}`,
      parts,
      isPending: status.includes("PENDING"),
      isFailed: status.includes("FAILED"),
      isSuccess: status.includes("OK"),
    };
  }).filter(Boolean), [logs]);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is required for high-volume request logs.
  const rowVirtualizer = useVirtualizer({
    count: parsedLogs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/usage/request-logs");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (error) {
        console.error("Failed to fetch logs:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;

    let cancelled = false;
    const interval = setInterval(() => {
      if (document.hidden) return;
      void (async () => {
        try {
          const res = await fetch("/api/usage/request-logs");
          if (!cancelled && res.ok) {
            const data = await res.json();
            setLogs(data);
          }
        } catch (error) {
          console.error("Failed to fetch logs:", error);
        }
      })();
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [autoRefresh]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{translate("Request Logs")}</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-[var(--color-text-muted)] flex items-center gap-2 cursor-pointer">
            <span>{translate("Auto Refresh (3s)")}</span>
            <div
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${autoRefresh ? "bg-primary" : "bg-[var(--color-bg)]-subtle border border-[var(--color-border)]"
                }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${autoRefresh ? "translate-x-5" : "translate-x-1"
                  }`}
              />
            </div>
          </label>
        </div>
      </div>

      <Card className="overflow-hidden bg-black/5 dark:bg-black/20">
        <CardContent ref={scrollParentRef} className="max-h-[600px] overflow-x-auto overflow-y-auto p-0 font-mono text-xs">
          {loading && logs.length === 0 ? (
            <DataState variant="loading" title={translate("Loading logs")} description={translate("Fetching recent routed request records.")} className="m-4" />
          ) : logs.length === 0 ? (
            <DataState title={translate("No logs recorded yet.")} description={translate("Routed requests will appear here after traffic is recorded.")} icon="list" className="m-4" />
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="sticky top-0 bg-[var(--color-bg)]-subtle border-b border-[var(--color-border)] z-10">
                <tr>
                  <th className="px-3 py-2 border-r border-[var(--color-border)]">{translate("DateTime")}</th>
                  <th className="px-3 py-2 border-r border-[var(--color-border)]">{translate("Model")}</th>
                  <th className="px-3 py-2 border-r border-[var(--color-border)]">{translate("Provider")}</th>
                  <th className="px-3 py-2 border-r border-[var(--color-border)]">{translate("Account")}</th>
                  <th className="px-3 py-2 border-r border-[var(--color-border)]">{translate("In")}</th>
                  <th className="px-3 py-2 border-r border-[var(--color-border)]">{translate("Out")}</th>
                  <th className="px-3 py-2">{translate("Status")}</th>
                </tr>
              </thead>
              <tbody className="relative divide-y divide-border/50" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = parsedLogs[virtualRow.index];
                  const { parts, isPending, isFailed, isSuccess } = row;

                  return (
                    <tr key={row.key} className={`absolute left-0 right-0 grid grid-cols-[180px_220px_120px_180px_80px_80px_110px] hover:bg-primary/5 transition-colors ${isPending ? 'bg-primary/5' : ''}`} style={{ transform: `translateY(${virtualRow.start}px)` }}>
                      <td className="px-3 py-1.5 border-r border-[var(--color-border)] text-[var(--color-text-muted)]">{parts[0]}</td>
                      <td className="px-3 py-1.5 border-r border-[var(--color-border)] font-medium">{parts[1]}</td>
                      <td className="px-3 py-1.5 border-r border-[var(--color-border)]">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--color-bg)]-subtle border border-[var(--color-border)] text-[10px] uppercase font-bold">
                          {parts[2]}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 border-r border-[var(--color-border)] truncate max-w-[150px]" title={parts[3]}>{parts[3]}</td>
                      <td className="px-3 py-1.5 border-r border-[var(--color-border)] text-right text-[var(--color-primary)]">{parts[4]}</td>
                      <td className="px-3 py-1.5 border-r border-[var(--color-border)] text-right text-success">{parts[5]}</td>
                      <td className={`px-3 py-1.5 font-bold ${isSuccess ? 'text-success' :
                          isFailed ? 'text-error' :
                            'text-[var(--color-primary)] animate-pulse'
                        }`}>
                        {status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      <div className="text-[10px] text-[var(--color-text-muted)] italic">
        {translate("Logs are saved to log.txt in the application data directory.")}
      </div>
    </div>
  );
}
