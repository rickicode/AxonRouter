"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CardSkeleton, SegmentedControl } from "@/shared/components";

const UsageStats = dynamic(() => import("@/shared/components/UsageStats"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const RequestLogger = dynamic(() => import("@/shared/components/RequestLogger"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const RequestDetailsTab = dynamic(() => import("./components/RequestDetailsTab"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const AnalyticsTab = dynamic(() => import("./components/AnalyticsTab"), {
  ssr: false,
  loading: () => <CardSkeleton />,
});

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "analytics", label: "Analytics" },
  { value: "logs", label: "Request Logs" },
];

const TAB_COPY = {
  overview: {
    title: "Usage Overview",
    body: "Requests, token volume, and estimated cost across every routed model. Switch the period to compare today against the last 7, 30, or 60 days.",
  },
  analytics: {
    title: "Reliability & Speed",
    body: "New routed LLM attempts only. Retries count separately. Reliability and latency describe service performance, not answer quality.",
  },
  logs: {
    title: "Request Logs",
    body: "Live request stream captured by the gateway. Filter by status to find failures without leaving the dashboard.",
  },
};

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [period, setPeriod] = useState("today");

  // Legacy deep links: `?tab=details` used to be its own tab; merge into logs.
  const tabParam = searchParams.get("tab");
  const tabFromUrl = tabParam === "details" ? "logs" : tabParam;
  const activeTab =
    tabFromUrl && ["overview", "logs", "analytics"].includes(tabFromUrl)
      ? tabFromUrl
      : "overview";
  const showDetails =
    activeTab === "logs" &&
    (tabParam === "details" || searchParams.get("details") === "1");

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    // The details panel only exists inside logs; drop its param elsewhere.
    if (value !== "logs") params.delete("details");
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const toggleDetails = () => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "logs");
    if (showDetails) params.delete("details");
    else params.set("details", "1");
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };
  const detailsRef = useRef(null);
  useEffect(() => {
    if (showDetails && detailsRef.current) {
      detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [showDetails]);

  const copy = TAB_COPY[activeTab];
  const showPeriod = activeTab === "overview" || activeTab === "analytics";
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

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-base font-semibold tracking-tight text-text-main">{copy.title}</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{copy.body}</p>
        </div>
        {showPeriod && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[11px] font-medium uppercase tracking-wide text-text-muted sm:inline">
              Period
            </span>
            <SegmentedControl
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              size="touch"
              className="min-w-max"
            />
          </div>
        )}
      </div>

      {/* Control bar */}
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
          />
        </div>
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats
            period={period}
            setPeriod={setPeriod}
            hidePeriodSelector
            subtab={searchParams.get("subtab") || undefined}
          />
        </Suspense>
      )}
      {activeTab === "logs" && (
        <>
          <RequestLogger
            detailsOpen={showDetails}
            onToggleDetails={toggleDetails}
            initialStatus={searchParams.get("status") || "all"}
          />
          {showDetails && (
            <div id="request-details-panel" ref={detailsRef}>
              <Suspense fallback={<CardSkeleton />}>
                <RequestDetailsTab
                  initialFilters={{
                    status: searchParams.get("status") || "",
                    provider: searchParams.get("provider") || "",
                  }}
                />
              </Suspense>
            </div>
          )}
        </>
      )}
      {activeTab === "analytics" && <AnalyticsTab period={period} />}
    </div>
  );
}
