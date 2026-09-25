"use client";

import PropTypes from "prop-types";
import dynamic from "@/lib/ui/dynamic.jsx";
import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components";
import { MemoProviderCard, MemoApiKeyProviderCard } from "./BaseProviderCard";
import { useVirtualizer } from "@tanstack/react-virtual";
import Icon from "@/shared/components/Icon";

const ModelAvailabilityBadge = dynamic(
  () => import("./ModelAvailabilityBadge"),
  { ssr: false, loading: () => null },
);

const APIKEY_INITIAL_VISIBLE = 20;

// ── Virtualisation helpers ───────────────────────────────────────

const ROW_GAP = 12; // matches Tailwind gap-3 (0.75rem)
const ESTIMATE_ROW_HEIGHT = 56; // card ~50px (p-2 + 32px icon row) + row gap
// Matches the Tailwind breakpoints used by gridCls (viewport-based, since the
// grid spans the full main-column width).
const COLUMN_BREAKPOINTS = [
  { min: 1280, columns: 4 }, // xl:grid-cols-4
  { min: 1024, columns: 3 }, // lg:grid-cols-3
  { min: 640, columns: 2 },  // sm:grid-cols-2
  { min: 0, columns: 1 },    // grid-cols-1
];

/** Walk up the DOM tree to find the nearest scrollable ancestor element. */
function findScrollParent(node) {
  let el = node && node.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Row-level virtualisation for the responsive card grids.
 *
 * Only mounts the grid rows currently visible inside the nearest scrollable
 * ancestor (the dashboard content div — `.flex-1.overflow-y-auto`), keeping the
 * DOM count proportional to the viewport instead of the provider count. Each
 * virtual row is one CSS grid line, so the responsive Tailwind grid classes
 * keep working unchanged. Header buttons / section chrome stay in normal flow.
 *
 * Falls back to a plain, un-virtualised grid when no scroll parent can be
 * located (e.g. a viewport tall enough that the page never scrolls) — the
 * result is identical to the old rendering, just without the DOM trimming.
 *
 * Props:
 *   items      – flat array of data items
 *   renderCard – (index, item) => JSX; MUST include its own React `key`
 *   overscan   – extra rows kept mounted above/below the viewport (default 2)
 */
function VirtualCardGrid({ items, renderCard, overscan = 2 }) {
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const marginRef = useRef(0);
  const columnsRef = useRef(1);

  const [columns, setColumns] = useState(1);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);

  // ── Locate scroll parent + keep the grid→parent margin fresh ──
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") {
      setFallback(true);
      return;
    }
    const parent = findScrollParent(el);
    if (!parent) {
      setFallback(true);
      return;
    }
    scrollRef.current = parent;

    // Offset of the grid's top edge within the scroll parent's *content*
    // coordinates — invariant to scrolling, changes only on layout shifts
    // (filters, dynamic badge loads, outer resizes).
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const prect = parent.getBoundingClientRect();
      const margin = rect.top - prect.top + parent.scrollTop;
      if (Math.abs(margin - marginRef.current) >= 1) {
        marginRef.current = margin;
        setScrollMargin(margin);
      }
    };
    measure();
    setReady(true);

    const resizeObs = new ResizeObserver(measure);
    resizeObs.observe(el);
    const mutationObs = new MutationObserver(measure);
    mutationObs.observe(parent, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    return () => {
      resizeObs.disconnect();
      mutationObs.disconnect();
    };
  }, []);

  // ── Columns: derive from viewport width (exact Tailwind match) ────
  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      const cols = COLUMN_BREAKPOINTS.find((b) => width >= b.min).columns;
      if (cols !== columnsRef.current) {
        columnsRef.current = cols;
        setColumns(cols);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const rowCount = items.length === 0 ? 0 : Math.ceil(items.length / columns);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATE_ROW_HEIGHT,
    overscan,
    scrollMargin,
    gap: ROW_GAP,
  });

  // All hooks above run unconditionally; only the *returns* branch below.

  if (items.length === 0) return <div ref={containerRef} />;

  if (!ready || fallback) {
    // Plain grid: pre-layout first frame, or no scrollable container at all.
    return (
      <div ref={containerRef} className={gridCls}>
        {items.map((item, i) => renderCard(i, item))}
      </div>
    );
  }

  // ── Virtualised: one absolutely-positioned grid row per virtual item ──
  return (
    <div ref={containerRef} className="relative">
      <div style={{ position: "relative", width: "100%", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * columns;
          const end = Math.min(start + columns, items.length);
          const rowCards = [];
          for (let i = start; i < end; i++) rowCards.push(renderCard(i, items[i]));
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className={gridCls}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
              }}
            >
              {rowCards}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Section helpers ──────────────────────────────────────────────

function SectionHeader({ title, rightContent }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-sm font-semibold flex items-center gap-2">{title}</h2>
      {rightContent}
    </div>
  );
}

