"use client";

import { useMemo, useState, useEffect, useCallback, useRef, memo } from "react";
import PropTypes from "prop-types";
import Image from "@/lib/ui/image.jsx";
import {
 ReactFlow,
 Handle,
 Position,
 Controls,
 BaseEdge,
 getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";

// ── Reduced-motion hook (media-query based, SSR-safe) ──
function usePrefersReducedMotion() {
 const [reduced, setReduced] = useState(() => {
 if (typeof window === "undefined") return false;
 return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 });
 useEffect(() => {
 const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
 const handler = (e) => setReduced(e.matches);
 mq.addEventListener("change", handler);
 return () => mq.removeEventListener("change", handler);
 }, []);
 return reduced;
}

// Force-stop FE animation if a provider stays active longer than this
const PROVIDER_RETENTION_MS = 5 * 60 * 1000;
const FE_ACTIVE_TICK_MS = 3000; // Throttled from 1000ms to reduce unneeded layout/render cycles
const RESIZE_DEBOUNCE_MS = 160;

// Kame + electric particles along active edges
const KAME_PARTICLE_COUNT = 6;
const SPARK_COUNT = 5;

// ── Single shared feTurbulence filter (static — not animated).
// One <defs> node is enough; every active edge points to url(#topo-electric-shared).
// The SMIL <animate> on baseFrequency is gated once here instead of per-edge:
// previously each active edge built its own filter + animate = N filter repaints
// per frame. One shared filter + reduced-motion gating cuts the repaint storm.
const SHARED_FILTER_ID = "topo-electric-shared";

function getProviderConfig(providerId) {
 return AI_PROVIDERS[providerId] || { color: "#6b7280", name: providerId };
}

function getProviderImageUrl(providerId) {
 return getProviderIconSrc(providerId);
}

// Custom provider node - rectangle with image + name — memoized: only re-renders when data identity changes
const ProviderNode = memo(function ProviderNode({ data }) {
 const { label, color, imageUrl, textIcon, active } = data;
 const [imgError, setImgError] = useState(false);
 const motionOK = usePrefersReducedMotion() === false;
 // Inline object hoisted as computed const so style identity is stable when color doesn't change
 const rootStyle = useMemo(() => ({
 borderColor: active ? color : "var(--color-border)",
 boxShadow: active ? `0 0 16px ${color}40` : "none",
 minWidth: "150px",
 }), [active, color]);
 const iconStyle = useMemo(() => ({ backgroundColor: `${color}15` }), [color]);
 const iconCharStyle = useMemo(() => ({ color }), [color]);
 const labelStyle = useMemo(() => ({ color: active ? color : "var(--color-text)" }), [active, color]);
 const pingStyle = useMemo(() => ({ backgroundColor: color }), [color]);
 return (
 <div
 className="flex items-center gap-2 px-3 h-8 rounded-sm border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
 style={rootStyle}
 tabIndex={0}
 role="group"
 aria-label={`${label}${active ? " — active" : ""}`}
 >
 <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
 <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
 <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
 <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

 {/* Provider icon */}
 <div
 className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0"
 style={iconStyle}
 >
 {imageUrl && !imgError ? (
 <Image
 src={imageUrl}
 alt={label}
 width={24}
 height={24}
 className="w-6 h-6 rounded-sm object-contain"
 loading="lazy"
 decoding="async"
 onError={() => {
 const m = imageUrl?.match(/^\/providers\/([^/]+)\.png$/i);
 if (m) markProviderIconMissing(m[1]);
 setImgError(true);
 }}
 />
 ) : (
 <span className="text-sm font-semibold" style={iconCharStyle}>{textIcon}</span>
 )}
 </div>

 {/* Provider name */}
 <span
 className="text-sm font-medium truncate"
 style={labelStyle}
 >
 {label}
 </span>

 {/* Active indicator (hidden under prefers-reduced-motion) */}
 {active && motionOK && (
 <span className="relative flex h-2 w-2 shrink-0">
 <span className="animate-ping absolute inline-flex h-full w-full rounded-sm opacity-75" style={pingStyle} />
 <span className="relative inline-flex rounded-sm h-2 w-2" style={pingStyle} />
 </span>
 )}
 </div>
 );
});

ProviderNode.propTypes = {
 data: PropTypes.object.isRequired,
};

// Center AxonRouter node — pulse/glow on card only (no expanding rings) — memoized
const RouterNode = memo(function RouterNode({ data }) {
 const powering = (data.activeCount || 0) > 0;
 return (
 <div
 className={`relative z-[1] flex items-center justify-center px-3 py-3 rounded-sm border-2 border-border min-w-[130px] ${
 powering
 ? "topology-router-core border-warning bg-gradient-to-br from-primary/30 via-warning/20 to-info/25"
 : "border-primary bg-primary/10 "
 }`}
 >
 <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
 <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
 <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
 <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

 <Image
 src="/favicon.svg"
      alt="AxonRouter"
 width={24}
 height={24}
 className={`w-6 h-6 mr-2 ${powering ? "topology-router-icon" : ""}`}
 loading="lazy"
 decoding="async"
 />
 <span className={`text-sm font-semibold ${powering ? "topology-router-label text-warning" : "text-primary"}`}>
      AxonRouter
 </span>
 {data.activeCount > 0 && (
 <span
 className="ml-2 px-1.5 py-1 rounded-sm bg-warning text-bg text-xs font-medium topology-router-badge"
 aria-label={`${data.activeCount} active requests`}
 role="status"
 >
 {data.activeCount}
 </span>
 )}
 </div>
 );
});

RouterNode.propTypes = {
 data: PropTypes.object.isRequired,
};

// Shared dispMap style for SMIL-gated electric halo — reuse across edges to avoid per-edge filter alloc
const ORB_SHADOW = { filter: "drop-shadow(0 0 4px #22d3ee)" };
const CORE_EDGE_STYLE = { stroke: "#f8fafc", strokeWidth: 2.2, opacity: 1 };

// Active: electric kame beam (multi-layer stroke + sparks). Idle/last/error: solid BaseEdge.
function TopologyEdge({
 id,
 sourceX,
 sourceY,
 targetX,
 targetY,
 sourcePosition,
 targetPosition,
 style = {},
 data,
}) {
 const [edgePath] = getBezierPath({
 sourceX,
 sourceY,
 sourcePosition,
 targetX,
 targetY,
 targetPosition,
 });
 const active = !!data?.active;
 const stroke = style.stroke || "var(--color-border)";
 const reducedMotion = usePrefersReducedMotion();

 if (!active) {
 return <BaseEdge id={id} path={edgePath} style={{ ...style, stroke }} />;
 }

 return (
 <g className="topology-edge-electric">
 {/* Outer electric halo */}
 <path
 d={edgePath}
 fill="none"
 stroke="#22d3ee"
 strokeWidth={10}
 strokeOpacity={0.35}
 strokeLinecap="round"
 filter={`url(#${SHARED_FILTER_ID})`}
 className="topology-edge-halo"
 />
 {/* Mid plasma */}
 <path
 d={edgePath}
 fill="none"
 stroke="#4ade80"
 strokeWidth={5}
 strokeOpacity={0.85}
 strokeLinecap="round"
 filter={`url(#${SHARED_FILTER_ID})`}
 className="topology-edge-plasma"
 />
 {/* Hot white core */}
 <BaseEdge
 id={id}
 path={edgePath}
 style={CORE_EDGE_STYLE}
 className="topology-edge-kame"
 />
 {/* Energy orbs (motion-only; static orbs remain when reduced-motion) */}
 {Array.from({ length: reducedMotion ? 0 : KAME_PARTICLE_COUNT }, (_, i) => (
 <circle
 key={`${id}-p-${i}`}
 r={i % 2 === 0 ? 4 : 2.5}
 fill={i % 3 === 0 ? "#fde047" : i % 3 === 1 ? "#67e8f9" : "#fff"}
 opacity={0.95}
 style={ORB_SHADOW}
 >
 <animateMotion
 dur={`${0.4 + i * 0.08}s`}
 repeatCount="indefinite"
 path={edgePath}
 begin={`${i * 0.09}s`}
 />
 </circle>
 ))}
 {/* Electric sparks (short-lived blink along path) */}
 {Array.from({ length: reducedMotion ? 0 : SPARK_COUNT }, (_, i) => (
 <circle
 key={`${id}-s-${i}`}
 r={1.8}
 fill="#e0f2fe"
 opacity={0}
 >
 <animate
 attributeName="opacity"
 values="0;1;0;0;1;0"
 dur={`${0.35 + (i % 3) * 0.1}s`}
 begin={`${i * 0.07}s`}
 repeatCount="indefinite"
 />
 <animateMotion
 dur={`${0.28 + i * 0.05}s`}
 repeatCount="indefinite"
 path={edgePath}
 begin={`${i * 0.11}s`}
 />
 </circle>
 ))}
 </g>
 );
}

TopologyEdge.propTypes = {
 id: PropTypes.string,
 sourceX: PropTypes.number,
 sourceY: PropTypes.number,
 targetX: PropTypes.number,
 targetY: PropTypes.number,
 sourcePosition: PropTypes.string,
 targetPosition: PropTypes.string,
 style: PropTypes.object,
 data: PropTypes.object,
};

const nodeTypes = { provider: ProviderNode, router: RouterNode };
const edgeTypes = { topology: TopologyEdge };

// Place N nodes evenly along an ellipse around the router center.
function buildLayout(providers, activeSet, lastSet, errorSet, totalActiveCount = 0) {
 const nodeW = 180;
 const nodeH = 30;
 const routerW = 120;
 const routerH = 44;
 const nodeGap = 24;

 const count = providers.length;

 // Compute rx so arc spacing between nodes >= nodeW + nodeGap
 const minRx = ((nodeW + nodeGap) * count) / (2 * Math.PI);
 const rx = Math.max(320, minRx);
 const ry = Math.max(200, rx * 0.55); // ellipse ratio ~0.55
 if (count === 0) {
 return {
 nodes: [{ id: "router", type: "router", position: { x: 0, y: 0 }, data: { activeCount: 0 }, draggable: false }],
 edges: [],
 };
 }

 const nodes = [];
 const edges = [];

 nodes.push({
 id: "router",
 type: "router",
 position: { x: -routerW / 2, y: -routerH / 2 },
 data: { activeCount: totalActiveCount },
 draggable: false,
 });

 const edgeStyle = (active, last, error) => {
 if (error) return { stroke: "var(--color-danger)", strokeWidth: 2.5, opacity: 0.9 };
 if (active) return { stroke: "var(--color-info)", strokeWidth: 3.5, opacity: 1 };
 if (last) return { stroke: "var(--color-warning)", strokeWidth: 2, opacity: 0.7 };
 return { stroke: "var(--color-border)", strokeWidth: 1, opacity: 0.3 };
 };

 providers.forEach((p, i) => {
 const config = getProviderConfig(p.provider);
 const active = activeSet.has(p.provider?.toLowerCase());
 const last = !active && lastSet.has(p.provider?.toLowerCase());
 const error = !active && errorSet.has(p.provider?.toLowerCase());
 const nodeId = `provider-${p.provider}`;
 const data = {
 label: (config.name !== p.provider ? config.name : null) || p.nodeName || p.name || p.provider,
 color: config.color || "#6b7280",
 imageUrl: getProviderImageUrl(p.provider),
 textIcon: config.textIcon || (p.provider || "?").slice(0, 2).toUpperCase(),
 active,
 };

 // Distribute evenly starting from top (−π/2), clockwise
 const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
 const cx = rx * Math.cos(angle);
 const cy = ry * Math.sin(angle);

 // Pick router handle closest to the node direction
 let sourceHandle, targetHandle;
 if (Math.abs(angle + Math.PI / 2) < Math.PI / 4 || Math.abs(angle - 3 * Math.PI / 2) < Math.PI / 4) {
 sourceHandle = "top"; targetHandle = "bottom";
 } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
 sourceHandle = "bottom"; targetHandle = "top";
 } else if (cx > 0) {
 sourceHandle = "right"; targetHandle = "left";
 } else {
 sourceHandle = "left"; targetHandle = "right";
 }

 nodes.push({
 id: nodeId,
 type: "provider",
 position: { x: cx - nodeW / 2, y: cy - nodeH / 2 },
 data,
 draggable: false,
 });

 edges.push({
 id: `e-${nodeId}`,
 type: "topology",
 source: "router",
 sourceHandle,
 target: nodeId,
 targetHandle,
 // Built-in animated uses stroke-dasharray (CPU-heavy); use particle beam instead
 animated: false,
 data: { active },
 style: edgeStyle(active, last, error),
 });
 });

 return { nodes, edges };
}

