"use client";

import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import AppIcon from "@/shared/components/AppIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LOG_LEVEL_COLORS = {
  LOG: "text-[var(--color-success)]",
  INFO: "text-[var(--color-info)]",
  WARN: "text-[var(--color-warning)]",
  ERROR: "text-[var(--color-danger)]",
  DEBUG: "text-[var(--color-purple)]",
};

function colorLine(line) {
  const match = line.match(/\[(\w+)\]/g);
  const levelTag = match ? match[1]?.replace(/\[|\]/g, "") : null;
  const color = LOG_LEVEL_COLORS[levelTag] || "text-[var(--color-success)]";
  return <span className={color}>{line}</span>;
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is required for high-volume streamed console logs.
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => logRef.current,
    estimateSize: () => 22,
    overscan: 16,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 22,
  });

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "init") {
        setLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
      } else if (msg.type === "line") {
        setLogs((prev) => {
          const next = [...prev, msg.line];
          return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
        });
      } else if (msg.type === "clear") {
        setLogs([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (logs.length === 0) return;
    rowVirtualizer.scrollToIndex(logs.length - 1, { align: "end" });
  }, [logs.length, rowVirtualizer]);

  return (
    <div className="">
      <Card>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Badge variant={connected ? "default" : "secondary"}>
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
              {connected ? "Live" : "Disconnected"}
            </Badge>
            <Button size="sm" variant="outline" onClick={handleClear}>
              <AppIcon name="delete" data-icon="inline-start" />
              Clear
            </Button>
          </div>
          <div
            ref={logRef}
            className="h-[calc(100vh-220px)] overflow-y-auto rounded-[4px] bg-[var(--color-editor-bg)] p-4 font-mono text-xs"
          >
            {logs.length === 0 ? (
              <Empty className="border-dashed bg-transparent py-10 font-sans">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <AppIcon name="terminal" />
                  </EmptyMedia>
                  <EmptyTitle>No console logs yet</EmptyTitle>
                  <EmptyDescription>Live translator console output will stream here when available.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const line = logs[virtualRow.index];
                  return (
                    <div
                      key={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute left-0 right-0 break-all py-px leading-snug"
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      {colorLine(line)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
