"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card, Button, Input } from "@/shared/components";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";

const LOG_LEVEL_COLORS = {
  LOG: "text-success",
  INFO: "text-info",
  WARN: "text-warning",
  ERROR: "text-danger",
  DEBUG: "text-primary",
};

function colorLine(line) {
  if (typeof line !== "string" || line.length === 0) {
    return <span className="text-success"></span>;
  }

  // Capture the first bracketed tag: "[ERROR] ...", "[WARN] ...", "[INFO] ...", etc.
  const match = line.match(/\[(\w+)\]/);
  const rawTag = match ? match[1] : null;
  const levelTag = rawTag ? rawTag.toUpperCase() : null;

  // Fallback: scan for level keywords when no bracket tag is present.
  let color;
  if (levelTag && LOG_LEVEL_COLORS[levelTag]) {
    color = LOG_LEVEL_COLORS[levelTag];
  } else {
    const lower = line.toLowerCase();
    if (/\berror\b|\bfail(ed|ure)?\b|\bexception\b/.test(lower)) {
      color = "text-danger";
    } else if (/\bwarn(ing)?\b|\bdeprecat/.test(lower)) {
      color = "text-warning";
    } else if (/\bdebug\b|\btrace\b/.test(lower)) {
      color = "text-primary";
    } else if (/\binfo\b|\bready\b|\bstarted\b|\brunning\b/.test(lower)) {
      color = "text-info";
    } else {
      color = "text-success";
    }
  }

  return <span className={color}>{line}</span>;
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const logRef = useRef(null);
  const searchRef = useRef(null);

  const handleClear = async () => {
    try {
      await fetch("/api/console-logs", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    if (paused) {
      queueMicrotask(() => setConnected(false));
      return undefined;
    }

    const es = new EventSource("/api/console-logs/stream");

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "init") {
          setLogs(msg.logs.slice(-CONSOLE_LOG_CONFIG.maxLines));
        } else if (msg.type === "line") {
          setLogs((prev) => {
            const next = [...prev, msg.line];
            return next.length > CONSOLE_LOG_CONFIG.maxLines
              ? next.slice(-CONSOLE_LOG_CONFIG.maxLines)
              : next;
          });
        } else if (msg.type === "lines") {
          setLogs((prev) => {
            const next = [...prev, ...msg.lines];
            return next.length > CONSOLE_LOG_CONFIG.maxLines
              ? next.slice(-CONSOLE_LOG_CONFIG.maxLines)
              : next;
          });
        } else if (msg.type === "clear") {
          setLogs([]);
        }
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [paused]);

  // Auto-scroll to bottom on new logs (skip while user is reading history).
  const isAtBottomRef = useRef(true);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 60;
      isAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!logRef.current || !isAtBottomRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // "/" focuses search; Escape clears it.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearchQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((line) => String(line).toLowerCase().includes(q));
  }, [logs, searchQuery]);

  const levelCounts = useMemo(() => {
    const counts = { ERROR: 0, WARN: 0 };
    for (const line of logs) {
      const s = String(line);
      if (/\berror\b|\bfail(ed|ure)?\b|\bexception\b/i.test(s)) counts.ERROR++;
      else if (/\bwarn(ing)?\b/i.test(s)) counts.WARN++;
    }
    return counts;
  }, [logs]);

  return (
    <div className="flex w-full flex-col gap-3">
      <Card padding="none">
        <div className="flex flex-col gap-2 border-b border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-medium ${
                paused
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : connected
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-danger/30 bg-danger/10 text-danger"
              }`}
              role="status"
              aria-live="polite"
              title={
                paused
                  ? "Stream paused"
                  : connected
                  ? "Connected to live server console"
                  : "Disconnected — retrying automatically"
              }
            >
              <span className="relative flex size-1.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                    paused ? "bg-warning" : connected ? "bg-success" : "bg-danger"
                  }`}
                />
                <span
                  className={`relative inline-flex size-1.5 rounded-full ${
                    paused ? "bg-warning" : connected ? "bg-success" : "bg-danger"
                  }`}
                />
              </span>
              {paused ? "Paused" : connected ? "Live" : "Reconnecting…"}
            </span>

            <span className="text-text-muted tabular-nums">
              {filteredLogs.length === logs.length
                ? `${logs.length} line${logs.length === 1 ? "" : "s"}`
                : `${filteredLogs.length} / ${logs.length} lines`}
            </span>

            {levelCounts.ERROR > 0 && (
              <span className="rounded-sm bg-danger/10 px-1.5 py-0.5 font-medium text-danger tabular-nums">
                {levelCounts.ERROR} error{levelCounts.ERROR === 1 ? "" : "s"}
              </span>
            )}
            {levelCounts.WARN > 0 && (
              <span className="rounded-sm bg-warning/10 px-1.5 py-0.5 font-medium text-warning tabular-nums">
                {levelCounts.WARN} warn
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56 sm:w-64">
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter logs (press /)..."
                icon="search"
                aria-label="Filter console logs"
                inputClassName="h-8 text-xs bg-[#111116] border-border focus:border-primary placeholder:text-text-muted/50 rounded-sm font-mono"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={paused ? "play_arrow" : "pause"}
              onClick={() => setPaused((value) => !value)}
              aria-label={paused ? "Resume live log stream" : "Pause live log stream"}
              className="h-8 text-xs px-3 rounded-sm border-border bg-surface hover:bg-surface-2 transition active:scale-95 flex items-center gap-1.5"
            >
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon="delete"
              onClick={handleClear}
              aria-label="Clear console logs"
              className="h-8 text-xs px-3 rounded-sm border-border bg-surface hover:bg-surface-2 text-text-muted hover:text-danger hover:border-danger/40 transition active:scale-95 flex items-center gap-1.5"
            >
              Clear
            </Button>
          </div>
        </div>

        <div
          ref={logRef}
          className="bg-black rounded-b-sm p-3 text-xs font-mono h-[calc(100vh-260px)] overflow-y-auto"
        >
          {logs.length === 0 ? (
            <span className="text-text-muted">No console logs yet.</span>
          ) : filteredLogs.length === 0 ? (
            <span className="text-text-muted">
              No lines match &quot;{searchQuery}&quot;.
            </span>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((line, i) => (
                <div key={`${i}-${String(line).slice(0, 24)}`} className="whitespace-pre-wrap break-words">
                  {colorLine(line)}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
