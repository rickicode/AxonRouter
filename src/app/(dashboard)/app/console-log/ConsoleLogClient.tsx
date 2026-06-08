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
  const [isPaused, setIsPaused] = useState(false);
  const [bufferedCount, setBufferedCount] = useState(0);
  const logRef = useRef<HTMLDivElement | null>(null);
  const bufferedLogsRef = useRef<string[]>([]);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is required for high-volume streamed console logs.
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => logRef.current,
    estimateSize: () => 22,
    overscan: 16,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 22,
  });

  const handleTogglePause = () => {
    if (isPaused) {
      // Unpausing: flush buffered logs
      setLogs((prev) => {
        const next = [...prev, ...bufferedLogsRef.current];
        bufferedLogsRef.current = [];
        return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
      });
      setBufferedCount(0);
    }
    setIsPaused(!isPaused);
  };

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      bufferedLogsRef.current = [];
      setBufferedCount(0);
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
        if (isPausedRef.current) {
          bufferedLogsRef.current.push(msg.line);
          if (bufferedLogsRef.current.length > CONSOLE_LOG_CONFIG.maxLines) {
            bufferedLogsRef.current.shift();
          }
          setBufferedCount(bufferedLogsRef.current.length);
        } else {
          setLogs((prev) => {
            const next = [...prev, msg.line];
            return next.length > CONSOLE_LOG_CONFIG.maxLines ? next.slice(-CONSOLE_LOG_CONFIG.maxLines) : next;
          });
        }
      } else if (msg.type === "clear") {
        setLogs([]);
        bufferedLogsRef.current = [];
        setBufferedCount(0);
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
            <div className="flex items-center gap-2">
              <Badge variant={connected ? "default" : "secondary"}>
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                {connected ? (isPaused ? "Paused" : "Live") : "Disconnected"}
              </Badge>
              {isPaused && (
                <Badge variant="outline" className="border-amber-500/20 bg-amber-500/8 text-amber-600 dark:text-amber-400 text-xs">
                  {bufferedCount > 0 ? `${bufferedCount} buffered` : "Paused"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleTogglePause}>
                <AppIcon name={isPaused ? "playarrow" : "pause"} data-icon="inline-start" />
                {isPaused ? "Resume" : "Pause"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <AppIcon name="delete" data-icon="inline-start" />
                Clear
              </Button>
            </div>
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
