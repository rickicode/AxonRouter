"use client";

import { Suspense, useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import PropTypes from "prop-types";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Button, CardSkeleton, SegmentedControl } from "@/shared/components";
import OverviewTab from "../components/OverviewTab";

const EndpointPageClient = dynamic(
  () => import("../endpoint/EndpointPageClient"),
  { ssr: false, loading: () => <CardSkeleton /> }
);

const emptySubscribe = () => () => {};

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "endpoint", label: "Endpoint & Key" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
];

const TAB_COPY = {
  overview: {
    title: "Gateway Overview",
    body: "Gateway status, usage metrics, top providers & models, and recent requests at a glance.",
  },
  endpoint: {
    title: "Endpoint & Key",
    body: "OpenAI-compatible base URLs, quick start integration, and API key management.",
  },
};

// Live gateway health: healthy = Postgres reachable, degraded = DB down but
// app responding, offline = health endpoint unreachable.
const HEALTH_STYLES = {
  healthy: {
    label: "GATEWAY ACTIVE",
    className: "bg-success/10 text-success border-success/30",
    dot: "bg-success",
    ping: "bg-success",
  },
  degraded: {
    label: "DEGRADED",
    className: "bg-warning/10 text-warning border-warning/30",
    dot: "bg-warning",
    ping: "bg-warning",
  },
  offline: {
    label: "OFFLINE",
    className: "bg-danger/10 text-danger border-danger/30",
    dot: "bg-danger",
    ping: "bg-danger",
  },
  checking: {
    label: "CHECKING…",
    className: "bg-surface-3 text-text-muted border-border",
    dot: "bg-text-muted",
    ping: "bg-text-muted",
  },
};

export default function AppPageClient({ machineId }) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <AppContent machineId={machineId} />
    </Suspense>
  );
}

function AppContent({ machineId }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl === "endpoint" ? "endpoint" : "overview";

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const tabsRef = useRef(null);

  // Keep the active tab visible: at 360 the strip is wider than its wrapper, so
  // a tab reached by URL or by deep navigation can sit entirely off-screen.
  useEffect(() => {
    const strip = tabsRef.current;
    if (!strip) return;
    const active = strip.querySelector('[data-active="true"]');
    if (!active) return;
    const left = active.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < strip.scrollLeft || right > strip.scrollLeft + strip.clientWidth) {
      strip.scrollLeft = Math.max(0, left - 8);
    }
  }, [activeTab]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [connections, setConnections] = useState([]);
  const [keys, setKeys] = useState([]);
  const [period, setPeriod] = useState("24h");
  const [health, setHealth] = useState("checking");

  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [statsRes, provRes, keysRes] = await Promise.all([
          fetch(`/api/usage/stats?period=${period}`),
          fetch("/api/providers"),
          fetch("/api/keys"),
        ]);
        if (cancelled) return;
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (!cancelled) setStats(statsData);
        }
        if (provRes.ok) {
          const provData = await provRes.json();
          if (!cancelled) setConnections(provData.connections || []);
        }
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          if (!cancelled) setKeys(keysData.keys || []);
        }
      } catch (err) {
        console.error("[DashboardApp] Error fetching overview data:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [statsRes, provRes, keysRes] = await Promise.all([
        fetch(`/api/usage/stats?period=${period}`),
        fetch("/api/providers"),
        fetch("/api/keys"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (provRes.ok) {
        const p = await provRes.json();
        setConnections(p.connections || []);
      }
      if (keysRes.ok) {
        const k = await keysRes.json();
        setKeys(k.keys || []);
      }
    } catch (err) {
      console.error("[DashboardApp] Error refreshing overview data:", err);
    } finally {
      setRefreshing(false);
    }
  }, [period]);

  // Live health ping: verifies Postgres via /api/health so the status chip
  // reflects reality instead of a static "ACTIVE" badge.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        if (cancelled) return;
        if (!res.ok) {
          setHealth("degraded");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setHealth(data.postgres ? "healthy" : "degraded");
      } catch {
        if (!cancelled) setHealth("offline");
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const copy = TAB_COPY[activeTab];
  const healthStyle = HEALTH_STYLES[health] || HEALTH_STYLES.checking;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-machine-id={machineId}>
      {/* Page header + tab copy (same shape as Usage & Benchmark) */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-base font-semibold tracking-tight text-text-main">{copy.title}</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{copy.body}</p>
        </div>
        {activeTab === "overview" && isClient && (
          <div className="flex flex-wrap shrink-0 items-center gap-2">
            <span
              className={`font-mono text-xs px-2.5 py-1 rounded-sm font-medium border flex items-center gap-1.5 ${healthStyle.className}`}
              role="status"
              aria-live="polite"
              data-testid="gateway-health"
            >
              <span className="relative flex size-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${healthStyle.ping}`} />
                <span className={`relative inline-flex rounded-full size-2 ${healthStyle.dot}`} />
              </span>
              {healthStyle.label}
            </span>
            <SegmentedControl
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              size="touch"
              aria-label="Metrics period"
            />
            <Button
              size="sm"
              variant="secondary"
              icon={refreshing ? "progress_activity" : "refresh"}
              loading={refreshing}
              onClick={handleRefresh}
              aria-label="Refresh overview data"
            >
              Refresh
            </Button>
          </div>
        )}
      </div>

      {/* Control bar: the tab control drives every panel below. */}
      <div className="-mx-3 flex items-center gap-2 border-b border-border bg-bg px-3 py-2 sm:mx-0 sm:rounded-lg sm:border sm:px-3">
        <div
          ref={tabsRef}
          className="tab-scroll-fade w-full min-w-0 overflow-x-auto no-scrollbar"
        >
          <SegmentedControl
            options={TABS}
            value={activeTab}
            onChange={handleTabChange}
            size="touch"
            snap
            className="w-full min-w-max sm:w-auto"
            aria-label="Dashboard sections"
          />
        </div>
      </div>

      {activeTab === "overview" ? (
        <OverviewTab
          stats={stats}
          connections={connections}
          keys={keys}
          loading={loading}
          period={period}
          onSwitchToEndpoint={() => handleTabChange("endpoint")}
        />
      ) : (
        <EndpointPageClient machineId={machineId} />
      )}
    </div>
  );
}

AppPageClient.propTypes = {
  machineId: PropTypes.string.isRequired,
};
