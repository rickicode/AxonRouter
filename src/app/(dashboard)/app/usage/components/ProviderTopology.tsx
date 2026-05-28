"use client";

import { useMemo, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import {
  ReactFlow,
  Handle,
  Position,
} from "@xyflow/react";

import "@xyflow/react/dist/style.css";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { AI_PROVIDERS, MORPH_MANAGED_PROVIDER_ID } from "@/shared/constants/providers";

function getProviderConfig(providerId) {
  if (providerId === MORPH_MANAGED_PROVIDER_ID) {
    return AI_PROVIDERS[providerId] || { color: "#FF5B99", name: "Morph Fast Models", textIcon: "MP" };
  }
  return AI_PROVIDERS[providerId] || { color: "var(--color-primary)", name: providerId };
}

// Custom provider node - rectangle with icon + name
function ProviderNode({ data }) {
  const { label, color, iconName, textIcon, active } = data;
  return (
    <div
      className="flex items-center gap-2.5 rounded-[4px] border px-4 py-3 transition-colors duration-300 bg-[color:color-mix(in_srgb,var(--color-surface-strong)_88%,white_12%)] shadow-[var(--shadow-soft)] backdrop-blur-xl"
      style={{
        borderColor: active ? color : `color-mix(in srgb, ${color} 38%, var(--color-border))`,
        boxShadow: active ? `0 0 0 1px ${color}22, 0 14px 38px ${color}18` : "var(--shadow-soft)",
        minWidth: "150px",
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      {/* Provider icon */}
      <div
        className="w-8 h-8 rounded flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}15`, boxShadow: `inset 0 0 0 1px ${color}22` }}
      >
        {iconName ? (
          <ProviderIcon
            src={iconName}
            alt={label}
            size={24}
            className="rounded-sm"
            fallbackText={textIcon}
            fallbackColor={color}
          />
        ) : (
          <span className="text-sm font-bold" style={{ color }}>{textIcon}</span>
        )}
      </div>

      {/* Provider name */}
      <span
        className="truncate text-base font-semibold"
        style={{ color: active ? color : "var(--color-text-main)" }}
      >
        {label}
      </span>

      {/* Active indicator */}
      {active && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: color }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
        </span>
      )}
    </div>
  );
}

ProviderNode.propTypes = {
  data: PropTypes.object.isRequired,
};

// Center AxonRouter node
function RouterNode({ data }) {
  return (
    <div className="flex min-w-[144px] items-center justify-center rounded-[4px] border border-[var(--color-primary)]/30 bg-[color:color-mix(in_srgb,var(--color-primary-soft)_82%,white_18%)] px-5 py-3 shadow-[var(--shadow-soft)]">
      <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      <ProviderIcon src="/axonrouter-logo-mark.svg" alt="AxonRouter" size={24} className="mr-2 size-6 object-contain" fallbackText="RR" fallbackColor="var(--color-primary)" />
      <span className="text-sm font-bold text-[var(--color-primary)]">AxonRouter</span>
      {data.activeCount > 0 && (
        <span className="ml-2 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-xs font-bold text-white">
          {data.activeCount}
        </span>
      )}
    </div>
  );
}

RouterNode.propTypes = {
  data: PropTypes.object.isRequired,
};

const nodeTypes = { provider: ProviderNode, router: RouterNode };

// Place N nodes evenly along an ellipse around the router center.
function buildLayout(providers, activeSet, lastSet, errorSet) {
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
    data: { activeCount: activeSet.size },
    draggable: false,
  });

  const edgeStyle = (active, last, error, color) => {
    if (error) return { stroke: "var(--color-danger)", strokeWidth: 2.5, opacity: 0.9 };
    if (active) return { stroke: "var(--color-success)", strokeWidth: 2.5, opacity: 0.9 };
    if (last) return { stroke: "var(--color-warning)", strokeWidth: 2, opacity: 0.7 };
    return { stroke: color || "var(--color-primary)", strokeWidth: 1.5, opacity: 0.32 };
  };

  providers.forEach((p, i) => {
    const config = getProviderConfig(p.provider);
    const active = activeSet.has(p.provider?.toLowerCase());
    const last = !active && lastSet.has(p.provider?.toLowerCase());
    const error = !active && errorSet.has(p.provider?.toLowerCase());
    const nodeId = `provider-${p.provider}`;
    const data = {
      label: (config.name !== p.provider ? config.name : null) || p.name || p.provider,
      color: config.color || "var(--color-primary)",
      iconName: p.provider === MORPH_MANAGED_PROVIDER_ID ? "/providers/morph-fast.svg" : p.provider,
      textIcon: config.textIcon || (p.provider || "?").slice(0, 2).toUpperCase(),
      active,
    };

    // Distribute evenly starting from top (-π/2), clockwise
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
      source: "router",
      sourceHandle,
      target: nodeId,
      targetHandle,
      animated: active,
      style: edgeStyle(active, last, error, config.color),
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

  const activeSet = useMemo(() => new Set(activeKey ? activeKey.split(",") : []), [activeKey]);
  const lastSet = useMemo(() => new Set(lastKey ? [lastKey] : []), [lastKey]);
  const errorSet = useMemo(() => new Set(errorKey ? [errorKey] : []), [errorKey]);

  const { nodes, edges } = useMemo(
    () => buildLayout(providers, activeSet, lastSet, errorSet),
    [providers, activeSet, lastSet, errorSet]
  );

  // Stable key - only remount when provider list changes
  const providersKey = useMemo(
    () => providers.map((p) => p.provider).sort().join(","),
    [providers]
  );

  const rfInstance = useRef(null);
  const onInit = useCallback((instance) => {
    rfInstance.current = instance;
    setTimeout(() => instance.fitView({ padding: 0.3 }), 50);
  }, []);

  return (
    <div className="w-full overflow-hidden rounded-[4px] border border-[var(--color-primary)]/15 bg-[color:color-mix(in_srgb,var(--color-surface)_84%,var(--color-primary-soft)_16%)] shadow-[var(--shadow-card)]" style={{ height: 480 }}>
      {providers.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-muted)]">
          No providers connected
        </div>
      ) : (
        <ReactFlow
          key={providersKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          onInit={onInit}
          proOptions={{ hideAttribution: true }}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        />
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