const gridCls = "grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4";

// ── ProvidersGrid ────────────────────────────────────────────────

function ProvidersGrid({
  oauthEntries, freeEntries, freeTierEntries, apikeyEntries,
  showAllApikey, onShowAllApikey, isFiltering,
  getProviderStats, dualAuthTypes, testingMode, onBatchTest,
  onToggleProvider, togglePendingId, compatibleProviders, anthropicCompatibleProviders,
  onAddOpenAI, onAddAnthropic,
}) {
  const visibleApikeyEntries = isFiltering || showAllApikey
    ? apikeyEntries
    : apikeyEntries.slice(0, APIKEY_INITIAL_VISIBLE);
  const hiddenApikeyCount = apikeyEntries.length - APIKEY_INITIAL_VISIBLE;

  // Unified item list for the Free Tier grid, which mixes two card types.
  const freeTierItems = [
    ...freeEntries.map(([key, info]) => ({
      kind: "free", key, info, authTypes: dualAuthTypes(info, key),
    })),
    ...freeTierEntries.map(([key, info]) => ({
      kind: "freeTier", key, info, authTypes: dualAuthTypes(info, key),
    })),
  ];

  return (
    <>
      {/* Custom Providers (OpenAI/Anthropic Compatible) */}
      <div className="flex flex-col gap-3">
        <SectionHeader
          title={<>Custom Providers (OpenAI/Anthropic Compatible) </>}
          rightContent={
            <div className="grid grid-cols-1 gap-2 sm:flex sm:w-auto">
              <Button size="sm" icon="add" onClick={onAddAnthropic} className="w-full sm:w-auto">
                Add Anthropic Compatible
              </Button>
              <Button size="sm" variant="secondary" icon="add" onClick={onAddOpenAI} className="w-full sm:w-auto">
                Add OpenAI Compatible
              </Button>
            </div>
          }
        />
        {compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-sm text-text-muted text-sm">
            <Icon name="extension" size={18} />
            <span>No custom providers — use buttons above to add OpenAI/Anthropic compatible endpoints</span>
          </div>
        ) : (
          <div className={gridCls}>
            {[...compatibleProviders, ...anthropicCompatibleProviders].map((info) => (
              <MemoApiKeyProviderCard
                key={info.id}
                providerId={info.id}
                provider={info}
                stats={getProviderStats(info.id, "apikey")}
                authType="compatible"
                toggleDisabled={togglePendingId === info.id}
                onToggle={(active) => onToggleProvider(info.id, "apikey", active, info.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* OAuth Providers */}
      {oauthEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="OAuth Providers"
            rightContent={
              <TestAllButton mode="oauth" testingMode={testingMode} onBatchTest={onBatchTest} />
            }
          />
          <VirtualCardGrid
            items={oauthEntries}
            renderCard={(index, [key, info]) => {
              const authTypes = dualAuthTypes(info, key);
              return (
                <MemoProviderCard
                  key={key}
                  providerId={key}
                  provider={info}
                  stats={getProviderStats(key, authTypes)}
                  authType="oauth"
                  toggleDisabled={togglePendingId === key}
                  onToggle={(active) => onToggleProvider(key, authTypes, active, info.name)}
                />
              );
            }}
          />
        </div>
      )}

      {/* Free Tier Providers */}
      {(freeEntries.length > 0 || freeTierEntries.length > 0) && (
        <div className="flex flex-col gap-3">
          <SectionHeader
            title="Free Tier Providers"
            rightContent={<TestAllButton mode="free" testingMode={testingMode} onBatchTest={onBatchTest} />}
          />
          <VirtualCardGrid
            items={freeTierItems}
            renderCard={(index, item) => {
              if (item.kind === "freeTier") {
                return (
                  <MemoApiKeyProviderCard
                    key={item.key}
                    providerId={item.key}
                    provider={item.info}
                    stats={getProviderStats(item.key, item.authTypes)}
                    authType={Array.isArray(item.authTypes) ? (item.authTypes[0] ?? "apikey") : item.authTypes}
                    toggleDisabled={togglePendingId === item.key}
                    onToggle={(active) => onToggleProvider(item.key, item.authTypes, active, item.info.name)}
                  />
                );
              }
              return (
                <MemoProviderCard
                  key={item.key}
                  providerId={item.key}
                  provider={item.info}
                  stats={getProviderStats(item.key, item.authTypes)}
                  authType="free"
                  toggleDisabled={togglePendingId === item.key}
                  onToggle={(active) => onToggleProvider(item.key, item.authTypes, active, item.info.name)}
                />
              );
            }}
          />
        </div>
      )}

      {/* API Key Providers */}
      {apikeyEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader
            title={<>API Key Providers </>}
            rightContent={<TestAllButton mode="apikey" testingMode={testingMode} onBatchTest={onBatchTest} />}
          />
          <VirtualCardGrid
            items={visibleApikeyEntries}
            renderCard={(index, [key, info]) => (
              <MemoApiKeyProviderCard
                key={key}
                providerId={key}
                provider={info}
                stats={getProviderStats(key, "apikey")}
                authType="apikey"
                toggleDisabled={togglePendingId === key}
                onToggle={(active) => onToggleProvider(key, "apikey", active, info.name)}
              />
            )}
          />
          {!isFiltering && !showAllApikey && hiddenApikeyCount > 0 && (
            <button
              onClick={onShowAllApikey}
              className="flex w-full min-h-11 sm:min-h-9 items-center justify-center gap-1.5 rounded-sm border border-dashed border-primary/30 px-3 py-2 text-sm font-medium text-primary hover:border-primary hover:bg-primary/10 transition-colors"
            >
              <Icon name="expand_more" size={18} />
              Show all {apikeyEntries.length} providers
            </button>
          )}
        </div>
      )}
    </>
  );
}

function TestAllButton({ mode, testingMode, onBatchTest }) {
  const active = testingMode === mode;
  const labels = { oauth: "Test all OAuth connections", free: "Test all Free connections", apikey: "Test all API Key connections" };
  const label = labels[mode] || `Test all ${mode} connections`;
  return (
    <button
      onClick={() => onBatchTest(mode)}
      disabled={!!testingMode}
      className={`flex w-full items-center justify-center gap-1.5 rounded-sm border px-3 min-h-11 text-xs font-medium sm:w-auto sm:h-10 sm:py-2 ${
        active
          ? "bg-primary/10 border-primary/30 text-primary animate-pulse"
          : "bg-bg border-border text-text-muted hover:text-text-main hover:border-primary/30"
      }`}
      title={label}
      aria-label={label}
    >
      <Icon name="play_arrow" size={18} className={active ? "animate-spin" : undefined} />
      {active ? "Testing..." : "Test All"}
    </button>
  );
}

ProvidersGrid.propTypes = {
  oauthEntries: PropTypes.array.isRequired,
  freeEntries: PropTypes.array.isRequired,
  freeTierEntries: PropTypes.array.isRequired,
  apikeyEntries: PropTypes.array.isRequired,
  showAllApikey: PropTypes.bool.isRequired,
  onShowAllApikey: PropTypes.func.isRequired,
  isFiltering: PropTypes.bool.isRequired,
  getProviderStats: PropTypes.func.isRequired,
  dualAuthTypes: PropTypes.func.isRequired,
  testingMode: PropTypes.string,
  onBatchTest: PropTypes.func.isRequired,
  onToggleProvider: PropTypes.func.isRequired,
  togglePendingId: PropTypes.string,
  compatibleProviders: PropTypes.array.isRequired,
  anthropicCompatibleProviders: PropTypes.array.isRequired,
  onAddOpenAI: PropTypes.func.isRequired,
  onAddAnthropic: PropTypes.func.isRequired,
};

export default ProvidersGrid;