export default function ProviderTopology({ providers = [], activeRequests = [], lastProvider = "", errorProvider = "" }) {
 // Serialize to stable string keys so useMemo only re-runs when values actually change
 const activeKey = useMemo(
 () => activeRequests.map((r) => r.provider?.toLowerCase()).filter(Boolean).sort().join(","),
 [activeRequests]
 );
 const lastKey = lastProvider?.toLowerCase() || "";
 const errorKey = errorProvider?.toLowerCase() || "";

 const rawActiveSet = useMemo(() => new Set(activeKey ? activeKey.split(",") : []), [activeKey]);
  const lastSet = useMemo(() => new Set(lastKey ? [lastKey] : []), [lastKey]);
  const errorSet = useMemo(() => new Set(errorKey ? [errorKey] : []), [errorKey]);
  const lastUsedRef = useRef({});
  const [clock, setClock] = useState(() => Date.now());
  const [usedSnapshot, setUsedSnapshot] = useState(() => new Set());
  const usedProviderSet = useMemo(() => {
  const used = new Set(rawActiveSet);
  for (const key of usedSnapshot) used.add(key);
  return used;
  }, [rawActiveSet, usedSnapshot]);
  const visibleProviders = useMemo(() => {
    const active = providers.filter((p) => usedProviderSet.has(String(p.provider || "").toLowerCase()));
    return active.length > 0 ? active : providers;
  }, [providers, usedProviderSet]);

 useEffect(() => {
  const now = Date.now();
  for (const p of rawActiveSet) lastUsedRef.current[p] = now;
  setUsedSnapshot((prev) => {
  const next = new Set(prev);
  for (const p of rawActiveSet) next.add(p);
  for (const provider of providers) {
  const key = String(provider.provider || "").toLowerCase();
  if (lastUsedRef.current[key] && now - lastUsedRef.current[key] < PROVIDER_RETENTION_MS) next.add(key);
  }
  return next;
  });
  }, [rawActiveSet, providers]);

 useEffect(() => {
  const id = setInterval(() => {
  const now = Date.now();
  const keys = Object.keys(lastUsedRef.current);
  if (keys.length === 0) return; // idle: skip setState, zero render
  let alive = false;
  for (const k of keys) {
  if (now - lastUsedRef.current[k] < PROVIDER_RETENTION_MS) {
  alive = true;
  } else {
  delete lastUsedRef.current[k]; // prune expired, cegah ref bengkak
  }
  }
  setUsedSnapshot(() => {
  const next = new Set();
  for (const k of Object.keys(lastUsedRef.current)) {
  if (now - lastUsedRef.current[k] < PROVIDER_RETENTION_MS) next.add(k);
  }
  for (const p of rawActiveSet) next.add(p);
  return next;
  });
  if (!alive) return;
  setClock(now);
  }, 1000);
  return () => clearInterval(id);
  }, [rawActiveSet]);

 const activeSet = rawActiveSet;
 const totalActiveCount = activeRequests.length;

 // ── Screen-reader fallback: text table of provider status ──
 // Build a stable summary for the aria-label on the visual graph.
 const statusSummary = useMemo(() => {
 const activeNames = [];
 const lastNames = [];
 const errorNames = [];
 const idleNames = [];
 for (const p of visibleProviders) {
 const key = String(p.provider || "").toLowerCase();
 const name = getProviderConfig(p.provider).name || p.nodeName || p.name || p.provider;
 if (activeSet.has(key)) activeNames.push(name);
 else if (errorSet.has(key)) errorNames.push(name);
 else if (lastSet.has(key)) lastNames.push(name);
 else idleNames.push(name);
 }
 const parts = [];
 if (activeNames.length) parts.push(`active: ${activeNames.join(", ")}`);
 if (errorNames.length) parts.push(`error: ${errorNames.join(", ")}`);
 if (lastNames.length) parts.push(`last used: ${lastNames.join(", ")}`);
 if (idleNames.length) parts.push(`idle: ${idleNames.join(", ")}`);
 return `Provider topology graph. ${totalActiveCount} active request${totalActiveCount === 1 ? "" : "s"}. ${parts.join(". ")}.`;
 }, [visibleProviders, activeSet, lastSet, errorSet, totalActiveCount]);

 const { nodes, edges } = useMemo(
 () => buildLayout(visibleProviders, activeSet, lastSet, errorSet, totalActiveCount),
 [visibleProviders, activeSet, lastSet, errorSet, totalActiveCount]
 );

 // Stable key — only remount when provider list changes
 const providersKey = useMemo(
 () => visibleProviders.map((p) => p.provider).sort().join(","),
 [visibleProviders]
 );

 const rfInstance = useRef(null);
 const containerRef = useRef(null);
 const reducedMotion = usePrefersReducedMotion();
 const fitOpts = useMemo(() => ({ padding: 0.2, duration: 200 }), []);
 const onInit = useCallback((instance) => {
 rfInstance.current = instance;
 setTimeout(() => instance.fitView(fitOpts), 50);
 }, [fitOpts]);

 // Re-fit on container resize — debounced so dragging window edges / mobile resize isn't refitting every frame
 useEffect(() => {
 const el = containerRef.current;
 if (!el) return;
 let raf = 0;
 let lastFitAt = 0;
 const ro = new ResizeObserver(() => {
 const now = Date.now();
 if (now - lastFitAt < RESIZE_DEBOUNCE_MS) {
 if (raf) return;
 raf = requestAnimationFrame(() => {
 raf = 0;
 if (Date.now() - lastFitAt < RESIZE_DEBOUNCE_MS) return;
 lastFitAt = Date.now();
 rfInstance.current?.fitView(fitOpts);
 });
 return;
 }
 lastFitAt = now;
 if (rfInstance.current) rfInstance.current.fitView(fitOpts);
 });
 ro.observe(el);
 return () => {
 if (raf) cancelAnimationFrame(raf);
 ro.disconnect();
 };
 }, [fitOpts]);

 // Re-fit when node count/layout changes
 useEffect(() => {
 if (rfInstance.current) {
 const id = setTimeout(() => rfInstance.current.fitView(fitOpts), 50);
 return () => clearTimeout(id);
 }
 }, [nodes.length, fitOpts]);

 return (
 <div className="flex min-w-0 flex-col">
 <div ref={containerRef} role="img" aria-label={statusSummary} data-testid="topology-container" className="h-[320px] w-full min-w-0 rounded-sm border border-border bg-surface-2 sm:h-[480px] overflow-hidden">
 {visibleProviders.length === 0 ? (
 <div className="h-full flex items-center justify-center text-text-muted text-sm">
 No providers connected
 </div>
 ) : (
 <ReactFlow
 key={providersKey}
 nodes={nodes}
 edges={edges}
 nodeTypes={nodeTypes}
 edgeTypes={edgeTypes}
 fitView
 fitViewOptions={fitOpts}
 minZoom={0.1}
 maxZoom={2}
 onInit={onInit}
 proOptions={{ hideAttribution: true }}
 panOnDrag
 zoomOnScroll
 zoomOnPinch
 zoomOnDoubleClick
 preventScrolling={false}
 nodesDraggable={false}
 nodesConnectable={false}
 elementsSelectable={false}
 >
 {/* One shared filter instance — all halo/plasma paths point at it via url(#topo-electric-shared).
 SMIL animate gated once for all edges; static SVG reduces per-edge repaints to zero. */}
 <svg width={0} height={0} aria-hidden="true" className="topology-defs">
 <defs>
 <filter id={SHARED_FILTER_ID} x="-40%" y="-40%" width="180%" height="180%">
 <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="noise">
 {!reducedMotion && (
 <animate attributeName="baseFrequency" values="0.8;1.4;0.8" dur="0.25s" repeatCount="indefinite" />
 )}
 </feTurbulence>
 <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" xChannelSelector="R" yChannelSelector="G" />
 </filter>
 </defs>
 </svg>
 <Controls showInteractive={false} position="bottom-right" className="react-flow-controls-custom" />
 </ReactFlow>
 )}
 </div>
 {/* Edge status legend: active/last/error/idle edge colors */}
 <div
 className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted"
 aria-label="Edge status legend"
 data-testid="topology-legend"
 role="list"
 >
 <span role="listitem" className="inline-flex items-center gap-1.5">
 <span aria-hidden="true" className="inline-block h-1 w-6 rounded-sm bg-info" />
 Active
 </span>
 <span role="listitem" className="inline-flex items-center gap-1.5">
 <span aria-hidden="true" className="inline-block h-1 w-6 rounded-sm bg-warning" />
 Last used
 </span>
 <span role="listitem" className="inline-flex items-center gap-1.5">
 <span aria-hidden="true" className="inline-block h-1 w-6 rounded-sm bg-danger" />
 Error
 </span>
 <span role="listitem" className="inline-flex items-center gap-1.5">
 <span aria-hidden="true" className="inline-block h-1 w-6 rounded-sm bg-border" />
 Idle
 </span>
 </div>
 {/* AT fallback: offscreen text table (outside role=img so screen readers reach it) */}
 {visibleProviders.length > 0 && (
 <table className="sr-only" aria-label="Provider connection status" data-testid="topology-status-table">
 <caption>Provider connection status</caption>
 <thead>
 <tr>
 <th className="h-8 px-3 text-left text-xs font-medium text-text-muted" scope="col">Provider</th>
 <th className="h-8 px-3 text-left text-xs font-medium text-text-muted" scope="col">Status</th>
 </tr>
 </thead>
 <tbody>
 {visibleProviders.map((p) => {
 const key = String(p.provider || "").toLowerCase();
 const name = getProviderConfig(p.provider).name || p.nodeName || p.name || p.provider;
 const status = activeSet.has(key) ? "active" : errorSet.has(key) ? "error" : lastSet.has(key) ? "last used" : "idle";
 return (
 <tr key={p.provider}>
 <th className="h-8 px-3 text-left text-xs font-medium text-text-muted" scope="row">{name}</th>
 <td className="h-8 px-3 text-sm text-text-main">{status}</td>
 </tr>
 );
 })}
 </tbody>
 </table>
 )}
 </div>
 );
}

ProviderTopology.propTypes = {
 providers: PropTypes.arrayOf(PropTypes.shape({
 id: PropTypes.string,
 provider: PropTypes.string,
 name: PropTypes.string,
 })),
 activeRequests: PropTypes.arrayOf(PropTypes.shape({
 provider: PropTypes.string,
 model: PropTypes.string,
 account: PropTypes.string,
 })),
 lastProvider: PropTypes.string,
 errorProvider: PropTypes.string,
};
